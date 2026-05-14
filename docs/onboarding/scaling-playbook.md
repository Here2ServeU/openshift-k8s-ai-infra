# Scaling playbook — how we plan capacity changes

This is the team's playbook for capacity changes that are bigger than routine tuning. The driving example is "support 10× more evaluation jobs next quarter" because it's the question that comes up most often, but the same structure applies to any meaningful capacity step: a new product feature that increases queue volume, a research team running larger sweeps, a customer onboarding that doubles eval traffic.

Use this when:

- A research lead asks whether the platform can handle a step-change in load.
- A capacity model shows we're within a quarter of saturation on any layer.
- A product launch will change the workload mix (e.g. more voice runs, longer evals).

---

## The trap to avoid

The wrong instinct is: "Sure, we'll just bump KEDA `maxReplicaCount`."

That moves the bottleneck from workers to the *next* binding constraint — Postgres, the LLM gateway, S3 request rate, the queue itself, or cost — without telling you which one. A senior plan starts with measurement and ends with a sequenced rollout. We've made this mistake before. Don't repeat it.

---

## Where scaling actually breaks

For Everse-style eval workloads, the binding constraints are almost always in this order:

1. **LLM inference capacity** — the model under evaluation and the LLM judge.
2. **Worker compute** — Python eval loop, persona simulation, scoring orchestration.
3. **Postgres** — run-events table writes, suite metadata reads.
4. **S3** — request rate on the artifact prefix, particularly listing operations.
5. **Queue itself** — SQS can absorb a lot, but visibility-timeout / message-retention defaults trip up high-volume work.
6. **Cost** — often the *real* constraint that gets discovered last and loudest.

Plus two that are easy to miss:

- **Redis** if you're using it for run-status pub/sub at high cardinality.
- **Cluster control plane** if you're churning thousands of short-lived pods per hour.

---

## Step 1 — Measurement first

Before any scaling work, ship the observability needed to *see* each constraint:

- **LLM gateway** — request rate, queue depth, p95 latency by model variant. If the team is using an external API, add provider rate-limit headroom as a metric.
- **Worker tier** — CPU saturation, memory ceiling, retry rate per worker, oldest-message age. (Already in [`observability/alerts/everse-platform.yaml`](../../observability/alerts/everse-platform.yaml) — verify the dashboard is wired.)
- **Postgres** — `pg_stat_activity` wait events, replication lag, slow query log on the run-events and run-metrics tables.
- **S3** — 4xx/5xx rate (esp. `SlowDown` 503), request volume per prefix.
- **Cost** — `eval_run_cost_usd_total` and the per-run breakdown.

The output of this step is a *single* dashboard the team agrees represents headroom for each layer. If headroom can't be shown, the team can't promise 10×.

---

## Step 2 — Plan, layered

### Layer 1: LLM inference

The expensive layer, and usually the binding one.

**If we host inference (vLLM/KServe):**

- Scale GPU replicas via KEDA on `vllm_pending_requests` and `vllm_gpu_kv_cache_usage_perc`.
- Add a warm-pool of GPU nodes ahead of forecast spikes. Karpenter can pre-provision via consolidation policies; otherwise a small Cron-triggered scale-up before known peak hours.
- Consider request coalescing at the inference gateway for repeated identical prompts (common in eval).
- For the judge specifically: prefer a cheaper model tier than the agent under test whenever quality allows. Eval cost is often dominated by judge tokens.

**If we use an external LLM provider:**

- Verify provider rate limits at the higher target volume. Get those raised in advance.
- Implement per-suite priority queues so low-priority sweeps don't starve user-facing evals during a backlog.
- Add a fallback to a lower tier or a different provider when primary saturates — provider failures *will* cap scaling more than expected.

### Layer 2: Worker compute

- Raise KEDA `maxReplicaCount` to a number derived from worker-throughput × forecast, with ~30% buffer.
- Verify scale-up rate (currently 200%/min in [`workloads/everse-platform/worker.yaml`](../../workloads/everse-platform/worker.yaml)). If the scale-up signal is fast but node provisioning is slow, the bottleneck is Karpenter, not KEDA.
- Add a dedicated batch node pool (spot, taint-isolated) sized for the new ceiling. Confirm taints/tolerations on the worker spec match.
- Verify `MAX_CONCURRENT_EVALS` per worker (env var) — sometimes raising in-pod concurrency is cheaper than adding pods, up to the LLM gateway limit.

