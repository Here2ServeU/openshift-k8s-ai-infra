# -----------------------------------------------------------------------------
# Model artifact bucket — GCS equivalent of the AWS S3 bucket.
# Same content-addressed pattern, same access shape — see ADR-004.
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "models" {
  name     = var.model_bucket_name
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning { enabled = true }

  lifecycle_rule {
    condition { age = 30, matches_prefix = ["raw/"] }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }

  lifecycle_rule {
    condition { age = 1, with_state = "ARCHIVED" }
    action { type = "Delete" }
  }

  labels = local.labels
}

# Service account for pods that need to pull models.
resource "google_service_account" "model_puller" {
  account_id   = "${var.cluster_name}-model-puller"
  display_name = "Pulls model artifacts from GCS"
}

resource "google_storage_bucket_iam_member" "model_puller_read" {
  bucket = google_storage_bucket.models.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.model_puller.email}"
}

# Workload Identity binding — lets the k8s SA `workloads/model-puller` act as
# this GCP SA. Equivalent to AWS IRSA. See ADR-007.
resource "google_service_account_iam_member" "model_puller_wi" {
  service_account_id = google_service_account.model_puller.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[workloads/model-puller]"
}
