# Same cloud-portable contract as terraform/{aws,gcp,azure}/outputs.tf (ADR-007),
# so the Helm bootstrap renders values-openshift.yaml the same way it renders the
# other clouds. The workload layer never learns it's on OpenShift.

output "cluster_name" {
  value = module.rosa_cluster.cluster_id
}

output "cluster_api_url" {
  value = module.rosa_cluster.cluster_api_url
}

output "cluster_console_url" {
  value = module.rosa_cluster.cluster_console_url
}

output "cluster_oidc_issuer" {
  value = module.rosa_oidc.oidc_endpoint_url
}

output "model_bucket_uri" {
  value = "s3://${aws_s3_bucket.models.bucket}"
}

output "model_puller_role_arn" {
  value = aws_iam_role.model_puller.arn
}

output "node_gpu_taint_key" {
  value = "nvidia.com/gpu"
}

output "node_gpu_label" {
  value = "nvidia.com/gpu.present"
}

# ROSA logs in via the OCM CLI rather than `aws eks update-kubeconfig`.
output "login_command" {
  value = "rosa create admin --cluster ${var.cluster_name}   # then: oc login <api-url> -u cluster-admin"
}
