variable "location" {
  description = "Azure region."
  type        = string
  default     = "eastus"
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

variable "resource_group_name" {
  type    = string
  default = "ai-ml-infra-rg"
}

variable "kubernetes_version" {
  type    = string
  default = "1.30"
}

variable "address_space" {
  type    = string
  default = "10.42.0.0/16"
}

variable "system_vm_size" {
  description = "VM SKU for the system node pool."
  type        = string
  default     = "Standard_D4s_v5"
}

variable "gpu_vm_size" {
  description = "GPU VM SKU. NCasT4_v3 has T4 GPUs; NCadsA10_v4 has A10."
  type        = string
  default     = "Standard_NC4as_T4_v3"
}

variable "model_storage_account_name" {
  description = "Storage account for model artifacts (must be globally unique, 3-24 lowercase alphanum)."
  type        = string
  default     = "aimlmodels"
}

variable "model_container_name" {
  type    = string
  default = "models"
}
