terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.14"
    }
  }

  # Wire your own S3+DynamoDB backend in real usage.
  # backend "s3" {
  #   bucket         = "<your-tfstate-bucket>"
  #   key            = "k8s-ai-ml-infra/aws/terraform.tfstate"
  #   region         = "us-west-2"
  #   dynamodb_table = "terraform-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project     = "k8s-ai-ml-infra"
      managed-by  = "terraform"
      environment = var.environment
      cost-center = var.cost_center
    }
  }
}
