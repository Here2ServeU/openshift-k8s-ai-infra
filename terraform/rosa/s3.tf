# -----------------------------------------------------------------------------
# Model artifact bucket — identical shape to terraform/aws/s3.tf (content-addressed
# storage, versioned, encrypted, public access blocked). See ADR-004.
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

# -----------------------------------------------------------------------------
# Workload identity for the model-puller pod.
#
# OpenShift's equivalent of EKS IRSA: the cluster's OIDC provider (created by the
# rosa_oidc module) issues ServiceAccount tokens; this IAM role trusts that
# provider and is scoped to the workloads:model-puller / workloads:vllm-* SAs.
# The pod assumes it via the projected SA token + AWS_ROLE_ARN env (pod identity
# webhook), so no static cloud keys live in the cluster — same posture as the
# other cloud profiles.
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "model_puller" {
  statement {
    sid       = "ListBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.models.arn]
  }
  statement {
    sid       = "ReadObjects"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.models.arn}/models/*"]
  }
}

resource "aws_iam_policy" "model_puller" {
  name   = "${var.cluster_name}-model-puller"
  policy = data.aws_iam_policy_document.model_puller.json
}

locals {
  # Strip the scheme so we can build the federated-principal ARN + sub conditions.
  oidc_host = replace(module.rosa_oidc.oidc_endpoint_url, "https://", "")
  puller_service_accounts = [
    "system:serviceaccount:workloads:model-puller",
    "system:serviceaccount:workloads:vllm-llama3-8b",
  ]
}

data "aws_iam_policy_document" "model_puller_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_host}"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = local.puller_service_accounts
    }
  }
}

resource "aws_iam_role" "model_puller" {
  name               = "${var.cluster_name}-model-puller"
  assume_role_policy = data.aws_iam_policy_document.model_puller_trust.json
}

resource "aws_iam_role_policy_attachment" "model_puller" {
  role       = aws_iam_role.model_puller.name
  policy_arn = aws_iam_policy.model_puller.arn
}
