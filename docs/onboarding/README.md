# T2S platform — onboarding for new platform engineers

Welcome to the team. This folder is the working introduction to the T2S platform: what it is, how it's built, what's already been decided, and where the load-bearing pieces are. Read it end-to-end in your first week. You'll come back to most of it during your first quarter.

> Companion docs in this folder:
>
> - [first-90-days.md](first-90-days.md) — what we expect you to focus on in your first 30/60/90 days.
> - [architecture-decisions.md](architecture-decisions.md) — the architectural calls you'll inherit, with the reasoning and the conditions that would flip them.
> - [operating-principles.md](operating-principles.md) — how we operate the platform day-to-day: ownership, judgment, cross-functional influence, on-call.
> - [voice-agent-infra.md](voice-agent-infra.md) — how the voice/text agent simulation layer sits on Kubernetes.
> - [scaling-playbook.md](scaling-playbook.md) — how we plan and execute capacity changes (e.g. supporting 10× eval throughput).
> - [openshift-platform.md](openshift-platform.md) — the four seams that differ when this platform runs on Red Hat OpenShift (OperatorHub/OLM, RHCOS GPU enablement, SCCs, Routes), plus ROSA/ARO/self-managed and RHOAI.
> - [ai-agent-operations.md](ai-agent-operations.md) — operating headless AI agent workloads: attribution, recoverability, behavioral observability, and the incident patterns specific to agents in a HIPAA environment.

---

## What the platform does in 60 seconds

This repo is a Kubernetes platform for AI evaluation and LLM-serving workloads. It covers the path from Terraform-provisioned clusters to GitOps deployments, SLO-gated model releases, queue-backed evaluation workers, GPU autoscaling, and observability for long-running AI jobs.

We treat the platform as three coupled lanes:

- **Product services** — `t2s-ui`, `t2s-api`, and `t2s-worker`, deployed through Argo CD and promoted by signed image PRs.
- **AI workloads** — vLLM/KServe inference, model artifact promotion, and Argo Workflows for evaluation suites.
- **Operations layer** — OpenTelemetry, Prometheus, Loki, Tempo, Grafana, runbooks, SLOs, cost dashboards, and KEDA/Karpenter scaling.

The connective tissue is GitOps: every change — service, model, infra, alert — is a reviewed Git commit, and Argo CD reconciles state. That gives us one rollback model regardless of whether we're reverting an image, a model digest, or a node pool.

---

## How the three responsibilities map to the repo

| Responsibility | Where it lives | How to think about it |
| --- | --- | --- |
| CI/CD and deployment infrastructure | [`.github/workflows/service-image-ci.yml`](../../.github/workflows/service-image-ci.yml), [`.github/workflows/t2s-release.yml`](../../.github/workflows/t2s-release.yml), [`.github/workflows/model-release.yml`](../../.github/workflows/model-release.yml), [`workloads/llm-serving/helm/templates/rollout.yaml`](../../workloads/llm-serving/helm/templates/rollout.yaml), [`workloads/t2s-platform/`](../../workloads/t2s-platform/) | We build signed images with SBOMs, promote services and models by immutable artifact, let Argo CD reconcile, and let Argo Rollouts decide promotion using live SLO metrics. |
| Observability | [`platform/observability/`](../../platform/observability/), [`observability/dashboards/`](../../observability/dashboards/), [`observability/alerts/`](../../observability/alerts/), [`docs/runbooks/`](../runbooks/) | We instrument user-facing latency, worker queue health, GPU saturation, model quality gates, and cost. Every paging alert points to a runbook. |
| Reliability, scaling, and cost | [`platform/keda/`](../../platform/keda/), [`workloads/t2s-platform/worker.yaml`](../../workloads/t2s-platform/worker.yaml), [`platform/karpenter/`](../../platform/karpenter/), [`docs/runbooks/cost-spike.md`](../runbooks/cost-spike.md) | Fast pod scaling is split from slower node scaling. Workers scale on queue backlog. GPU and batch pools are isolated. Spot and scale-to-zero where the workload tolerates it. |

---

## How T2S actually works

### Workload shape

- **`t2s-ui`** — React/Next.js front end. Canary rollout, small CPU requests, served behind ingress.
- **`t2s-api`** — Python API. Handles auth, suite definitions, run orchestration, result reads, and artifact metadata.
- **`t2s-worker`** — Python workers consuming SQS jobs. Run voice/text agent simulation, call LLM services, write artifacts to S3, push metrics.
- **Postgres** — source of truth for runs, suites, agent versions, regression history.
- **Redis** — short-lived cache, rate limits, locks, live run status.
- **S3** — eval artifacts, transcripts, audio/video assets, model outputs, reproducible run bundles.

### Operating model

