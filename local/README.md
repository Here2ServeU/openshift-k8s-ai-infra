# Local cluster (kind)

A 1 control-plane + 3 worker kind cluster that mirrors the cloud topology closely enough to validate the workload manifests without paying for GPU instances.

## Workload-type labels

The worker nodes are labelled to mirror the cloud node pools:

- `workload-type=serving` (2 nodes) — vLLM, KServe, the inference gateway. In cloud, these have GPUs and the `nvidia.com/gpu` taint.
- `workload-type=batch` (1 node) — Argo Workflows, the eval harness, data pipeline jobs.

Pod specs use `nodeSelector: workload-type=serving` (and tolerations for the GPU taint in cloud). Locally the toleration is a no-op.

## What changes vs. cloud

| Component | Local | Cloud |
|---|---|---|
| LLM runtime | vLLM CPU image, TinyLlama-1.1B | vLLM GPU image, Llama-3-8B / Mistral-7B |
| Model storage | MinIO in-cluster | S3 / GCS |
| Secrets | `fake` ESO ClusterSecretStore | AWS Secrets Manager / GCP Secret Manager |
| Node autoscaler | None (fixed 3 workers) | Karpenter / GKE NAP |
| Ingress | kind port-mapping (80/443 → host) | NLB / GCP LB |
| TLS | self-signed (cert-manager `selfsigned-issuer`) | Let's Encrypt |
| GPU | None (CPU build) | NVIDIA L4 / A10G |

## Selecting profiles

The app-of-apps reads `profile=local` (default for kind) which causes the workload Helm charts to layer `values-local.yaml` over the base values. Cloud deploys set `profile=aws` or `profile=gcp`.

## Resource notes

You'll want at least 16GB RAM allocated to Docker. The CPU vLLM build of TinyLlama runs OK with ~6GB RAM and 2 cores; the rest goes to platform components (Prom is the biggest at ~2GB).
