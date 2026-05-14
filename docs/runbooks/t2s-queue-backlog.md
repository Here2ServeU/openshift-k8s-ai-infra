# T2S queue backlog and worker incidents

Use this runbook for any of:

- `T2SEvalQueueAgeHigh` — oldest SQS message > 15 minutes.
- `T2SDeadLetterQueueGrowing` — new messages landing in the DLQ.
- `T2SQueueBacklogGrowing` — backlog growing for 20+ minutes (early signal).
- `T2SWorkerCrashLooping` / `T2SWorkerOOMKilled` — worker stability incident.
- `T2SVoiceCallConcurrencyNearMax` — voice worker capacity exhaustion.

The runbook covers the steady-state structure (triage → mitigation → recovery) and the workload-specific signals you'll actually look at.

> All alerts reference back here. If an alert is on this runbook and doesn't match a section below, fix the alert or extend this doc.

---

## Quick orientation

**Service group:** `t2s-api` + `t2s-worker` (text) + `t2s-worker-voice` + `t2s-ui`, all in the `t2s` namespace.

**Critical dependencies:** SQS (`t2s-eval`, `t2s-eval-dlq`), Postgres, Redis, S3 (`t2s-artifacts-*`), LLM gateway / external LLM provider.

**Source of truth:** Argo CD application `t2s-platform`. Rollback is `git revert` of the digest change.

**On-call dashboard:** Grafana → "T2S platform" folder → "Eval queue health".

---

## Triage (first 5 minutes)

Walk top-down. The order matters — if Postgres is the cause, scaling workers makes it worse.

### 1. SQS state

```bash
aws sqs get-queue-attributes \
  --queue-url $EVAL_QUEUE_URL \
  --attribute-names \
    ApproximateNumberOfMessages \
    ApproximateNumberOfMessagesNotVisible \
    ApproximateAgeOfOldestMessage \
    NumberOfMessagesSent \
    NumberOfMessagesReceived
```

Watch for:

- Visible >> in-flight → workers aren't picking work up. Look at worker tier next.
- In-flight high, age high → workers are consuming but not completing. Look at downstream (LLM, Postgres, S3).
- Visible low, age high → a small number of poison messages are wedging workers. Sample the message.
- Sent rate >> received rate → producer spike. Confirm with `t2s-api` deploy log and recent suite submissions.

### 2. Worker tier

```bash
kubectl -n t2s get pods -l app.kubernetes.io/name=t2s-worker
kubectl -n t2s top pods -l app.kubernetes.io/name=t2s-worker
kubectl -n t2s get hpa
```

Watch for:

- Pods not in `Running` → check `kubectl describe`. Common causes: image pull, node capacity, taint mismatch on the `batch` node pool.
- CPU at limit → worker compute is the bottleneck. KEDA should be scaling — check the `ScaledObject` events.
- Memory rising → potential leak. If `OOMKilled`, jump to "Worker stability" below.
- KEDA at `maxReplicaCount` → capacity ceiling hit. Decide whether to raise the cap (see Mitigation).

### 3. Downstream dependencies

```bash
# LLM gateway saturation
kubectl -n llm-serving exec deploy/inference-gateway -- curl -s :15000/stats | grep upstream_rq_pending_active

# Postgres connections and wait events
kubectl -n t2s exec deploy/t2s-api -- \
  psql $DATABASE_URL -c "select wait_event_type, wait_event, count(*) from pg_stat_activity group by 1,2 order by 3 desc;"

# Redis latency
kubectl -n t2s exec deploy/t2s-api -- redis-cli --latency-history -i 1

# S3 error spike
aws cloudwatch get-metric-statistics --namespace AWS/S3 \
  --metric-name 5xxErrors --dimensions Name=BucketName,Value=$ARTIFACT_BUCKET \
  --start-time $(date -u -d '15 min ago' +%FT%TZ) --end-time $(date -u +%FT%TZ) \
  --period 60 --statistics Sum
```

Watch for:

- LLM pending requests rising → inference is the bottleneck, not workers.
- Postgres wait events on `Lock` or `IO:DataFileRead` → DB is the bottleneck.
- Redis latency spike → either Redis is overloaded or the network path is degraded.
- S3 `SlowDown` 503s → prefix throttling. Workers are succeeding but artifact uploads are failing.

### 4. DLQ inspection

Before redriving, look at what's there:

```bash
aws sqs receive-message --queue-url $DLQ_URL --max-number-of-messages 5 \
  --attribute-names All --message-attribute-names All
```

Classify by error class:

