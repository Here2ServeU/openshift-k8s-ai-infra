# Architecture decisions you're inheriting

These are the load-bearing calls the team has already made on the T2S platform. You're not being asked to re-litigate them on day one, but you should know them well enough to:

- Operate the platform without surprises.
- Spot when a new requirement would push us to revisit one.
- Push back when someone proposes a change that ignores the original reasoning.

Each entry follows the same shape: **the call, why we made it, the tradeoff we accepted, and the conditions that would flip the decision**. The last part is the most important — naming the conditions is what lets the team revisit decisions without nostalgia or defensiveness.

For the formal record, see also [`docs/decisions/`](../decisions/) — the ADRs.

---

## 1. KEDA on backlog *and* age, not backlog alone

**The call.** `t2s-worker` scales on SQS visible-message count **plus** oldest-message-age, with a Prometheus fallback that keeps the second signal observable.

**Why.** Message count tells you how much work is queued. Age tells you whether anyone is stuck. They diverge during the failure modes that actually cause user pain: a small queue with a 30-minute oldest message means workers are wedged on a slow message, and we need to react before the queue grows.

**Tradeoff.** Two triggers is more configuration and a slightly noisier scale-up curve. Worth it because age is a leading indicator of user-perceived eval delay and a single-signal trigger misses it.

**What would flip it.** If `t2s-worker` becomes strictly homogeneous and short-lived (every message under 30 seconds), age and length collapse to the same signal and one is enough.

See [`workloads/t2s-platform/worker.yaml`](../../workloads/t2s-platform/worker.yaml).

---

## 2. Argo Rollouts canary on `t2s-api`, plain rolling update on `t2s-worker`

**The call.** API uses canary with metric analysis. Worker uses rolling update with KEDA-driven replacement.

**Why.** The API serves user requests; a bad version is immediately visible in 5xx and p95, and a canary with SLO gates catches it before full rollout. Worker is queue-backed; a "bad" worker isn't user-visible in latency, it's visible in DLQ growth and eval-quality regressions. Trying to canary on those is too slow — minutes to hours of eval runtime per signal. Better to roll workers normally and rely on DLQ alerts plus per-deploy eval-success metrics.

**Tradeoff.** Worker rollouts are slightly less defended against a bad release. Mitigated by per-message retries with exponential backoff, the DLQ alert, and the model-checksum check at startup.

**What would flip it.** If worker work units became short enough that a per-deploy A/B is feasible (say, sub-30-second eval segments), we'd canary workers too.

---

## 3. Eval suites in Argo Workflows, not Kubeflow Pipelines

**The call.** Eval orchestration runs on Argo Workflows. MLflow handles experiment tracking and model registry.

**Why.** Argo Workflows is a thin DAG layer that integrates with the GitOps stack we already run. Kubeflow Pipelines pulls in a much larger surface area (notebook servers, KFServing, metadata store, central UI) that we'd own without using most of it. For a small research-to-prod team, Argo Workflows is the right unit.

**Tradeoff.** Argo Workflows has no native experiment-tracking UI. We get that from MLflow, integrated through artifact pointers.

**What would flip it.** If the team grows to multiple research pods running fundamentally different pipelines and we need shared notebook + experiment workflows, Kubeflow earns its keep.

---

## 4. Content-addressed model artifacts in S3, not the OCI registry

**The call.** Models live in S3 (or GCS / Blob) at `s3://models/<name>/<sha256>/`. The Helm value for production references the digest. An init-container verifies the signature on pod start. See [ADR-004](../decisions/004-model-artifacts.md).

**Why.** Models are not container images. They're large blobs that change far more often than container code, are often loaded by multiple replicas concurrently, and are sometimes pulled at runtime by different services. OCI works, but image pull semantics are tuned for layered code-shaped artifacts.

**Tradeoff.** We give up some OCI ecosystem tooling (cosign-on-image natively, registry-level GC, single CI artifact path). We get cheap fan-out, multi-cloud-friendly storage, and a model lifecycle that can be different from the service lifecycle.

**What would flip it.** If the team standardized on small models that compose well with container layering (under a few hundred MB, infrequent updates), OCI would start to win on simplicity.

---

## 5. Spot for batch eval, on-demand for serving floor

**The call.** Worker / batch evaluation pods can run on spot nodes. LLM serving keeps a hard on-demand floor sized for production traffic; spot is the burst layer above the floor.

**Why.** Eval jobs can tolerate restarts — we re-drive from SQS. LLM serving cannot tolerate a 2-minute capacity gap during a spot interruption when a customer's `/v1/chat/completions` is in flight.

**Tradeoff.** We pay on-demand prices for the floor capacity. The savings come from the burst.

