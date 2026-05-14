# Runbook: Model rollback

**When to use**: A new model digest is in production and we need to revert. Triggers include user reports of regressed output quality, the `eval winrate` metric trending down post-promotion, or an external compliance issue with the model.

The platform supports two rollback paths.

## Path A: Git revert (preferred)

The right answer 95% of the time.

```bash
# Find the PR that bumped the digest
gh pr list --search "model:<name>" --state merged

# Revert
git revert <merge-commit-sha>
git push
```

ArgoCD picks up the revert within ~30s. The Rollout sees a new revision (the old digest) and runs the same canary strategy in rt2s:

- 10% on the old digest, 5min bake, AnalysisTemplate (same SLO checks).
- 50%, bake, check.
- 100%.

The whole thing takes ~15 min and is safe — the analysis template gates each step. Same machinery as the forward promote.

## Path B: Imperative override (incident-time)

Only when path A is too slow (active user-visible outage). Skips the canary gate.

```bash
# Get the previous digest from git history
PREV=$(git log -p workloads/llm-serving/helm/values-aws.yaml | \
       grep -B1 -A1 '+  digest:' | grep '^-' | grep digest | \
       head -1 | sed -E 's/.*"(sha256:[^"]+)".*/\1/')

# Apply directly. This temporarily diverges from git — ArgoCD will fight you
# until the git state matches. Fix git immediately after.
kubectl -n workloads patch rollout vllm-llama3-8b --type=merge \
  -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"model.k8s.ai/digest\":\"$PREV\"}}}}}"

# Then immediately revert via git so ArgoCD's selfHeal doesn't re-deploy bad model
git revert <bad-merge-sha>
git push
```

## Verification

```bash
# Current digest on the Rollout
kubectl -n workloads get rollout vllm-llama3-8b -o jsonpath='{.metadata.annotations.model\.k8s\.ai/digest}'; echo

# All pods agree
kubectl -n workloads get pods -l app=vllm-llama3-8b \
  -o jsonpath='{range .items[*]}{.metadata.name}{": "}{.spec.initContainers[?(@.name=="model-puller")].env[?(@.name=="MODEL_DIGEST")].value}{"\n"}{end}'

# Smoke test
curl -s http://chat.local/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"llama3-8b","messages":[{"role":"user","content":"hi"}]}'
```

## After rollback

- **Don't delete the bad digest from S3/GCS/Azure**. Forensics need it. The bucket has a 90-day retention for `models/`.
- File an incident note. What did the eval miss? Tighten the AnalysisTemplate threshold or add a new metric.
- If the bad model was promoted *without* eval data (the `model_eval_winrate` gauge was absent → check skipped), this is a CI bug — the smoke-eval Workflow didn't fire or didn't push. Investigate before the next release.

## Common gotchas

- **Cache busting**: pods on the old digest may have warm KV cache for popular prompts. After rollback, the first ~5 min of traffic will see slightly higher TTFT until cache rebuilds.
- **AnalysisTemplate cooldown during rollback**: the canary on the rollback also runs the analysis. If the analysis itself is what's broken (Prom is unhealthy), the rollback will stall. Path B exists for this.
- **Multi-cloud**: if you rolled back on AWS, remember GCP and Azure deployments have their own `values-<cloud>.yaml`. Revert all three if the bad digest reached them.