- API and UI are **latency-sensitive** — canary rollouts plus HPA on CPU and request latency.
- Workers are **throughput-sensitive** — KEDA on queue length **and** oldest-message age, with a Prometheus fallback that keeps scaling decisions observable.
- GPU-backed inference is **capacity-sensitive** — KEDA for replica pressure, Karpenter/GPU node pools for node pressure.
- Every release is reversible through Git because Argo CD is the source of truth.

### Boundaries

- **Network** — default-deny NetworkPolicy. UI can only talk to API. All egress to managed services goes via 443 with explicit allow lists. Observability namespace is the only cross-namespace ingress.
- **Identity** — IRSA / Workload Identity per ServiceAccount. The API can read Postgres and write SQS. Workers can read SQS, write S3, and call the LLM gateway. UI has no cloud credentials.
- **Secrets** — External Secrets Operator pulls from AWS Secrets Manager / GCP Secret Manager. No long-lived secrets in Git.

---

## Tradeoffs worth knowing on day one

Read [architecture-decisions.md](architecture-decisions.md) for the full set. The ones you'll hit first:

- **Queue length alone is not enough.** Workers scale on backlog **and** oldest message age. Backlog tells you volume; age tells you user pain. See [`workloads/t2s-platform/worker.yaml`](../../workloads/t2s-platform/worker.yaml).
- **GPU autoscaling has a time constant.** Pods react in seconds, nodes in minutes, model load can dominate both. We keep a warm floor for production and scale to zero only in non-prod or batch-safe paths.
- **Eval quality gates need statistical discipline.** A simple win-rate threshold is a start, but production gates use confidence intervals, position-swapped LLM judges, and fixed benchmark snapshots.
- **GitOps is a control plane, not a release strategy by itself.** We still own artifact signing, environment promotion, rollout analysis, rollback paths, and the failed-deploy response.
- **Observability follows the job lifecycle.** Request metrics aren't enough for long-running evals. We track queue age, active workers, retry rate, DLQ depth, run duration, artifact upload latency, and cost per run.
- **Bursty workloads need budget headroom, not just elasticity.** An eval run that takes 4× the budget because of cold GPU starts is a cost incident.

---

## Frequently asked questions

### How do we support 10× more evaluation jobs?

We don't do it by bumping a single KEDA cap. Bottlenecks shift as load grows: workers, then LLM inference, then Postgres, then S3, then cost. The full playbook is [scaling-playbook.md](scaling-playbook.md). Short version: observability sprint first, then sequence the fixes by binding constraint, with a load-test gate between each.

### How do we roll back a bad model or service release?

For services: revert the image change PR or use Argo Rollouts `abort` / `undo` if the canary is still active. For models: revert the digest change in the Helm values. Because artifacts are content-addressed and signed, rollback means selecting the previous digest, not rebuilding anything. The canary gate checks live error rate, latency, and (for models) eval win-rate before full promotion.

The hard case is an irreversible side effect — a destructive DB migration, a one-way SQS schema change, an S3 write that downstream consumers now depend on. For those, the team rule is **expand then contract**: ship the new schema additively, run both writers in parallel, prove the new path, then remove the old. We don't approve design reviews for migrations that can't be safely rolled forward.

### What do we alert on?

Pageable, user-impacting symptoms:

- API 5xx burn rate and p95 latency burn (multi-burn-rate, Google SRE workbook style).
- Queue oldest-message age (user-perceived eval delay).
- DLQ growth (silent failures hiding behind retries).
- Worker crash loops (capacity collapse).
- GPU node `NotReady` (model serving capacity loss).
- Model checksum mismatch (supply chain or registry corruption).
- Budget spikes (cost incident).

Ticket or dashboard-only: slowly rising queue depth, cost per evaluation run, cache saturation, Postgres replication lag, S3 4xx rate. Alerts that don't have a runbook get downgraded or deleted — pager fatigue is an outage in slow motion.

### How do we keep cloud spend rational?

Tag every resource (`team`, `env`, `workload`, `cost-center`), surface per-workload cost in Grafana via OpenCost, use spot for interruptible batch/GPU work, keep on-demand for the critical serving floor, set KEDA cooldowns to prevent thrash, and scale dev models to zero. The headline FinOps metric is **cost per eval run**, because it ties infra spend to product throughput.

Two cost decisions that are baked in: GPU node pools are split by lifecycle (spot for batch eval, on-demand for serving), and KEDA has hard MaxReplica caps even when scaling smoothly — to bound a runaway producer's blast radius on cost, not just on capacity.

### How do we handle research asks that won't scale?

This is the cross-functional-influence muscle. The team pattern:

1. Make the cost visible. "If we ship this as-is, here is the dollar figure and the failure mode."
2. Offer a near-equivalent that scales. "Here is what changes if we run inference behind the shared gateway with KV-cache reuse — same latency, 1/3 the cost."
3. If they push back, unblock them on the research path with a guardrail (separate namespace, budget cap, expiry date). The guardrail becomes the forcing function for the redesign.

"No" without a path forward is the wrong move. "Yes and hope" is the other wrong move.

### How do we secure the platform?

In four layers:

1. **Supply chain** — signed images (cosign), SBOMs, Trivy scans in CI, blocked-CVE policy, base-image refresh schedule. Image policy enforced at admission with Kyverno.
2. **Cluster** — RBAC scoped per namespace, no cluster-admin to humans except break-glass, restricted PodSecurity admission, no privileged containers, no root, seccomp `RuntimeDefault`, read-only root FS where possible.
3. **Network** — default-deny NetworkPolicy per namespace, explicit east-west allows, egress restricted to required CIDRs/ports, no public LB without WAF.
4. **Identity & data** — IRSA / Workload Identity per ServiceAccount (no long-lived keys), External Secrets Operator pulling from cloud secret manager, S3 buckets private with bucket policies + KMS, Postgres in private subnets, audit logging to immutable storage.

For the annotation/surveillance tools the AI team uses: PII/PHI awareness means encrypted-at-rest everywhere, field-level encryption for sensitive columns, signed URLs with short TTL for artifact access, and access logging that survives the artifact lifecycle.

### How do we instrument long-running evaluation jobs?

Request metrics aren't enough. There's a lifecycle layer on top:

- **Job-level** — `eval_run_started_total`, `eval_run_completed_total` by status, `eval_run_duration_seconds` (histogram), `eval_run_cost_usd_total`. Pushed by workers, not scraped.
- **Phase-level** — time in queue, time in model inference, time in scoring, time in artifact upload. Long evals fail in specific phases; without phase metrics we'd be guessing.
- **Quality-level** — pass rate, regression rate (vs previous agent version), judge-disagreement rate. Quality regressions are the signal that a "successful" deploy actually broke something.
- **Trace correlation** — every eval run gets a trace ID propagated into the LLM gateway, so we can pivot from a slow run to the exact upstream model call.

This is the difference between "the API is up" and "the product is working."

### Why Argo Workflows and not Kubeflow?

We pick orchestration by the unit of work:

- **Argo Workflows** for eval orchestration — DAGs, conditional steps, artifact passing, retries on per-step granularity, fits the GitOps model.
- **MLflow** for experiment tracking and model registry — a metadata store, not an orchestrator. The model registry is the boundary between research and prod.
- **Kubeflow** would only earn its keep if the team grew into distributed training that needed operator-managed PyTorchJob/TFJob. The pipeline UI alone isn't worth the operating surface for our size.
- **Plain K8s Jobs / CronJob** for the boring stuff: nightly cleanup, snapshot rotation, single-step batch.

If you find yourself reaching for Kubeflow as a brand name, ask whether you wanted Argo Workflows. If you find yourself reinventing experiment tracking, ask whether you wanted MLflow.

### Walk me through a voice-agent eval run

See [voice-agent-infra.md](voice-agent-infra.md). Short version:

1. UI submits a suite run with a persona config (tone, speech speed, call quality).
2. API persists the run in Postgres, enqueues a job per agent variant on SQS, returns immediately with a run ID.
3. KEDA scales workers based on queue length + oldest-message age. Workers run on the `batch` node pool, tolerate the batch taint.
4. Each worker pulls a job, instantiates the persona simulator, runs the conversation against the agent under test (which may be a service inside the cluster or a third-party API), and writes the transcript + audio bundle to S3.
5. A scoring step calls the LLM judge with position-swapped prompts and writes the score back to Postgres.
6. On completion, Redis pub/sub notifies the UI so the run status updates in real-time without polling.
7. Metrics, logs, and traces stream through OTel to Prometheus/Loki/Tempo. The cost-per-run metric is computed from worker time × node price + LLM tokens × model price.

The thing that makes this **T2S**, not just "a worker pool", is reproducibility: same persona seed, same model digest, same suite version → same result. Enforced by content-addressed everything.

---

## What this repo is *not*

Be honest about gaps as you ramp:

- Image names (`ghcr.io/T2S/...`) and cloud account IDs in the manifests are placeholders.
- `t2s-platform` is the infrastructure scaffold for the product; the application source code lives in a separate repo.
- The sample eval workflow uses a simplified win-rate gate. Production should use stronger statistical checks (CI-aware, position-swap LLM judges, fixed benchmark snapshots).
- Local mode is for demos and does not reproduce real GPU scheduling or managed cloud IAM.

If you spot more, add them here. Onboarding docs that pretend the scaffold is production are worse than no docs.
