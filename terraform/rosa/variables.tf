variable "rhcs_token" {
  description = "Red Hat OpenShift Cluster Manager (OCM) offline token. Get it from https://console.redhat.com/openshift/token/rosa. Prefer the RHCS_TOKEN env var."
  type        = string
  sensitive   = true
}

variable "region" {
  description = "AWS region for the ROSA cluster."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment tag (dev/staging/prod) — applied to every resource."
  type        = string
  default     = "dev"
}

variable "cost_center" {
  description = "FinOps tag for chargeback."
  type        = string
  default     = "platform"
}

variable "cluster_name" {
  description = "ROSA cluster name."
  type        = string
  default     = "ai-ml-infra"
}

variable "openshift_version" {
  description = "OpenShift version (must be available for ROSA HCP in the region)."
  type        = string
  default     = "4.16.20"
}

variable "vpc_cidr" {
  type    = string
  default = "10.43.0.0/16"
}

variable "az_count" {
  description = "Number of AZs to spread the cluster across."
  type        = number
  default     = 3
}

variable "cpu_instance_type" {
  description = "Instance type for the default (system/CPU) machine pool."
  type        = string
  default     = "m6i.xlarge"
}

variable "cpu_replicas" {
  description = "Replicas for the default machine pool (multiple of az_count for HCP)."
  type        = number
  default     = 3
}

variable "gpu_instance_type" {
  description = "Instance type for the GPU machine pool."
  type        = string
  default     = "g5.xlarge"
}

variable "gpu_min_replicas" {
  description = "Autoscaler floor for the GPU pool (0 = scale-to-zero when idle)."
  type        = number
  default     = 0
}

variable "gpu_max_replicas" {
  description = "Autoscaler ceiling for the GPU pool."
  type        = number
  default     = 4
}

variable "model_bucket_name" {
  description = "S3 bucket for model artifacts (must be globally unique)."
  type        = string
  default     = "ai-ml-infra-models-rosa"
}
