# ADR-009: AI runtime security — guardrails sidecar, output scanning, and red-team eval

**Status**: Accepted
**Date**: 2026-05

## Context

The platform serves LLMs and ML models to clients that include healthcare evaluation surfaces (T2S) and synthetic voice agents. The web-app and Kubernetes security posture is covered in [`docs/security/owasp-posture.md`](../security/owasp-posture.md), but that document admits a gap: the **OWASP LLM Top 10** controls were not fully wired up. The only LLM-layer control was the Qdrant similarity-based prompt-injection canary at the gateway.

The product asks coming in from research and from compliance reviewers are pushing the same direction:

- **Compliance** wants a documented control for *each* OWASP LLM Top 10 category, not a generic "we have a gateway."
- **Research** wants a red-team pipeline that runs on every model release — not just capability eval.
- **Platform on-call** wants the same shape they already operate: a sidecar, a NetworkPolicy, a metric, an alert. Not a separate vendor console.
- **Cost** rules out running Llama Guard on a permanent GPU node for every request. The pattern has to be opt-in per route and scale to zero.

We also evaluated commercial AI runtime security products — Prisma AIRS, Lakera Guard, Robust Intelligence. They have stronger detection, especially for jailbreak families and PII egress, but each one adds a third-party data path and a per-request cost. For this repo, the decision is to build the **integration shape** so a product can slot in, and to provide working open-source defaults so the platform is not blocked on a procurement decision.

## Decision

### 1. Three layers, not one

AI security is split across three layers, each with a clear blast radius:

| Layer | Where | Stops |
|---|---|---|
| **Input guardrail** | Envoy Lua filter at the [inference gateway](../../workloads/inference-gateway/) + Llama Guard sidecar in [`workloads/guardrails/`](../../workloads/guardrails/) | LLM01 prompt injection, jailbreaks, off-policy prompts |
| **Output scanner** | Envoy Lua filter on the response path + `scripts/python/llm_output_scan.py` for batch | LLM02 insecure output handling, LLM06 sensitive-info disclosure (PII, secrets, model identifiers) |
| **Pre-release red-team** | Argo Workflow in [`workloads/eval-platform/redteam/`](../../workloads/eval-platform/redteam/) running Garak | LLM03/LLM04/LLM10 model robustness, data poisoning surface, model theft probes |

Each layer is independent. Failing one does not bypass the others: a prompt that slips past the input filter is still observed by the output scanner; a model that regresses on red-team is caught before production.

### 2. Llama Guard as a sidecar service, not a per-pod sidecar

Llama Guard runs as its own Deployment in a dedicated `guardrails` namespace, exposed via a ClusterIP service. The inference gateway calls it via an `ext_authz`-style HTTP check filter before forwarding to vLLM.

Why a service and not a per-pod sidecar:
- The model is shared. Running one Llama Guard per vLLM pod wastes GPU.
- Scale-to-zero via KEDA: when no requests are flowing, the guardrails Deployment scales to 0 and the gateway short-circuits to "allow" with a metric (`guardrails_short_circuit_total`) that pages if it stays elevated.
- Independent rollout. Llama Guard model upgrades don't restart vLLM.

### 3. Output scanner is regex-first, model-backed-second

Output scanning is two stages:

1. **Lua filter at the gateway** — regex pass over the streaming response body for high-signal patterns: AWS keys, OpenAI keys, SSN, credit cards, JWT structure, internal hostnames (`*.svc.cluster.local`). This is hot-path and runs on every token chunk.
2. **Asynchronous Python scanner** ([`scripts/python/llm_output_scan.py`](../../scripts/python/llm_output_scan.py)) — pulls a sampled fraction of conversations from Loki and re-scans with Presidio + a small embedding classifier for prompt-injection success indicators ("I will now ignore my previous instructions"). This runs as a CronJob, not in the request path.

Why split: the request path can't tolerate a 200ms Presidio call on every response. The async path can.

### 4. Red-team eval is a separate Argo Workflow, not part of `llm-eval`

Garak runs as `WorkflowTemplate/llm-redteam` in the same `eval-platform` namespace, with its own analysis output. Capability eval (`lm-eval-harness`) and adversarial eval (Garak) report separate metrics:

- `model_eval_winrate` — capability, gates Argo Rollouts canary
- `model_redteam_pass_rate` — robustness, gates the *production promotion* (canary → stable), one tier later

This separation is deliberate. A capability regression should block the canary fast; a red-team regression is allowed to take a longer eval pass before blocking promotion to stable.

### 5. Commercial AI firewall integration is a documented swap, not a build

The `guardrails` Deployment fronts a generic `POST /v1/guard` API shape (request body: `{prompt, context}`, response: `{allow: bool, categories: []}`). The repo ships Llama Guard 2 as the default backend. To swap in Prisma AIRS / Lakera / Robust Intelligence, you replace the Deployment image and add a Secret with the API token — the gateway integration does not change. The shape is documented in [`workloads/guardrails/README.md`](../../workloads/guardrails/README.md).

