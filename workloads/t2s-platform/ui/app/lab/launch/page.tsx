"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { myModels, mySuites } from "@/lib/lab-mock-data";
import { personas } from "@/lib/mock-data";
import { cn, fmtDuration } from "@/lib/utils";

const STEPS = ["Agent", "Suite", "Personas", "Compute", "Review"] as const;

export default function LaunchEval() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [modelId, setModelId] = useState(myModels[0].id);
  const [versionTag, setVersionTag] = useState(myModels[0].versions[0].tag);
  const [suiteId, setSuiteId] = useState(mySuites[0].id);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([
    personas[0].id,
    personas[1].id,
  ]);
  const [parallelism, setParallelism] = useState(8);
  const [sampleSize, setSampleSize] = useState(200);
  const [seed, setSeed] = useState(42);
  const [submitting, setSubmitting] = useState(false);

  const handleLaunch = () => {
    if (submitting) return;
    setSubmitting(true);
    // Demo behaviour: a real submission would POST to /api/runs and the API
    // would return the new run id. We jump straight to the existing detail
    // page so the flow feels alive.
    setTimeout(() => {
      router.push("/lab/runs/run_01HXG3CY7K4Q9N2D8M5R6P0Z");
    }, 600);
  };

  const model = myModels.find((m) => m.id === modelId)!;
  const version = model.versions.find((v) => v.tag === versionTag) ?? model.versions[0];
  const suite = mySuites.find((s) => s.id === suiteId)!;

  const estCost = useMemo(() => {
    // very rough: $0.014 per case × samples × persona count, scaled by parallelism savings
    const base = 0.014 * sampleSize * selectedPersonas.length;
    return base / Math.sqrt(parallelism);
  }, [sampleSize, selectedPersonas.length, parallelism]);

  const estDuration = useMemo(() => {
    const base = suite.estMinutes * 60 * selectedPersonas.length;
    return Math.round(base / parallelism);
  }, [suite, selectedPersonas.length, parallelism]);

  const canGoForward =
    (step === 0 && version) ||
    (step === 1 && suite) ||
    (step === 2 && selectedPersonas.length > 0) ||
    (step === 3 && parallelism > 0 && sampleSize > 0) ||
    step === 4;

  return (
    <>
      <PageHeader
        eyebrow="Launch eval"
        title="Submit a new evaluation run"
        description="Five steps. Each pick is content-addressed — the resulting run is uniquely keyed by (suite, agent digest, persona sha) so you can reproduce it months later."
      />

      {/* Stepper */}
      <ol className="mb-7 flex items-center gap-1">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                  active && "border-accent/50 bg-accent/[0.08]",
                  done && "border-border-subtle bg-canvas/40",
                  !active && !done && "border-border-subtle/60 bg-canvas/30 hover:border-border-subtle",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold",
                    active && "bg-accent text-canvas",
                    done && "bg-signal-success/20 text-signal-success",
                    !active && !done && "bg-elevated text-ink-muted",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[0.8125rem]",
                    active ? "text-ink-primary" : done ? "text-ink-secondary" : "text-ink-muted",
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {step === 0 && (
            <StepCard
              eyebrow="Step 1 of 5"
              title="Which agent are you evaluating?"
              hint="Pick a model you own and the specific version digest. The digest is what gets pinned in the run record — re-running with a re-tag will produce a different run id."
            >
              <div className="grid grid-cols-1 gap-2">
                {myModels.map((m) => (
                  <SelectableRow
                    key={m.id}
                    active={m.id === modelId}
                    onClick={() => {
                      setModelId(m.id);
                      setVersionTag(m.versions[0].tag);
                    }}
                    title={m.display}
                    subtitle={`${m.framework} · ${m.versions.length} versions registered`}
                    detail={m.description}
                  />
                ))}
              </div>

              <SectionTitle eyebrow="Version" title={`Pick a ${model.display} digest`} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {model.versions.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => setVersionTag(v.tag)}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors",
                      versionTag === v.tag
                        ? "border-accent/50 bg-accent/[0.08]"
                        : "border-border-subtle hover:border-border",
                    )}
                  >
                    <div>
                      <div className="text-[0.875rem] text-ink-primary">{v.tag}</div>
                      <div className="mt-0.5 mono text-[0.6875rem] text-ink-muted">
                        {v.digest}
                      </div>
                    </div>
                    <StatusPill status={v.status} />
                  </button>
                ))}
              </div>
            </StepCard>
          )}

          {step === 1 && (
            <StepCard
              eyebrow="Step 2 of 5"
              title="Which eval suite?"
              hint="Each suite encodes a regulatory question. The clause that gates production deploy is named in the run record so an auditor can read the chain."
            >
              <div className="grid grid-cols-1 gap-2">
                {mySuites.map((s) => (
                  <SelectableRow
                    key={s.id}
                    active={s.id === suiteId}
                    onClick={() => setSuiteId(s.id)}
                    title={s.display}
                    subtitle={`${s.regulation} · ${s.caseCount.toLocaleString()} test cases · ~${s.estMinutes}m base time`}
                    detail={s.description}
                  />
                ))}
              </div>
            </StepCard>
          )}

          {step === 2 && (
            <StepCard
              eyebrow="Step 3 of 5"
              title="Which personas?"
              hint="Multi-select. Each persona is one configurable caller (tone, speech rate, audio quality, code-switching). More personas = more coverage, more cost."
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {personas.map((p) => {
                  const checked = selectedPersonas.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setSelectedPersonas((cur) =>
                          cur.includes(p.id)
                            ? cur.filter((x) => x !== p.id)
                            : [...cur, p.id],
                        )
                      }
                      className={cn(
                        "flex items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors",
                        checked
                          ? "border-accent/50 bg-accent/[0.06]"
                          : "border-border-subtle hover:border-border",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                          checked
                            ? "border-accent bg-accent text-canvas"
                            : "border-border bg-surface",
                        )}
                      >
                        {checked && (
                          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none">
                            <path
                              d="M1.5 5 L4 7.5 L8.5 2.5"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[0.875rem] text-ink-primary">{p.display}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-muted">
                          <span>tone {p.tone}</span>
                          <span>audio {p.callQuality}</span>
                          <span>{p.speechWpm} wpm</span>
                          <span>int {(p.interruptionPct * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[0.75rem] text-ink-muted">
                {selectedPersonas.length} selected. Need a persona that isn't here?{" "}
                <Link href="/personas" className="text-accent hover:underline">
                  Open the library →
                </Link>
              </p>
            </StepCard>
          )}

          {step === 3 && (
            <StepCard
              eyebrow="Step 4 of 5"
              title="How much compute do you want to spend?"
              hint="Higher parallelism finishes sooner but costs the same — until you hit our per-researcher concurrency cap (currently 16 voice workers)."
            >
              <Slider
                label="Parallelism"
                hint="Concurrent voice workers. Cap: 16."
                min={1}
                max={16}
                value={parallelism}
                onChange={setParallelism}
                unit="workers"
              />
              <Slider
                label="Sample size"
                hint="Cases drawn from the suite. Full suites take hours; smoke runs use 200."
                min={50}
                max={Math.min(2000, suite.caseCount)}
                step={50}
                value={sampleSize}
                onChange={setSampleSize}
                unit="cases"
              />
              <Slider
                label="Random seed"
                hint="Pin for reproducibility. Change to draw a different cohort sample."
                min={1}
                max={999}
                value={seed}
                onChange={setSeed}
                unit=""
              />
            </StepCard>
          )}

          {step === 4 && (
            <StepCard
              eyebrow="Step 5 of 5"
              title="Review and launch"
              hint="What you're about to submit. The signed manifest below is what lands in the audit ledger if you launch."
            >
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ReviewRow label="Agent" value={`${model.display} · ${version.tag}`} mono={version.digest} />
                <ReviewRow label="Suite" value={suite.display} mono={suite.regulation} />
                <ReviewRow
                  label="Personas"
                  value={`${selectedPersonas.length} selected`}
                  mono={selectedPersonas.map((id) => personas.find((p) => p.id === id)?.sha).filter(Boolean).join(" · ")}
                />
                <ReviewRow
                  label="Compute"
                  value={`${parallelism} workers × ${sampleSize} cases · seed ${seed}`}
                  mono=""
                />
              </div>

              <div className="rounded-md border border-border-subtle bg-canvas/40 p-4">
                <div className="caption text-ink-muted">Signed manifest preview</div>
                <pre className="mt-2 overflow-x-auto mono text-[0.75rem] leading-[1.05rem] text-ink-secondary">{`apiVersion: t2s/v1
kind: EvalRun
spec:
  agent:
    image: ghcr.io/T2S/${model.id}:${version.tag}
    digest: ${version.digest}
  suite:
    id: ${suite.id}
    regulation: "${suite.regulation}"
    sample_size: ${sampleSize}
    seed: ${seed}
  personas:
${selectedPersonas.map((id) => `    - ${id}`).join("\n")}
  compute:
    parallelism: ${parallelism}
  signer: cosign/keyless · gh-oidc`}</pre>
              </div>
            </StepCard>
          )}

          {/* Prominent footer action area — visible right under the current step
              so Back / Next / Launch don't get lost in the right sidebar. */}
          <div className="card mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-[0.75rem] leading-[1rem] text-ink-muted">
              {step < STEPS.length - 1 ? (
                <>
                  Step {step + 1} of {STEPS.length}. Selections are reversible until you launch.
                </>
              ) : (
                <>
                  Submitting writes a signed manifest to the audit ledger and enqueues the run.
                  You'll be redirected to its detail page.
                </>
              )}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0 || submitting}
                className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary disabled:opacity-40"
              >
                ← Back
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  disabled={!canGoForward}
                  className="rounded-md border border-accent/40 bg-accent/[0.08] px-4 py-1.5 text-[0.8125rem] font-medium text-accent transition hover:bg-accent/[0.14] disabled:opacity-40"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={submitting}
                  className="rounded-md border border-accent/40 bg-accent/[0.14] px-4 py-1.5 text-[0.8125rem] font-semibold text-accent transition hover:bg-accent/[0.24] disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "▸ Launch run"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Always-visible summary panel */}
        <aside className="lg:col-span-1">
          <div className="card sticky top-[88px] p-5">
            <SectionTitle eyebrow="Estimate" title="Cost and time" />
            <dl className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <dt className="caption text-ink-muted">Estimated cost</dt>
                <dd className="mt-1 text-[1.25rem] font-semibold text-ink-primary">
                  ${estCost.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="caption text-ink-muted">Wall-clock</dt>
                <dd className="mt-1 text-[1.25rem] font-semibold text-ink-primary">
                  {fmtDuration(estDuration)}
                </dd>
              </div>
            </dl>

            <div className="hairline mt-4 pt-4">
              <dl className="space-y-2 text-[0.8125rem]">
                <SummaryLine label="Agent" value={`${model.display} · ${version.tag}`} />
                <SummaryLine label="Suite" value={suite.display} />
                <SummaryLine label="Personas" value={`${selectedPersonas.length}`} />
                <SummaryLine label="Samples" value={`${sampleSize}`} />
                <SummaryLine label="Parallelism" value={`${parallelism}`} />
                <SummaryLine label="Seed" value={String(seed)} />
              </dl>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0 || submitting}
                className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary disabled:opacity-40"
              >
                Back
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  disabled={!canGoForward}
                  className="flex-1 rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent transition hover:bg-accent/[0.14] disabled:opacity-40"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={submitting}
                  className="flex-1 rounded-md border border-accent/40 bg-accent/[0.14] px-3 py-1.5 text-[0.8125rem] font-semibold text-accent transition hover:bg-accent/[0.24] disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "▸ Launch run"}
                </button>
              )}
            </div>

            <p className="mt-3 text-[0.6875rem] leading-[0.95rem] text-ink-muted">
              Submitting writes a signed manifest to the audit ledger and enqueues the run. You'll be redirected to its detail page.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

// ---------- helpers ----------

function StepCard({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <div className="caption text-ink-muted">{eyebrow}</div>
      <h2 className="mt-1 text-[1.125rem] font-semibold text-ink-primary">{title}</h2>
      {hint && <p className="mt-1.5 max-w-prose text-[0.8125rem] text-ink-secondary">{hint}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function SelectableRow({
  active,
  onClick,
  title,
  subtitle,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-md border px-4 py-3 text-left transition-colors",
        active
          ? "border-accent/50 bg-accent/[0.06]"
          : "border-border-subtle hover:border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[0.9375rem] text-ink-primary">{title}</span>
        {active && (
          <span className="rounded-sm border border-accent/30 bg-accent/[0.08] px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.06em] text-accent">
            Selected
          </span>
        )}
      </div>
      <span className="mt-1 text-[0.75rem] text-ink-secondary">{subtitle}</span>
      <span className="mt-2 text-[0.75rem] leading-[1rem] text-ink-muted">{detail}</span>
    </button>
  );
}

function StatusPill({ status }: { status: "prod" | "canary" | "candidate" | "retired" }) {
  const map = {
    prod: { label: "prod", color: "#4ADE80" },
    canary: { label: "canary", color: "#60A5FA" },
    candidate: { label: "candidate", color: "#5EEAD4" },
    retired: { label: "retired", color: "#5F6E94" },
  } as const;
  const m = map[status];
  return (
    <span
      className="rounded-sm border px-1.5 py-0.5 text-[0.6875rem]"
      style={{ color: m.color, borderColor: `${m.color}44`, background: `${m.color}10` }}
    >
      {m.label}
    </span>
  );
}

function Slider({
  label,
  hint,
  min,
  max,
  step = 1,
  value,
  onChange,
  unit,
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (n: number) => void;
  unit: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[0.875rem] text-ink-primary">{label}</div>
          <p className="mt-0.5 text-[0.75rem] text-ink-muted">{hint}</p>
        </div>
        <div className="mono text-[0.95rem] text-ink-primary">
          {value} <span className="text-[0.75rem] text-ink-muted">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-accent"
        aria-label={label}
      />
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-canvas/40 px-3 py-2.5">
      <div className="caption text-ink-muted">{label}</div>
      <div className="mt-1 text-[0.875rem] text-ink-primary">{value}</div>
      {mono && (
        <div className="mt-1 truncate mono text-[0.6875rem] text-ink-muted">{mono}</div>
      )}
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="truncate text-right text-ink-primary">{value}</dd>
    </div>
  );
}