### Layer 3: Postgres

This is the silent killer for high-throughput eval platforms.

- Identify the write-heavy tables. Usually `run_events` or `run_metrics`. Move them off Postgres or partition by run-id range.
- For high-frequency per-step telemetry, write to the time-series store (Prometheus, OpenTSDB) or a streaming sink (Kinesis/Kafka), not Postgres.
- Add read replicas for the API's heavy read paths (run history, leaderboards).
- Set up `pg_stat_statements` and review top queries quarterly. The slow query that pages you in production was visible in `pg_stat_statements` two weeks earlier.

### Layer 4: S3

- Shard the artifact prefix. `s3://everse/artifacts/<run-id>/...` becomes `s3://everse/artifacts/<hash-prefix>/<run-id>/...`. S3 request-rate scales per-prefix; flat prefixes cap at a few thousand requests/sec.
- Use multipart upload for audio/video artifacts to keep upload latency stable as size grows.
- For listing operations (which back the UI's "recent runs" view), serve from Postgres + S3 pointers rather than direct `ListObjectsV2`.

### Layer 5: Queue

- Confirm SQS visibility timeout > worst-case eval duration + buffer. If evals can exceed an hour, default 30s timeouts cause duplicate processing under load.
- For long evals, use SQS `ChangeMessageVisibility` heartbeats from the worker. Don't rely on a single timeout for a long task.
- Confirm DLQ is sized for failed-job triage volume at the new throughput. (Alert exists.)
- Consider FIFO queues only if ordering is required; standard queues are cheaper and scale further.

### Layer 6: Cost

This is where most "yes we can scale" promises die.

- Run the math: target throughput × cost-per-eval-run = projected monthly cost. If that's outside the budget, the conversation is "what's the cost target?" before it's "what's the throughput target?"
- Identify the dominant cost driver. Usually it's judge tokens. Sometimes it's GPU-hours. Optimize whichever is dominant first — a 20% cut on the dominant cost is worth more than a 50% cut on a small one.
- Move dev/staging eval traffic to a cheaper model tier for judge calls. Production-equivalent quality usually doesn't matter in dev.

### Bonus — Cluster control plane

- A step-change in evaluation throughput often means a step-change in pod churn. The Kubernetes API server can struggle with rapid create/delete cycles.
- Verify API server metrics: request latency, etcd commit duration, watch cache hit rate.
- If pod churn dominates, consider longer-lived workers with in-pod job parallelism (batch multiple SQS messages per pod) rather than one pod per message.

---

## Step 3 — Sequencing

Don't do this in parallel. Each layer's fix changes the next layer's load profile.

1. **Week 1**: Observability sprint. Ship the headroom dashboard.
2. **Week 2**: LLM inference capacity. Usually the dominant constraint.
3. **Week 3**: Worker tier and node pools. Verify the LLM layer absorbs the new request rate.
4. **Week 4**: Postgres + S3. These quietly break under sustained higher load, not initial spikes.
5. **Week 5**: Cost optimization on whatever the new dominant driver is.
6. **Week 6**: Load test at target throughput. Adjust.

Six weeks to a credible 10× capability with quality and cost intact. If anyone wants 10× in two weeks, they're not counting the load downstream.

---

## Step 4 — Risks to surface out loud

- **Provider rate limits.** If we depend on an external LLM, we're scaling within their constraints. Get this raised in advance, or have a fallback.
- **Eval quality regressions hidden by volume.** At higher throughput, statistical noise can mask real regressions for longer. Tighten the per-suite regression alert before scaling, not after.
- **On-call load.** 10× throughput at the same alert design means 10× pager volume from any flaky alert. Audit alerts *before* scaling.
- **Cost runaway.** A misconfigured KEDA `maxReplicaCount` can burn a month's budget in an afternoon. Hard caps and budget alerts are non-negotiable.

---

## When research asks "can we 10× by next quarter?"

The team answer:

> "We can. We don't do it by bumping KEDA caps — that just moves the incident downstream. The plan is one week of observability to see headroom in each layer, then five weeks of sequenced fixes by binding constraint, with a load-test gate between. About six weeks to a credible 10× with quality and cost intact."

That's the right shape for the conversation: confident about the outcome, honest about the path, specific about the timeline.
