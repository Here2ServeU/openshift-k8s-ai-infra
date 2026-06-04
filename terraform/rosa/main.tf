data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  tags = {
    cluster = var.cluster_name
  }
}

# -----------------------------------------------------------------------------
# VPC — ROSA HCP needs private + public subnets per AZ. We reuse the same
# community VPC module as terraform/aws so the networking story is identical.
# -----------------------------------------------------------------------------
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.13"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr
  azs  = local.azs

  private_subnets = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets  = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i + 8)]

  enable_nat_gateway   = true
  single_nat_gateway   = true # Cost — flip to false for prod HA
  enable_dns_hostnames = true

  tags = local.tags
}

# -----------------------------------------------------------------------------
# ROSA prerequisites — account roles, OIDC config/provider, operator roles.
# These STS roles are what let cluster operators assume least-privilege AWS
# permissions (the OpenShift analog of EKS IRSA). The rhcs sub-modules generate
# the exact policies Red Hat publishes for the chosen version.
# -----------------------------------------------------------------------------
module "rosa_account_roles" {
  source  = "terraform-redhat/rosa-hcp/rhcs//modules/account-iam-resources"
  version = ">= 1.6.2"

  account_role_prefix = var.cluster_name
}

module "rosa_oidc" {
  source  = "terraform-redhat/rosa-hcp/rhcs//modules/oidc-config-and-provider"
  version = ">= 1.6.2"

  managed = true
}

module "rosa_operator_roles" {
  source  = "terraform-redhat/rosa-hcp/rhcs//modules/operator-roles"
  version = ">= 1.6.2"

  operator_role_prefix = var.cluster_name
  account_role_prefix  = var.cluster_name
  oidc_endpoint_url    = module.rosa_oidc.oidc_endpoint_url
}

# -----------------------------------------------------------------------------
# ROSA HCP cluster — Hosted Control Plane: Red Hat runs the control plane, you
# pay for workers only. Closest analog to EKS's managed control plane, which is
# why it's the default here over Classic.
# -----------------------------------------------------------------------------
module "rosa_cluster" {
  source  = "terraform-redhat/rosa-hcp/rhcs"
  version = ">= 1.6.2"

  cluster_name           = var.cluster_name
  openshift_version      = var.openshift_version
  aws_billing_account_id = data.aws_caller_identity.current.account_id

  # Networking
  aws_subnet_ids     = concat(module.vpc.private_subnets, module.vpc.public_subnets)
  availability_zones = local.azs
  machine_cidr       = var.vpc_cidr

  # Default (system/CPU) machine pool
  replicas             = var.cpu_replicas
  compute_machine_type = var.cpu_instance_type

  # STS / OIDC wiring from the modules above
  create_account_roles  = false
  create_oidc           = false
  create_operator_roles = false
  account_role_prefix   = var.cluster_name
  operator_role_prefix  = var.cluster_name
  oidc_config_id        = module.rosa_oidc.oidc_config_id

  tags = local.tags

  depends_on = [
    module.rosa_account_roles,
    module.rosa_operator_roles,
  ]
}

# -----------------------------------------------------------------------------
# GPU machine pool — autoscaling, tainted so only GPU workloads land on it.
# This is the ROSA analog of the EKS gpu-warm node group + Karpenter. The
# NVIDIA GPU Operator (platform/openshift/gpu/) builds the driver onto these
# RHCOS nodes once they join.
# -----------------------------------------------------------------------------
resource "rhcs_hcp_machine_pool" "gpu" {
  cluster      = module.rosa_cluster.cluster_id
  name         = "gpu"
  machine_type = var.gpu_instance_type

  autoscaling = {
    enabled      = true
    min_replicas = var.gpu_min_replicas
    max_replicas = var.gpu_max_replicas
  }

  labels = {
    "workload-type"          = "serving"
    "nvidia.com/gpu.present" = "true"
  }

  taints = [{
    key           = "nvidia.com/gpu"
    value         = "true"
    schedule_type = "NoSchedule"
  }]
}