- **Deterministic payload errors** (validation, malformed config) → fix in `t2s-api` before redrive.
- **Transient infra errors** (LLM timeout, S3 503) → safe to redrive after the upstream recovers.
- **Logic bugs** in the worker (uncaught exception, parse error on response) → fix in `t2s-worker` before redrive.

---

## Mitigation

Choose by what triage told you.

### Workers saturated, dependencies healthy

1. Confirm batch node pool has headroom (`kubectl describe nodes | grep -A5 'workload-type=batch'`).
2. Raise KEDA `maxReplicaCount` temporarily — `kubectl -n t2s patch scaledobject t2s-worker-sqs --type merge -p '{"spec":{"maxReplicaCount": 100}}'`.
3. Monitor downstream — if Postgres or LLM saturate next, scale back and address the new bottleneck.
4. After incident, decide whether to bake the new cap into [`workloads/t2s-platform/worker.yaml`](../../workloads/t2s-platform/worker.yaml).

### LLM inference saturated

1. Reduce per-worker concurrency — `kubectl -n t2s set env deploy/t2s-worker MAX_CONCURRENT_EVALS=2`.
2. If we host inference, scale the model serving deployment up first — `kubectl -n llm-serving scale rollout/vllm-judge --replicas=8`.
3. If we use an external provider and we're being rate-limited, route lower-priority suites to a cheaper model tier or pause non-critical sweeps.

### Postgres saturated

1. Pause non-critical eval suites at the API level (feature flag).
2. Reduce high-cardinality write paths — move per-step telemetry to Prometheus if it isn't already.
3. If a slow query is dominant, capture it via `kubectl -n t2s exec deploy/t2s-api -- psql $DATABASE_URL -c "select query, total_time, calls from pg_stat_statements order by total_time desc limit 10;"` and run `EXPLAIN ANALYZE` before tuning.

### DLQ growing from deterministic failures

1. **Stop redrive.** Redriving deterministic failures just hides the pattern.
2. Patch validation in `t2s-api` (reject bad payloads at submission).
3. Redrive once the fix is deployed.

### Voice worker concurrency near max

1. Scale up `t2s-worker-voice` deployment — but verify the node pool has headroom *before* scaling, because killing nodes with active calls is expensive.
2. If a long-running call is wedged, check `voice_call_setup_duration_seconds` and `voice_asr_confidence` for that pod. A pod stuck in setup is different from a healthy long call.
3. Do not aggressively scale down after recovery — active calls are stateful. Let cooldown handle it.

### Worker stability (crash-loop / OOM)

1. Check the last 100 lines of logs from a crashing pod — `kubectl -n t2s logs --tail=100 -p <pod-name>`.
2. If OOMKilled: raise memory limit *temporarily* and lower `MAX_CONCURRENT_EVALS` until the leak is fixed. Don't raise limits as a permanent fix without root-causing.
3. If panicking on a specific message: pull that message from the DLQ (after redrive policy moves it there) and reproduce locally.
4. If a recent deploy is implicated, rollback first, debug second — `git revert <commit> && git push` (Argo CD reconciles within ~30s).

---

## Recovery

After the incident clears:

1. Compare cost-per-eval-run against the pre-incident baseline ([cost-spike runbook](cost-spike.md) for follow-up).
2. Compare worker utilization, queue freshness, and DLQ landings against the 24h-prior baseline.
3. If you manually changed any KEDA cap, decide whether to keep it. If yes, commit it to the manifest. If no, revert.
4. If the alert fired without a clear cause, capture the dashboard state at peak in the post-mortem.
5. Update this runbook with anything you wished you'd known when triage started.

---

## Common root causes (in observed-frequency order)

1. **A model release with worse judge agreement** — eval pass rate drops, DLQ grows from inconsistent judge responses. Rollback the model digest.
2. **A deploy of `t2s-worker` with a regressed Python dependency** — silent memory leak, gradual OOMs. Rollback the service.
3. **An LLM provider rate-limit drop** — sudden DLQ spike from upstream 429s. Coordinate with the provider; consider fallback tier.
4. **A research-team suite submission spike** — backlog grows from increased producer rate. Capacity is healthy; queue freshness drops temporarily. Communicate to the team.
5. **A Postgres slow query introduced by a schema change** — API latency rises, workers slow because they wait on API writes. Identify the query, add an index or revert.

---

## What to push back on after the incident

- Adding alerts without runbook entries (they belong here).
- Raising `maxReplicaCount` permanently because of a single incident — fix the root cause first.
- Adding retries to mask poison-message handling. Make the failure visible, then fix it.
- Cleaning the DLQ to "make the dashboard look better." The DLQ is forensic data.
