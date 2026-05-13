# Terraform — AWS

Provisions:

- VPC with 3 AZs, private + public subnets, single-NAT for dev (flip to per-AZ NAT for prod).
- EKS cluster (1.30) with a 2-node system pool and a 0-2 node GPU "warm pool".
- Karpenter for sub-90s GPU node bursts (NodePool definitions live in [`platform/karpenter/`](../../platform/karpenter/)).
- S3 model bucket — versioned, encrypted, public access blocked, lifecycle to Glacier for `raw/`.
- IRSA role for pods that need to pull from the model bucket.

## Apply

```bash
terraform init
terraform plan
terraform apply
# Then:
$(terraform output -raw kubeconfig_command)
```

## Cost notes

The default config is dev-grade — single NAT, public endpoint, 2× `m6i.large` system nodes. Steady-state cost is roughly:

- EKS control plane: $73/month
- 2× `m6i.large`: ~$140/month
- NAT gateway: ~$35/month
- S3: pennies until you load real models

Add ~$25/hr per GPU node when Karpenter provisions one (g5.xlarge spot is ~$0.30/hr; on-demand is ~$1.00/hr).

## Production checklist

- [ ] Flip `single_nat_gateway = false` for HA.
- [ ] Set `cluster_endpoint_public_access = false` and use a VPN/bastion.
- [ ] Configure the S3 backend in `versions.tf` (uncomment + fill in).
- [ ] Tighten the IRSA `namespace_service_accounts` list to specific SAs you actually use.
- [ ] Add `aws_kms_key` + use SSE-KMS instead of SSE-S3 for `model-bucket`.
- [ ] Set `enable_irsa_for_service_accounts_on_pods` for the AWS-LB-controller, ExternalDNS, ESO, etc.

## Why this shape

See [`docs/decisions/007-multi-cloud-terraform.md`](../../docs/decisions/007-multi-cloud-terraform.md) — every cloud root produces the same outputs (`model_bucket_uri`, `cluster_oidc_issuer`, `node_gpu_label`, etc.) so the workload Helm charts don't change.
