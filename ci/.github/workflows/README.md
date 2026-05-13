# CI/CD

What runs when:

| Trigger | Workflows |
|---|---|
| PR touching `terraform/**` | `terraform.yml` (plan + tfsec, all 3 clouds) |
| PR touching `workloads/**` or `platform/**` | `helm-lint.yml`, `argocd-sync-check.yml` (4 cloud profiles × every chart) |
| PR touching `workloads/inference-gateway/**` or `workloads/model-registry/**` | `docker-build.yml` (build, not push) |
| Push to `main` | All of the above, **plus** push images + cosign sign + SBOM |
| Manual / webhook | `model-release.yml` (validate → promote → smoke-eval) |
| PR or push or nightly | `security-scan.yml` (Trivy, gitleaks, Semgrep) |

## Why this shape

- **Plan all clouds on every PR**: drift detection. If someone changes the AWS root but forgets the matching GCP/Azure update, CI shows the diff.
- **Render with every profile**: catches values-file typos that would have ArgoCD `OutOfSync` after merge.
- **Image signing + SBOM by default**: SLSA-style provenance is now ~10 lines with cosign-keyless + actions/attest-sbom. Worth the small effort.
- **Model release is its own pipeline**: model promotions are not code, but they need the same gate semantics (validate → publish → smoke-test → PR). Keeping it separate keeps `terraform.yml` and `helm-lint.yml` fast.

## What the model-release pipeline does

1. **validate** — pull the raw artifact, picklescan it, sniff the safetensors header, compute sha256, check for a LICENSE file. Failures stop the pipeline.
2. **promote** — call `scripts/promote-model.sh` to copy to the content-addressed location, cosign-sign the digest, write the env ref, and open a PR bumping `values-<env-cloud>.yaml`.
3. **smoke-eval** — kick the `llm-eval` Argo Workflow against the soon-to-be canary endpoint. The result lands in Prometheus by the time Argo Rollouts' AnalysisTemplate reads it.

Merging the PR triggers ArgoCD → Rollout → canary → analysis → promote-or-rollback. End to end, a new model goes from "uploaded" to "100% prod" in 10-20 minutes (most of which is the canary bake periods, not the pipeline itself).

## Where this falls short (be honest)

- The eval is a smoke test (`--limit 200`). Real production gating needs a full eval suite that takes hours. Pattern is the same; bigger compute budget.
- No "canary by traffic shadowing" (replay real traffic at the canary endpoint before flipping weights). Listed as a planned ADR.
- `cloud-auth` composite action assumed but not written out — production setup would have it under `.github/actions/cloud-auth/action.yml`.
