# ADR-007: Terraform abstraction for multi-cloud portability

**Status**: Accepted
**Date**: 2026-01

## Context

The same workloads should run on EKS, GKE, AKS, or `kind` locally. We want Terraform that's clean per cloud (not Crossplane-style abstractions hiding the actual provider) but also doesn't duplicate the same logic in three places.

## Decision

- **Per-cloud root modules** under `terraform/aws/`, `terraform/gcp/`, and `terraform/azure/`. Engineers read native AWS/GCP/Azure HCL — no leaky abstraction.
- **Shared concepts as small modules** under `terraform/modules/` (e.g., `model-bucket` exposes the same outputs regardless of S3, GCS, or Azure Blob).
- **A common Helm values contract** — `cloud-provider`, `model-bucket-uri`, `cluster-oidc-issuer`, `model-puller-identity`, etc. The workload layer reads these and doesn't know which cloud they came from.

We deliberately did **not** use Crossplane or Pulumi's cross-cloud abstractions. Reasons:
1. Cloud-specific gotchas (IRSA's trust policy, GCP's pod-to-SA binding, EKS's auth ConfigMap...) leak through any abstraction layer. Better to be explicit.
2. Hiring managers reading the Terraform should immediately see "yes this is real EKS" rather than parsing a custom abstraction.

## Module boundaries

```
terraform/
├── modules/
│   ├── model-bucket/           # outputs: bucket_uri, identity, region
│   │   ├── aws/                # S3 + IAM policy for IRSA
│   │   ├── gcp/                # GCS + IAM binding for Workload Identity
│   │   └── azure/              # Blob container + managed identity + federated credential
│   └── cluster-identity/       # OIDC trust glue (IRSA / WI / Azure WI)
├── aws/
│   ├── eks/                    # EKS cluster, GPU node group, Karpenter install
│   ├── networking/             # VPC, subnets, NAT, security groups
│   ├── iam/                    # OIDC provider, baseline roles
│   └── observability/          # Managed Prom workspace (optional)
├── gcp/
│   ├── gke/                    # GKE cluster, GPU node pool, NAP config
│   ├── networking/             # VPC, subnets, Cloud NAT
│   └── iam/                    # Workload Identity pool, baseline SAs
└── azure/
    ├── aks/                    # AKS cluster, GPU spot node pool, WI enabled
    ├── networking/             # VNet, subnet
    └── identity/               # Managed identity + federated credentials
```

Each cloud's root is self-contained: `cd terraform/aws && terraform apply` works. Modules are imported only where the abstraction is genuinely shared.

## Outputs as a contract

Every cloud root module exports the same shape (different values):

```hcl
output "cluster_endpoint"      { value = ... }
output "cluster_oidc_issuer"   { value = ... }
output "model_bucket_uri"      { value = ... }   # "s3://...", "gs://...", or "az://container@account"
output "model_puller_identity" { value = ... }   # IRSA ARN | GCP SA email | Azure managed identity client_id
output "node_gpu_taint_key"    { value = ... }
output "node_gpu_label"        { value = ... }
```

A small `scripts/render-helm-values.sh` reads these outputs and produces `values-cloud.yaml` for ArgoCD. ArgoCD uses Helm `valueFiles` to layer cloud-specific values onto the base chart.

## Consequences

- **Positive**: a workload chart's values reference `{{ .Values.cloud.modelBucketUri }}` and never know whether it resolves to S3 or GCS. Engineers can read the EKS Terraform without learning a custom DSL.
- **Negative**: when both clouds need to evolve, two PRs. Cost of clarity.
- **Risk**: drift between AWS and GCP root modules. Mitigated by CI that runs `terraform plan` on both for every PR — if you change one, the other shows up as drift in CI and you remember to update it.
