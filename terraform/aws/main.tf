data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
  tags = {
    cluster = var.cluster_name
  }
}

# -----------------------------------------------------------------------------
# VPC
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

  # Required for EKS load balancers
  public_subnet_tags = {
    "kubernetes.io/role/elb"                      = 1
    "kubernetes.io/cluster/${var.cluster_name}"   = "shared"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"             = 1
    "kubernetes.io/cluster/${var.cluster_name}"   = "shared"
    # Karpenter discovery
    "karpenter.sh/discovery"                      = var.cluster_name
  }
}

# -----------------------------------------------------------------------------
# EKS — cluster + a small system node group + GPU node group.
# Karpenter handles burst capacity for GPU workloads; the static node group is
# for system pods (ArgoCD, Prom, KEDA, Karpenter itself) and small CPU workloads.
# -----------------------------------------------------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name                   = var.cluster_name
  cluster_version                = var.kubernetes_version
  cluster_endpoint_public_access = true

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  enable_cluster_creator_admin_permissions = true

  cluster_addons = {
    coredns                = { most_recent = true }
    kube-proxy             = { most_recent = true }
    vpc-cni                = { most_recent = true }
    aws-ebs-csi-driver     = { most_recent = true }
    eks-pod-identity-agent = { most_recent = true }
  }

  eks_managed_node_groups = {
    system = {
      desired_size   = 2
      min_size       = 2
      max_size       = 4
      instance_types = var.cpu_instance_types
      labels = {
        workload-type = "system"
      }
      # Karpenter discovery happens by subnet/sg tags, not by these nodes.
    }

    # A small managed GPU pool — used as warm capacity. Karpenter handles bursts.
    gpu-warm = {
      desired_size   = 0
      min_size       = 0
      max_size       = 2
      instance_types = ["g5.xlarge"]
      ami_type       = "AL2_x86_64_GPU"
      capacity_type  = "ON_DEMAND"
      labels = {
        workload-type      = "serving"
        nvidia.com/gpu     = "true"
      }
      taints = [{
        key    = "nvidia.com/gpu"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  node_security_group_tags = {
    "karpenter.sh/discovery" = var.cluster_name
  }

  tags = local.tags
}
