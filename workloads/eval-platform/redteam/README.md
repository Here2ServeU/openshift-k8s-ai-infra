# Red-team eval — Garak on every model release

Adversarial robustness eval. Runs alongside capability eval (`lm-eval-harness`) but gates a different stage of promotion and reports a separate metric.

| | Capability eval (lm-eval) | Red-team eval (Garak) |
|---|---|---|
| **Metric** | `model_eval_winrate` | `model_redteam_pass_rate` |
| **Probes** | MMLU, HellaSwag, ARC, TruthfulQA | promptinject, dan, goodside, lmrc, atkgen, encoding, latentinjection, divergence |
| **Gates** | 0% → 10% canary | canary → stable |
| **Runtime** | 5–15 min sampled / 1–2 h full | 10–30 min sampled / 30–90 min full |
| **Owner** | research | security |

The architecture rationale (why two metrics, two gates, two owners) is in [ADR-009](../../../docs/decisions/009-ai-runtime-security.md) §5.

## How it runs

1. **Per release (sampled)** — when the model-release pipeline lands a new digest, it triggers `WorkflowTemplate/llm-redteam` with `probe-families=promptinject,dan,goodside` and `generations=10`. Takes ~10 minutes. The `AnalysisTemplate/redteam-pass-rate` reads the resulting Prometheus metric and gates canary → stable.

2. **Nightly (full sweep)** — `CronWorkflow/llm-redteam-nightly` runs the full probe set against the current production model, archives the JSONL report to S3, and emits per-family metrics for trending. This is the "did the threat surface shift overnight?" signal — model behavior doesn't change between releases, but the *attack literature* does, and the probe set rotates quarterly.

## Probe families used

Garak's probe taxonomy, with what each one stresses:

| Family | Stresses |
|---|---|
| `promptinject` | Direct prompt injection — overriding the system prompt with user content |
| `dan` | "Do Anything Now" / role-play jailbreaks |
| `goodside` | Riley Goodside's collection of clever bypasses (encoding tricks, instruction smuggling) |
| `lmrc` | Language-model risk cards — harmful-content elicitation |
| `atkgen` | Auto-generated attacks (Garak's red-team LLM probes a target LLM) |
| `encoding` | Base64, ROT13, leetspeak smuggling |
| `latentinjection` | Hidden instructions in retrieved context (indirect injection) |
| `divergence` | Behavior divergence between model versions — surfaces both regressions and fingerprinting opportunities |

The sampled gate uses the first three because they have the best signal-to-runtime ratio. The full sweep covers everything.

## What this is *not*

- **Not a NIST AI RMF audit.** Garak nightly is continuous evidence, not certification.
- **Not a PyRIT replacement.** PyRIT's multi-turn orchestration is stronger when the *agent* is the attack surface; today the model is. ADR-009 names the conditions under which we'd add PyRIT alongside.
- **Not a substitute for the input guardrail.** Red-team eval tells you what your model is vulnerable to. The guardrail in [`workloads/guardrails/`](../../guardrails/) is what stops the attack from reaching the model in the first place. Both layers exist; they catch different things.

## Local testing

```bash
make test-redteam
```

What it does:

1. Applies the WorkflowTemplate, CronWorkflow, AnalysisTemplate, and ConfigMap.
2. Verifies they parse and are picked up by argo-workflows.
3. Submits a single run with `probes=promptinject` and `generations=2` against a stub OpenAI endpoint (the local kind cluster's TinyLlama via the inference gateway).
4. Asserts the resulting workflow reaches `Succeeded` and pushed a `model_redteam_pass_rate` metric.

No GPU is required for the local run — TinyLlama is the model under attack, and a 2-generation sweep takes about 90 seconds.
