terraform {
  required_version = ">= 1.6.0"

  required_providers {
    # Red Hat Cloud Services provider — manages ROSA clusters via the OCM API.
    rhcs = {
      source  = "terraform-redhat/rhcs"
      version = ">= 1.6.2"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  # Wire your own S3+DynamoDB backend in real usage (mirrors terraform/aws).
  # backend "s3" {
  #   bucket         = "<your-tfstate-bucket>"
  #   key            = "k8s-ai-ml-infra/rosa/terraform.tfstate"
  #   region         = "us-east-1"
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
      platform    = "openshift"
    }
  }
}

# Token from https://console.redhat.com/openshift/token/rosa — export as
# RHCS_TOKEN, or set via TF_VAR_rhcs_token.
provider "rhcs" {
  token = var.rhcs_token
}
