variable "region" {
  description = "AWS region for the cluster."
  type        = string
  default     = "us-west-2"
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
  description = "EKS cluster name."
  type        = string
  default     = "ai-ml-infra"
}

variable "kubernetes_version" {
  description = "EKS control-plane version."
  type        = string
  default     = "1.30"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "gpu_instance_types" {
  description = "Instance types Karpenter is allowed to provision for GPU NodePool."
  type        = list(string)
  default     = ["g5.xlarge", "g5.2xlarge", "g4dn.xlarge"]
}

variable "cpu_instance_types" {
  description = "Instance types for the system / CPU-only workloads."
  type        = list(string)
  default     = ["m6i.large", "m6i.xlarge"]
}

variable "model_bucket_name" {
  description = "S3 bucket for model artifacts (must be globally unique)."
  type        = string
  default     = "ai-ml-infra-models"
}
