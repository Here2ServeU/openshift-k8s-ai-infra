# LLM security posture (OWASP LLM Top 10 + AI runtime security)

Companion to [`owasp-posture.md`](owasp-posture.md). That document maps the web-application and Kubernetes posture; this one maps the **OWASP LLM Top 10 (2025)** and adjacent AI-runtime concerns to where the controls live in this repo.

The architecture decisions behind these controls are in [ADR-009](../decisions/009-ai-runtime-security.md). The shape is three layers — input guardrail, output scanner, pre-release red-team — and a documented swap path so a commercial AI firewall (Prisma AIRS, Lakera, Robust Intelligence) can replace the open-source default without changing the gateway integration.

## OWASP LLM Top 10 (2025)

| ID | Category | Where the control lives | Notes |
|---|---|---|---|
| LLM01 | Prompt Injection | Llama Guard 2 sidecar in [`workloads/guardrails/`](../../workloads/guardrails/), called from the gateway via an HTTP check filter. Similarity-based prompt-injection canaries via Qdrant in [`workloads/vector-db/`](../../workloads/vector-db/). | Direct injection blocked at input; indirect (data-borne) injection partially covered by the output scanner detecting injection-success indicators. |
| LLM02 | Insecure Output Handling | Gateway response-path Lua filter scans for secrets, internal hostnames, JWT structure. Async deep scan via [`scripts/python/llm_output_scan.py`](../../scripts/python/llm_output_scan.py) using Presidio + classifier on sampled conversations from Loki. | The async path is what catches the slow burns; the hot path catches the high-signal bleed. |
| LLM03 | Training Data Poisoning | Model artifacts are content-addressed and signed (ADR-004). Training-data corpora ingested into Qdrant pass through [`scripts/python/rag_corpus_scan.py`](../../scripts/python/rag_corpus_scan.py) for injection-marker scanning before indexing. | We don't train base models in this repo — fine-tuning corpora are the realistic surface, and they're versioned in S3 with the same digest discipline as model weights. |
| LLM04 | Model Denial of Service | Per-tenant rate limit at the gateway (Envoy `local_ratelimit`, 100 req/min default). Request body size cap at 64 KiB (413 short-circuit). vLLM running with bounded `max_num_seqs` and `max_model_len`. KEDA scales on queue depth so a flood doesn't starve other tenants. | Token-budget per request is enforced at the gateway *and* at vLLM. Two layers because a misconfigured gateway shouldn't be a single point of failure. |
| LLM05 | Supply Chain | Cosign-signed images + SBOM attestation. Trivy `fs`/`config`/`image` scans in CI. Model weights pulled by digest only (sha256), verified at pod-start by an init container. Python deps pinned with hashes in `scripts/python/requirements.txt`. | Same supply-chain discipline as A06/K02; LLM05 is just that discipline applied to model artifacts. |
| LLM06 | Sensitive Information Disclosure | Output scanner (above). PII detection in the async path uses Presidio with the `en_core_web_sm` model and a custom recognizer for medical record numbers (T2S product surface is healthcare-adjacent). | The hot-path regex catches credentials; the async path catches PHI/PII patterns that regex misses. Hits surface as `llm_output_pii_detected_total{kind="..."}` and page on a sustained rate. |
| LLM07 | Insecure Plugin Design | The inference gateway does **not** expose tool-use or function-calling endpoints. Models in this repo are chat-only. When agentic flows land, the action-allowlist pattern goes here. | Listed under "What's NOT here" so it stays visible. ADR-009 §Edge cases names the work. |
| LLM08 | Excessive Agency | Same as LLM07: agentic flows are out of scope for v1. The platform is a model-serving surface, not an agent runtime. | The voice-agent worker tier is a *simulation* of an agent for evaluation, not a production agent making real decisions. |
| LLM09 | Overreliance | Eval pipeline (`lm-eval-harness`) plus red-team pipeline (Garak) both gate promotion. T2S operator UI explicitly shows model confidence and the eval-run digest beside each output ([`workloads/t2s-platform/ui/`](../../workloads/t2s-platform/ui/)). | This is partly a UX control, not just a platform control — the platform exposes the signals, the UI is responsible for not hiding them. |
| LLM10 | Model Theft | IRSA / Workload Identity gates access to the model bucket; no static keys. Bucket policy denies `s3:GetObject` from outside the cluster's NAT egress IP set. Egress NetworkPolicy on `llm-serving` workloads denies arbitrary egress except for telemetry. Model-weight pulls are logged via S3 access logs to a separate audit bucket. | Detection: a Prometheus alert fires on `s3_request_rate{bucket="model-artifacts"}` deviation from the rolling baseline. Spike → page. |

