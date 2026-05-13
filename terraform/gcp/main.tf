locals {
  labels = {
    project     = "k8s-ai-ml-infra"
    managed_by  = "terraform"
    environment = var.environment
    cost_center = var.cost_center
  }
}

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------
resource "google_compute_network" "vpc" {
  name                    = "${var.cluster_name}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.cluster_name}-subnet"
  network       = google_compute_network.vpc.id
  region        = var.region
  ip_cidr_range = "10.42.0.0/20"

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.43.0.0/16"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.44.0.0/20"
  }

  private_ip_google_access = true
}

resource "google_compute_router" "router" {
  name    = "${var.cluster_name}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "${var.cluster_name}-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# -----------------------------------------------------------------------------
# GKE cluster — Standard mode (we want node-pool control, not Autopilot).
# Workload Identity is the GCP analogue of IRSA.
# -----------------------------------------------------------------------------
resource "google_container_cluster" "primary" {
  provider = google-beta

  name     = var.cluster_name
  location = var.region

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  release_channel {
    channel = "REGULAR"
  }

  # Enable cluster autoscaling for the cluster overall (NAP) so KEDA-triggered
  # bursts can provision GPU nodes on demand. Constraints in `resource_limits`.
  cluster_autoscaling {
    enabled = true
    resource_limits {
      resource_type = "cpu"
      minimum       = 1
      maximum       = 100
    }
    resource_limits {
      resource_type = "memory"
      minimum       = 4
      maximum       = 400
    }
    resource_limits {
      resource_type = var.gpu_accelerator_type
      minimum       = 0
      maximum       = 8
    }
    autoscaling_profile = "OPTIMIZE_UTILIZATION"
  }

  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
    managed_prometheus {
      enabled = true
    }
  }

  resource_labels = local.labels
}

# -----------------------------------------------------------------------------
# System node pool — small CPU pool for platform components.
# -----------------------------------------------------------------------------
resource "google_container_node_pool" "system" {
  name     = "system"
  cluster  = google_container_cluster.primary.id
  location = var.region

  node_count = 1 # per zone — region has 3 zones, so 3 total

  node_config {
    machine_type = "e2-standard-4"
    disk_size_gb = 50
    disk_type    = "pd-standard"

    labels = merge(local.labels, {
      workload-type = "system"
    })

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    service_account = google_service_account.gke_nodes.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  autoscaling {
    min_node_count = 1
    max_node_count = 3
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# -----------------------------------------------------------------------------
# GPU node pool — scales 0..8 nodes. The cluster's NAP also handles bursts
# beyond this pool's max via dynamically created pools.
# -----------------------------------------------------------------------------
resource "google_container_node_pool" "gpu" {
  name     = "gpu"
  cluster  = google_container_cluster.primary.id
  location = var.region

  initial_node_count = 0

  node_config {
    machine_type = var.gpu_machine_type
    disk_size_gb = 200
    disk_type    = "pd-ssd"
    spot         = true # most cost-savings come from this

    guest_accelerator {
      type  = var.gpu_accelerator_type
      count = 1
      gpu_driver_installation_config {
        gpu_driver_version = "LATEST"
      }
    }

    labels = merge(local.labels, {
      workload-type   = "serving"
      "nvidia.com/gpu" = "true"
    })

    taint {
      key    = "nvidia.com/gpu"
      value  = "true"
      effect = "NO_SCHEDULE"
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    service_account = google_service_account.gke_nodes.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  autoscaling {
    min_node_count  = 0
    max_node_count  = 4
    location_policy = "ANY" # spot — take whatever zone has capacity
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

resource "google_service_account" "gke_nodes" {
  account_id   = "${var.cluster_name}-nodes"
  display_name = "GKE node SA"
}
