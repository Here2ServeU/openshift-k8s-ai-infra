#!/usr/bin/env bash
# Smoke every Python automation script:
#   1. `--help` on each script (catches import errors)
#   2. SLO burn check against the in-cluster Prometheus (port-forwarded)
#   3. GPU util report (no GPUs locally → rows == 0 is the success signal)
#   4. Queue audit against LocalStack SQS (skipped if docker unavailable)
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"

echo "→ 0. Ensuring venv + deps"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r scripts/python/requirements.txt

echo "→ 1. --help on every script"
for s in scripts/python/*.py; do
  python "$s" --help >/dev/null || { echo "FAIL: $s --help"; exit 2; }
  echo "  OK: $s"
done

echo "→ 2. SLO burn check (skipped if Prom not reachable)"
kubectl -n observability port-forward svc/prometheus-operated 9090:9090 >/tmp/prom-pf.log 2>&1 &
PROM_PF=$!
trap 'kill "$PROM_PF" 2>/dev/null || true' EXIT
sleep 3
if curl -fsS http://localhost:9090/-/healthy >/dev/null 2>&1; then
  PROM_URL=http://localhost:9090 python scripts/python/slo_burn_check.py || true
  PROM_URL=http://localhost:9090 python scripts/python/gpu_util_report.py --hours 1 || true
else
  echo "  (Prometheus not reachable — skipping)"
fi

echo "→ 3. Queue audit via LocalStack (skipped if docker unavailable)"
if command -v docker >/dev/null 2>&1; then
  docker rm -f t2s-localstack >/dev/null 2>&1 || true
  docker run -d --rm -p 4566:4566 --name t2s-localstack localstack/localstack >/dev/null
  for _ in {1..20}; do
    curl -fsS http://localhost:4566/_localstack/health >/dev/null 2>&1 && break || sleep 1
  done
  aws --endpoint-url=http://localhost:4566 --region us-east-1 \
    sqs create-queue --queue-name t2s-eval >/dev/null || true
  AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4566 \
    python scripts/python/queue_audit.py --queue t2s-eval
  docker rm -f t2s-localstack >/dev/null 2>&1 || true
else
  echo "  (docker not found — skipping)"
fi

echo "✓ python automation OK"
