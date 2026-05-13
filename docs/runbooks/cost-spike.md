# Runbook: Cost spike

**Triggers**: OpenCost daily budget alert, `GPUIdleButProvisioned` firing on > 1 node, cloud bill anomaly detection.

## 1. Locate the spend

Open the [Cost dashboard](http://grafana/d/cost). Top-row stats answer most questions:

- **Cluster cost (7d)** — is the spike new or pre-existing?
- **GPU cost (7d)** — almost always the answer for AI infra.
- **$ per 1M generation tokens** — went up while traffic stayed flat? Bad bin-packing or stuck replicas.
- **Idle GPU $ (1h, est.)** — direct measure of waste.

Drill into "Cost by namespace" (top-N table) — usually one workload is the offender.

## 2. Classify the spike

### A. Idle replicas (most common)

A model that scaled up during a burst hasn't scaled back down. KEDA's cooldown is 5 min, but **`vllm_pending_requests + vllm_running_requests`** must drop to zero across the cooldown for it to scale.

```bash
kubectl -n workloads describe scaledobject vllm-<model>
# Check 'Last successful scale' timestamps
```

Quick fix:

```bash
# Force scale-down (KEDA will re-evaluate)
kubectl -n workloads patch rollout vllm-<model> --type=merge -p '{"spec":{"replicas":1}}'
```

Permanent: shorten `cooldownPeriod` if traffic patterns allow, or move dev models to the scale-to-zero variant pattern (see [`platform/keda/scaledobject-vllm.yaml`](../../platform/keda/scaledobject-vllm.yaml)).

### B. On-demand GPU instead of spot

Karpenter (AWS) or AKS spot is supposed to prefer spot. If `gpu-od-fallback` is taking traffic for hours, either spot capacity is genuinely unavailable or the NodePool weight is wrong.

```bash
kubectl get nodeclaim -A          # AWS: which NodePool is each node from?
# Or:
kubectl get nodes -l karpenter.sh/capacity-type
```

- **Genuine spot shortage**: check the cloud provider's spot capacity page. Sometimes patience is the answer; sometimes you widen the `instance-family` allow-list to include cheaper alternatives.
- **Wrong NodePool weight**: review [`platform/karpenter/nodepool-gpu.yaml`](../../platform/karpenter/nodepool-gpu.yaml). `weight: 100` on spot vs `weight: 10` on OD is correct.

### C. Big context windows / runaway requests

A tenant is sending 32k-token prompts. Each one occupies KV cache for a long time, pushing other users into the queue → KEDA scales up → cost spike.

Quick fix: drop the gateway's max prompt size:

```yaml
# workloads/inference-gateway/envoy-config.yaml — Lua filter
if #raw > 16384 then   # was 65536
  handle:respond({[":status"] = "413"}, "request too large")
end
```

Then identify the tenant in Tempo (filter spans by `gen_ai.request.model` + high input token count) and rate-limit them specifically.

### D. Eval / data-pipeline job stuck

An Argo Workflow is parked, holding nodes:

```bash
argo list -A | grep -v Succeeded
kubectl get pods -A --field-selector=status.phase=Running -l workflows.argoproj.io/workflow
```

Kill stuck workflows; check the workflow's `activeDeadlineSeconds` is set.

## 3. Prevention

- Tag every workload with `team` + `cost-center` + `env` — Terraform `default_tags` and Helm chart labels do this consistently.
- Set HPA / KEDA `maxReplicaCount` even when you "shouldn't need it" — saves you from a runaway scale.
- Set `activeDeadlineSeconds` on all CronWorkflows.
- Quarterly review: which models have the worst $/1M-tokens? Often a smaller / quantized version of the same model is good enough.

## Common gotchas

- **`GPUIdleButProvisioned` lags**: 30-min rolling window. Real saturation drops then bursts within the window can look idle on the dashboard.
- **OpenCost reconciliation**: real costs lag actual usage by ~24h depending on cloud billing export. Use the live `node_total_hourly_cost` metric for incident-time decisions.
- **Spot reclaims during scale-down**: don't be fooled by Karpenter terminating spot nodes — it's the right behavior.
