# -----------------------------------------------------------------------------
# Azure-native operations layer (ADR-011).
#
# The in-cluster OTel -> Prometheus/Loki/Tempo pipeline stays the operator
# surface. This file adds the compliance/audit surface: a Log Analytics
# workspace fed by Container Insights + AKS control-plane diagnostics, and a
# workspace-based Application Insights resource for agent transaction traces.
# The OTel Collector dual-exports into App Insights via its connection string.
# -----------------------------------------------------------------------------

resource "azurerm_log_analytics_workspace" "ops" {
  name                = "${var.cluster_name}-logs"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"

  # Interactive retention. Audit-grade retention beyond this is cheaper as
  # archive tier / export-to-storage — configure per compliance requirement.
  retention_in_days = var.log_retention_days

  tags = local.tags
}

resource "azurerm_application_insights" "agents" {
  name                = "${var.cluster_name}-appinsights"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  workspace_id        = azurerm_log_analytics_workspace.ops.id
  application_type    = "web"

  tags = local.tags
}

# Control-plane logs are only reachable via diagnostic settings — no in-cluster
# scrape can see them. kube-audit-admin (mutations only) instead of the full
# kube-audit firehose: it's the log an incident review and a HIPAA audit
# actually need, at a fraction of the ingestion cost.
resource "azurerm_monitor_diagnostic_setting" "aks" {
  name                       = "${var.cluster_name}-control-plane"
  target_resource_id         = azurerm_kubernetes_cluster.aks.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.ops.id

  enabled_log {
    category = "kube-apiserver"
  }

  enabled_log {
    category = "kube-audit-admin"
  }

  enabled_log {
    category = "kube-controller-manager"
  }

  enabled_log {
    category = "kube-scheduler"
  }

  enabled_log {
    category = "cluster-autoscaler"
  }

  enabled_log {
    category = "guard" # AAD/authn webhook — who authenticated, and how
  }

  # No metric categories on purpose — metrics live in Prometheus (managed
  # Prometheus integration is on via monitor_metrics); don't store them twice.
}
