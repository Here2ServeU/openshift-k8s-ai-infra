# Guardrails — input-side AI runtime security

Llama Guard 2 served as a stateless HTTP service. Called by the inference gateway before every model request via an `ext_authz`-style check filter. The gateway gets back `{allow, categories, scores}` and either forwards the request to vLLM or short-circuits with a 451.

The design rationale, including why this is a service and not a per-pod sidecar, why Llama Guard 2 specifically, and how to swap in Prisma AIRS / Lakera / Robust Intelligence, is in [ADR-009](../../docs/decisions/009-ai-runtime-security.md).

## The `/v1/guard` contract

This is the only contract the gateway depends on. Any backend that implements it can be the guard.

**Request**

```http
POST /v1/guard HTTP/1.1
Content-Type: application/json

{
  "prompt": "...",                 // user-supplied content
  "context": {
    "tenant": "tenant-id",
    "route": "/v1/chat/completions",
    "model": "llama3-8b",
    "trace_id": "abcd..."
  }
}
```

**Response — allow**

```json
{
  "allow": true,
  "model_version": "llamaguard2-8b@sha256:...",
  "decision_id": "uuid",
  "duration_ms": 142
}
```

**Response — deny**

```json
{
  "allow": false,
  "categories": ["T2S-03-system-prompt-extract"],
  "scores": { "T2S-03-system-prompt-extract": 0.91 },
  "model_version": "llamaguard2-8b@sha256:...",
  "decision_id": "uuid",
  "duration_ms": 138
}
```

The gateway treats *any* non-2xx response, or any response with `allow=true` but `categories` non-empty for a severity≥warn category, as a deny with `reason="guardrails_unhealthy"`. The metric `guardrails_short_circuit_total` increments and the alert in [`servicemonitor.yaml`](servicemonitor.yaml) pages on sustained short-circuiting.

## Metrics emitted

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `llama_guard_decisions_total` | counter | `decision`, `category`, `tenant`, `route` | Decisions made, by outcome and reason |
| `llama_guard_decision_duration_seconds` | histogram | `route` | Decision latency p50/p95/p99 |
| `llama_guard_model_loaded` | gauge | `model_version` | 1 when the model is loaded; 0 during cold start |
| `guardrails_short_circuit_total` | counter | `reason` | Incremented at the *gateway*, not here, when the guard is unreachable |

The first three are scraped from `llama-guard`'s `/metrics` via `ServiceMonitor`. The last is on the gateway pod.

## Modes

`LLAMA_GUARD_MODE` env on the Deployment:

- `enforce` — return the actual decision. The gateway blocks on deny. **Production default.**
- `shadow` — always return `allow=true` but emit `decisions_total` with the would-be decision labeled. Used on local `kind` (no GPU) and for tuning a new policy against production traffic before flipping to enforce.
- `off` — return `allow=true` with no decision logged. The gateway treats this as a degraded mode and pages. Only intended for incident response.

## Custom policy

The policy file at `/etc/llama-guard/policy.yaml` is mounted from the `llama-guard-policy` ConfigMap. Adding a new category:

1. Edit [`configmap.yaml`](configmap.yaml). Each category needs `id`, `description`, `severity` (`allow`/`warn`/`deny`), and ≥3 exemplars.
2. Run `make test-guardrails` locally — the test exercises shadow mode against a corpus of benign + adversarial prompts and asserts deny rate stays in tolerance bands.
3. Open a PR. The argocd-sync-check workflow verifies the ConfigMap deserializes cleanly; the helm-lint workflow does the YAML structural check.
4. After merge, Argo CD reconciles, the Llama Guard pods reload the policy (SIGHUP via a sidecar `configmap-reload`).

## Local testing

```bash
make test-guardrails
```

What the script does:

1. Applies `workloads/guardrails/` to the local kind cluster.
2. Waits for the Deployment to become ready (it will *not* on kind without a GPU — the test asserts the manifest is correct and the ConfigMap is valid, **not** that the model loaded).
3. Verifies the `ScaledObject` was created.
4. Verifies the default-deny NetworkPolicy and the IMDS egress block.
5. Verifies the ServiceAccount has IRSA / Workload Identity annotations.
6. Sends three synthetic prompts at the gateway's `ext_authz` cluster pointer and asserts the right behavior (allow / shadow-log / deny — depending on `LLAMA_GUARD_MODE`).

The deep, GPU-required test is in CI, gated on a self-hosted GPU runner: it boots an actual Llama Guard 2 server and runs the full benign+adversarial corpus.

## Swapping in a commercial AI firewall (Prisma AIRS, Lakera, Robust Intelligence)

The integration contract is the `/v1/guard` shape above. To swap in a vendor:

1. **Image** — change the `image:` in [`deployment.yaml`](deployment.yaml) to a small "adapter" container that translates `/v1/guard` to the vendor's API. The adapter is typically <50 lines of Python.
2. **Secrets** — add an `ExternalSecret` for the vendor's API token; mount it into the adapter container.
3. **Upstream URL** — add it to [`configmap.yaml`](configmap.yaml) under a new key, e.g. `airs_endpoint: "https://api.airs.paloaltonetworks.com/v1/check"`.
4. **NetworkPolicy** — extend [`networkpolicy.yaml`](networkpolicy.yaml) egress to allow the vendor's IP range (or, more loosely, `0.0.0.0/0:443` with the IMDS block already in place).
5. **Re-run** `make test-guardrails`.

What does **not** change: the Envoy `ext_authz` cluster, the gateway's response handling, the metric names, the alert definitions, or the audit-log shape in Loki. That's the whole point of the abstraction.

## What's NOT here yet

- **Output-side Llama Guard.** Llama Guard 2 supports response classification too. The hot-path output filter is currently regex (see [`workloads/inference-gateway/`](../inference-gateway/)); using the same Llama Guard server on the response path adds 200–400ms per response and isn't worth it for streaming. The async output scanner in [`scripts/python/llm_output_scan.py`](../../scripts/python/llm_output_scan.py) does the heavy lift.
- **Tenant-scoped policy.** Today policy is per-deployment. Per-tenant policy would need a routing tier in front of the guard; deliberately deferred.
- **Multi-modal.** Llama Guard 2 is text-only. Image-input guards (e.g. for the surveillance pipeline) are not in this Deployment — they'd be a separate `image-guard` service of the same shape.
