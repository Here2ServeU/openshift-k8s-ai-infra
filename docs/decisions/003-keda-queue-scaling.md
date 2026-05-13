# ADR-003: KEDA on top of HPA for workload autoscaling

**Status**: Accepted
**Date**: 2026-01

## Context

HPA scales on CPU and memory. For LLM serving, CPU is uninformative — a vLLM replica pegs one CPU core constantly doing prompt tokenization while the GPU does the actual work. We need to scale on signals that actually predict saturation.

The signals that matter for LLM serving:
- **Queue depth** (`vllm_pending_requests`) — leading indicator. If this is non-zero, we're rejecting future capacity for current load.
- **KV cache utilization** (`vllm_gpu_cache_usage_perc`) — leading indicator of OOM evictions.
- **In-flight request count** (`vllm_running_requests`) — capacity utilization.
- **External event sources** for batch / async workloads — SQS depth for eval jobs, Pub/Sub for data pipelines.

HPA's `external` metrics API supports custom metrics but the wiring (prometheus-adapter, custom metrics API) is painful. KEDA wraps that complexity and adds first-class scalers for 60+ sources.

## Decision

- Use **KEDA** for all event-driven and Prometheus-driven autoscaling.
- HPA remains underneath (KEDA generates HPAs as its mechanism) — so CPU-based scaling stays available as a fallback if Prometheus is down.
- For vLLM specifically, target `(pending + running) / replicas == 4` as the steady-state load factor.

## Rationale

- **Right signal**: queue depth predicts TTFT degradation by ~15-30s. CPU-based scaling reacts after users see slow responses.
- **Scale to zero**: KEDA supports scale-to-zero, important for dev models in non-prod environments. Saves ~$700/month per idle GPU in our staging cluster.
- **Cooldown control**: GPU pods take ~60s to become ready (model load). KEDA's `cooldownPeriod` prevents thrashing. HPA + prometheus-adapter doesn't expose this knob cleanly.

## Consequences

- **Positive**: Same KEDA `ScaledObject` pattern works for vLLM (Prom), eval workers (SQS/Pub/Sub queue), data pipeline (Kafka lag). One mental model.
- **Negative**: KEDA is another operator to maintain. Its own metrics-server can be a SPoF if mis-configured. Mitigated with HPA fallback + alert on KEDA operator unavailability.
- **Edge case**: when Prometheus is unhealthy, KEDA defaults to the fallback `minReplicas` rather than holding the last known scale. We chose `fallback.replicas: 3` (enough to serve baseline traffic during a Prom outage).

## Example

```yaml
# platform/keda/scaledobject-vllm.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: vllm-llama3-8b
spec:
  scaleTargetRef:
    name: vllm-llama3-8b
  minReplicaCount: 1
  maxReplicaCount: 12
  cooldownPeriod: 300  # 5 min — GPU pods are slow to recycle
  fallback:
    failureThreshold: 3
    replicas: 3
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.observability:9090
        threshold: "4"  # target backlog of 4 requests/replica
        query: |
          sum(vllm_pending_requests{model="llama3-8b"}) +
          sum(vllm_running_requests{model="llama3-8b"})
```
