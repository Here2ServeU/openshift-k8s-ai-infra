# Behavioral stories — STAR format

A senior interview will spend at least 30% on behavioral signal. The role brief calls out three explicit seniority signals:

1. **Autonomy & ownership** — making architectural decisions the team lives with for years.
2. **Technical judgment under ambiguity** — making tradeoffs without a playbook.
3. **Cross-functional influence** — translating research ambitions into operational reality, and pushing back when needed.

Behavioral questions probe these directly. Each story below is shaped to one of those signals, plus a few that almost always come up (outage, mentorship, prioritization).

Use these as templates. Swap in your real specifics. The structure is what carries the signal.

> Format: **Situation → Task → Action → Result → What you'd do differently.**
> Most interviewers love the last line because it shows reflection.

---

## Story 1 — Autonomy & ownership: "Tell me about a major architectural decision you owned"

**Situation.** A platform I was supporting needed to move from a single-region monolith to a multi-region service-group pattern because customer SLA commitments couldn't be met with one region's failure domain.

**Task.** Choose the topology (active-active, active-passive, regional sharding), the data strategy (replicated, partitioned, eventually-consistent), and the cutover plan. No one above me on this.

**Action.** I wrote three short ADRs covering the topology options with concrete cost and complexity numbers, ran two failure-mode workshops with the on-call team, and chose active-passive with read replicas in the standby region. I built the deploy automation first (so the topology was reversible in code, not just on paper), then ran a controlled failover drill before declaring the design complete.

**Result.** The standby region absorbed a 90-minute primary-region degradation six months later with under 30 seconds of write unavailability and no data loss. The decision held for two more years before the team grew enough to justify active-active.

**Differently.** I'd build the cost dashboard before the topology, not after. Two months in, leadership asked "what is this costing us?" and I didn't have a clean answer.

**Signal carried:** ownership of a multi-year architectural call.

---

## Story 2 — Technical judgment under ambiguity: "When did you make a tough call with incomplete information?"

**Situation.** During a production capacity incident on a model-serving stack, two hypotheses fit the symptoms: (a) the upstream LLM endpoint was throttling us, (b) our own connection pool was leaking sockets. We had partial evidence for both. Customer-facing latency was up; pages were firing.

**Task.** Decide what to do *now* — wait for cleaner evidence or act on the most-likely hypothesis. Wrong move either way burns time.

**Action.** I cut traffic to the affected route by 40% with a feature flag (small, reversible), which bought us breathing room without committing to a diagnosis. Then I confirmed the socket-leak hypothesis by reading the pool metrics across the last three deploys, which showed a regression in the most recent one. We rolled the service back, restored full traffic, and the latency cleared inside 15 minutes.

**Result.** Customer impact was limited to a 12-minute degraded window. The post-mortem identified the socket leak as a connection-handling change in a vendor SDK, and we added pool saturation as a paging alert.

**Differently.** I should have written the runbook entry for "ambiguous latency spike → cut traffic first, diagnose second" before the incident, not after. The right move was reusable; I just hadn't reused it.

**Signal carried:** judgment under ambiguity, willingness to act before you have certainty.

---

## Story 3 — Cross-functional influence: "Tell me about a time you disagreed with a research team and how you resolved it"

**Situation.** A research team wanted to run a new inference path with per-request GPU model loading because it simplified their experimentation loop. The infrastructure cost would have been roughly 8× our then-current GPU bill, and the request latency would have been measured in tens of seconds.

**Task.** Push back without becoming the "no" person. They had a real research need; my job was to find them a path that didn't break the platform.

**Action.** I made the cost and latency visible with a one-page comparison: their proposed design at their projected request volume vs. a warm-pool design with pre-loaded variants. I offered a third path — a dedicated namespace with a budget cap and a 30-day expiry — so they could prototype without the platform-wide cost, and so we'd have data to make the decision rather than vibes. The expiry gave us a forcing function to revisit.

**Result.** They prototyped, learned that two of their three variants didn't need per-request loading at all, and we ended up with a shared warm pool plus a small "long tail" loader for the rare experimental variants. Total cost was within 20% of baseline.

**Differently.** I should have invited the research lead to one of our cost review meetings *before* they wrote the proposal. The "no" felt confrontational because they'd already drafted the design without my input. I now ask earlier.

**Signal carried:** influence without authority, push back with a path forward.

---

## Story 4 — Outage / post-mortem: "Walk me through an incident you led"

**Situation.** A model release passed our canary gate but caused a 20% regression in eval pass rates across two customer-specific suites. The canary's metric was win-rate vs. baseline aggregated across all suites, which masked the regression.

**Task.** Identify the root cause, roll back, and decide what to change so this doesn't recur in a way that costs another customer.

**Action.** Rolled back the model digest via Git revert (rollback was 90 seconds end-to-end because of GitOps). Ran the affected suites against the old and new digests offline and confirmed the regression class. The root cause was a fine-tuning data shift that helped most suites and hurt one customer's tone-sensitive evals.

