# These outputs form the "cloud-portable contract" consumed by Helm values.
# See ADR-007 — the GCP root module produces the same shape.

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_oidc_issuer" {
  value = module.eks.cluster_oidc_issuer_url
}

output "model_bucket_uri" {
  value = "s3://${aws_s3_bucket.models.bucket}"
}

output "model_puller_role_arn" {
  value = module.model_puller_irsa.iam_role_arn
}

output "node_gpu_taint_key" {
  value = "nvidia.com/gpu"
}

output "node_gpu_label" {
  value = "nvidia.com/gpu"
}

output "karpenter_queue_name" {
  value = module.karpenter.queue_name
}

output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}