**What would flip it.** If we add a request-replay or session-pinning layer at the inference gateway that survives a pod kill cleanly, more of the serving fleet can move to spot.

---

## 6. Multi-cloud Terraform structure, single primary cloud at any moment

**The call.** We maintain Terraform modules for AWS, GCP, and Azure ([`terraform/`](../../terraform/)). We run production on one of them. The other modules are for portability, demos, and a credible exit story.

**Why.** True simultaneous multi-cloud production is expensive — data egress, IAM split-brain, doubled on-call. It's only worth doing for regulatory or vendor-risk reasons. What's nearly free is keeping the *option* open by writing portable manifests and modular infra.

**Tradeoff.** Some non-portable cloud features (S3 Express, AWS-only Karpenter at certain versions, GCP-only TPU options) take more thought to use. We do use them when the value is large enough; we just don't pretend we're multi-cloud.

**What would flip it.** A specific regulatory requirement, a real disaster-recovery RTO that can't be met within one cloud, or a single-vendor risk that materializes.

---

## 7. Argo CD over Flux, with Argo Rollouts for progressive delivery

**The call.** Argo CD as the GitOps engine, Argo Rollouts as the canary controller. See [ADR-006](../decisions/006-argocd-rollouts.md).

**Why.** Argo CD's app-of-apps pattern, sync waves, and UI are an excellent fit for a multi-workload platform with non-trivial dependency ordering. Argo Rollouts gives us canary + analysis as a first-class controller, which is what we actually need for SLO-gated promotion.

**Tradeoff.** Two controllers to operate. Flux has a smaller surface. The Argo team owns more lines of code we depend on.

**What would flip it.** If we go all-in on a service mesh that provides progressive delivery natively (Linkerd + Flagger, or Istio + Flagger), and the team prefers fewer controllers, Flux + Flagger is a reasonable consolidation.

---

## 8. One namespace per service group, not one namespace per microservice

**The call.** `t2s-platform` lives in a single `t2s` namespace with UI, API, and worker together. Other workload groups (LLM serving, eval platform, data pipeline) get their own namespace.

**Why.** Namespace per service is fashionable but adds friction for related services that share secrets, network policy, and Service discovery. Service group = blast-radius boundary. The cost (slightly larger NetworkPolicy graphs inside the namespace) is manageable.

**Tradeoff.** Less isolation between sibling services. A noisy neighbor inside the same namespace can starve quotas if quotas are set at the pod level rather than per-deployment.

**What would flip it.** Strong multi-tenancy requirements (different teams shipping into T2S), or a regulatory boundary between two services in the same group.

---

## 9. OpenTelemetry Collector as the single ingestion point

**The call.** Apps emit OTLP to a cluster-local OTel Collector. The Collector fans out to Prometheus, Loki, and Tempo. See [ADR-005](../decisions/005-otel-collector.md).

**Why.** Apps stay vendor-portable. Sampling, scrubbing, and routing live in the Collector config, not in application code. Switching a backend is a Collector pipeline change, not a code change.

**Tradeoff.** The Collector itself is a new dependency to operate. Bad Collector config can drop telemetry silently.

**What would flip it.** If we standardize on a single SaaS observability vendor and their native agent has a meaningfully better feature set, the indirection stops paying for itself.

---

## 10. Cost per evaluation run as the headline FinOps metric

**The call.** `eval_run_cost_usd` (computed: worker time × node price + LLM tokens × model price + storage write × S3 price) is the metric we put on the leadership dashboard.

**Why.** "Cloud spend went up 20%" doesn't generate decisions. "Cost per eval run went from $0.18 to $0.34, driven by GPT-4 tier judges replacing 3.5 tier" is a tradeoff conversation. Connecting infra cost to product throughput is the FinOps unlock for an AI team.

**Tradeoff.** The number is approximate. Pod-level allocation, shared-node amortization, and idle-capacity attribution all involve modeling choices. We picked reasonable ones, documented them, and don't claim more precision than we have.

**What would flip it.** A more product-aligned metric (cost per agent regression caught, cost per successful test suite) earning its place. The point is *one* number the team trusts and uses.

---

## How to use this when proposing a change

When you find yourself wanting to change one of these decisions, the team rule is:

1. Read the original entry. Make sure you understand the **why** and the **tradeoff** before arguing the call is wrong.
2. Show that the **what-would-flip-it** condition has actually been met, or argue specifically that the original reasoning was wrong.
3. Bring the new design as an ADR-shaped proposal, not a Slack thread.
4. Expect pushback. The team's defaults exist for reasons. If your proposal survives the pushback, great — propose the ADR. If not, you've learned something.

This isn't bureaucracy. It's how the platform stays coherent across the years of changes the team is going to make.
