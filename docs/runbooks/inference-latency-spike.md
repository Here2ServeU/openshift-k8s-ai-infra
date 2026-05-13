# Runbook: Inference latency spike

**Triggers**: `LLMTTFTBreaching`, `LLMAvailabilityFastBurn`, user-visible slow responses.

**SLO context**: TTFT p95 < 500ms, end-to-end p95 < 8s at 256 tokens, 99.5% availability. See [`observability/slo/`](../../observability/slo/).

## 1. Confirm scope (60s)

Open the [LLM Serving dashboard](http://grafana/d/llm-serving). Check:

- Is **one model** breaching, or all? → Localizes to a deployment vs the gateway.
- TTFT vs end-to-end — which is high? TTFT alone implies prefill / queue saturation. End-to-end alone implies decode throughput / batch starvation.
- **Queue depth panel** — if `vllm:num_requests_waiting > 0` we're overloaded, not slow per-request.

```bash
kubectl -n workloads get rollout
kubectl -n workloads logs -l app=vllm-llama3-8b --tail=200 -c vllm
```

## 2. Decide: scale, throttle, or rollback

### A. Queue depth high, GPUs at >80% util → **scale**

Healthy scaling story; just confirm KEDA + Karpenter are firing.

```bash
kubectl -n workloads describe scaledobject vllm-llama3-8b
kubectl get nodepool -A           # AWS: Karpenter
kubectl describe nodes -l workload-type=serving
```

If KEDA looks healthy and Karpenter is provisioning, just wait — new GPU node should be ready in ~60-90s (AWS Karpenter), ~90-120s (GKE NAP), ~2-3min (AKS CA). The breach should self-heal.

If KEDA is **not** scaling, check `keda-operator` logs for the Prometheus scaler — most outages here are Prom being unreachable. The `fallback.replicas: 3` setting on the ScaledObject means we won't 503; we'll just be slow.

### B. KV cache > 90%, no queue → **memory pressure**

Long-context requests are evicting other users' cache.

- Short-term: drop the gateway's `max_tokens` cap to 4096 (Lua filter) to stop new long requests from starting while in-flights drain.
- Medium-term: reduce `--max-num-seqs` on the affected model in `values-<cloud>.yaml`, redeploy. Argo Rollouts will canary the change.

### C. Errors > 1%, **specifically on the canary** → **canary regression**

The AnalysisTemplate should have caught this. If it hasn't (e.g., the eval winrate metric was missing → assertion skipped), force an abort:

```bash
kubectl argo rollouts -n workloads abort vllm-llama3-8b
kubectl argo rollouts -n workloads undo  vllm-llama3-8b
```

### D. Errors > 1%, all replicas → **bad model / bad config**

```bash
# Roll back via git — flip the PR. ArgoCD will re-sync to the previous digest.
git revert <model-bump-sha>
git push
# Or override fast (incident only — fix git after):
kubectl -n workloads patch rollout vllm-llama3-8b --type=merge \
  -p '{"spec":{"template":{"metadata":{"annotations":{"model.k8s.ai/digest":"sha256:<previous>"}}}}}'
```

## 3. Post-incident

- Update [`observability/slo/`](../../observability/slo/) if the SLO target was too aggressive.
- If a real regression slipped past Analysis, tighten the AnalysisTemplate thresholds.
- File a follow-up to add the failure mode you saw to the [`docs/runbooks/`](.) set.

## Common gotchas

- **kind / local mode**: the CPU build of vLLM is naturally slow. Don't page yourself for local-mode TTFT.
- **Cold start after model bump**: a fresh pod takes 30-60s on GPU (longer on CPU + bigger models). The startup probe with 600s `failureThreshold` is correct — don't shorten it.
- **Prom storage full**: SLO recording rules silently degrade. The Prometheus capacity alert (in `kube-prometheus-stack` defaults) catches this.
