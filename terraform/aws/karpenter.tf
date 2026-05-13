# -----------------------------------------------------------------------------
# Karpenter — sub-90s GPU node provisioning. See ADR-002.
# -----------------------------------------------------------------------------
module "karpenter" {
  source  = "terraform-aws-modules/eks/aws//modules/karpenter"
  version = "~> 20.24"

  cluster_name           = module.eks.cluster_name
  enable_v1_permissions  = true
  enable_pod_identity    = true
  create_pod_identity_association = true

  # The CFN-managed instance profile so Karpenter can launch nodes.
  node_iam_role_additional_policies = {
    AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  }

  tags = local.tags
}

resource "helm_release" "karpenter" {
  namespace        = "karpenter"
  create_namespace = true
  name             = "karpenter"
  repository       = "oci://public.ecr.aws/karpenter"
  chart            = "karpenter"
  version          = "1.0.6"

  values = [yamlencode({
    settings = {
      clusterName       = module.eks.cluster_name
      clusterEndpoint   = module.eks.cluster_endpoint
      interruptionQueue = module.karpenter.queue_name
    }
    serviceAccount = {
      annotations = {
        "eks.amazonaws.com/role-arn" = module.karpenter.iam_role_arn
      }
    }
    controller = {
      resources = {
        requests = { cpu = "1",   memory = "1Gi" }
        limits   = { cpu = "1",   memory = "1Gi" }
      }
    }
  })]
}

# NodePools and EC2NodeClasses are defined as Kubernetes manifests under
# platform/karpenter/. They're applied via ArgoCD after the cluster is up.
