# Runbooks

Oncall playbooks for the platform. Each one is structured the same way:

1. **Triggers** — which alert / signal opens the page.
2. **Identify** — three commands that localize the problem in <60s.
3. **Decide** — the small set of classes the incident falls into, with the action for each.
4. **Verify** — how you know it's actually fixed.
5. **Common gotchas** — what the runbook author learned the hard way.

| Runbook | Covers |
|---|---|
| [inference-latency-spike.md](inference-latency-spike.md) | TTFT / e2e / availability SLO breaches |
| [gpu-node-not-ready.md](gpu-node-not-ready.md) | GPU node failures, XID errors, spot interruptions |
| [cost-spike.md](cost-spike.md) | Unexpected cloud spend, idle GPUs, runaway scale |
| [model-rollback.md](model-rollback.md) | Reverting a bad model digest, fast and slow paths |
| [everse-queue-backlog.md](everse-queue-backlog.md) | SQS backlog, DLQ growth, stuck or saturated eval workers |

## Conventions

- Alerts include `runbook_url` annotations pointing to these files. Always update the URL when renaming a file.
- "Quick fix" actions are explicitly labelled. They're the right call during a fire; follow up with the permanent fix after.
- Every runbook ends with a "Common gotchas" section. That's where the value lives — anyone can write a "kubectl get pods" tutorial; what matters is the non-obvious traps.
