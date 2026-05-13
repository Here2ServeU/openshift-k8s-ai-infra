terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.116"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.53"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }

  # Wire your own Azure Storage backend in real usage.
  # backend "azurerm" {
  #   resource_group_name  = "tfstate"
  #   storage_account_name = "yourtfstateaccount"
  #   container_name       = "tfstate"
  #   key                  = "k8s-ai-ml-infra/azure.tfstate"
  # }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

provider "azuread" {}
