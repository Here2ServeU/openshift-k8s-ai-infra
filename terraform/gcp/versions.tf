terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.43"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.43"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }

  # Wire your own GCS backend in real usage.
  # backend "gcs" {
  #   bucket = "<your-tfstate-bucket>"
  #   prefix = "k8s-ai-ml-infra/gcp"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
