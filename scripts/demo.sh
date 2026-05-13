#!/usr/bin/env bash
# scripts/demo.sh — port-forward the LLM gateway and run a sample chat completion.
set -euo pipefail

NS=${NS:-workloads}
SVC=${SVC:-inference-gateway}
PORT=${PORT:-8080}
MODEL=${MODEL:-tinyllama}

echo "→ Port-forwarding svc/$SVC in ns/$NS to localhost:$PORT"
kubectl -n "$NS" port-forward "svc/$SVC" "$PORT:8080" >/tmp/pf.log 2>&1 &
PF_PID=$!
trap "kill $PF_PID 2>/dev/null || true" EXIT

# Wait for the port to open
for i in {1..30}; do
  if curl -s "http://localhost:$PORT/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo
echo "→ Sending a chat completion against $MODEL"
echo
curl -sN -X POST "http://localhost:$PORT/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{
  "model": "$MODEL",
  "stream": true,
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user",   "content": "In 3 sentences, what is PagedAttention and why does it matter?" }
  ]
}
EOF
)" | tee /tmp/demo-response.txt

echo
echo "→ Done. Trace ID for this request:"
grep -oE 'x-trace-id: [a-f0-9]+' /tmp/demo-response.txt | head -1 || echo "  (no trace id header found — check inference gateway config)"
