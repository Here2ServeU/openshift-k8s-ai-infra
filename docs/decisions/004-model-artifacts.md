# ADR-004: Content-addressed model artifacts in object storage

**Status**: Accepted
**Date**: 2026-01

## Context

Model weights are too big for git (~16GB for Llama-3-8B in fp16) and too big to bake into container images sensibly (slow pulls, exploding registry storage, version explosion). They need to live somewhere else and be referenced from the pod spec.

Options:
1. **Bake weights into the container image** — naive. Works for small models. 50GB images = slow pulls, slow rollouts, registry cost explosion when you have 20 model versions.
2. **OCI artifacts (ORAS)** — store weights in the OCI registry as separate artifacts. Better than baking, but registry storage is expensive and OCI's pull-by-digest is single-blob (a 16GB pull from one blob).
3. **Object storage (S3/GCS), content-addressed** — weights stored as `s3://models/<name>/<sha256>/model.safetensors`. Pulled by an init-container.
4. **Hugging Face Hub** — works for public models, but adds an external dependency, rate limits, and license-tracking headaches in prod.

## Decision

**Object storage, content-addressed by SHA256 of the safetensors file.**

- Layout: `s3://<bucket>/models/<model-name>/<digest>/` (digest is the sha256 of the `.safetensors` file, the canonical artifact).
- The `latest` and `prod` pointers are written as `s3://<bucket>/models/<model-name>/refs/<env>` (a tiny text file containing the digest).
- Pod spec references the digest directly: `model.digest: sha256:abc123...`. No `latest` in pod specs ever.
- Pull happens via an init-container running `oras pull` (S3/GCS via rclone backend), verifying the sha256 against the digest in the pod env.
- Optional: sign the digest with cosign at promote-time, verify in the init-container.

## Rationale

- **Reproducibility**: a pod manifest referencing a digest is bit-identical across clusters and time. Rollbacks are a git revert.
- **Image hygiene**: container images stay slim (vLLM base + the init-puller). Same image serves any model.
- **Cost**: S3 storage is ~$0.023/GB-month, vs. ~$0.10/GB-month for ECR. For a 100GB model fleet, that's $77/year vs. $850/year, before egress.
- **Auditing**: a single bucket with versioning + access logs gives you a one-stop "who pulled what model when" audit trail.

## What "promote" looks like

```bash
# scripts/promote-model.sh — invoked by the model-release GH Action
DIGEST=$(aws s3api head-object --bucket models --key raw/llama3-8b-v2/model.safetensors --query 'Metadata.sha256' --output text)

# 1. Copy to content-addressed location
aws s3 cp s3://models/raw/llama3-8b-v2/ s3://models/models/llama3-8b/$DIGEST/ --recursive

# 2. Sign the digest
cosign sign --key cosign.key s3://models/models/llama3-8b/$DIGEST/

# 3. Update the env pointer
echo "$DIGEST" | aws s3 cp - s3://models/refs/prod/llama3-8b

# 4. Open a PR bumping workloads/llm-serving/values.yaml model.digest
```

## Consequences

- **Positive**: clean separation between artifact storage and container images. Trivial rollback. Cost-efficient.
- **Negative**: init-container adds ~30-60s to pod startup (proportional to model size + bandwidth). Mitigated with a node-local cache (DaemonSet seeds frequently-used models to a `hostPath` volume). For a model pod that lives for hours, the one-time cost is fine.
- **Security**: bucket misconfiguration could leak weights. Mitigation: bucket is private, access via IRSA/WI scoped to specific model paths, encryption at rest, access logged.
