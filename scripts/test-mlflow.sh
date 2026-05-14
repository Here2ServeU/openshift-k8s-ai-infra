#!/usr/bin/env bash
# Spin up the local SQLite-backed MLflow deployment, log a sample run via the
# REST API, assert it shows up. Production deployment lives in
# platform/mlflow/ with the Postgres + S3 backend.
set -euo pipefail

NS=mlflow
PORT=${PORT:-5000}

echo "→ Applying local MLflow manifest (SQLite backend)"
kubectl apply -f local/mlflow-local.yaml

echo "→ Waiting for mlflow deployment (up to 2m)"
kubectl -n "$NS" rollout status deployment/mlflow --timeout=120s

echo "→ Port-forwarding svc/mlflow to localhost:$PORT"
kubectl -n "$NS" port-forward svc/mlflow "$PORT:5000" >/tmp/mlflow-pf.log 2>&1 &
PF_PID=$!
trap 'kill "$PF_PID" 2>/dev/null || true' EXIT

for _ in {1..30}; do
  curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1 && break || sleep 1
done

API=http://localhost:$PORT/api/2.0/mlflow

echo "→ Creating experiment 't2s-smoke'"
EXP_ID=$(curl -fsS -X POST "$API/experiments/create" \
  -H 'Content-Type: application/json' \
  -d '{"name":"t2s-smoke"}' | sed -n 's/.*"experiment_id":"\([^"]*\)".*/\1/p')
echo "  experiment_id=$EXP_ID"

echo "→ Creating run"
RUN_ID=$(curl -fsS -X POST "$API/runs/create" \
  -H 'Content-Type: application/json' \
  -d "{\"experiment_id\":\"$EXP_ID\"}" \
  | sed -n 's/.*"run_id":"\([^"]*\)".*/\1/p')
echo "  run_id=$RUN_ID"

echo "→ Logging a param + metric"
curl -fsS -X POST "$API/runs/log-parameter" \
  -H 'Content-Type: application/json' \
  -d "{\"run_id\":\"$RUN_ID\",\"key\":\"model\",\"value\":\"tinyllama\"}" >/dev/null
curl -fsS -X POST "$API/runs/log-metric" \
  -H 'Content-Type: application/json' \
  -d "{\"run_id\":\"$RUN_ID\",\"key\":\"eval_pass_rate\",\"value\":0.92,\"timestamp\":$(date +%s)000}" >/dev/null

echo "→ Reading the run back"
GOT=$(curl -fsS "$API/runs/get?run_id=$RUN_ID")
echo "$GOT" | grep -q '"value":"tinyllama"' || { echo "FAIL: param not stored"; exit 2; }
echo "$GOT" | grep -q '"value":0.92' || { echo "FAIL: metric not stored"; exit 2; }

echo "✓ mlflow OK — open http://localhost:$PORT to browse"
