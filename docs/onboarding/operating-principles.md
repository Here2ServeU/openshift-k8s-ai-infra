# Operating principles — how we run the platform

This doc is the cultural counterpart to [architecture-decisions.md](architecture-decisions.md). The architecture doc tells you what we built and why. This one tells you *how we behave* when we operate it — when we disagree, when something breaks, when someone wants to ship faster than the platform safely allows, when the bill spikes.

These principles are how senior platform engineers on this team are expected to operate. They're not rules — they're patterns that have earned their place over multiple incidents and decisions.

Each principle has an illustrative example. The examples are anonymized composites of things we've actually seen on this or adjacent platforms; they exist to make the principle concrete, not to be canon.

---

## 1. Own architectural calls all the way through

**Principle.** When you take an architectural decision, you own the cost dashboard, the rollback path, the failure-mode workshop, and the post-mortem if it goes wrong. Not just the design doc.

**What it looks like in practice.** Before declaring a topology change "done," you've:

- Written the ADR with options weighed against concrete numbers.
- Built the automation that makes the change reversible in code, not just on paper.
- Run a failure-mode workshop with the on-call team.
- Run a controlled drill of the new failure-handling path.
- Stood up the cost view before leadership has to ask.

**Example.** A platform team migrated from single-region to active-passive multi-region to meet customer SLA commitments. The engineer who owned it spent six weeks on the design, four weeks on automation, and only then ran the cutover. When a 90-minute primary-region degradation hit six months later, the standby absorbed it with under 30 seconds of write unavailability and no data loss. The thing that almost went wrong: the cost view wasn't ready until month three, and leadership asked "what is this costing us?" before the answer existed. Build the cost view before the topology, not after.

**Anti-pattern.** "I designed it; ops can run it." We don't separate design from operation on this team. The design quality is the operational quality.

---

## 2. Act on the most-likely cause, but make the action reversible

**Principle.** Production incidents rarely give you certainty. You buy yourself diagnostic time with small reversible actions, then commit to a fix once the evidence is clear.

**What it looks like in practice.** In ambiguous outages we:

- Cut traffic, throttle a path, or flip a feature flag *before* we decide the root cause, when those moves are reversible.
- Read the recent-deploy diff before reaching for deeper diagnostics. Most recent-deploy-related incidents are obvious from the diff.
- Diagnose with the dashboards we already have, not by adding new instrumentation mid-incident.

**Example.** Two hypotheses fit a customer-facing latency spike: upstream throttling or our own connection-pool leak. The on-call cut 40% of traffic with a feature flag (reversible), bought breathing room, then read pool metrics across recent deploys and confirmed the leak. Service rolled back, latency cleared in 15 minutes, total customer impact 12 minutes. The post-mortem-driven addition: "ambiguous latency spike → cut traffic first, diagnose second" is now an entry at the top of the [latency runbook](../runbooks/inference-latency-spike.md).

**Anti-pattern.** Waiting for certainty while users hurt. You don't need to know which engine is on fire to land the plane.

---

## 3. Push back with a path forward

**Principle.** When a research request would break the platform, we don't say "no." We make the cost visible, offer a near-equivalent that scales, and if needed give them a guardrailed sandbox with an expiry date.

**What it looks like in practice.** When research proposes something expensive:

1. Show the dollar figure and the failure mode at projected volume.
2. Offer a near-equivalent. "Same outcome, 1/3 the cost, here's the design."
3. If they want to prototype anyway, give them an isolated namespace with a budget cap and an expiry. The expiry is the forcing function to revisit.
4. Invite the research lead to a cost review meeting *before* they draft the next proposal. The earlier we're in the loop, the less it feels like a blocker.

**Example.** A research team wanted per-request GPU model loading. The projected cost was ~8× our then-current GPU bill and per-request latency was tens of seconds. Instead of refusing, the platform engineer offered: (a) a warm-pool design with pre-loaded variants at the same latency, and (b) a 30-day expiring namespace with a budget cap if they wanted to prototype anyway. They prototyped, learned two of three variants didn't need per-request loading at all, and the team converged on a shared warm pool plus a small long-tail loader. Total cost ended within 20% of baseline.

**Anti-pattern.** "No, that won't work." Without a path forward, that reads as a turf claim. The team grows the platform together with research; we don't gate it.

---

## 4. Canary gates only protect what they measure

**Principle.** A passing canary doesn't mean the release is good. It means the metrics the canary measured stayed within the gate. If a regression class isn't in the gate, the canary won't catch it.

**What it looks like in practice.** Every new canary gate gets reviewed against the question "what regression could pass this gate?" Aggregate metrics get extra scrutiny because they're the most likely to hide a real regression behind a happy mean.

