# T2S — Brand Identity

> **Trust to Scale.** Evaluation and assurance for AI agents and ML/robotic systems being deployed into highly regulated environments.

T2S is the operator-facing platform for taking AI/ML and robotics work — surgical robotics, clinical decision support, autonomous diagnostics, voice agents in care pathways, vision systems in pharma manufacturing — from research bench to regulated production. The brand sits at the intersection of *AI confidence* and *regulatory rigor*. It should feel like an instrument, not a marketing site.

---

## Voice

| Do | Don't |
|---|---|
| Precise, calibrated, measured | Hype, urgency, exclamation marks |
| "ROC-AUC 0.94 on the EU-MDR holdout cohort" | "Cutting-edge AI, redefined" |
| Names regulations by clause (IEC 62304 §5.3) | Names regulations as buzzwords |
| Cites evidence — digest, run id, manifest sha | Cites adjectives |
| Calm under load | Loud at any volume |

The platform's job is to be the boring, trustworthy nervous system around exciting research. The UI should read like flight instruments: dense, legible, accurate, never decorative.

---

## Color tokens (dark, default)

| Token | Hex | Role |
|---|---|---|
| `--bg-canvas` | `#0A0F1F` | Base — deep navy, near-black. Lit room, not dark room. |
| `--bg-surface` | `#131A2E` | Cards, panels |
| `--bg-elevated` | `#1B2440` | Hovered / focused surfaces |
| `--bg-overlay` | `#212C4F` | Modals, popovers |
| `--border-subtle` | `#232E47` | Hairlines |
| `--border-default` | `#2B375A` | Card borders |
| `--border-strong` | `#3A4A78` | Selected states |
| `--text-primary` | `#E8ECF7` | Body copy |
| `--text-secondary` | `#94A3C2` | Secondary copy |
| `--text-muted` | `#5F6E94` | Captions, axis labels |
| `--accent` | `#5EEAD4` | Brand teal — electric, instrument cool |
| `--accent-strong` | `#2DD4BF` | Pressed / focus |
| `--accent-soft` | `rgba(94,234,212,0.12)` | Accent backgrounds |
| `--signal-success` | `#4ADE80` | Pass, green-lit |
| `--signal-warning` | `#FBBF24` | Watch — amber, aviation-style caution |
| `--signal-danger` | `#F87171` | Fail — coral, never pure red |
| `--signal-info` | `#60A5FA` | Information, neutral status |

### Why teal over the obvious blue

Most observability tooling is blue. T2S evaluates the systems those tools observe — a different role needs a different signature. Teal reads instrument-cool (think anodized aluminum, EKG trace, oscilloscope phosphor) without going into "AI startup purple". Amber accent is borrowed from aviation HUDs, where it means "regard this, do not panic". Coral red is reserved exclusively for hard failures (assertion violated, compliance gate failed) — never used for "loading" or "info".

---

## Typography

- **Sans** — `Inter`, variable, with system fallbacks. Tight tracking (-0.01em) on display sizes, normal on body.
- **Mono** — `JetBrains Mono`, variable. Used for identifiers (run id, digest, manifest sha), measurements, and tabular numbers.
- **Tabular numerals** enabled globally (`font-variant-numeric: tabular-nums`) — every column of numbers aligns, no exceptions.

Type scale (rem):

| Use | Size | Weight | Tracking |
|---|---|---|---|
| Display | 2.5 | 600 | -0.02em |
| H1 | 1.75 | 600 | -0.01em |
| H2 | 1.25 | 600 | -0.005em |
| H3 | 1.0625 | 600 | 0 |
| Body | 0.875 | 400 | 0 |
| Caption | 0.75 | 500 | 0.04em uppercase |
| Mono | 0.8125 | 450 | 0 |

---

## Layout

- **Grid**: 4px base unit. Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- **Density**: data-dense by default. Cards have 16px padding; tables have 12px row height. Whitespace is earned by hierarchy, not given by default.
- **Hairlines**: 1px borders on every card. Never `box-shadow` as the primary separator — shadows are decorative; the brand is calibrated.
- **Motion**: 120-180ms ease-out for state changes. No bouncy easings. No "fancy" page transitions. Motion is feedback, not flourish.

---

## Iconography

- **System icons**: outline, 1.5px stroke, 20×20 nominal. Inline SVG, no icon-font dependencies.
- **Status glyphs**: solid, 12×12, paired with text. Never icon-only for status — a screen-reader user has to know the state too.

---

## Domain framing

Demo data and persona names assume the user is operating in **regulated healthcare AI/robotics**. The vocabulary is calibrated to that world:

- **Eval runs** are named after the regulatory question they answer (`pre-510k-saMD-class-iib`, `iec-62304-software-safety-class-c`, `eu-mdr-clinical-evaluation`).
- **Personas** include real-feeling pathway actors (post-op patient call-back, pharmacovigilance intake, pre-anesthesia screening) with quality profiles that match clinical telephony reality (mobile networks, hearing aids, code-switching).
- **Compliance status** cites the specific clause that's gated (e.g. *IEC 62304 §5.7.4: software unit verification*).
- **Audit trail** records cryptographic evidence (model digest, persona sha, eval run id, signed manifest) — the auditor's view, not the developer's.

---

## In one sentence

T2S looks like the instrument panel a chief medical officer or a notified body would trust to sign off on a deployment — calm, dense, and never trying.