The lasting change was in the canary gate: per-suite pass rate became a *required* signal, not just the aggregate, and any regression worse than 5% on any suite blocks promotion. I also added "canary gates can only protect what they measure" to our runbook intro — it changed how we evaluate every new gate proposal since.

**Result.** Customer impact was a 6-hour eval-quality regression for one customer, contained by rollback. The gate change has caught two subsequent partial-regression deploys before customer impact.

**Differently.** I should have noticed the aggregate-only signal in design review, not after an incident. The post-mortem found this in 30 seconds. I now ask "what does this metric average over?" as a default question in every design review.

**Signal carried:** ownership of impact, learning from failure, durable improvement.

---

## Story 5 — Mentorship / scaling yourself: "How have you grown someone on your team?"

**Situation.** A mid-level engineer joined the team strong on application code but uncertain on production operations — first time on an on-call rotation.

**Task.** Get them to a place where they could lead an incident in three months without me in the room.

**Action.** I paired with them on every incident for the first month, then handed them the on-call book and shadowed for the second month, then went silent for the third except for post-incident debriefs. I gave them ownership of one of our top-three runbooks to rewrite — they had to interview the people who'd actually used it, which built their network. I made sure they led two non-incident operational changes (a KEDA tuning cycle, a noisy-alert cleanup) so they had wins not tied to fires.

**Result.** They led an unrelated production incident in month four cleanly, including the post-mortem write-up and stakeholder comms. Two years later they're staff-level at the same company.

**Differently.** I waited too long on the first solo on-call. They were ready around week 6, not week 12, and the extra wait probably slowed their confidence growth.

**Signal carried:** the ability to grow others, scale that doesn't require you in the loop.

---

## Story 6 — Prioritization: "How do you choose what to work on?"

**Situation.** Inheriting an over-committed quarter: three half-built migrations, two new platform requests from research, a tech debt list with 40 items, and a noisy alert page that was eroding the team.

**Task.** Decide what ships, what slips, and what dies.

**Action.** I scored every active piece of work on (a) reversibility — can we still finish it next quarter if we pause? (b) downstream blocker — are other people waiting on us? (c) ongoing pain — does this cost us hours every week? Cleaning up alert noise scored highest on ongoing pain, even though it had no project status. Two of the half-built migrations got paused with a written "we will resume this in Q2" note (which we did). One died.

I then committed only to what fit in 70% of the quarter's capacity, leaving room for the unknown. Wrote that down so leadership could push back on the choice; they didn't.

**Result.** Pager volume dropped roughly 60%, the surviving migration finished on time, the dead project was acknowledged formally rather than left in zombie state. Team retro mood went from "underwater" to "purposeful" within six weeks.

**Differently.** I waited too long to declare the dead project dead. It had a sponsor who liked it; I let that delay the call by a month. The right move is to surface the death decision early and let the sponsor argue against it explicitly.

**Signal carried:** judgment about scope, willingness to make unpopular calls.

---

## Story 7 — Cost discipline: "Tell me about a time you reduced cloud spend without breaking anything"

**Situation.** Cloud bill was growing roughly 15% month over month, faster than the workload, on a platform with bursty GPU evaluation jobs.

**Task.** Find the disproportionate cost drivers and cut them without slowing the research team.

**Action.** Tagged every resource by `workload` and `team`, joined that with OpenCost per-pod allocations, and surfaced cost-per-eval-run on a Grafana dashboard. The number alone surfaced two issues nobody had flagged: a forgotten dev cluster running 24/7 GPU nodes, and a model-serving floor sized for the peak of three months ago, not last month's peak. Scaling the dev cluster down to zero off-hours and resizing the serving floor recovered roughly 22% of monthly spend in two weeks of low-risk work.

The lasting change was the dashboard. Cost-per-eval-run became a number people quoted in meetings, and the team started asking "what is the cost-per-run impact?" in design reviews unprompted.

**Result.** ~22% reduction in monthly spend, sustained over the next quarter. Bigger win: the conversation about cost shifted from "the bill is too high" to "this model judge tier doubles cost-per-run, is it worth it?"

**Differently.** I should have built the dashboard before pulling the obvious levers. The savings were visible without it, but the cultural shift came from the dashboard, and I would have started the cultural change a month earlier.

**Signal carried:** cost as a product metric, not a chore.

---

## How to deliver these in the room

- Keep each story under 3 minutes. Long is suspicious.
- Lead with the call you made and the result, then back-fill the reasoning. Interviewers reward decision-makers, not narrators.
- The "what I'd do differently" line is the most senior part. Don't skip it.
- If they ask a follow-up that pulls you off the script, follow it. The script is to start you on solid ground, not to perform.
- It's fine to say "I have a few stories that could fit, which lens do you care about?" — that's a senior move.
