import { PageHeader, SectionTitle } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { compliance, type ComplianceGate } from "@/lib/mock-data";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Compliance" };

export default function CompliancePage() {
  const grouped = groupBy(compliance, "framework");

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Regulatory gates, mapped to the controls in this repo"
        description="Each gate cites the clause that triggered it, the owner who closes it, and the count of signed evidence artifacts behind it. No checkbox is green without a corresponding cryptographic record."
        actions={
          <>
            <button className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary">
              Export 510(k) evidence bundle
            </button>
            <button className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent transition hover:bg-accent/[0.14]">
              Open audit view
            </button>
          </>
        }
      />

      <div className="mb-7 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Headline label="Frameworks tracked" value={String(Object.keys(grouped).length)} />
        <Headline label="Gates green" value={String(compliance.filter((c) => c.status === "green").length)} tone="success" />
        <Headline label="Gates amber" value={String(compliance.filter((c) => c.status === "amber").length)} tone="warning" />
        <Headline label="Gates red" value={String(compliance.filter((c) => c.status === "red").length)} tone="danger" />
      </div>

      <SectionTitle
        eyebrow="By framework"
        title="What blocks production today"
        hint="Status reflects the most recent evaluation cohort plus signed sign-off by the named owner."
      />

      <div className="space-y-5">
        {Object.entries(grouped).map(([framework, gates]) => (
          <FrameworkBlock key={framework} framework={framework} gates={gates} />
        ))}
      </div>

      <SectionTitle
        eyebrow="Chain of evidence"
        title="What an auditor sees"
        hint="The same three artifacts referenced in docs/security/owasp-posture.md, surfaced inline."
      />
      <div className="card mt-3 p-5">
        <ol className="grid gap-4 md:grid-cols-3">
          <Step
            n="01"
            title="Image digest"
            body="Cosign-keyless signature, SBOM attestation. The answer to 'what is running' is a sha256, not a Git ref."
            mono="sha256:9f2c3b18a7e6…"
          />
          <Step
            n="02"
            title="Manifest"
            body="GitOps PR trail on the values file referencing the digest. Reviewer, timestamp, two-person rule."
            mono="PR #1842 · 2 reviewers"
          />
          <Step
            n="03"
            title="Model lineage"
            body="MLflow run id linking the artifact's training to the dataset hash and the eval cohort sign-off."
            mono="mlflow_run_id: 4a92…"
          />
        </ol>
      </div>
    </>
  );
}

function FrameworkBlock({
  framework,
  gates,
}: {
  framework: string;
  gates: ComplianceGate[];
}) {
  const reds = gates.filter((g) => g.status === "red").length;
  const ambers = gates.filter((g) => g.status === "amber").length;
  const tone: "success" | "warning" | "danger" =
    reds > 0 ? "danger" : ambers > 0 ? "warning" : "success";

  const color =
    tone === "danger" ? "#F87171" : tone === "warning" ? "#FBBF24" : "#4ADE80";

  return (
    <div className="card overflow-hidden">
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: `1px solid ${color}22`, background: `${color}06` }}
      >
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <h3 className="text-[1rem] font-semibold text-ink-primary">{framework}</h3>
          <span className="text-[0.75rem] text-ink-muted">
            {gates.length} gates · {gates.reduce((s, g) => s + g.evidenceCount, 0)} evidence artifacts
          </span>
        </div>
        <span
          className="rounded-sm px-2 py-0.5 text-[0.6875rem]"
          style={{ color, background: `${color}14`, border: `1px solid ${color}33` }}
        >
          {tone === "success" ? "All gates green" : tone === "warning" ? "Watching" : "Blocking"}
        </span>
      </header>

      <ul className="divide-y divide-border-subtle/60">
        {gates.map((g) => (
          <li key={`${g.framework}-${g.clause}`} className="grid grid-cols-12 gap-4 px-5 py-3.5">
            <div className="col-span-12 md:col-span-3 mono text-[0.8125rem] text-ink-secondary">
              {g.clause}
            </div>
            <div className="col-span-12 md:col-span-5 text-[0.875rem] text-ink-primary">
              {g.title}
            </div>
            <div className="col-span-6 md:col-span-2 text-[0.8125rem] text-ink-secondary">
              {g.owner}
            </div>
            <div className="col-span-3 md:col-span-1 text-[0.8125rem] mono text-ink-muted">
              {g.evidenceCount} ev.
            </div>
            <div className="col-span-3 md:col-span-1 flex md:justify-end">
              <StatusBadge variant={g.status} />
            </div>
            <div className="col-span-12 mt-0.5 text-[0.6875rem] text-ink-muted">
              last reviewed {relativeTime(g.lastReviewed)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Headline({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "#4ADE80"
      : tone === "warning"
        ? "#FBBF24"
        : tone === "danger"
          ? "#F87171"
          : "#94A3C2";
  return (
    <div className="card flex items-end justify-between px-4 py-3">
      <div>
        <div className="caption flex items-center gap-2 text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {label}
        </div>
        <div className="mt-1.5 text-[1.65rem] font-semibold leading-none text-ink-primary">
          {value}
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  mono,
}: {
  n: string;
  title: string;
  body: string;
  mono: string;
}) {
  return (
    <li className="rounded-md border border-border-subtle bg-canvas/40 p-4">
      <div className="flex items-center gap-2">
        <span className="mono text-[0.75rem] text-accent">{n}</span>
        <span className="text-[0.95rem] font-medium text-ink-primary">{title}</span>
      </div>
      <p className="mt-2 text-[0.8125rem] leading-[1.2rem] text-ink-secondary">{body}</p>
      <div className="mt-3 mono text-[0.6875rem] text-ink-muted">{mono}</div>
    </li>
  );
}

function groupBy<T, K extends keyof T>(arr: T[], key: K): Record<string, T[]> {
  return arr.reduce(
    (acc, x) => {
      const k = String(x[key]);
      (acc[k] ||= []).push(x);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}
