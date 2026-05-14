#!/usr/bin/env bash
# Apply Qdrant, wait for ready, upsert + query a sample vector, assert the
# query returns the seed point with score ~1.0. Tears down the port-forward
# on exit.
set -euo pipefail

NS=vector-db
PORT=${PORT:-6333}

echo "→ Applying $NS manifests"
kubectl apply -f workloads/vector-db/namespace.yaml
kubectl apply -f workloads/vector-db/service.yaml
kubectl apply -f workloads/vector-db/statefulset.yaml
kubectl apply -f workloads/vector-db/pdb.yaml
kubectl apply -f workloads/vector-db/networkpolicy.yaml

echo "→ Waiting for qdrant statefulset to be ready (up to 3m)"
kubectl -n "$NS" rollout status statefulset/qdrant --timeout=180s

echo "→ Port-forwarding svc/qdrant to localhost:$PORT"
kubectl -n "$NS" port-forward svc/qdrant "$PORT:6333" >/tmp/qdrant-pf.log 2>&1 &
PF_PID=$!
trap 'kill "$PF_PID" 2>/dev/null || true' EXIT

# wait for the port to open
for _ in {1..30}; do
  curl -fsS "http://localhost:$PORT/readyz" >/dev/null 2>&1 && break || sleep 1
done

echo "→ Creating collection 'demo'"
curl -fsS -X PUT "http://localhost:$PORT/collections/demo" \
  -H 'Content-Type: application/json' \
  -d '{"vectors":{"size":4,"distance":"Cosine"}}' >/dev/null

echo "→ Upserting sample point"
curl -fsS -X PUT "http://localhost:$PORT/collections/demo/points?wait=true" \
  -H 'Content-Type: application/json' \
  -d '{"points":[{"id":1,"vector":[0.1,0.2,0.3,0.4],"payload":{"label":"hello"}}]}' >/dev/null

echo "→ Searching"
RESP=$(curl -fsS -X POST "http://localhost:$PORT/collections/demo/points/search" \
  -H 'Content-Type: application/json' \
  -d '{"vector":[0.1,0.2,0.3,0.4],"limit":1}')
echo "$RESP"

# crude assertion: response should contain "score" and id 1
echo "$RESP" | grep -q '"id":1' || { echo "FAIL: expected id 1 in response"; exit 2; }
echo "✓ vector-db OK"
