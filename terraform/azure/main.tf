locals {
  tags = {
    project     = "k8s-ai-ml-infra"
    managed-by  = "terraform"
    environment = var.environment
    cost-center = var.cost_center
  }
}

# -----------------------------------------------------------------------------
# Resource Group
# -----------------------------------------------------------------------------
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.tags
}

# -----------------------------------------------------------------------------
# VNet + subnet for the cluster
# -----------------------------------------------------------------------------
resource "azurerm_virtual_network" "vnet" {
  name                = "${var.cluster_name}-vnet"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  address_space       = [var.address_space]
  tags                = local.tags
}

resource "azurerm_subnet" "aks" {
  name                 = "${var.cluster_name}-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [cidrsubnet(var.address_space, 4, 0)] # 10.42.0.0/20
}

# -----------------------------------------------------------------------------
# AKS — Workload Identity is the Azure analogue of IRSA / GCP WI. Federated
# identity credentials map a k8s SA to a managed identity for that subject.
# -----------------------------------------------------------------------------
resource "azurerm_kubernetes_cluster" "aks" {
  name                = var.cluster_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = var.cluster_name
  kubernetes_version  = var.kubernetes_version

  # OIDC + Workload Identity — required for federated pod identity.
  oidc_issuer_enabled       = true
  workload_identity_enabled = true

  # System node pool — for platform components (ArgoCD, Prom, KEDA).
  default_node_pool {
    name           = "system"
    vm_size        = var.system_vm_size
    node_count     = 2
    vnet_subnet_id = azurerm_subnet.aks.id
    type           = "VirtualMachineScaleSets"
    node_labels = {
      "workload-type" = "system"
    }
    only_critical_addons_enabled = true
    auto_scaling_enabled         = true
    min_count                    = 2
    max_count                    = 5
  }

  network_profile {
    network_plugin    = "azure"
    network_policy    = "calico"
    load_balancer_sku = "standard"
  }

  identity {
    type = "SystemAssigned"
  }

  monitor_metrics {} # enables managed Prometheus integration

  # Container Insights — node/pod logs and inventory into Log Analytics.
  # The audit/compliance surface; Grafana stays the operator surface (ADR-011).
  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.ops.id
  }

  azure_policy_enabled = true

  # Patching is a managed cadence, not an event (ADR-011): control-plane patch
  # versions and node OS CVEs auto-apply inside the window below. Kubernetes
  # minor upgrades stay a deliberate, human-run change.
  automatic_upgrade_channel = "patch"
  node_os_upgrade_channel   = "NodeImage"

  maintenance_window_auto_upgrade {
    frequency   = "Weekly"
    interval    = 1
    duration    = 4
    day_of_week = var.maintenance_day
    start_time  = "02:00"
    utc_offset  = "+00:00"
  }

  maintenance_window_node_os {
    frequency   = "Weekly"
    interval    = 1
    duration    = 4
    day_of_week = var.maintenance_day
    start_time  = "06:00"
    utc_offset  = "+00:00"
  }

  tags = local.tags
}

# -----------------------------------------------------------------------------
# GPU node pool. Spot priority for cost — Azure spot has eviction notice via
# the Scheduled Events metadata service, which we surface to drain pods.
# Cluster Autoscaler handles 0..N. For sub-90s GPU bursts on Azure, AKS uses
# its own autoscaler (Karpenter is preview on AKS — when GA, swap in).
# -----------------------------------------------------------------------------
resource "azurerm_kubernetes_cluster_node_pool" "gpu" {
  name                  = "gpu"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.aks.id
  vm_size               = var.gpu_vm_size
  vnet_subnet_id        = azurerm_subnet.aks.id

  priority        = "Spot"
  eviction_policy = "Delete"
  spot_max_price  = -1 # pay up to on-demand price

  node_count           = 0
  min_count            = 0
  max_count            = 4
  auto_scaling_enabled = true

  node_labels = {
    "workload-type"                         = "serving"
    "nvidia.com/gpu"                        = "true"
    "kubernetes.azure.com/scalesetpriority" = "spot"
  }

  node_taints = [
    "nvidia.com/gpu=true:NoSchedule",
    "kubernetes.azure.com/scalesetpriority=spot:NoSchedule",
  ]

  tags = local.tags
}
