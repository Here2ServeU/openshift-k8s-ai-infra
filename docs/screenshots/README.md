# T2S — UI screenshots

Captured against the live dev build (`npm run dev`, port 3010) on a dark macOS desktop. Drop the eleven screenshots into this directory under the filenames below — the markdown in the repo root README, [`workloads/t2s-platform/ui/README.md`](../../workloads/t2s-platform/ui/README.md), and [`docs/demo-deploy.md`](../demo-deploy.md) already references them.

## Platform-owner view (Mission Control, etc.)

| File | Page | Source |
| --- | --- | --- |
| `01-mission-control.png` | Mission Control (root `/`) | [`app/page.tsx`](../../workloads/t2s-platform/ui/app/page.tsx) |
| `02-eval-runs.png` | Eval Runs (`/eval-runs`) | [`app/eval-runs/page.tsx`](../../workloads/t2s-platform/ui/app/eval-runs/page.tsx) |
| `03-personas.png` | Personas (`/personas`) | [`app/personas/page.tsx`](../../workloads/t2s-platform/ui/app/personas/page.tsx) |
| `04-compliance.png` | Compliance (`/compliance`) | [`app/compliance/page.tsx`](../../workloads/t2s-platform/ui/app/compliance/page.tsx) |
| `05-audit-trail.png` | Audit Trail (`/audit-trail`) | [`app/audit-trail/page.tsx`](../../workloads/t2s-platform/ui/app/audit-trail/page.tsx) |

## Researcher view (Lab — Workbench, Launch eval, Run detail)

| File | Page | Source |
| --- | --- | --- |
| `06-lab-workbench.png` | Workbench landing with welcome tour (`/lab`) | [`app/lab/page.tsx`](../../workloads/t2s-platform/ui/app/lab/page.tsx) |
| `07-lab-launch-1-agent.png` | Launch eval · Step 1 of 5 — pick agent + version (`/lab/launch`) | [`app/lab/launch/page.tsx`](../../workloads/t2s-platform/ui/app/lab/launch/page.tsx) |
| `08-lab-launch-2-suite.png` | Launch eval · Step 2 of 5 — pick regulatory suite | (same) |
| `09-lab-launch-3-personas.png` | Launch eval · Step 3 of 5 — multi-select personas | (same) |
| `10-lab-launch-4-compute.png` | Launch eval · Step 4 of 5 — parallelism, sample size, seed | (same) |
| `11-lab-launch-5-review.png` | Launch eval · Step 5 of 5 — review + signed manifest preview | (same) |

## Capturing fresh shots

To re-capture (e.g. after a design change):

```bash
cd workloads/t2s-platform/ui
npm run dev -- -p 3010          # see Makefile `ui-dev` target

# platform-owner views
for route in "" eval-runs personas compliance audit-trail; do
  open "http://localhost:3010/$route"
done

# researcher views — open the Lab via the Platform/Lab toggle in the topbar
open "http://localhost:3010/lab"
open "http://localhost:3010/lab/launch"        # capture all 5 wizard steps in order
```

Mac screenshots default to ~2× retina PNGs, which is what's checked in. Don't down-scale before commit — GitHub will fit them to width in the README.

## File-size discipline

If you compress them, run `pngcrush` or `oxipng` and keep each shot under ~600 KB. The eleven together should land around 4–5 MB on disk.
