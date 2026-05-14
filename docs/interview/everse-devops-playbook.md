# Everse Senior DevOps interview playbook

Use this as your full talk track for the role. The goal is to sound like the person who can own the platform end-to-end, not someone who only knows the tools.

> Companion docs in this folder:
>
> - [first-90-days.md](first-90-days.md) — 30/60/90 day plan for the role
> - [senior-tradeoffs.md](senior-tradeoffs.md) — hardest decisions, with the reasoning you'd defend
> - [behavioral-stories.md](behavioral-stories.md) — STAR stories mapped to the role's seniority signals
> - [voice-agent-infra.md](voice-agent-infra.md) — how the voice/text agent simulation layer sits on Kubernetes
> - [scaling-10x.md](scaling-10x.md) — concrete "support 10x evaluation jobs next quarter" plan

---

## 60-second project pitch

This repo is a Kubernetes platform for AI evaluation and LLM-serving workloads. It covers the path from Terraform-provisioned clusters to GitOps deployments, SLO-gated model releases, queue-backed evaluation workers, GPU autoscaling, and observability for long-running AI jobs.

For an Everse-style system I treat the platform as three coupled lanes:

- **Product services**: `everse-ui`, `everse-api`, and `everse-worker` deployed through Argo CD and promoted through signed image PRs.
- **AI workloads**: vLLM/KServe inference, model artifact promotion, and Argo Workflows for evaluation suites.
- **Operations layer**: OpenTelemetry, Prometheus, Loki, Tempo, Grafana, runbooks, SLOs, cost dashboards, and KEDA/Karpenter scaling.

The connective tissue is GitOps: every change — service, model, infra, alert — is a reviewed Git commit, and Argo CD reconciles state. That gives me one rollback model regardless of whether I'm reverting an image, a model digest, or a node pool.

---

## Top 3 responsibility mapping

| Interview responsibility | Repo artifact | How to explain it |
| --- | --- | --- |
| CI/CD and deployment infrastructure | [`.github/workflows/service-image-ci.yml`](../../.github/workflows/service-image-ci.yml), [`.github/workflows/everse-release.yml`](../../.github/workflows/everse-release.yml), [`.github/workflows/model-release.yml`](../../.github/workflows/model-release.yml), [`workloads/llm-serving/helm/templates/rollout.yaml`](../../workloads/llm-serving/helm/templates/rollout.yaml), [`workloads/everse-platform/`](../../workloads/everse-platform/) | "I build signed images with SBOMs, promote services and models by immutable artifact, let Argo CD reconcile it, and let Argo Rollouts decide promotion using live SLO metrics." |
| Observability stack | [`platform/observability/`](../../platform/observability/), [`observability/dashboards/`](../../observability/dashboards/), [`observability/alerts/`](../../observability/alerts/), [`docs/runbooks/`](../runbooks/) | "I instrument user-facing latency, worker queue health, GPU saturation, model quality gates, and cost. Alerts point to runbooks, not just dashboards." |
| Reliability, scaling, and cost | [`platform/keda/`](../../platform/keda/), [`workloads/everse-platform/worker.yaml`](../../workloads/everse-platform/worker.yaml), [`platform/karpenter/`](../../platform/karpenter/), [`docs/runbooks/cost-spike.md`](../runbooks/cost-spike.md) | "I split fast pod scaling from slower node scaling, scale workers on queue backlog, isolate GPU and batch pools, and use spot/scale-to-zero where the workload can tolerate it." |

---

## Architecture answer for Everse

Start with the workload shape:

- **`everse-ui`**: React/Next.js front end, canary rollout, small CPU requests, served behind ingress.
- **`everse-api`**: Python API, handles auth, suite definitions, run orchestration, result reads, and artifact metadata.
- **`everse-worker`**: Python workers consuming SQS jobs, running voice/text agent simulation, calling LLM services, writing artifacts to S3, and pushing metrics.
- **Postgres**: source of truth for runs, suites, agent versions, and regression history.
- **Redis**: short-lived cache, rate limits, locks, and live run status.
- **S3**: eval artifacts, transcripts, audio/video assets, model outputs, and reproducible run bundles.

Then explain the operating model:

- API and UI are latency-sensitive, so they use canary rollouts and HPA on CPU + request latency.
- Workers are throughput-sensitive, so they use KEDA on queue length **and** oldest-message age, with a Prometheus fallback so scaling decisions stay observable.
- GPU-backed inference is capacity-sensitive, so it uses KEDA for replica pressure and Karpenter/GPU node pools for node pressure.
- Every release is reversible through Git because Argo CD is the source of truth.

Then explain the boundaries:

- Network: default-deny NetworkPolicy, UI can only talk to API, all egress to managed services goes via 443 with explicit allow lists, observability namespace is the only cross-namespace ingress.
- Identity: IRSA / Workload Identity per ServiceAccount. The API can read Postgres and write SQS. Workers can read SQS, write S3, and call the LLM gateway. UI has no cloud credentials.
- Secrets: External Secrets Operator pulls from AWS Secrets Manager / GCP Secret Manager. No long-lived secrets in Git.

---

## Senior-level tradeoffs to mention

