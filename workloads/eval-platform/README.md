# Eval platform

Argo Workflows + `lm-eval-harness` — the gate between "a new model passed CI" and "we shipped it to production." Every model release goes through this.

## The pipeline

```
   model-release.yml (GitHub Actions)
        │
        │  on merge → triggers Workflow
        ▼
  ┌───────────────────────────────────────┐
  │  Workflow: llm-eval                    │
  │   ├─ run-lm-eval  (MMLU, HellaSwag,    │
  │   │                ARC-c, TruthfulQA)  │
  │   ├─ compute-winrate vs baseline       │
  │   └─ push-metric → Prometheus          │
  └────────────────┬──────────────────────┘
                   │
                   ▼
         model_eval_winrate{model=...}
                   │
                   ▼
   Argo Rollouts AnalysisTemplate reads this
   gauge. If >= 0.5 the canary promotes.
```

## Why Argo Workflows (not Airflow / Prefect / Step Functions)

- **Pods all the way down** — every step is a pod with its own resource requests, image, and node selector. We schedule the eval step on `workload-type=batch` so it doesn't compete with serving GPUs.
- **Native to the platform** — Workflows is already installed for data pipelines. One fewer system to operate.
- **Templating + DAG** — the patterns we need (parallel task fan-out, scoring, push to Prom) fit comfortably.

Airflow would also work; the trade-off is operating a separate scheduler/DB.

## Trigger this manually

```bash
argo submit -n workloads --from workflowtemplate/llm-eval \
  --parameter candidate-model=llama3-8b \
  --parameter candidate-endpoint=http://vllm-llama3-8b-canary.workloads:8000/v1
```

## Adding tasks

`lm-eval-harness` supports hundreds of tasks. Add yours to the comma-separated `tasks` parameter. For domain-specific evals, mount a config volume with custom YAML.

## Production caveats (be honest in interviews)

- The `compute-winrate` step uses a simple accuracy-mean as a proxy. A real production setup would do **pairwise LLM-as-judge** with bias controls (position-swapped pairs, multiple judge models).
- Real eval runs take hours, not minutes. We use `--limit 200` for the demo. Production should bake a "full eval" + "smoke eval" split: smoke runs in the canary gate, full runs nightly.
- No statistical significance gate. Two runs at `acc=0.71` vs `acc=0.72` could be noise; the gate should require a confidence interval check.
