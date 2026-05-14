# Senior tradeoffs I would defend on the Everse platform

The job framing for this role calls out "technical judgment under ambiguity" as a senior signal. Interviewers usually probe that by pushing on opinions you've already stated — "why didn't you do X instead?", "what would make you change your mind?". The strongest answer is one that already shows you considered X, picked the other path, and named the conditions that would flip the decision.

What follows is the short list of tradeoffs I would walk into the interview holding clearly. Each one has the call, the reasoning, and the conditions that would change my mind.

---

## 1. KEDA on backlog *and* age, not backlog alone

**Call:** Scale `everse-worker` on SQS visible-message count **plus** oldest-message-age, with a Prometheus fallback that keeps the second signal observable.

**Why:** Message count tells you how much work is queued. Age tells you whether anyone is stuck. They diverge during the failure modes that actually cause user pain: a small queue with a 30-minute oldest message means workers are wedged on a slow message, and you need to react before the queue grows.

**Tradeoff:** Two triggers is more configuration and a slightly noisier scale-up curve. Worth it because age is a leading indicator of user-perceived eval delay and a single-signal trigger misses it.

**What would change my mind:** If `everse-worker` becomes strictly homogeneous and short-lived (every message under 30 seconds), age and length collapse to the same signal and one is enough.

See [`workloads/everse-platform/worker.yaml`](../../workloads/everse-platform/worker.yaml).

---

## 2. Argo Rollouts canary on `everse-api`, plain rolling update on `everse-worker`

**Call:** API uses canary with metric analysis. Worker uses rolling update with KEDA-driven replacement.

**Why:** API serves user requests; a bad version is immediately visible in 5xx and p95, and a canary with SLO gates catches it before full rollout. Worker is queue-backed; a "bad" worker isn't user-visible in latency, it's visible in DLQ growth and eval-quality regressions. Trying to canary on those is too slow — minutes to hours of eval runtime per signal. Better to roll workers normally and rely on DLQ alerts plus per-deploy eval-success metrics.

**Tradeoff:** Worker rollouts are slightly less defended against a bad release. Mitigated by per-message retries with exponential backoff, the DLQ alert, and the model-checksum check at startup.

**What would change my mind:** If worker work units become short enough that a per-deploy A/B is feasible (say, sub-30-second eval segments), I'd canary workers too.

---

## 3. Eval suites in Argo Workflows, not Kubeflow Pipelines

**Call:** Eval orchestration runs on Argo Workflows. MLflow handles experiment tracking and model registry.

**Why:** Argo Workflows is a thin DAG layer that integrates with the GitOps stack we already run. Kubeflow Pipelines pulls in a much larger surface area (notebook servers, KFServing, metadata store, central UI) that we'd own without using most of it. For a small research-to-prod team, Argo Workflows is the right unit.

**Tradeoff:** Argo Workflows has no native experiment-tracking UI. We get that from MLflow, integrated through artifact pointers.

**What would change my mind:** If the team grows to multiple research pods running fundamentally different pipelines and we need shared notebook + experiment workflows, Kubeflow earns its keep.

---

## 4. Content-addressed model artifacts in S3, not the OCI registry

**Call:** Models live in S3 (or GCS / Blob) at `s3://models/<name>/<sha256>/`. The Helm value for production references the digest. An init-container verifies the signature on pod start. ([ADR-004](../decisions/004-model-artifacts.md).)

**Why:** Models are not container images. They're large blobs that change far more often than container code, are often loaded by multiple replicas concurrently, and are sometimes pulled at runtime by different services. OCI works, but image pull semantics are tuned for layered code-shaped artifacts.

**Tradeoff:** We give up some OCI ecosystem tooling (cosign-on-image natively, registry-level GC, single CI artifact path). We get cheap fan-out, multi-cloud-friendly storage, and a model lifecycle that can be different from the service lifecycle.

**What would change my mind:** If the team standardizes on small models that compose well with container layering (under a few hundred MB, infrequent updates), OCI starts to win on simplicity.

---

## 5. Spot for batch eval, on-demand for serving floor

**Call:** Worker / batch evaluation pods can run on spot nodes. LLM serving keeps a hard on-demand floor sized for production traffic; spot is the burst layer above the floor.

**Why:** Eval jobs can tolerate restarts (we re-drive from SQS). LLM serving cannot tolerate a 2-minute capacity gap during a spot interruption when a customer's `/v1/chat/completions` is in flight.

**Tradeoff:** We pay on-demand prices for the floor capacity. The savings come from the burst.

