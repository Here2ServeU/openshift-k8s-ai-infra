# Architecture

This is the long-form companion to the [top-level README](../README.md). It walks through each layer of the stack, what problem it solves, and the trade-offs.

## Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│ Workloads          vLLM   KServe   Everse UI/API/Worker   Data Pipe  │
├─────────────────────────────────────────────────────────────────────┤
│ Platform           ArgoCD  Rollouts  KEDA  Karpenter  GPU Operator   │
│                    Prom/Loki/Tempo  OTel  cert-manager  ESO  Argo WF │
├─────────────────────────────────────────────────────────────────────┤
│ Cluster            EKS / GKE / kind                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Cloud              VPC  IAM (IRSA / WI)  S3/GCS  KMS  Route53/CloudDNS│
└─────────────────────────────────────────────────────────────────────┘
```

## Request path — LLM serving

1. Client opens HTTPS connection to `chat.api.example.com`.
2. **ingress-nginx** terminates TLS (cert-manager + Let's Encrypt) and forwards to the inference-gateway service.
3. **Inference Gateway** (Envoy + Lua filter): authenticates the request (JWT), rate-limits per tenant, validates request shape (token count, model allow-list), tags the request with a trace ID, and routes to the right backend based on the `model` field. A/B and canary weights live here.
4. **vLLM** receives the OpenAI-compatible chat completion request. Continuous batching merges it with concurrent in-flight requests; PagedAttention manages KV cache pages. Streaming response goes back through the gateway and ingress.
5. **OpenTelemetry**: the gateway emits a server span; vLLM emits a child span with `gen_ai.*` attributes (input tokens, output tokens, model, latency to first token).
6. Metrics scraped by Prometheus on `:8000/metrics` (vLLM exposes `vllm_pending_requests`, `vllm_running_requests`, `vllm_gpu_cache_usage_perc`, TTFT, TPOT histograms).

## Everse evaluation path

1. A user creates or re-runs an agent evaluation suite in `everse-ui`.
2. `everse-api` validates the suite, records run metadata in Postgres, stores large fixtures in S3, and enqueues evaluation jobs to SQS.
3. `everse-worker` consumes jobs, simulates voice/text personas, calls the inference gateway or external model endpoints, and writes transcripts, audio/video artifacts, and result summaries back to S3/Postgres.
4. Redis holds short-lived run state, idempotency locks, and rate-limit counters.
5. OpenTelemetry traces connect API requests, queue jobs, worker spans, LLM calls, S3 uploads, and Postgres writes under one run ID.

The UI/API/worker manifests live in [`workloads/everse-platform/`](../workloads/everse-platform/). The important design choice is that the services promote together as a product surface, while each component scales on its own pressure signal: API latency/CPU, worker queue depth and oldest-message age, and LLM serving GPU pressure. The full reasoning — one namespace, two worker tiers (text vs. voice), canary on API/UI but rolling on workers — is captured in [ADR-008](decisions/008-everse-service-group.md). The voice-tier specifics are in [`docs/interview/voice-agent-infra.md`](interview/voice-agent-infra.md), and the product-level SLOs (API availability, API latency, queue freshness, eval success rate) live in [`observability/slo/everse-slo.yaml`](../observability/slo/everse-slo.yaml).

## Autoscaling — workload and node

We use a two-tier scaling strategy:

**Workload (pod replicas)**: KEDA's PrometheusScaler watches `vllm_pending_requests + vllm_running_requests` against a target backlog of 4 requests per replica. KEDA wraps HPA, so it falls back to CPU-based scaling if Prometheus is unavailable. Cooldown is 5 min to avoid thrashing on GPU pods (which take ~60s to become ready). Dev models can scale to zero on a 15-min idle window.

**Node (GPU instance count)**: Karpenter on AWS (NodePool for `g5.xlarge` + `g5.2xlarge` spot, with on-demand fallback). On GCP, GKE node auto-provisioning serves the same role. Both can stand up a new GPU node in ~60-90s, vs. ~3-5 min for cluster-autoscaler hitting an ASG.

Why two tiers: pod-level autoscaling reacts in seconds but only within the existing node capacity. Node-level reacts in minutes but adds capacity. Together you can handle a 10× burst without either over-provisioning or 500ing.

For Everse workers, the same principle applies without GPUs: KEDA scales worker pods on SQS backlog and oldest-message age, then the cluster autoscaler adds batch nodes if the pending pods cannot schedule. Queue age is the user-facing signal; queue length is only the volume signal.

## Model artifact pipeline

1. A model is trained or downloaded (HF Hub mirror) → uploaded to `s3://models/raw/<name>/<version>/`.
2. A GitHub Actions job runs `validate-model.yml`: checksum, scan for known-malicious safetensors, license check. On pass, it copies to `s3://models/verified/<name>/<sha256-digest>/` (content-addressed).
3. The job opens a PR to `workloads/llm-serving/values.yaml` bumping `model.digest`.
4. On merge, ArgoCD syncs the new Rollout revision. The pod's init-container `oras pull`s the digest from S3, verifies the signature (cosign), then vLLM starts with the new weights.
5. Argo Rollouts runs an `AnalysisTemplate` that fires the eval workflow against the canary pod's endpoint. If win-rate against the previous model exceeds threshold AND p95 latency is within budget, the rollout promotes; otherwise it auto-rolls-back.

