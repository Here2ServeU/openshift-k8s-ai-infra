import Link from "next/link";
import { Logo } from "./logo";

type Step = {
  n: string;
  label: string;
  href: string;
  body: string;
  cta?: string;
};

const PLATFORM_TOUR: Step[] = [
  {
    n: "01",
    label: "Mission Control",
    href: "/",
    body: "Live view of every evaluation cohort in flight. SLO ring gauges, throughput sparklines, compliance lane indicators, and the audit-trail feed. The first place to look at the start of every on-call shift.",
    cta: "You're here ↘",
  },
  {
    n: "02",
    label: "Eval Runs",
    href: "/eval-runs",
    body: "Every cohort under evaluation across the platform, keyed by (suite · agent digest · persona sha). Each row cites the regulation that gates production deploy. Click a run for analysis template, signed artifacts, and per-turn bundle.",
    cta: "Open the ledger →",
  },
  {
    n: "03",
    label: "Personas",
    href: "/personas",
    body: "The simulation profiles that drive agents under test — tone, speech rate, audio quality, code-switching. Each persona is content-addressed; runs cite (persona_sha · agent_digest · suite_version) as a primary key.",
    cta: "Browse the library →",
  },
  {
    n: "04",
    label: "Compliance",
    href: "/compliance",
    body: "Regulatory gates grouped by framework — FDA SaMD, IEC 62304, ISO 13485, EU MDR, HIPAA, IEC 62366-1 — with the clause that triggered each gate and the signed evidence count behind it.",
    cta: "Open the gates →",
  },
  {
    n: "05",
    label: "Audit Trail",
    href: "/audit-trail",
    body: "Tamper-evident record of every state change — releases, model promotions, persona additions, policy events, access grants — with cryptographic digests and signers. WORM-sunk to S3 with 7-year retention.",
    cta: "Open the ledger →",
  },
  {
    n: "06",
    label: "→ Switch to Lab",
    href: "/lab",
    body: "Flip to the researcher view — Workbench, Launch eval wizard, and your run history with per-turn transcripts and rubric scores. Use the Platform / Lab toggle in the topbar to switch back.",
    cta: "Open the Lab →",
  },
];

const LAB_TOUR: Step[] = [
  {
    n: "01",
    label: "Workbench",
    href: "/lab",
    body: "Your home. KPIs for the month, your models with current production / canary versions, in-flight runs, and a 7-day throughput trend.",
    cta: "You're here ↘",
  },
  {
    n: "02",
    label: "Launch eval",
    href: "/lab/launch",
    body: "Submit a new evaluation in 5 steps — pick an agent + version, choose a regulatory suite, multi-select personas, configure compute, review the signed manifest, and launch.",
    cta: "Start a run →",
  },
  {
    n: "03",
    label: "My runs",
    href: "/lab/runs",
    body: "Every eval you've launched, filtered to your models. Click any row for the run-detail view.",
    cta: "Open my runs →",
  },
  {
    n: "04",
    label: "Run detail",
    href: "/lab/runs/run_01HXG3CY7K4Q9N2D8M5R6P0Z",
    body: "The page you'll spend the most time on. Per-rubric scores with deltas vs. previous version, turn-by-turn conversation transcript with ASR confidence, and the chain of evidence (image digest · MLflow lineage · signed manifest).",
    cta: "Open the live triage run →",
  },
];

export function WelcomeCard({
  variant = "platform",
}: {
  variant?: "platform" | "lab";
}) {
  const isLab = variant === "lab";
  const tour = isLab ? LAB_TOUR : PLATFORM_TOUR;

  return (
    <section className="card relative mb-8 overflow-hidden p-6">
      {/* subtle accent gradient */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(94,234,212,0.6), transparent)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-12 translate-x-12 rounded-full opacity-30 blur-2xl"
        style={{ background: "radial-gradient(circle, #5EEAD4 0%, transparent 70%)" }}
      />

      <div className="relative flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="caption mb-2 text-accent">
            {isLab ? "Lab · Workbench tour" : "Welcome to T2S"}
          </div>
          <h2 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.01em] text-ink-primary">
            {isLab
              ? "From submission to signed evidence in four steps."
              : "Hello, Dr. Emmanuel Naweji."}
          </h2>
          <p className="mt-2 max-w-3xl text-[0.9375rem] leading-[1.45rem] text-ink-secondary">
            {isLab ? (
              <>
                The Lab is the researcher surface. You launch evaluations against the AI agents
                you train, watch them run, drill into per-turn transcripts, and compare versions
                to spot regressions before they reach production.
              </>
            ) : (
              <>
                T2S — <span className="text-accent">Trust to Scale</span> — is the assurance
                platform for AI/ML and robotic systems being deployed into highly regulated
                environments (FDA SaMD · IEC 62304 · ISO 13485 · EU MDR · HIPAA). This dashboard
                is the platform-owner view. Below is a six-step tour of where to find everything.
              </>
            )}
          </p>
        </div>
        <div className="hidden md:block shrink-0">
          <Logo size={44} withWordmark={false} />
        </div>
      </div>

      <ol className="relative mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tour.map((step) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="group flex h-full flex-col rounded-md border border-border-subtle bg-canvas/40 p-4 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="mono text-[0.75rem] text-accent">{step.n}</span>
                <span className="text-[0.6875rem] text-ink-muted opacity-0 transition group-hover:opacity-100">
                  {step.cta}
                </span>
              </div>
              <div className="mt-1.5 text-[0.95rem] font-medium text-ink-primary">
                {step.label}
              </div>
              <p className="mt-2 text-[0.8125rem] leading-[1.15rem] text-ink-secondary">
                {step.body}
              </p>
            </Link>
          </li>
        ))}
      </ol>

      <div className="hairline mt-6 pt-4 flex flex-wrap items-center justify-between gap-3 text-[0.75rem] text-ink-muted">
        <span>
          Built by{" "}
          <span className="text-ink-secondary">Dr. Emmanuel Naweji</span> ·
          PhD · AI/ML/Robotics in regulated environments
        </span>
        <span className="flex items-center gap-3">
          {!isLab && (
            <Link href="/lab" className="text-accent hover:underline">
              Researcher view →
            </Link>
          )}
          {isLab && (
            <Link href="/" className="text-accent hover:underline">
              ← Back to platform view
            </Link>
          )}
        </span>
      </div>
    </section>
  );
}
