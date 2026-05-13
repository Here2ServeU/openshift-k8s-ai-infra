# ADR-005: OpenTelemetry Collector as the single ingestion point

**Status**: Accepted
**Date**: 2026-01

## Context

We need metrics, logs, and traces. Each has multiple viable backends (Prom/Mimir, Loki/Elastic, Tempo/Jaeger, plus vendor SaaS like Datadog/Honeycomb). The wrong choice locks workloads to a backend via per-vendor SDKs and scraping configs.

## Decision

- All workloads emit via the **OpenTelemetry SDK** (one library per language).
- A **single OTel Collector DaemonSet** receives metrics/logs/traces on the node.
- The Collector fans out to Prometheus (metrics), Loki (logs), Tempo (traces), and optionally a vendor exporter.
- Existing Prometheus-only sources (kube-state-metrics, node-exporter, vLLM's `/metrics`) continue to be scraped by Prometheus directly — no point bouncing through OTel for those.

## Rationale

- **Vendor portability**: swap Tempo for Honeycomb by changing one exporter in the Collector config. Workload code doesn't move.
- **One consistent telemetry namespace**: GenAI semantic conventions (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, etc.) give us LLM-aware observability across vendor boundaries.
- **Filtering / sampling at the edge**: the Collector can drop noisy spans, rewrite attributes, and apply tail-based sampling before data hits the (expensive) trace backend.
- **Future-proofing**: OTel is the consensus standard. Migrating away from per-vendor SDKs later is painful.

## What about Prometheus pull?

The Collector receives via OTLP/gRPC from apps but **also runs a Prometheus receiver** to pull from things that only speak Prom (kube-state-metrics, vLLM, DCGM exporter). This gives one unified pipeline.

## Consequences

- **Positive**: the gateway emits a span; vLLM emits a child span; both end up in Tempo with full request-level GenAI attributes. Joining `gen_ai.usage.output_tokens * cost_per_token` against trace duration gives you cost-per-request observability for free.
- **Negative**: one more component to operate. DaemonSet has resource overhead (~100MB RAM per node). For a 50-node cluster that's 5GB cluster-wide — acceptable.
- **Risk**: OTel's metrics SDK still has rough edges (delta vs. cumulative temporality, label cardinality footguns). We standardize on cumulative + enforce a low-cardinality label allow-list in the Collector's `processors`.

## What we actually changed

- `platform/opentelemetry-collector/values.yaml` — DaemonSet mode, OTLP receivers, Prom receiver for kube/vLLM/DCGM, exporters to Prom/Loki/Tempo
- `workloads/inference-gateway/envoy.yaml` — OTel tracing filter configured to send to `otel-collector.observability:4317`
- `observability/dashboards/llm-serving.json` — uses `gen_ai.*` labels in Tempo queries
