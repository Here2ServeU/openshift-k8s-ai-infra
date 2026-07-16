# Operating headless AI agents in production

How we run the agent tier: headless, long-lived AI agents that act as intelligent workstations for clinical and operational staff — reading from and writing to enterprise applications (EHR-adjacent systems, ticketing, document stores) through tool calls, with no human watching each step. This is the workload class where "the pod is Running" and "the product is working" are furthest apart, and where industry best practice is still being written. These are the patterns we've committed to; expect this doc to change.

Related: [voice-agent-infra.md](voice-agent-infra.md) for the conversational tier, [ADR-009](../decisions/009-ai-runtime-security.md) for runtime guardrails, [ADR-011](../decisions/011-azure-operations.md) for the Azure operations layer, [hipaa-operational-posture.md](../security/hipaa-operational-posture.md) for the PHI rules that shape everything below.

---

## The operational contract for an agent

An ordinary service gets availability and latency SLOs. An agent workload needs four properties, in priority order:

1. **Attributable** — every action the agent takes (tool call, integration write, message) carries the run ID, agent identity, and trace ID. When someone asks "why did the system update this record," the answer is a trace query, not archaeology.
2. **Recoverable** — an agent run that dies mid-task must either resume from its last durable step or roll back cleanly. Crash-and-rerun-from-scratch is only acceptable if every tool call is idempotent — and "the vendor API is idempotent" is a claim you verify, not assume.
3. **Bounded** — per-run budget caps (tokens, tool calls, wall clock, downstream API writes). A looping agent is the AI equivalent of a runaway queue producer, except it spends money *and* mutates enterprise state.
4. **Observable in behavior, not just health** — see below. Behavioral drift is the incident class that liveness probes cannot see.

## Workload shape

Agents run as queue-backed workers, same skeleton as the T2S eval tier ([ADR-008](../decisions/008-t2s-service-group.md)): work arrives on a queue, a worker claims a run, executes the agent loop against the LLM gateway, persists state transitions to Postgres, artifacts to the object store.

What's different from the eval workers:

- **State checkpointing is mandatory.** Eval jobs can rerun; an agent halfway through a multi-system workflow cannot blindly redo its writes. Each completed tool call is checkpointed with its result; resume replays state, not side effects.
- **Rollouts drain, never kill.** Same pattern as voice: `terminationGracePeriodSeconds` sized to the longest sane run, `preStop` flips the worker to stop-claiming, KEDA scales on *active runs + queue depth*. A deploy must never strand a half-finished workflow.
- **Every agent type is its own identity.** One ServiceAccount + Workload Identity binding per agent type, scoped to exactly the integrations it uses. This is both least-privilege and what makes attribution real.
- **All model traffic goes through the inference gateway.** Agents get no direct egress to LLM providers — the gateway is where guardrails, budgets, routing, and per-agent usage accounting live. NetworkPolicy enforces this; it's not a convention.

## Observability: behavior is the signal

Infrastructure metrics tell you the agent tier is up. These tell you it's *working* — they flow through the standard OTel pipeline to Prometheus/Grafana, with the audit-relevant slice dual-exported to Log Analytics / App Insights (ADR-011):

- **Run lifecycle** — `agent_run_started/completed_total` by agent type and terminal status (`succeeded`, `failed`, `budget_exceeded`, `escalated_to_human`, `abandoned`). The ratio of `escalated` and `budget_exceeded` is the early-warning channel: it climbs days before anyone files a complaint.
- **Step-level latency** — time per loop iteration, split into LLM time (TTFT/TPOT from the gateway) vs. tool time per integration. When "the agent is slow," this is what says whether it's the model, one enterprise API, or the agent genuinely doing more steps.
- **Behavioral baselines** — steps per run, tokens per run, tool-call mix, retry rate: percentile baselines per agent type + suite version. A model version bump that sends median steps-per-run from 6 to 11 is a regression even though every request succeeded. Alert on baseline deviation, ticket-level, not page-level.
- **Integration health from the agent's side** — per-integration error/timeout/auth-failure rates as first-class series. Enterprise apps have maintenance windows and rate limits; the agent tier is usually their noisiest client and the first to notice.
- **Guardrail events** — injection screens, PII scans, and policy blocks (ADR-009) emit metrics per agent type. A spike in output-side PII catches is a data problem upstream, not gateway noise.

Transcripts and prompts are **artifacts, not logs** — encrypted object storage, access-logged, referenced from the trace by run ID (the HIPAA posture doc explains why this is non-negotiable).

## Incident patterns we plan for

| Pattern | What it looks like | First move |
|---|---|---|
| Runaway loop | One run's token/tool-call count climbing linearly; budget alerts | Budget cap kills the run automatically; on-call asks *why* the loop happened (usually a tool returning an error the model retries forever) |
| Behavioral drift after a model/prompt change | Success rate flat, steps-per-run and escalations climbing | Treat as a bad release: revert the model digest or prompt version via GitOps, then diff traces between versions |
| Integration credential expiry | One integration's auth failures at 100%, everything else healthy | ESO sync status first — nine times out of ten it's a rotation that didn't propagate ([operational-hygiene.md](../security/operational-hygiene.md)) |
| Stuck runs | Runs in `executing` with no step progress > N minutes | The queue-backlog playbook applies ([t2s-queue-backlog.md](../runbooks/t2s-queue-backlog.md)): a few wedged workers hide behind healthy averages |
| Enterprise app slowdown | One tool's p95 up 10×; agent throughput collapses while infra looks idle | Per-integration circuit breaker sheds that tool's runs to a retry queue instead of letting them camp on workers |

The general rule: **an agent incident is a data/behavior incident until proven otherwise.** The pods are almost always fine.

## What we deliberately don't do

- **No agent self-modification of its own scopes, budgets, or prompts at runtime.** Changes to agent configuration are Git commits, reviewed and attributable like any deploy.
- **No shared "agents" service account**, no matter how convenient the Helm chart would be.
- **No free-text agent output in logs.** If you need to debug a conversation, you fetch the artifact with an access-logged, short-TTL URL.
- **No unbounded autonomy on write-path integrations.** New agent capabilities start in shadow mode (propose, don't execute) with human review of proposals, and graduate to autonomous execution per-capability once the proposal accuracy baseline supports it. That gate is a product decision recorded in the agent's config, not an engineer's judgment call at deploy time.