**What would change my mind:** If we add a request-replay or session-pinning layer at the inference gateway that survives a pod kill cleanly, more of the serving fleet can move to spot.

---

## 6. Multi-cloud Terraform structure, single primary cloud at any moment

**Call:** Maintain Terraform modules for AWS, GCP, and Azure ([`terraform/`](../../terraform/)). Run production on one of them. The other modules are for portability, demos, and a credible exit story.

**Why:** True simultaneous multi-cloud production is expensive (data egress, IAM split-brain, doubled on-call). It's only worth doing for regulatory or vendor-risk reasons. What's nearly free is keeping the *option* open by writing portable manifests and modular infra.

**Tradeoff:** Some non-portable cloud features (S3 Express, AWS-only Karpenter at certain versions, GCP-only TPU options) take more thought to use. We do use them when the value is large enough; we just don't pretend we're multi-cloud.

**What would change my mind:** A specific regulatory requirement, a real disaster-recovery RTO that can't be met within one cloud, or a single-vendor risk that materializes.

---

## 7. Argo CD over Flux, with Argo Rollouts for progressive delivery

**Call:** Argo CD as the GitOps engine, Argo Rollouts as the canary controller. ([ADR-006](../decisions/006-argocd-rollouts.md).)

**Why:** Argo CD's app-of-apps pattern, sync waves, and UI are an excellent fit for a multi-workload platform with non-trivial dependency ordering. Argo Rollouts gives us canary + analysis as a first-class controller, which is what we actually need for SLO-gated promotion.

**Tradeoff:** Two controllers to operate. Flux has a smaller surface. The Argo team owns more lines of code we depend on.

**What would change my mind:** If we go all-in on a service mesh that provides progressive delivery natively (Linkerd + Flagger, or Istio + Flagger), and the team prefers fewer controllers, Flux + Flagger is a reasonable consolidation.

---

## 8. One namespace per service group, not one namespace per microservice

**Call:** `everse-platform` lives in a single `everse` namespace with UI, API, and worker together. Other workload groups (LLM serving, eval platform, data pipeline) get their own namespace.

**Why:** Namespace per service is fashionable but adds friction for related services that share secrets, network policy, and Service discovery. Service group = blast-radius boundary. The cost (slightly larger NetworkPolicy graphs inside the namespace) is manageable.

**Tradeoff:** Less isolation between sibling services. A noisy neighbor inside the same namespace can starve quotas if quotas are set at the pod level rather than per-deployment.

**What would change my mind:** Strong multi-tenancy requirements (different teams shipping into Everse), or a regulatory boundary between two services in the same group.

---

## 9. OpenTelemetry Collector as the single ingestion point

**Call:** Apps emit OTLP to a cluster-local OTel Collector. The Collector fans out to Prometheus, Loki, and Tempo. ([ADR-005](../decisions/005-otel-collector.md).)

**Why:** Apps stay vendor-portable. Sampling, scrubbing, and routing live in the Collector config, not in application code. Switching a backend is a Collector pipeline change, not a code change.

**Tradeoff:** The Collector itself is a new dependency to operate. Bad Collector config can drop telemetry silently.

**What would change my mind:** If we standardize on a single SaaS observability vendor and their native agent has a meaningfully better feature set, the indirection stops paying for itself.

---

## 10. Cost per evaluation run as the headline FinOps metric

**Call:** `eval_run_cost_usd` (computed: worker time × node price + LLM tokens × model price + storage write × S3 price) is the metric I'd put on a leadership dashboard.

**Why:** "Cloud spend went up 20%" doesn't generate decisions. "Cost per eval run went from $0.18 to $0.34, driven by GPT-4 tier judges replacing 3.5 tier" is a tradeoff conversation. Connecting infra cost to product throughput is the FinOps unlock for an AI team.

**Tradeoff:** The number is approximate. Pod-level allocation, shared-node amortization, and idle-capacity attribution all involve modeling choices. Pick reasonable ones, document them, and don't claim more precision than you have.

**What would change my mind:** If a more product-aligned metric emerges (cost per agent regression caught, cost per successful test suite), I'd elevate that one. The point is *one* number that the team trusts and uses.

---

## How to use this in the interview

You don't need to bring up all ten. Pick two or three that match the conversation, give the *call → why → tradeoff → what changes my mind* shape, and let the interviewer pull on the one they care about. Naming the conditions under which you'd flip your decision is the part that reads as senior — it shows you're holding the decision lightly enough to update it, not defending an aesthetic.
