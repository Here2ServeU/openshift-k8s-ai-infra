# First 30 / 60 / 90 days on the Everse platform team

A senior interview almost always includes "what would you do in your first 90 days?" The wrong answer is a generic list of best practices. The right answer is a focused plan that proves you understand *this* team — small, research-to-prod, bursty AI workloads, voice + text agents, and no platform person above you.

The principles I would lead with:

- **Listen before building.** The first month is mostly discovery. The team has already made architectural calls that exist for reasons I don't yet know.
- **Reversible bets first.** Things I can change later (alerts, dashboards, runbooks, CI hardening) before things I can't easily change (cluster topology, IAM design, data layout).
- **Make cost and reliability visible before optimizing them.** Telemetry beats opinion.
- **Earn the right to redesign.** A new hire who rewrites the deployment pipeline in week 2 is a liability. The same person doing it in month 3 with team buy-in is an upgrade.

---

## Days 0–30: Understand the system in production-realistic detail

Goal: by end of month one, I can on-call for Everse without a buddy.

### Discovery
- Read every Argo CD application, every Helm values file, every Terraform module. Diagram what's actually deployed where (clouds, regions, clusters, environments).
- Sit with the AI scientists for at least one full eval run. Watch how they submit jobs, what they look at, what they complain about. This is the product surface.
- Shadow on-call for two weeks. Write down every alert that fires, whether it was actionable, and what the runbook said vs. what actually fixed it.
- Map the SQS topology end-to-end: producers, consumer groups, DLQs, visibility-timeout settings, retry policies, what happens to a poison message.
- Inventory IAM: every ServiceAccount → role mapping, every long-lived key (if any), every cross-account trust. This is where security incidents come from.

### Quick wins (low-risk, high-signal)
- Fix or delete every alert that's fired in the last 30 days without anyone taking action. Pager fatigue is an outage you haven't had yet.
- Add SLO-burn alerts for `everse-api` if they're not already there. ([Everse SLO file](../../observability/slo/everse-slo.yaml).)
- Write one runbook per existing pageable alert. If I can't write the runbook, the alert is wrong.
- Stand up a `cost-per-eval-run` panel on the existing Grafana cost dashboard. Even if the math is approximate, having the number visible changes conversations.

### Deliverables at end of month one
- A written "current state" doc covering topology, IAM map, deployment flow, on-call experience, top 5 risks.
- A pruned alert set with a 1:1 runbook ratio.
- A baseline cost-per-eval-run number, with the methodology.

---

## Days 31–60: Tighten the highest-risk parts of the platform

Goal: by end of month two, the team can ship 2× more eval throughput without me being in the loop, and a wrong release rolls back automatically.

### Reliability
- Verify rollback paths for `everse-api`, `everse-worker`, `everse-ui`, and the model serving stack. For each, time how long rollback actually takes. Anything over 5 minutes gets work to make it faster.
- Audit Argo Rollouts `AnalysisTemplate`s. Are the canary gates checking what they should — error rate, latency, business metrics? Or are they passing on noise?
- Confirm DLQ depth and worker crash-loop alerts page, and that they have runbooks. ([Everse alerts](../../observability/alerts/everse-platform.yaml).)
- Confirm at least one game-day-quality test: drain a node, kill a worker mid-job, push a bad config, and observe whether the platform behaves as designed.

### Scaling and cost
- Tune KEDA: confirm `scaleUp` is fast enough for the worst-case backlog and `scaleDown` cooldown isn't thrashing. Backlog age, not just length, drives the trigger.
- Right-size requests/limits with vertical-pod-autoscaler recommendations or `kube-resource-report`. Most workloads I've seen overspecify CPU and underspecify memory.
- Implement spot-only node pool for batch eval workers if not already done; on-demand floor for API and UI.
- Implement a hard MaxReplica cap on every KEDA-scaled workload as a runaway-cost circuit breaker.

### Security
- Image policy: signed images only at admission. SBOM and Trivy scan are non-blocking signals today; make them blocking on new images by the end of month two.
- Per-namespace default-deny NetworkPolicy if any namespace doesn't have one.
- Rotate long-lived secrets; move them to External Secrets Operator if anything is still in Git or kubectl-applied manually.

### Deliverables at end of month two
- A green game-day report.
- Documented per-service rollback time.
- KEDA + node-pool tuning that takes a known load spike from "incident" to "automatic."
- All production images are signed and scanned, with a policy enforcing both.

---

## Days 61–90: Make the platform an enabler, not a bottleneck

Goal: by end of month three, the AI team can answer "yes, we can run 10× the evals next quarter" with infrastructure data, not vibes.

### Capacity and forecasting
- Build a capacity model: queue throughput per worker × max workers × GPU availability vs. forecast suite volume. Surface it on a dashboard so the team can see headroom in real time.
- Confirm the 10x scaling plan ([scaling-10x.md](scaling-10x.md)) actually works under load. Either run a controlled load test or carefully measure during a real spike.
- Bring cost-per-eval-run into the weekly team review, alongside latency and pass rate.

### Developer experience
- One-command local environment that lets a new researcher run an eval suite end-to-end on `kind`. Reduces onboarding time and exercises the deploy path.
- Ephemeral preview environments per pull request for `everse-ui` and `everse-api`. Argo CD `ApplicationSet` + GitHub PR events is the simplest path.
- A consolidated `everse-status` command (CLI or Slack bot) that summarizes queue depth, recent deploys, error budget burn, and on-call. Reduces "is everything okay?" questions.

### Strategic positioning
- Write an "infra roadmap" doc covering the next two quarters, grounded in what the team is trying to ship (more eval volume, real-time voice pipelines, GPU efficiency). Get it reviewed and used as the planning artifact.
- Identify the next big tradeoff to surface for the team: multi-region? Different inference runtime? Real-time vs batch worker split? Bring it as an ADR with a recommendation, not just a question.

### Deliverables at end of month three
- Validated 10x scaling plan.
- A capacity dashboard the team uses in planning.
- A two-quarter infra roadmap, agreed with the team and leadership.
- One ADR-quality decision proposed and resolved.

---

## What I would *not* do in the first 90 days

- Replatform off the current cloud or change cluster topology.
- Rewrite the CI pipelines from scratch. Incremental hardening, yes; rewrite, no.
- Introduce a service mesh "because it's good hygiene." Only if a concrete observability or security need exists.
- Argue for a Kubeflow installation as a first instinct. The team is small. Argo Workflows + MLflow is usually the right fit until proven otherwise.
- Add a new on-call rotation just because the team grew. Let the load justify the rotation, not the org chart.

The senior signal is restraint plus visible momentum. Lots of doing, very little churn.
