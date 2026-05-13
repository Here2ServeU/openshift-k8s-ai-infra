variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "cost_center" {
  type    = string
  default = "platform"
}

variable "cluster_name" {
  type    = string
  default = "ai-ml-infra"
}

variable "kubernetes_version" {
  type    = string
  default = "1.30"
}

variable "model_bucket_name" {
  description = "GCS bucket for model artifacts (must be globally unique)."
  type        = string
  default     = "ai-ml-infra-models"
}

variable "gpu_accelerator_type" {
  type    = string
  default = "nvidia-l4"
}

variable "gpu_machine_type" {
  type    = string
  default = "g2-standard-8"
}
