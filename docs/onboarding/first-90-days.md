# First 30 / 60 / 90 days on the T2S platform team

Welcome. This doc is what we expect you to focus on as you ramp. It's not a checklist — it's the shape of how the team learns to own this platform. Adapt it to what's actually on fire when you arrive.

The principles behind it:

- **Listen before building.** The first month is mostly discovery. We've made architectural calls that exist for reasons you don't yet know — read [architecture-decisions.md](architecture-decisions.md) early.
- **Reversible bets first.** Things you can change later (alerts, dashboards, runbooks, CI hardening) before things you can't easily change (cluster topology, IAM design, data layout).
- **Make cost and reliability visible before optimizing them.** Telemetry beats opinion.
- **Earn the right to redesign.** A new hire who rewrites the deployment pipeline in week 2 is a liability. The same person doing it in month 3 with team buy-in is an upgrade.

---

## Days 0–30: Understand the system in production-realistic detail

Goal: by end of month one, you can on-call for T2S without a buddy.

### Discovery

- Read every Argo CD application, every Helm values file, every Terraform module. Diagram what's actually deployed where (clouds, regions, clusters, environments).
- Sit with the AI scientists for at least one full eval run. Watch how they submit jobs, what they look at, what they complain about. That's the product surface.
- Shadow on-call for two weeks. Write down every alert that fires, whether it was actionable, and what the runbook said vs. what actually fixed it.
- Map the SQS topology end-to-end: producers, consumer groups, DLQs, visibility-timeout settings, retry policies, what happens to a poison message.
- Inventory IAM: every ServiceAccount → role mapping, every long-lived key (if any), every cross-account trust. This is where security incidents come from.

### Quick wins (low-risk, high-signal)

- Fix or delete every alert that's fired in the last 30 days without anyone taking action. Pager fatigue is an outage we haven't had yet.
- Add SLO-burn alerts for `t2s-api` if any are missing from [`observability/slo/t2s-slo.yaml`](../../observability/slo/t2s-slo.yaml).
- Write one runbook per existing pageable alert. If you can't write the runbook, the alert is wrong — bring it to the team.
- Stand up a `cost-per-eval-run` panel on the existing Grafana cost dashboard. Even if the math is approximate, having the number visible changes conversations.

### What you'll have produced by end of month one

- A written "current state" doc covering topology, IAM map, deployment flow, on-call experience, top 5 risks.
- A pruned alert set with a 1:1 runbook ratio.
- A baseline cost-per-eval-run number, with the methodology.

---

## Days 31–60: Tighten the highest-risk parts of the platform

Goal: by end of month two, the team can ship 2× more eval throughput without you in the loop, and a wrong release rolls back automatically.

### Reliability

- Verify rollback paths for `t2s-api`, `t2s-worker`, `t2s-ui`, and the model serving stack. For each, time how long rollback actually takes. Anything over 5 minutes gets work to make it faster.
- Audit Argo Rollouts `AnalysisTemplate`s. Are the canary gates checking what they should — error rate, latency, business metrics? Or are they passing on noise?
- Confirm DLQ depth and worker crash-loop alerts page, and that they have runbooks. See [T2S alerts](../../observability/alerts/t2s-platform.yaml).
- Run at least one game-day-quality test: drain a node, kill a worker mid-job, push a bad config, and observe whether the platform behaves as designed.

### Scaling and cost

- Tune KEDA: confirm `scaleUp` is fast enough for the worst-case backlog and `scaleDown` cooldown isn't thrashing. Backlog age, not just length, drives the trigger.
- Right-size requests/limits with vertical-pod-autoscaler recommendations or `kube-resource-report`. Most workloads here overspecify CPU and underspecify memory.
- Confirm batch eval workers run on a spot-only node pool; on-demand floor for API and UI.
- Confirm every KEDA-scaled workload has a hard MaxReplica cap as a runaway-cost circuit breaker.

### Security

- Image policy: signed images only at admission. If SBOM and Trivy scan are non-blocking signals today, make them blocking on new images by the end of month two.
- Per-namespace default-deny NetworkPolicy if any namespace doesn't have one.
- Rotate long-lived secrets; move them to External Secrets Operator if anything is still in Git or kubectl-applied manually.

### What you'll have produced by end of month two

- A green game-day report.
- Documented per-service rollback time.
- KEDA + node-pool tuning that takes a known load spike from "incident" to "automatic."
- All production images signed and scanned, with a policy enforcing both.

---

## Days 61–90: Make the platform an enabler, not a bottleneck

Goal: by end of month three, the AI team can answer "yes, we can run 10× the evals next quarter" with infrastructure data, not vibes.

### Capacity and forecasting

- Build a capacity model: queue throughput per worker × max workers × GPU availability vs. forecast suite volume. Surface it on a dashboard so the team can see headroom in real time.
- Confirm the 10× scaling plan ([scaling-playbook.md](scaling-playbook.md)) actually works under load. Either run a controlled load test or carefully measure during a real spike.
- Bring cost-per-eval-run into the weekly team review, alongside latency and pass rate.

### Developer experience

- One-command local environment that lets a new researcher run an eval suite end-to-end on `kind`. Reduces onboarding time and exercises the deploy path.
- Ephemeral preview environments per pull request for `t2s-ui` and `t2s-api`. Argo CD `ApplicationSet` + GitHub PR events is the simplest path.
- A consolidated `t2s-status` command (CLI or Slack bot) that summarizes queue depth, recent deploys, error budget burn, and on-call. Reduces "is everything okay?" pings.

### Strategic positioning

- Write an "infra roadmap" doc covering the next two quarters, grounded in what the team is trying to ship (more eval volume, real-time voice pipelines, GPU efficiency). Get it reviewed and used as the planning artifact.
- Identify the next big tradeoff to surface for the team: multi-region? Different inference runtime? Real-time vs batch worker split? Bring it as an ADR with a recommendation, not just a question.

### What you'll have produced by end of month three

- Validated 10× scaling plan.
- A capacity dashboard the team uses in planning.
- A two-quarter infra roadmap, agreed with the team and leadership.
- One ADR-quality decision proposed and resolved.

---

## What we'd rather you *not* do in the first 90 days

- Replatform off the current cloud or change cluster topology.
- Rewrite the CI pipelines from scratch. Incremental hardening, yes; rewrite, no.
- Introduce a service mesh "because it's good hygiene." Only if a concrete observability or security need exists.
- Stand up Kubeflow as a first instinct. Argo Workflows + MLflow is the right fit for this team's size until proven otherwise.
- Add a new on-call rotation just because the team grew. Let the load justify the rotation, not the org chart.

The senior signal we look for is restraint plus visible momentum. Lots of doing, very little churn.
