# Mirror of terraform/{aws,gcp}/outputs.tf — same keys, Azure values. See ADR-007.

output "cluster_name" {
  value = azurerm_kubernetes_cluster.aks.name
}

output "cluster_endpoint" {
  value = azurerm_kubernetes_cluster.aks.kube_config.0.host
  sensitive = true
}

output "cluster_oidc_issuer" {
  value = azurerm_kubernetes_cluster.aks.oidc_issuer_url
}

output "model_bucket_uri" {
  # Workload-portable URI: container-name@storage-account. The puller image's
  # rclone backend speaks az:// when given this layout.
  value = "az://${azurerm_storage_container.models.name}@${azurerm_storage_account.models.name}"
}

output "model_puller_client_id" {
  description = "Client ID of the managed identity for the model-puller SA. Annotated on the SA via `azure.workload.identity/client-id`."
  value       = azurerm_user_assigned_identity.model_puller.client_id
}

output "model_puller_tenant_id" {
  value = azurerm_user_assigned_identity.model_puller.tenant_id
}

output "node_gpu_taint_key" {
  value = "nvidia.com/gpu"
}

output "node_gpu_label" {
  value = "nvidia.com/gpu"
}

output "kubeconfig_command" {
  value = "az aks get-credentials --resource-group ${azurerm_resource_group.rg.name} --name ${azurerm_kubernetes_cluster.aks.name}"
}