## AI-runtime concerns beyond the OWASP list

A few categories the OWASP list doesn't name but that come up in real deployments:

| Concern | Control |
|---|---|
| **Jailbreak families** (DAN, role-play, base64-encoded instructions, system-prompt extraction) | Garak nightly run on the production endpoint — `dan`, `promptinject`, `goodside`, `lmrc` probe families. Failure rate published as `model_redteam_pass_rate{family="..."}`. |
| **Indirect prompt injection via RAG** | Qdrant corpus passes through `rag_corpus_scan.py` before indexing. Retrieved chunks tagged with provenance; the gateway can refuse retrieval from low-trust corpora for high-stakes routes. |
| **Cross-tenant data leakage** | One namespace per workload group. KV-cache is not shared across vLLM replicas serving different tenant pools. Conversation logs are tenant-tagged at ingestion to Loki, RBAC'd on query. |
| **Model fingerprinting / extraction probes** | Gateway rate-limits + per-tenant query budgets. Garak `divergence` probe checks for known fingerprinting prompts. |
| **Hallucinated tool calls / function names** | Until we add tool use, this is N/A. When we do, the action-allowlist pattern (controller-side, not model-side) is the control. |
| **Adversarial inputs to traditional ML** | KServe predictors run with input-shape validation at the InferenceService level. Image classifiers have a perturbation-detection preprocessor (Lp-norm threshold) — a known-weak defense, but it raises the cost of trivial attacks. |

## What we explicitly do *not* claim

- **No formal red-team certification.** Garak nightly runs are continuous evidence; they're not a NIST AI RMF audit.
- **No human-in-the-loop policy review.** The system flags and blocks; humans review false-positive reports out-of-band. A future T2S surface will expose the review queue, but it's not in v1.
- **Llama Guard 2 is not perfect.** Reported jailbreak success rates against Llama Guard 2 in the literature are non-zero. The defense-in-depth assumption is what makes this acceptable: the output scanner and the red-team eval are the safety net for what slips past the input filter.
- **Adversarial robustness on classical ML** is rudimentary. A real defender against, e.g., adversarial patches on the surveillance-imagery pipeline would use certified-radius training or randomized smoothing. Out of scope for the inference platform.

## Swap path to a commercial AI firewall

The integration contract is documented in [`workloads/guardrails/README.md`](../../workloads/guardrails/README.md). To replace Llama Guard with Prisma AIRS, Lakera Guard, or Robust Intelligence:

1. Update `workloads/guardrails/deployment.yaml` — change the image, add the vendor's API token via `ExternalSecret`.
2. Update `workloads/guardrails/configmap.yaml` — set the upstream URL (the vendor's cloud endpoint) and the request mapper.
3. The Envoy `ext_authz` cluster pointing at `guardrails.svc.cluster.local:8080` does not change.
4. Re-run `make test-guardrails`. Same assertions: allow/deny on a known-good and a known-bad prompt.

The point of the abstraction is that the *gateway never knows* whether the backend is Llama Guard, Prisma AIRS, or a unit-test stub. That's deliberate.

## Audit trail for AI security events

When an auditor asks "what happened to that prompt?":

1. **Gateway access log** (Loki) — request body hash, tenant, route, decision (`allow`/`deny`/`shadow`).
2. **Guardrails decision log** (Loki) — request hash, Llama Guard category scores, model version, decision.
3. **Output scanner log** (Loki) — response hash, detections, categories.
4. **Red-team baseline** (`model_redteam_pass_rate` history in Prometheus) — what the model scored on the probe set that was current at the time of the prompt.

Same three-step shape as the model audit trail in [`owasp-posture.md`](owasp-posture.md): the question "what did the platform see?" is answered by the gateway log; "what did it decide?" by the guardrails log; "was the model itself in a known-good state?" by the red-team baseline.
