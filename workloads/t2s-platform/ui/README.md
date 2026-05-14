# t2s-ui

The React/Next.js operator surface for T2S — **Trust to Scale**, an AI assurance platform for AI/ML and robotic systems being deployed into highly regulated environments (FDA SaMD, IEC 62304, ISO 13485, EU MDR, HIPAA).

This directory is the application code. The Kubernetes manifests that run it live one level up at [`../ui.yaml`](../ui.yaml) (Rollout + Service + HPA). The brand identity that informs every design choice in here is in [`BRAND.md`](BRAND.md).

## Demo

![Mission Control — KPI row, SLO ring gauges, live sparklines, compliance lanes, recent runs, audit feed](../../../docs/screenshots/01-mission-control.png)

![Eval Runs — every cohort under evaluation, keyed by suite + agent digest + persona sha](../../../docs/screenshots/02-eval-runs.png)

![Personas — clinical-grade simulation profiles with tone, audio quality, WPM, interruption, languages](../../../docs/screenshots/03-personas.png)

![Compliance — regulatory gates grouped by framework with clause-level citations](../../../docs/screenshots/04-compliance.png)

![Audit Trail — tamper-evident timeline of cryptographic events, signed and sunk to S3 WORM](../../../docs/screenshots/05-audit-trail.png)

### Run it locally — exact commands that worked

```bash
# 1. Move into the UI app (one level deeper than the workload directory).
cd /Users/emmanuelnaweji/k8s-ai-ml-infra/workloads/t2s-platform/ui

# 2. Install dependencies (one-time, ~30s on a warm cache).
npm install

# 3. Start the dev server. Port 3000 is the default; if something else is
#    already bound to 3000 (a Docker container, another Node process), pick
#    a free port with -p. The `Makefile` target `make ui-dev` does this
#    auto-detect for you.
npx next dev -p 3010          # → http://localhost:3010

# 4. Confirm the right service is responding (sanity-check before opening
#    the browser — distinguishes T2S from anything else on the same port).
curl -s http://localhost:3010/api/healthz
# → {"status":"ok","service":"t2s-ui","version":"0.2.0"}
```

If you hit `EADDRINUSE`, find the process holding the port and either stop it or pick a different `-p`:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN     # show what's on 3000
docker ps                            # if it's a container
npx next dev -p 3010                 # or just sidestep the conflict
```

## What's in it

| Surface | Path | What it does |
| --- | --- | --- |
| **Mission Control** | [`app/page.tsx`](app/page.tsx) | KPI row, SLO ring gauges, live signals (throughput, TTFT, ASR), compliance lane indicators, recent runs, audit feed. |
| **Eval Runs** | [`app/eval-runs/page.tsx`](app/eval-runs/page.tsx) | Every cohort under evaluation, keyed by suite + agent digest + persona sha. |
| **Personas** | [`app/personas/page.tsx`](app/personas/page.tsx) | Simulation profiles — tone, speech rate, audio quality, code-switching. Each is content-addressed. |
| **Compliance** | [`app/compliance/page.tsx`](app/compliance/page.tsx) | Regulatory gates grouped by framework, with evidence counts and clause-level citations. |
| **Audit Trail** | [`app/audit-trail/page.tsx`](app/audit-trail/page.tsx) | Tamper-evident ledger of every state change, signed and dropped to a WORM S3 sink. |

## Stack

- **Next.js 14** App Router · React 18 · TypeScript 5 · strict mode.
- **Tailwind 3** with hand-rolled brand tokens (see [`tailwind.config.ts`](tailwind.config.ts)).
- **No icon font, no charting library, no shadcn**. Everything is inline SVG and Tailwind. The whole UI is dependency-light on purpose — fewer surfaces an auditor or a security scanner has to evaluate, and faster cold-start for the `standalone` Next output.
- **Standalone build** (`output: "standalone"`) so the runtime image is `node:20-alpine` + the `.next/standalone` server only.

## Local dev

```bash
cd workloads/t2s-platform/ui
npm install
npm run dev
# → http://localhost:3000
```

`npm run typecheck` runs `tsc --noEmit`. `npm run build` produces the standalone server consumed by the Docker image.

## Docker build

```bash
docker build -t ghcr.io/T2S/t2s-ui:0.2.0 .
docker run --rm -p 3000:3000 ghcr.io/T2S/t2s-ui:0.2.0
```

The Dockerfile is multi-stage; the final layer runs as a non-root user (uid 10001) with no writable filesystem requirements beyond the standard Next.js cache directories — it slots cleanly into the Pod-Security `restricted` profile every namespace in this repo enforces.

## Demo data

All pages read from [`lib/mock-data.ts`](lib/mock-data.ts). The shape is real (it's the contract the future `t2s-api` will expose) — only the values are fabricated. The pages render entirely server-side; the only client component is the topbar clock + environment switcher.

Replace `lib/mock-data.ts` with real API calls (`fetch` against the `t2s-api` service) when wiring to production data. The component layer doesn't change.

## Why this UI is structured the way it is

T2S evaluates the agents that decide things in regulated environments. Three properties matter more than they would for a typical app:

1. **Density without panic.** A platform owner triaging a 2 AM alert has to read this UI under stress. The information hierarchy and the color palette are calibrated for that case — coral red is reserved for hard failures only, amber means "regard this", teal means "in budget".
2. **Evidence is first-class.** Every metric is paired with the signed artifact behind it (run id, digest, signer, run-of-evidence count). The audit trail is not a separate concern bolted on — it's the trunk the rest of the UI hangs off.
3. **Calm under load.** No animations that aren't feedback. No gradients that aren't signal. No floating dock, no command palette demo, no live confetti. The brand voice is *flight instrument*, not *dashboard demo*.

The look-and-feel matches the Grafana dashboards in [`../../../observability/dashboards/`](../../../observability/dashboards/) — same palette, same iconography decisions — so an operator moving between the application surface and the platform telemetry doesn't context-switch between visual languages.
