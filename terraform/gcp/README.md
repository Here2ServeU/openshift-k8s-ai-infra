# Terraform — GCP

Provisions:

- VPC + subnet with secondary ranges for pods/services + Cloud NAT.
- GKE Standard cluster (1.30) with Workload Identity enabled.
- A small system node pool (e2-standard-4, 1-3 nodes per zone).
- A spot GPU node pool (g2-standard-8 + 1× L4, 0-4 nodes per zone).
- Cluster Autoscaling (NAP) for dynamic GPU pools above the static pool's max.
- GCS model bucket with the same lifecycle + IAM shape as the AWS S3 bucket.
- Workload Identity binding for pods that need to pull from the model bucket.

## Apply

```bash
export TF_VAR_project_id=your-gcp-project
terraform init
terraform plan
terraform apply
# Then:
$(terraform output -raw kubeconfig_command)
```

## Cost notes

Dev-grade defaults:

- GKE regional cluster (3 zones): ~$73/month control plane fee
- 3× e2-standard-4 system nodes: ~$120/month
- L4 spot GPUs (when provisioned): ~$0.30/hr each
- GCS: pennies until real models loaded

## Why the shape

Outputs mirror the AWS root module exactly (`model_bucket_uri`, `cluster_oidc_issuer`, etc.) so the workload Helm charts don't know which cloud they're running on. See [ADR-007](../../docs/decisions/007-multi-cloud-terraform.md).

## On GKE Autopilot

We use GKE Standard, not Autopilot, because:
1. Autopilot doesn't support all the GPU SKUs we want, and pricing is per-pod (not per-node) which is worse for batch GPU workloads.
2. We need explicit control over node taints / labels for Karpenter-style burst behavior via NAP.

If you don't care about GPU node-level optimization, Autopilot is a fine choice and reduces the ops surface.
