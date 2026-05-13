#!/usr/bin/env bash
# scripts/load-test.sh — k6 burst test against the LLM endpoint.
# Drives the scaling story: ramp from 1 → 50 → 100 VUs to trigger HPA + Karpenter.
set -euo pipefail

NS=${NS:-workloads}
SVC=${SVC:-inference-gateway}
PORT=${PORT:-8080}

kubectl -n "$NS" port-forward "svc/$SVC" "$PORT:8080" >/tmp/pf.log 2>&1 &
PF_PID=$!
trap "kill $PF_PID 2>/dev/null || true" EXIT

# Wait for port
for i in {1..30}; do
  curl -s "http://localhost:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 not installed — falling back to a shell loop. Install k6 for proper percentiles."
  for i in {1..200}; do
    curl -sN -X POST "http://localhost:$PORT/v1/chat/completions" \
      -H "Content-Type: application/json" \
      -d '{"model":"tinyllama","messages":[{"role":"user","content":"hi"}]}' >/dev/null &
  done
  wait
  exit 0
fi

cat > /tmp/k6-llm.js <<'JS'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '60s', target: 50 },
    { duration: '90s', target: 100 },   // burst — exercises KEDA + Karpenter
    { duration: '60s', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<8000'],   // matches the e2e_p95 SLO
  },
};

const BASE = __ENV.BASE || 'http://localhost:8080';
const MODEL = __ENV.MODEL || 'tinyllama';

const PROMPTS = [
  'Summarize the theory of relativity in one paragraph.',
  'Write a haiku about Kubernetes.',
  'What is the difference between TCP and UDP?',
  'Explain backpropagation to a high schooler.',
];

export default function () {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: 'You are concise.' },
      { role: 'user', content: PROMPTS[Math.floor(Math.random() * PROMPTS.length)] },
    ],
  });
  const res = http.post(`${BASE}/v1/chat/completions`, body, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(Math.random() * 2);
}
JS

k6 run /tmp/k6-llm.js
