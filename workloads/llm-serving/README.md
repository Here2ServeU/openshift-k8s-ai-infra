# LLM serving — vLLM

This chart deploys vLLM as an OpenAI-compatible chat completion server. It's the centerpiece of the platform — everything else (autoscaling, observability, canary deploys, the model registry) feeds into making this run reliably.

## What's inside

- **Rollout** ([rollout.yaml](helm/templates/rollout.yaml)) — Argo Rollouts CRD with a canary strategy. Init-container pulls the model by content-addressed digest, verifies the sha256, then vLLM starts.
- **AnalysisTemplate** ([analysistemplate.yaml](helm/templates/analysistemplate.yaml)) — Prometheus-driven SLO gate. The canary must satisfy three checks (error rate, TTFT vs. stable, eval winrate) to advance.
- **Services** — three: main, stable, canary. The canary one is what Rollouts shifts traffic to during a release.
- **ServiceMonitor** — wires vLLM's `/metrics` (Prometheus exposition) into kube-prometheus-stack.
- **PodDisruptionBudget** — `minAvailable: 1` so a voluntary disruption (node drain, AZ rebalance) doesn't take the model offline.
- **ServiceAccount** — annotated for IRSA (AWS) or Workload Identity (GCP) so the puller init-container can read the model bucket.

## How model releases work end-to-end

1. **Upload**: a trainer or HF mirror job uploads `model.safetensors` to `s3://models/raw/<name>/`.
2. **Validate**: the [`model-release.yml`](../../ci/.github/workflows/model-release.yml) GitHub Actions workflow:
   - computes the sha256 of the safetensors file,
   - scans the file for known-malicious patterns (`pickle`-style RCE detection),
   - copies to `s3://models/models/<name>/<digest>/`,
   - cosigns the digest,
   - opens a PR bumping `model.digest` in `values-<cloud>.yaml`.
3. **Eval (pre-merge)**: a separate Argo Workflow runs a smoke eval against the canary endpoint of a staging deployment that uses this digest.
4. **Merge**: ArgoCD picks up the change. The Rollout starts:
   - 10% canary, 5m bake, AnalysisTemplate check.
   - 50% canary, 5m bake, AnalysisTemplate check (now with a fresh eval-winrate metric from the full eval run).
   - 100%.
5. **Rollback**: revert the PR. ArgoCD syncs back; Rollouts rt2ss the strategy.

## Tuning vLLM

The settings in [`values.yaml`](helm/values.yaml) under `runtime.args` are tuned for general chat completion against a single GPU. Pull-out:

- `--max-num-seqs`: max concurrent requests in a continuous batch. Higher = better throughput, worse TTFT under heavy load. We use 64 for 8B-class models on an L4 / A10G, 256 on an A100.
- `--max-num-batched-tokens`: cap on prefill+decode tokens per step. Setting this lower bounds TTFT for long-context users at the cost of throughput.
- `--enable-chunked-prefill`: splits long prefills across steps so a 32k-context user doesn't starve other concurrent users. Big TTFT win.
- `--enable-prefix-caching`: hashes system/few-shot prefixes; cache hits make subsequent requests near-instant. Critical for production chat with stable system prompts.
- `--gpu-memory-utilization`: how much of GPU VRAM vLLM can use. Leave ~10% slack for activations.

## Local vs cloud

Local kind runs a vLLM CPU build with TinyLlama. Cloud profiles use the CUDA image and Llama-3-8B / Mistral-7B. Tolerations and `nvidia.com/gpu: 1` requests are toggled by the values file.

```bash
# Render the rollout for AWS (with a real terraform output) just to sanity-check
helm template . -f values.yaml -f values-aws.yaml | less
```

## Observability hooks

- `/metrics` — Prometheus format. Scraped via ServiceMonitor.
- OTLP — vLLM emits trace spans for each request with `gen_ai.*` attributes (model name, input/output tokens) to the OTel Collector. See ADR-005.
- Pod labels — `model`, `node`, `cloud` are propagated so dashboards can filter cleanly.

The [`llm-serving.json`](../../observability/dashboards/llm-serving.json) Grafana dashboard reads everything from here.