The digest-based addressing means two clusters running "the same model" are bit-identical, and rollbacks are a one-line revert.

## Observability — what makes LLM serving different

Traditional web service metrics (RED: rate, errors, duration) are necessary but insufficient. LLM serving adds:

- **TTFT (time to first token)** — user-perceived latency. Dominated by queue depth + prefill cost (proportional to input length).
- **TPOT (time per output token)** — streaming throughput once generation starts. Dominated by decode cost and batch size.
- **Tokens/second per replica** — the throughput metric to capacity-plan against.
- **KV cache utilization** — when this hits 100%, requests get evicted or queued. Leading indicator of saturation.
- **Request queue depth** — what KEDA scales on.
- **Batch size distribution** — small batches waste GPU; very large batches hurt TTFT.

All of these are exposed by vLLM as Prometheus metrics. The [`llm-serving.json`](../observability/dashboards/llm-serving.json) Grafana dashboard surfaces them with the right percentiles.

For tracing, OpenTelemetry's GenAI semantic conventions (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, etc.) let you correlate trace spans with token-level cost in Tempo.

## Failure modes the platform handles

| Failure | Detection | Mitigation |
|---|---|---|
| GPU node `NotReady` (driver hang) | DCGM exporter + NodeReady alert | Cordon + drain via node-problem-detector → Karpenter replaces |
| OOM on long-context request | vLLM rejects with 429, span tagged | Gateway returns 503; client retry-after; alert if rate > 1% |
| Model checksum mismatch on pull | Init-container exits 1 | Pod won't start; Rollout pauses; alert pages oncall |
| Cost spike (GPU runaway) | OpenCost daily budget alert | Auto-scale-down dev pools; pager to platform |
| ArgoCD sync drift | ArgoCD App status `OutOfSync > 10m` | Slack notification; auto-sync re-applies |

Each is covered by a runbook in [`docs/runbooks/`](runbooks/).

## Multi-cloud portability

The workload layer (everything under `platform/` and `workloads/`) is plain Kubernetes manifests — it doesn't know about AWS, GCP, or Azure. Cloud-specific concerns are isolated:

- **Object storage**: `s3://`, `gs://`, or `az://container@account` — the model-puller init-container speaks all three via `rclone`, configured from env vars set by the cloud-specific Terraform module.
- **Identity**: AWS uses IRSA (IAM Roles for Service Accounts), GCP uses Workload Identity, Azure uses AAD Workload Identity (federated credentials). All three annotate ServiceAccounts; the workload code is identical.
- **Node autoscaling**: Karpenter (AWS), GKE NAP (GCP), AKS Cluster Autoscaler (Azure, with Karpenter-for-Azure GA-pending). The KEDA layer above doesn't change.
- **Load balancer**: NLB vs GCP LB vs Azure Load Balancer (Standard SKU). ingress-nginx abstracts this; the Service annotations differ per cloud and are templated in the Helm chart.
- **Secrets**: External Secrets Operator backends differ (AWS Secrets Manager / GCP Secret Manager / Azure Key Vault) but `ExternalSecret` CRDs are identical.

See [ADR-007](decisions/007-multi-cloud-terraform.md) for the detailed abstraction strategy.

## Local-mode adaptations

`kind` doesn't have GPUs, persistent storage, or real cloud services. The local profile substitutes:

- **vLLM** → vLLM CPU-only build with `TinyLlama-1.1B`. Real GPU mode available with `GPU=1` if NVIDIA driver is present.
- **S3/GCS** → MinIO running in-cluster, same API.
- **Karpenter / NAP** → fixed kind nodes (autoscaling is a no-op locally).
- **External Secrets** → `fake` ClusterSecretStore backed by k8s Secrets.
- **Ingress** → kind's port-mapping (80/443 → localhost).

The local profile is selected via a `profile=local|aws|gcp` Helm value that the app-of-apps reads.