## Rationale

### Why not put everything in the gateway

Tempting, because Envoy already has a Lua hook and seeing one place own LLM safety is clean. Two problems:

1. Lua in Envoy can't talk to a 7B model in <50ms. Llama Guard inference takes 100–400ms even on a small GPU. That cost belongs in a separate pod where it can be scaled, batched, and torn down independently.
2. The gateway is on the hot path for *every* request, including ones that don't need guardrails (health checks, internal eval traffic). Making the gateway own the model means every request pays the gateway-to-model RTT even when the route is exempt.

### Why Llama Guard 2 specifically

We evaluated three open-source guardrail models for the default ship:

| Model | License | Latency p95 (A10G, 256 tok) | Coverage |
|---|---|---|---|
| Llama Guard 2 (8B) | Llama 2 community | ~280 ms | unsafe-content taxonomy + custom policies |
| NeMo Guardrails | Apache 2.0 | varies (rule-based) | configurable but heavier ops |
| ShieldGemma (2B) | Gemma | ~140 ms | content safety, narrower |

Llama Guard 2 has the best "speak the request body's actual semantics" capability for an OpenAI-style chat payload, and the custom policy hooks are how we'll express T2S-specific rules (PHI disclosure, off-label medical advice). NeMo is the right tool if you want a dialog manager, not just a classifier — we don't. ShieldGemma is the faster option and we'll benchmark it when latency matters more than the policy DSL.

### Why Garak as the red-team tool

Garak is what we run because:

- **Probe taxonomy is open.** PyRIT (Microsoft) is more capable but its probe library is more closed; Garak's `dan`, `promptinject`, `goodside`, `xss`, `lmrc` probe families are auditable and add new probes via Python plugins.
- **Output format is straightforward.** Garak emits a JSONL report we can post-process and push to Prometheus. PyRIT's output is structured around its orchestrators, which is more work to flatten.
- **Cost is predictable.** Garak runs as a single container against an OpenAI-compatible endpoint; we already have that endpoint via the gateway. PyRIT wants to orchestrate multiple agents.

The trade-off: PyRIT's multi-turn attack scenarios are stronger. We will revisit when we have a defended agent (not just a defended model) to attack.

### Why a separate red-team metric

A model can be more *capable* (win-rate up) and less *robust* (red-team pass rate down) at the same time. Conflating them makes for a metric that's noisy in both directions. Two metrics, two gates, two owners (research owns win-rate; security owns red-team pass rate).

## Consequences

### Positive

- Each OWASP LLM Top 10 row points to an in-repo control, not a TODO ([docs/security/llm-security-posture.md](../security/llm-security-posture.md)).
- The integration shape for a commercial AI firewall is a one-Deployment swap with no gateway change.
- Red-team regressions block production promotion automatically — security doesn't have to remember to gate.
- On-call sees guardrail health as one more metric and one more alert; no new tool to learn.
- Output scanning is split so the request path stays fast and the deep scan happens out-of-band.

### Negative

- Three layers means three places to debug a false positive. A blocked prompt could be Llama Guard, the response regex, or a Garak-induced rollout halt. We document the triage order in [`docs/runbooks/guardrails-false-positive.md`](../runbooks/guardrails-false-positive.md) (pointer to be added).
- Llama Guard at 8B parameters wants a GPU. On CPU it works but adds 1–3 s of latency, which is a non-starter for streaming. The `make local-up` flow runs guardrails in a CPU "shadow mode" that logs decisions without enforcing — explicit in the README.
- Garak runs are slow. A full robustness sweep takes 30–90 minutes per model and burns inference quota on the endpoint under test. We gate promotion on a *sampled* probe set and run the full sweep nightly.

### Edge cases

- **Streaming responses** — output scanning over a streamed token chunk can match a regex that spans a chunk boundary. The Lua filter keeps a 256-byte trailing window across chunks. If the false-negative rate becomes a concern, the async scanner is the safety net.
- **Multi-tenant policy** — Llama Guard accepts custom policies, but they're set per-deployment, not per-tenant. Per-tenant policy needs a routing tier in front of Llama Guard. Out of scope for v1.
- **Adaptive adversaries** — a static regex set and a fixed Llama Guard policy are easy to evade with novel attacks. The Garak nightly run is the bandage; rotating the probe set quarterly is the structural fix.

## Cross-references

- [LLM security posture (OWASP LLM Top 10 mapping)](../security/llm-security-posture.md)
- [Guardrails workload](../../workloads/guardrails/)
- [Red-team eval workflow](../../workloads/eval-platform/redteam/)
- [Inference gateway Envoy config](../../workloads/inference-gateway/envoy-config.yaml)
- [Async LLM output scanner](../../scripts/python/llm_output_scan.py)
- [Web + K8s posture](../security/owasp-posture.md)
