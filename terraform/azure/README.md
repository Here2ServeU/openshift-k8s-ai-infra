# Terraform — Azure (AKS)

Provisions:

- Resource group + VNet + subnet (single subnet — AKS handles pod IPs via Azure CNI).
- AKS cluster (1.30) with OIDC + Workload Identity enabled.
- System node pool (Standard_D4s_v5, 2-5 nodes).
- Spot GPU node pool (Standard_NC4as_T4_v3 by default, 0-4 nodes, autoscaling).
- Azure Storage account + container for model artifacts (versioned, archive lifecycle for `raw/`).
- User-assigned managed identity + role assignment + federated credential, the Azure equivalent of AWS IRSA / GCP Workload Identity.

## Apply

```bash
az login
az account set --subscription <your-sub-id>
terraform init
terraform plan
terraform apply
# Then:
$(terraform output -raw kubeconfig_command)
```

## Cost notes

Dev-grade defaults:

- AKS control plane: free for `Free` tier (default), $0.10/hr for `Standard` SLA
- 2× Standard_D4s_v5 system nodes: ~$280/month
- Spot T4 GPUs (when provisioned): ~$0.13/hr each (NC4as_T4_v3 spot)
- Storage: pennies until real models loaded

## On Karpenter for Azure

Karpenter has Azure support in preview (`karpenter-provider-azure`). Once GA we'll add a `karpenter.tf` analogous to the AWS one, swap to a tighter NodePool definition, and let Karpenter handle bursts. For now the AKS Cluster Autoscaler runs the GPU pool 0..4.

## Why the shape

Outputs mirror the AWS and GCP root modules exactly (`model_bucket_uri`, `cluster_oidc_issuer`, etc.) so the workload Helm charts don't know which cloud they're running on. See [ADR-007](../../docs/decisions/007-multi-cloud-terraform.md).

The one Azure-specific wrinkle: the `model_bucket_uri` uses the format `az://<container>@<account>` (rclone convention) because Azure Blob doesn't have a top-level URI scheme. The model-puller init-container's rclone wrapper handles all three (`s3://`, `gs://`, `az://`) transparently.

## Production checklist

- [ ] Replace public AKS endpoint with private cluster (`private_cluster_enabled = true`) + private endpoint to storage.
- [ ] Configure the Storage backend in `versions.tf`.
- [ ] Scope the `Storage Blob Data Reader` role to specific blob paths via condition.
- [ ] Use a customer-managed encryption key for the Storage account (Microsoft.KeyVault).
- [ ] Add Microsoft Defender for Containers if you're already on the Azure security stack.
