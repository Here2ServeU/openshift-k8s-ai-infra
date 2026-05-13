# Contributing

> If you're reading this for an interview, this file tells you what working in this repo would feel like day-to-day.

## Local dev loop

```bash
make local-up          # 5-min one-shot — kind + platform + workloads
make demo              # exercise the LLM endpoint
make load-test         # k6 burst to see autoscaling in action
make dashboards        # open Grafana
make local-down
```

All four cloud profiles render cleanly without a real cluster:

```bash
helm template workloads/llm-serving/helm \
  -f workloads/llm-serving/helm/values.yaml \
  -f workloads/llm-serving/helm/values-aws.yaml | less
```

## Changes that touch...

### `terraform/`

- `terraform fmt -recursive` before committing — CI enforces it.
- Update **all three** cloud root modules together if you change a contract (output name, label key). The point of ADR-007 is that the workload layer is identical across clouds; drift breaks that.

### `platform/`

- Components are installed by ArgoCD Apps. Use Helm `values` inline in the Application YAML, not a separate values file (keeps the upgrade story to a single `kubectl diff`).
- Sync waves matter. CRD-providing apps go in earlier waves than apps that consume them.

### `workloads/`

- Workload Helm charts live under `workloads/<name>/helm/` with `values.yaml` + one `values-<cloud>.yaml` per supported cloud (`local`, `aws`, `gcp`, `azure`).
- Every workload has an `application.yaml` at its root that ArgoCD's app-of-apps picks up.

### `observability/`

- Alerts: PrometheusRule CRDs with multi-burn-rate windows. Don't add single-window alerts — they're noisy. Use the patterns in [`llm-slo-burn.yaml`](observability/alerts/llm-slo-burn.yaml).
- Dashboards: stored as JSON, deployed via Grafana sidecar ConfigMaps. Edit in Grafana → export → commit.
- SLOs: defined in [`observability/slo/`](observability/slo/) (Sloth format). Either commit the generated PrometheusRules alongside or run Sloth in CI.

### `ci/`

- Workflows are matrix'd over `aws/gcp/azure` even when the change only touches one cloud. Drift detection — see ADR-007.

## Adding a new model

1. Upload `model.safetensors` (+ `tokenizer.json`, `config.json`, `LICENSE`) to `<bucket>/raw/<name>/<version>/`.
2. Trigger `model-release.yml` (Actions tab → Run workflow) with the raw URI.
3. Review the auto-generated PR, merge.
4. ArgoCD picks up the merge, Rollout starts. Watch in the ArgoCD UI.

## Adding a new platform component

1. Drop a new YAML in `platform/argocd/apps/NN-name.yaml` (NN sets the sync wave).
2. Use the inline-Helm pattern other apps use.
3. If it provides CRDs that other apps consume, put it in an earlier sync wave.

## Adding a new cloud (e.g., Oracle, IBM)

Follow ADR-007. Create `terraform/<cloud>/` with the same output contract. Add a `values-<cloud>.yaml` to each workload chart. Update the inference-gateway and serviceaccount templates with the cloud-specific identity annotation if needed.

## Style

- Keep ArgoCD Application manifests short (≤ 50 lines). Long config goes in the chart's values file the App points at.
- Don't bury non-obvious decisions in YAML comments — they belong in an ADR.
- Runbooks ship with the alert that triggers them. If you add an alert, add a runbook or extend an existing one.
