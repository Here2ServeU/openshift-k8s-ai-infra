# Python automation

Operational scripts the platform team runs against the cluster. Python rather than shell where the logic touches structured cloud APIs (SQS, S3, Prometheus, cloud cost APIs) — shell is fine for orchestrating other binaries, but parsing JSON and emitting structured exit signals belongs in Python.

| Script | What it does | Used by |
|---|---|---|
| [`queue_audit.py`](queue_audit.py) | Inspects SQS queues backing `t2s-worker` / `t2s-worker-voice` — depth, age-of-oldest, in-flight, DLQ count. Exits non-zero past thresholds. | On-call paging shim; CI smoke after a release |
| [`cost_report.py`](cost_report.py) | Joins OpenCost allocation data with cloud cost-explorer rollups, breaks down by `team` / `workload` / `cost-center` tags. | Weekly cost review; cost-spike runbook |
| [`model_artifact_validate.py`](model_artifact_validate.py) | Validates a model artifact in object storage: sha256 match, safetensors header sniff, picklescan, license-file presence. | `model-release.yml` validate job |
| [`gpu_util_report.py`](gpu_util_report.py) | Pulls DCGM exporter samples from Prometheus, summarizes per-node utilization vs. spot price. Flags candidates for downsizing or migration. | Capacity planning |
| [`slo_burn_check.py`](slo_burn_check.py) | Reads Sloth SLO definitions in `observability/slo/`, queries Prom for current burn, prints a budget snapshot. Standalone of Alertmanager so it can run pre-deploy. | Release gate; eyes-on-glass check |

## Conventions

- **Stdlib + boto3/google-cloud-* + requests only.** No frameworks. These are operational scripts, not services.
- **Structured output on `--json`.** Default output is human-readable; CI runs with `--json` and parses.
- **Exit codes are load-bearing.** `0` = clean, `1` = warning threshold, `2` = critical threshold, `>=3` = script error.
- **Read-only by default.** Anything that mutates cluster or cloud state requires `--apply`. Bare invocation prints what it *would* do.
- **No surprises in CI.** Scripts that take more than a few seconds expose `--timeout`. Scripts that page cloud APIs expose `--max-pages` so a regression can't run up a bill.

## Local quickstart

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/python/requirements.txt
export KUBECONFIG=~/.kube/config
export AWS_REGION=us-east-1
python scripts/python/queue_audit.py --queue t2s-eval --queue t2s-eval-voice
```

## Why these are Python, not shell

Three of the scripts (`queue_audit`, `cost_report`, `slo_burn_check`) make multi-page paginated cloud API calls and join the results to Prom queries. Doing that in bash is technically possible and operationally terrible — the failure modes (partial pagination, silent `jq` filter mistakes, fragile error handling) are exactly the kind of thing that bites at 2 AM. `model_artifact_validate.py` needs to parse a binary header (safetensors) which is not a shell job at all.
