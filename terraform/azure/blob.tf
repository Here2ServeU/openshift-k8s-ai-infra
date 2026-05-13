# -----------------------------------------------------------------------------
# Model artifact storage — Azure Blob Storage, content-addressed.
# Mirrors S3 / GCS. See ADR-004.
# -----------------------------------------------------------------------------
resource "azurerm_storage_account" "models" {
  name                     = var.model_storage_account_name
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"

  https_traffic_only_enabled  = true
  min_tls_version             = "TLS1_2"
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = true   # tighten for prod (private endpoint)

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 30
    }
  }

  tags = merge(local.tags, { workload = "model-registry" })
}

resource "azurerm_storage_container" "models" {
  name                  = var.model_container_name
  storage_account_id    = azurerm_storage_account.models.id
  container_access_type = "private"
}

resource "azurerm_storage_management_policy" "models" {
  storage_account_id = azurerm_storage_account.models.id

  rule {
    name    = "raw-to-archive"
    enabled = true
    filters {
      prefix_match = ["${var.model_container_name}/raw/"]
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        tier_to_archive_after_days_since_modification_greater_than = 30
      }
    }
  }
}

# -----------------------------------------------------------------------------
# Workload Identity — bind a managed identity to the k8s SA `workloads/model-puller`.
# The federation credential is what makes AKS's OIDC provider trust the SA.
# -----------------------------------------------------------------------------
resource "azurerm_user_assigned_identity" "model_puller" {
  name                = "${var.cluster_name}-model-puller"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = local.tags
}

resource "azurerm_role_assignment" "model_puller_blob_read" {
  scope                = azurerm_storage_account.models.id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.model_puller.principal_id
}

resource "azurerm_federated_identity_credential" "model_puller" {
  name                = "${var.cluster_name}-model-puller-fic"
  resource_group_name = azurerm_resource_group.rg.name
  parent_id           = azurerm_user_assigned_identity.model_puller.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.aks.oidc_issuer_url
  subject             = "system:serviceaccount:workloads:model-puller"
}
