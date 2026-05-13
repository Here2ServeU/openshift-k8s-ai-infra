# Model registry

The "registry" is just an object-storage bucket with conventions. See [ADR-004](../../docs/decisions/004-model-artifacts.md) for the rationale on why we didn't build a fancier service.

## Layout (per bucket, same for S3 / GCS / Azure Blob)

```
<bucket>/
├── raw/                            # uploads land here first — unverified
│   └── <name>/<version>/model.safetensors
├── models/                         # content-addressed, verified, immutable
│   └── <name>/sha256-<digest>/
│       ├── model.safetensors
│       ├── tokenizer.json
│       └── config.json
├── refs/                           # tiny pointers
│   ├── dev/<name>           # contents = "sha256:<digest>"
│   ├── staging/<name>
│   └── prod/<name>
└── signatures/                     # cosign signatures of digests
    └── <digest>.sig
```

## The model-puller image

A small Go binary (multi-stage build, ~20MB image) that runs as an init-container in every model-serving pod:

1. Reads env: `MODEL_BUCKET_URI`, `MODEL_NAME`, `MODEL_DIGEST`, `CLOUD_PROVIDER`.
2. Uses [rclone](https://rclone.org) under the hood — speaks `s3://`, `gs://`, and `az://` from a single binary, authenticates via the pod's mounted IRSA / Workload Identity token.
3. Pulls `<bucket>/models/<name>/<digest>/` to `/models/<name>/`.
4. Computes sha256 of the safetensors file and compares to `MODEL_DIGEST`. **Exits non-zero on mismatch — pod won't start.**
5. Optional: verifies cosign signature against the digest.

```dockerfile
# Sketched in workloads/model-registry/Dockerfile (not built here)
FROM rclone/rclone:1.68 AS rclone
FROM gcr.io/distroless/static-debian12
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY puller /usr/local/bin/puller
ENTRYPOINT ["/usr/local/bin/puller"]
```

## The promote script

[`../../scripts/promote-model.sh`](../../scripts/promote-model.sh) handles the workflow:

```bash
./scripts/promote-model.sh \
  --name llama3-8b \
  --raw s3://models/raw/llama3-8b-v2/ \
  --env prod
```

What it does:

1. Compute sha256 of `model.safetensors` in the raw path.
2. Copy the directory to `<bucket>/models/<name>/<digest>/`.
3. cosign-sign the digest (key from External Secrets → `cosign-key`).
4. Update `<bucket>/refs/<env>/<name>` to the new digest.
5. Open a PR bumping `model.digest` in `workloads/llm-serving/helm/values-<env-cloud>.yaml`.

## Why not MLflow / Weights & Biases / SageMaker / Vertex AI

All of those work — but each adds a control plane to operate and a license/cost line item. For the *deployment* concern (which is what this repo is about), digest-pinned object storage is enough. Teams that want experiment tracking can layer MLflow on top without changing the deployment path.
