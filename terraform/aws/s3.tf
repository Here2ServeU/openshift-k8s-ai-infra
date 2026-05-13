# -----------------------------------------------------------------------------
# Model artifact bucket — content-addressed storage for safetensors weights.
# See ADR-004.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "models" {
  bucket = var.model_bucket_name

  tags = {
    workload = "model-registry"
  }
}

resource "aws_s3_bucket_versioning" "models" {
  bucket = aws_s3_bucket.models.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "models" {
  bucket = aws_s3_bucket.models.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "models" {
  bucket                  = aws_s3_bucket.models.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle: move old versions of `raw/` to Glacier after 30 days.
# Verified content-addressed objects stay in Standard (frequently accessed).
resource "aws_s3_bucket_lifecycle_configuration" "models" {
  bucket = aws_s3_bucket.models.id

  rule {
    id     = "raw-to-glacier"
    status = "Enabled"
    filter { prefix = "raw/" }
    transition {
      days          = 30
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

# IAM policy for pods that need to pull models (via IRSA).
data "aws_iam_policy_document" "model_puller" {
  statement {
    sid     = "ListBucket"
    actions = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.models.arn]
  }
  statement {
    sid     = "ReadObjects"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.models.arn}/models/*"]
  }
}

resource "aws_iam_policy" "model_puller" {
  name   = "${var.cluster_name}-model-puller"
  policy = data.aws_iam_policy_document.model_puller.json
}

# IRSA — bind the policy to a service account in the workloads namespace.
module "model_puller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.44"

  role_name        = "${var.cluster_name}-model-puller"
  role_policy_arns = { policy = aws_iam_policy.model_puller.arn }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["workloads:model-puller", "workloads:vllm-llama3-8b"]
    }
  }
}