**Example.** A model release passed an aggregate-win-rate canary but caused a 20% regression in eval pass rate for one customer's tone-sensitive suites. The aggregate masked the per-customer hit. Rollback was 90 seconds (Git revert of the digest, GitOps reconciled), customer impact was ~6 hours of degraded eval quality, contained. The lasting change: per-suite pass rate is now a required signal on every model canary, and any single-suite regression worse than 5% blocks promotion. "Canary gates only protect what they measure" is the intro line in the relevant runbook.

**Anti-pattern.** Adding more aggregate metrics to the canary gate. The fix for "the aggregate hid a regression" is to disaggregate, not to add more aggregates.

---

## 5. Grow other engineers; don't be the bottleneck

**Principle.** A senior engineer who's the only one who can handle a class of incident is a problem, not an asset. The job isn't to be irreplaceable — it's to be replaceable in a way that grows the team.

**What it looks like in practice.** On a typical ramp:

- Month 1: pair on every incident. The new engineer watches and asks.
- Month 2: hand them the on-call book; shadow as second responder.
- Month 3: silence except for post-incident debriefs. Lead an unrelated change.
- Throughout: give them at least one non-incident operational win (alert cleanup, KEDA tuning) so they have confidence from a non-emergency context.

Two failure modes to watch for in yourself: keeping incidents because they're satisfying to solve, and keeping decisions because you trust your own judgment more. Both are real. Both hold the team back.

**Example.** A mid-level engineer who joined strong-on-code, weak-on-ops led an unrelated production incident cleanly by month four, including the post-mortem and stakeholder comms. The platform engineer who onboarded them admitted afterward that the first solo on-call should have been around week 6, not week 12 — the extra wait slowed the new engineer's confidence growth.

**Anti-pattern.** "I'll just take this incident, it's faster." It's faster this time. It's slower forever.

---

## 6. Prioritize on ongoing pain and downstream blockers, not project momentum

**Principle.** When we choose what ships, three signals matter: reversibility (can we still finish it next quarter?), downstream blockers (are other people waiting?), and ongoing pain (does this cost hours every week?). Project momentum — "we're already halfway done" — is the least valuable signal.

**What it looks like in practice.** We:

- Score every active piece of work on those three dimensions, not on "how far along."
- Commit to no more than ~70% of capacity, leaving headroom for the unknown.
- Write down what we chose not to do, and the reason, so leadership can push back on the choice rather than discovering it later.
- Declare dead projects dead. The longer a project stays in zombie state, the more it costs.

**Example.** A team inherited an over-committed quarter — three half-built migrations, two new platform requests, a 40-item tech debt list, and a noisy pager. Re-scoring against pain/blockers/reversibility put alert cleanup at the top, even though it had no "project" status. Two migrations got paused (with written resume dates that were honored), one died. Pager volume dropped ~60%, the surviving migration shipped on time, team morale recovered in six weeks.

**Anti-pattern.** "We're so close, let's just push through." Sunk cost is not a prioritization signal.

---

## 7. Make cost visible before optimizing it

**Principle.** Cost optimization without visibility is a hand-wave. The biggest savings on this platform have come from *making the number visible*, not from clever optimizations. Visibility changes culture; culture compounds.

**What it looks like in practice.** Before pulling cost levers:

- Every cloud resource is tagged (`team`, `env`, `workload`, `cost-center`).
- OpenCost is wired to those tags for per-pod allocation.
- The headline metric is `eval_run_cost_usd` — the unit of work the product team understands.
- Cost-per-eval-run goes in the weekly team review, alongside latency and pass rate.

**Example.** A platform with monthly spend growing ~15% MoM stopped the growth in two weeks of low-risk work after the dashboard surfaced two issues nobody had flagged: a dev cluster running 24/7 GPU nodes, and a serving floor sized for a three-month-old peak. Recovered ~22% of monthly spend. The bigger win was cultural: cost-per-run became a number quoted in meetings, and design reviews started asking "what's the cost-per-run impact?" unprompted.

**Anti-pattern.** Cost optimization week. Without a durable dashboard the savings revert, and you've taught the team nothing.

---

## How to use these principles

- During incidents: principles 2 and 4 are the ones that come up most. Read them again next time you're paged.
- During design review: principles 1, 3, 4, and 7 are the lenses we use. If a proposal violates one, it's not automatically wrong — but the proposal owner should be able to defend the violation.
- During quarterly planning: principles 5, 6, and 7. They're how we choose where the team spends its time.
- When onboarding the next person: pair on incidents, then shadow, then silence. (Principle 5.) Don't keep incidents to yourself.

The shorthand for the team's senior expectations is: **restraint plus visible momentum**. Lots of doing, very little churn.
