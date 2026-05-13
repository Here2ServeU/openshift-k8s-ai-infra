# Mirror of terraform/aws/outputs.tf — same keys, GCP values. See ADR-007.

output "cluster_name" {
  value = google_container_cluster.primary.name
}

output "cluster_endpoint" {
  value = google_container_cluster.primary.endpoint
}

output "cluster_oidc_issuer" {
  value = "https://container.googleapis.com/v1/${google_container_cluster.primary.id}"
}

output "model_bucket_uri" {
  value = "gs://${google_storage_bucket.models.name}"
}

output "model_puller_service_account" {
  value = google_service_account.model_puller.email
}

output "node_gpu_taint_key" {
  value = "nvidia.com/gpu"
}

output "node_gpu_label" {
  value = "nvidia.com/gpu"
}

output "kubeconfig_command" {
  value = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region ${var.region} --project ${var.project_id}"
}
