# ADR-008: Everse as a single service group with tiered workers

**Status**: Accepted
**Date**: 2026-05

## Context

Everse is an evaluation and simulation platform for AI agents. Its product surface has three coupled services: `everse-ui` (React/Next.js), `everse-api` (Python API), and `everse-worker` (queue-backed Python workers consuming SQS). It also has a tier of voice-capable workers for the voice-agent simulation product.

The team is small (research-to-prod), and the operational model needs to (a) ship to production frequently, (b) absorb bursty research workloads, (c) keep cost-per-eval-run as a tracked metric, and (d) preserve a clean rollback path for any release.

The decisions documented below have come up explicitly in the brief or in the workload manifests:

- Should `everse-ui`, `everse-api`, and `everse-worker` share a namespace or each have one?
- Should we use a single worker tier or split text vs. voice workers?
- Should worker scaling be on queue length, message age, or both?
- Should the canary strategy be the same across UI, API, and worker?

## Decision

### 1. One namespace, one Argo CD application, three deployments

All Everse services live in a single `everse` namespace as a single Argo CD application ([`workloads/everse-platform/application.yaml`](../../workloads/everse-platform/application.yaml)). The application owns the manifests under `workloads/everse-platform/`.

### 2. Two worker tiers: text and voice

Text workers are short-lived, scale aggressively on backlog, and are the default tier. Voice workers are longer-lived (the unit of work is a multi-minute call), scale on concurrent active calls, and tolerate slower scale-down. Both consume from the same logical queue family but are deployed and scaled independently.

See [`docs/onboarding/voice-agent-infra.md`](../onboarding/voice-agent-infra.md) for the longer treatment of the voice tier.

### 3. Compound KEDA trigger for text workers: backlog **and** message age

Text workers scale on the maximum of two signals: SQS visible-message count and SQS oldest-message-age (the latter sourced via Prometheus from the SQS exporter). See [`workloads/everse-platform/worker.yaml`](../../workloads/everse-platform/worker.yaml).

### 4. Canary with metric analysis for `everse-api` and `everse-ui`; rolling for workers

API and UI use Argo Rollouts canary with a Prometheus `AnalysisTemplate` ([`workloads/everse-platform/analysis-template.yaml`](../../workloads/everse-platform/analysis-template.yaml)) gating on error rate and p95 latency. Workers use a standard rolling update — their "is this release good?" signal is DLQ growth + eval pass rate, not request latency, and those signals are too slow for an in-rollout gate.

## Rationale

### One namespace

A `everse-ui` / `everse-api` / `everse-worker` triple is the unit of product, not three separate products. Splitting them into three namespaces would multiply NetworkPolicy graphs, secret references, and ServiceAccount/IRSA wiring without gaining a real isolation benefit, because they fail together: if the API is down, the worker queue grows and the UI's main job is broken regardless. A single namespace bounds the blast radius to "Everse is down" without manufacturing artificial seams.

Other workload groups (LLM serving, eval-platform, data-pipeline) get their own namespaces because they have different ownership, different release cadence, and different security boundaries.

### Tiered workers

A single worker tier handling both short text-eval messages (~ seconds) and long voice-call messages (~ minutes) creates two problems:

1. Scaling signal becomes incoherent — backlog of 50 messages means very different load if the average duration is 5s vs. 5min.
2. Rollouts are forced into the worse of two strategies — you either kill active voice calls (bad) or you wait minutes for text workers to drain (slow).

Splitting tiers lets each one have its own scaling triggers, its own node pool, and its own rollout strategy. The cost is one more Deployment to manage.

### Backlog and age compound trigger

Backlog alone misses the failure mode where a small number of workers are wedged on slow messages — the queue size looks fine, but the oldest message is hours old. Age alone misses sudden volume spikes (the age is low because new messages have been added, but you're falling behind). Together they describe both "too much work" and "stuck work."

Prometheus is the source for age because the AWS-native SQS metric is published with delay; the Prometheus exporter scrapes more frequently and is the signal that wakes alerts and KEDA in the same place.

### Canary for API/UI, rolling for workers

Argo Rollouts canary is most valuable when the *signal* (error rate, latency) responds within the rollout window. For API and UI, a 5-minute pause at 10% traffic gives you enough sample to detect a regression. For workers, the meaningful signal is "did the new release produce a different eval pass rate?" — and that takes a full eval run to surface, which is longer than the rollout window. So workers get a fast rolling update with strong post-deploy alerting (DLQ growth, crash loops, per-deploy eval-success metric) instead of an in-rollout canary that wouldn't see the regression in time anyway.

## Consequences

### Positive

- Service-group promotion is a single Argo CD sync. One source of truth for the whole product surface.
- Rollback is a Git revert at the digest level, same shape across all three services and both worker tiers.
- Scaling signals match each workload's actual saturation pattern.
- Voice and text workers can be operated and tuned independently without coordinated cluster changes.

### Negative

- A noisy neighbor inside the `everse` namespace (e.g., a UI bug exhausting connection limits to the API) has no namespace boundary to break against. We mitigate with per-Deployment resource requests, PDBs, and a default-deny NetworkPolicy with explicit allows.
- Two worker tiers means two scaling configs and two on-call patterns. We document both in the runbook.
- Worker rollouts don't catch regressions until post-deploy. We compensate with paging on DLQ growth and per-deploy eval-success metrics tied to the commit SHA.

### Edge cases

- A future requirement for strict multi-tenancy (separate customer-isolated Everse instances) would push us toward namespace-per-tenant rather than namespace-per-service. ADR revisit at that point.
- If text-message processing time grows toward voice-message duration (e.g., long multi-turn text conversations), the two-tier split may stop being meaningful and we'd converge.

## Cross-references

- [Service manifests](../../workloads/everse-platform/)
- [Voice-tier infrastructure notes](../onboarding/voice-agent-infra.md)
- [Architecture decisions](../onboarding/architecture-decisions.md)
- [Queue-backlog runbook](../runbooks/everse-queue-backlog.md)
- [Everse SLO definitions](../../observability/slo/everse-slo.yaml)
