# terraform/rosa — Red Hat OpenShift Service on AWS (ROSA HCP)

Provisions a **ROSA Hosted Control Plane** cluster with a tainted, autoscaling GPU
machine pool and the content-addressed model bucket — the OpenShift sibling of
`terraform/aws`. It produces the **same output contract** (`cluster_oidc_issuer`,
`model_bucket_uri`, `model_puller_role_arn`, GPU label/taint) so the Helm bootstrap
renders [`values-openshift.yaml`](../../workloads/llm-serving/helm/values-openshift.yaml)
exactly the way it renders the EKS/GKE/AKS profiles (ADR-007).

Why ROSA HCP over Classic: Red Hat runs the control plane (like EKS's managed control
plane), you pay for workers only, and clusters come up in ~10 min instead of ~40.

> ROSA is one of three ways to land OpenShift; the others are **ARO** (Azure Red Hat
> OpenShift) and **self-managed** (installer-provisioned / agent-based on bare metal or
> vSphere). The platform layer in [`platform/openshift/`](../../platform/openshift/) is
> identical across all three — only this provisioning module is AWS-specific. ADR-010
> covers the trade-offs.

## Prerequisites

```bash
# 1. ROSA enabled in the AWS account (one-time):
rosa init                     # or: enable the ROSA service in the AWS console

# 2. An OCM offline token from https://console.redhat.com/openshift/token/rosa
export RHCS_TOKEN="<token>"    # the rhcs provider reads this

# 3. Service-linked role for ELB (one-time per account):
aws iam create-service-linked-role --aws-service-name elasticloadbalancing.amazonaws.com || true
```

## Apply

```bash
cd terraform/rosa
terraform init
terraform apply                 # ~10-15 min for ROSA HCP

# Log in (the module prints the exact command):
rosa create admin --cluster ai-ml-infra
oc login <cluster_api_url> -u cluster-admin -p <generated-password>

# Then bring up the OpenShift platform layer + workloads:
make ocp-up
```

## What it creates

| Resource | Purpose |
|---|---|
| VPC (3 AZ, private+public subnets, single NAT) | Cluster networking — same module as `terraform/aws` |
| ROSA account roles + OIDC config/provider + operator roles | STS least-privilege wiring (OpenShift's IRSA analog) |
| ROSA HCP cluster | Hosted control plane + default CPU machine pool |
| `gpu` machine pool | Autoscaling `g5.xlarge`, tainted `nvidia.com/gpu`, scale-to-zero floor |
| S3 model bucket (versioned, encrypted, private) | Content-addressed artifacts (ADR-004) |
| IAM role + policy trusting the cluster OIDC | `model-puller` / `vllm-*` SAs pull weights with no static keys |

## Cost note

ROSA HCP bills a per-cluster-hour control-plane fee **plus** the EC2 workers. The GPU pool
floors at `gpu_min_replicas = 0`, so an idle cluster only pays for the CPU machine pool +
control plane. `terraform destroy` tears everything down; run `rosa list clusters` afterward
to confirm no orphaned cluster keeps billing.
