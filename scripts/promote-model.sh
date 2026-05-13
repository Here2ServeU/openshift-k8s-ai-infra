#!/usr/bin/env bash
# Promote a raw model artifact to a content-addressed, signed, env-tagged model.
# Used by the model-release GitHub Actions workflow (and by hand in incidents).
#
# Cloud-agnostic — speaks s3://, gs://, and az:// via rclone.
set -euo pipefail

NAME=""
RAW=""
ENV="staging"
BUCKET="${MODEL_BUCKET_URI:-}"
COSIGN_KEY="${COSIGN_KEY:-}"

usage() {
  cat <<EOF
Usage: $0 --name <model-name> --raw <bucket-uri/raw/path/> [--env <dev|staging|prod>] [--bucket <bucket-uri>]

  --name      Logical model name (e.g., llama3-8b)
  --raw       URI of the raw upload directory (s3://, gs://, or az://)
  --env       Promotion env (default: staging)
  --bucket    Override the bucket. Defaults to MODEL_BUCKET_URI env.

Requires: rclone, sha256sum, cosign (optional), gh (for PR creation)
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)   NAME="$2"; shift 2 ;;
    --raw)    RAW="$2"; shift 2 ;;
    --env)    ENV="$2"; shift 2 ;;
    --bucket) BUCKET="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown flag: $1" >&2; usage ;;
  esac
done

[[ -z "$NAME" || -z "$RAW" || -z "$BUCKET" ]] && usage

WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

echo "→ Pulling raw model to compute digest"
rclone copy "$RAW" "$WORK/raw/" --progress

DIGEST="sha256:$(sha256sum "$WORK/raw/model.safetensors" | awk '{print $1}')"
SHORT="${DIGEST:7:12}"
echo "→ Digest: $DIGEST"

DEST="$BUCKET/models/$NAME/$DIGEST/"
REFS="$BUCKET/refs/$ENV/$NAME"

if rclone lsd "$DEST" >/dev/null 2>&1; then
  echo "→ Already published at $DEST — promoting ref only"
else
  echo "→ Publishing to $DEST"
  rclone copy "$WORK/raw/" "$DEST" --progress
fi

if [[ -n "$COSIGN_KEY" ]] && command -v cosign >/dev/null 2>&1; then
  echo "→ Signing digest with cosign"
  echo "$DIGEST" > "$WORK/digest.txt"
  cosign sign-blob --yes --key "$COSIGN_KEY" "$WORK/digest.txt" \
    --output-signature "$WORK/$SHORT.sig"
  rclone copyto "$WORK/$SHORT.sig" "$BUCKET/signatures/$DIGEST.sig"
fi

echo "→ Updating ref refs/$ENV/$NAME → $DIGEST"
echo -n "$DIGEST" > "$WORK/ref"
rclone copyto "$WORK/ref" "$REFS"

# Optional: open a PR bumping the values file. The CI version uses GH App auth.
if command -v gh >/dev/null 2>&1 && [[ -n "${OPEN_PR:-}" ]]; then
  BRANCH="model/$NAME/$SHORT"
  git checkout -b "$BRANCH"
  # Cloud is encoded in the env name (e.g., prod-aws). Default to the AWS file.
  VALUES_FILE="workloads/llm-serving/helm/values-aws.yaml"
  case "$ENV" in
    *gcp*)   VALUES_FILE="workloads/llm-serving/helm/values-gcp.yaml" ;;
    *azure*) VALUES_FILE="workloads/llm-serving/helm/values-azure.yaml" ;;
  esac
  sed -i.bak -E "s|digest: \"sha256:[a-f0-9]+\"|digest: \"$DIGEST\"|" "$VALUES_FILE"
  git add "$VALUES_FILE"
  git commit -m "$NAME: bump to $SHORT" -m "Digest: $DIGEST"
  git push origin "$BRANCH"
  gh pr create --title "$NAME → $SHORT ($ENV)" --body "Auto-promote by promote-model.sh"
fi

echo "Done."
echo "  Digest:    $DIGEST"
echo "  Stored at: $DEST"
echo "  Ref:       $REFS"
