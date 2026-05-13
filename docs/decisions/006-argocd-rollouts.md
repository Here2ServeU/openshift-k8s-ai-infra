# ADR-006: ArgoCD + Argo Rollouts for GitOps and progressive delivery

**Status**: Accepted
**Date**: 2026-01

## Context

The role explicitly calls for "CI/CD pipelines for high-frequency releases and model deployments." That means:
- Git is the source of truth for desired cluster state.
- Promotions go through PR + merge, not `kubectl apply`.
- Model deploys need to be progressive — canary first, gated on metrics, automatic rollback.

Choices:
- **GitOps**: ArgoCD vs Flux
- **Progressive delivery**: Argo Rollouts vs Flagger

## Decision

- **ArgoCD** with the app-of-apps pattern.
- **Argo Rollouts** for canary/blue-green of every workload, with `AnalysisTemplate`s that gate promotion on Prometheus SLOs.

## Rationale — ArgoCD vs Flux

ArgoCD wins for this project specifically because:
- **UI**: the web UI is genuinely useful for demos and for the AI-research collaborators who don't live in `kubectl`. Hiring managers will look at it.
- **App-of-apps**: a single bootstrap App that points at `platform/argocd/apps/` and reconciles every other component. Onboarding a new cluster is one `kubectl apply`.
- **Sync waves**: explicit ordering (`argocd.argoproj.io/sync-wave: "-2"` for cert-manager, etc.) makes platform bootstrap deterministic.

Flux is arguably more "Kubernetes-native" (controllers all the way down, no central server) but the UX trade-off for an AI-research-facing platform isn't worth it.

## Rationale — Argo Rollouts vs Flagger

Both work. Argo Rollouts wins on:
- **Native integration with ArgoCD** — both projects, one UI.
- **`AnalysisTemplate` is more flexible** — supports Prom, Datadog, NewRelic, web hooks for custom eval.
- **Streaming controller** — doesn't require an Ingress-level traffic mirror like Flagger does for some modes. Important for canary on internal gRPC services.

## How a model release looks

1. Engineer (or model-release GHA) bumps `workloads/llm-serving/values.yaml`: `model.digest: sha256:def456`.
2. ArgoCD detects the diff. Applies the new Rollout revision.
3. Rollout starts: 10% of traffic to canary (the new digest), 90% to stable.
4. `AnalysisTemplate` runs queries against Prometheus every 30s for 5 min:
   - `llm_ttft_p95` on canary must be within 20% of stable.
   - `llm_5xx_rate` on canary must be < 1%.
   - `eval_winrate_vs_baseline` (from Argo Workflow eval run) must be > 0.5.
5. If all green: promote to 50%, repeat, then 100%.
6. If any red: auto-rollback. Slack alert + Sentry breadcrumb.

```yaml
# workloads/llm-serving/rollout.yaml — abbreviated
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: vllm-llama3-8b
spec:
  strategy:
    canary:
      steps:
        - setWeight: 10
        - pause: { duration: 5m }
        - analysis:
            templates:
              - templateName: llm-canary-analysis
        - setWeight: 50
        - pause: { duration: 5m }
        - analysis:
            templates:
              - templateName: llm-canary-analysis
        - setWeight: 100
```

## Consequences

- **Positive**: every change is auditable in git. Rollback is a revert. The release pipeline runs the same way for code, config, and model weights.
- **Negative**: Argo Rollouts modifies the standard Deployment model (it's a CRD that supersedes Deployment). Teams new to it sometimes get confused that `kubectl get deployments` doesn't show their app. Mitigated with docs.
- **Risk**: ArgoCD as a SPoF for cluster state. Mitigated by running it HA (3 replicas) and keeping the bootstrap `kubectl apply` documented so anyone can re-seed it.