- **Queue length alone is not enough**: scale on backlog *and* oldest message age. Backlog tells you volume; age tells you user pain and stuck workers. See [`workloads/everse-platform/worker.yaml`](../../workloads/everse-platform/worker.yaml) — both triggers are wired.
- **GPU autoscaling has a time constant**: pods react in seconds, nodes in minutes, model load can dominate both. Keep a warm floor for production and scale to zero only in non-prod or batch-safe paths.
- **Eval quality gates need statistical discipline**: a simple win-rate threshold is a start, but production gates should use confidence intervals, position-swapped LLM judges, and fixed benchmark snapshots. Otherwise rollouts pass on noise.
- **GitOps is a control plane, not a release strategy by itself**: you still need artifact signing, environment promotion, rollout analysis, rollback paths, and ownership of failed deploys.
- **Observability must follow the job lifecycle**: request metrics are not enough for long-running evals. Track queue age, active workers, retry rate, DLQ depth, run duration, artifact upload latency, and cost per run.
- **Bursty workloads need budget headroom, not just elasticity**: an eval run that takes 4× the budget because of cold GPU starts is a cost incident. Pre-warmed pools cost less than late-firing PagerDuty in engineer hours.

See [`senior-tradeoffs.md`](senior-tradeoffs.md) for the longer list with the reasoning.

---

## Likely questions and strong answers

### How would you support 10x more evaluation jobs next quarter?

I would separate the bottlenecks. First, use current queue age, worker utilization, DB wait events, Redis ops, S3 throughput, and LLM gateway saturation to identify the limiting resource. Then:

- If **workers** are limiting, raise KEDA `maxReplicaCount` and add batch node capacity. Verify scale-up rate is fast enough (we're at 200%/min, capped by node provisioning).
- If **LLM inference** is limiting, add GPU replicas and pre-warmed node capacity. Consider request coalescing at the gateway.
- If **Postgres** is limiting, reduce write amplification on the run-events table, push high-volume telemetry to a time-series store, and partition by run-id range.
- If **S3** is limiting (usually request-rate, not bandwidth), shard the prefix and turn on transfer acceleration for large artifacts.

I would not blindly add workers because that can move the incident to the database or model endpoint. The first PR is observability ("can we see the bottleneck?"), the second is the fix. Full plan in [`scaling-10x.md`](scaling-10x.md).

### How would you roll back a bad model or service release?

For services, revert the image change PR or use Argo Rollouts `abort` / `undo` if the canary is still active. For models, revert the digest change in the Helm values. Because artifacts are content-addressed and signed, rollback means selecting the previous digest rather than rebuilding anything. The canary gate checks live error rate, latency, and (for models) eval win-rate before full promotion.

The hard case is an irreversible side effect — a destructive DB migration, a one-way SQS schema change, an S3 write that downstream consumers now depend on. For those, the discipline is "expand then contract": ship the new schema additively, run both writers in parallel, prove the new path, then remove the old. I don't accept design reviews for migrations that can't be safely rolled forward.

### What would you alert on?

Page on user-impacting symptoms:

- API 5xx burn rate and p95 latency burn (multi-burn-rate, Google SRE workbook style).
- Queue oldest-message age (user-perceived eval delay).
- DLQ growth (silent failures hiding behind retries).
- Worker crash loops (capacity collapse).
- GPU node `NotReady` (model serving capacity loss).
- Model checksum mismatch (supply chain or registry corruption).
- Budget spikes (cost incident).

Ticket or dashboard-only: slowly rising queue depth, cost per evaluation run, cache saturation, Postgres replication lag, S3 4xx rate. Alerts that don't have a runbook get downgraded or deleted — pager fatigue is an outage in slow motion.

### How do you keep cloud spend rational?

Tag resources (`team`, `env`, `workload`, `cost-center`), surface per-workload cost in Grafana via OpenCost, use spot for interruptible batch/GPU work, keep on-demand for the critical serving floor, set KEDA cooldowns to prevent thrash, and scale dev models to zero. For Everse specifically, **cost per eval run** is the executive metric because it connects infra spend to product throughput — that's the number I'd put on a quarterly dashboard.

Two cost decisions I'd make on day one: (1) split GPU node pools by lifecycle (spot for batch eval, on-demand for serving), and (2) set hard MaxReplica caps even when KEDA scales smoothly — to bound a runaway producer's blast radius on cost, not just on capacity.

### How would you handle a research team asking for an unscalable architecture?

This is the cross-functional-influence question. The pattern I use:

1. Make the cost visible. "If we ship this as-is, here is the dollar figure and the failure mode."
2. Offer a near-equivalent that scales. "Here is what changes if we run inference behind the shared gateway with KV-cache reuse — same latency, 1/3 the cost."
3. If they push back, I unblock them on the research path with a guardrail (a separate namespace, a budget cap, an expiry date) so they're not stuck waiting for the right answer. The guardrail becomes the forcing function for the redesign.

The wrong move is "no" without a path forward. The other wrong move is yes-and-hope.

### How would you secure this platform?

In four layers:

1. **Supply chain**: signed images (cosign), SBOMs, Trivy scans in CI, blocked-CVE policy, base-image refresh schedule. Image policy enforced at admission with Kyverno.
2. **Cluster**: RBAC scoped per namespace, no cluster-admin to humans except break-glass, restricted PodSecurity admission, no privileged containers, no root, seccomp `RuntimeDefault`, read-only root FS where possible.
3. **Network**: default-deny NetworkPolicy per namespace, explicit east-west allows, egress restricted to required CIDRs/ports, no public LB without WAF.
4. **Identity & data**: IRSA / Workload Identity per ServiceAccount (no long-lived keys), External Secrets Operator pulling from cloud secret manager, S3 buckets private with bucket policies + KMS, Postgres in private subnets, audit logging to immutable storage.

For the annotation/surveillance tools mentioned in the JD: PII/PHI awareness means encrypted-at-rest everywhere, field-level encryption for sensitive columns, signed URLs with short TTL for artifact access, and access logging that survives the artifact lifecycle.

### How do you instrument long-running evaluation jobs specifically?

Request metrics aren't enough. I add a lifecycle layer:

- **Job-level**: `eval_run_started_total`, `eval_run_completed_total` by status, `eval_run_duration_seconds` (histogram), `eval_run_cost_usd_total`. These are pushed by workers, not scraped.
- **Phase-level**: time spent in queue, time spent in model inference, time spent in scoring, time spent in artifact upload. Long evals fail in specific phases — without phase metrics, you're guessing.
- **Quality-level**: pass rate, regression rate (vs previous agent version), judge-disagreement rate. Quality regressions are the signal that a "successful" deploy actually broke something.
- **Trace correlation**: every eval run gets a trace ID propagated into the LLM gateway, so I can pivot from a slow run to the exact upstream model call.

This is the difference between "the API is up" and "the product is working."

### How do you decide between Kubeflow, MLflow, Argo Workflows, and just Kubernetes Jobs?

I pick by the unit of work:

- **Argo Workflows** for eval orchestration — DAGs, conditional steps, artifact passing, retries on per-step granularity, fits the GitOps model.
- **MLflow** for experiment tracking and model registry — it's a metadata store, not an orchestrator. The model registry is the boundary between research and prod.
- **Kubeflow** if the team is doing distributed training that needs operator-managed PyTorchJob/TFJob; otherwise it's a lot of platform to run.
- **Plain K8s Jobs / CronJob** for the boring stuff: nightly cleanup, snapshot rotation, single-step batch.

The mistake is picking Kubeflow as a brand name when what you needed was Argo Workflows. The other mistake is reinventing experiment tracking when MLflow already does it.

### Walk me through how a voice-agent eval run actually moves through this system

See [`voice-agent-infra.md`](voice-agent-infra.md). Short version:

1. UI submits a suite run with a persona config (tone, speech speed, call quality).
2. API persists the run in Postgres, enqueues a job per agent variant on SQS, returns immediately with a run ID.
3. KEDA scales workers based on queue length + oldest-message age. Workers run on the `batch` node pool, tolerate the batch taint.
4. Each worker pulls a job, instantiates the persona simulator, runs the conversation against the agent under test (which may itself be a service inside the cluster or a third-party API), and writes the transcript + audio bundle to S3.
5. A scoring step calls the LLM judge with position-swapped prompts and writes the score back to Postgres.
6. On completion, Redis pub/sub notifies the UI so the run status updates in real-time without polling.
7. Metrics, logs, and traces stream through OTel to Prometheus/Loki/Tempo. The cost-per-run metric is computed from worker time × node price + LLM tokens × model price.

The thing that makes this *Everse*, not just "a worker pool", is reproducibility: same persona seed, same model digest, same suite version → same result. That's enforced by content-addressed everything.

---

## Tough questions to be ready for

These are the ones that separate senior from staff-track answers. See [`behavioral-stories.md`](behavioral-stories.md) for STAR-shaped versions of each.

- "Tell me about a time you disagreed with a research lead about infrastructure direction." — Show influence without authority.
- "Describe an outage where the post-mortem changed how you think about a class of systems." — Show learning.
- "When did you choose to take on tech debt deliberately, and how did you pay it back?" — Show judgment.
- "What's a piece of infrastructure you owned that you'd rebuild today, and why?" — Show self-criticism without bitterness.
- "How do you decide whether to fix a flaky alert vs. delete it?" — Show ownership of the on-call experience.
- "Where do you draw the line between 'platform' and 'app team' responsibility?" — Show how you scale yourself.

---

## What to be honest about

- The repo uses placeholder image names (`ghcr.io/your-org/...`) and cloud account IDs.
- `everse-platform` is an infrastructure scaffold, not the application source code.
- The sample eval workflow uses a simplified win-rate gate; production should use stronger statistical checks (CI-aware, position-swap LLM judges, fixed benchmark snapshots).
- Local mode is for demos and does not reproduce real GPU scheduling or managed cloud IAM.
- I haven't run Everse itself — these are the patterns I'd apply to it based on the brief; I'd expect the first month on the job to surface things this design got wrong.

Being upfront about gaps reads as senior. Pretending the scaffold is production is the opposite.
