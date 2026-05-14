import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { evalRuns, type EvalRun } from "@/lib/mock-data";
import { fmtDuration, fmtPct, relativeTime, shortSha } from "@/lib/utils";

export const metadata = { title: "Eval Runs" };

export default function EvalRunsPage() {
  const summary = summarize(evalRuns);

  return (
    <>
      <PageHeader
        eyebrow="Eval Runs"
        title="Every cohort, every regulation, one ledger"
        description="Each run is keyed by (suite, agent digest, persona sha). Promotion to production is gated by SLO-bound analysis templates — no manual override path exists."
        actions={
          <>
            <button className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary">
              Filter
            </button>
            <button className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent transition hover:bg-accent/[0.14]">
              + New eval run
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryStat label="Total · 30d" value={String(summary.total)} />
        <SummaryStat label="Passed" value={String(summary.passed)} tone="success" />
        <SummaryStat label="Failed" value={String(summary.failed)} tone="danger" />
        <SummaryStat label="Blocked" value={String(summary.blocked)} tone="warning" />
        <SummaryStat label="Running" value={String(summary.running)} tone="info" pulse />
      </div>

      <DataTable<EvalRun>
        rowKey={(r) => r.id}
        rows={evalRuns}
        columns={columns()}
        highlight={(r) => r.status === "running"}
      />

      <p className="mt-4 text-[0.75rem] text-ink-muted">
        Run ids are ULIDs; agent digests are sha256 of the OCI manifest. Click a run to open
        its analysis template, signed artifacts, and per-turn transcript bundle.
      </p>
    </>
  );
}

function summarize(rows: EvalRun[]) {
  return {
    total: rows.length,
    passed: rows.filter((r) => r.status === "passed").length,
    failed: rows.filter((r) => r.status === "failed").length,
    blocked: rows.filter((r) => r.status === "blocked").length,
    running: rows.filter((r) => r.status === "running").length,
  };
}

function columns(): Column<EvalRun>[] {
  return [
    {
      key: "id",
      header: "Run",
      render: (r) => (
        <div className="min-w-0">
          <div className="mono text-ink-primary">{r.id.slice(0, 24)}…</div>
          <div className="mt-1 text-[0.6875rem] text-ink-muted">
            {r.regulation}
          </div>
        </div>
      ),
    },
    {
      key: "suite",
      header: "Suite",
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-ink-primary">{r.suite}</div>
          <div className="mt-1 text-[0.6875rem] text-ink-muted">
            persona: {r.persona}
          </div>
        </div>
      ),
    },
    {
      key: "agent",
      header: "Agent · digest",
      render: (r) => (
        <div className="min-w-0">
          <div className="text-ink-primary">{r.agent}</div>
          <div className="mt-1 mono text-[0.6875rem] text-ink-muted">
            {shortSha(r.agentDigest.replace(/^sha256:/, ""), 14)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      render: (r) => <StatusBadge variant={r.status} />,
    },
    {
      key: "passRate",
      header: "Pass",
      align: "right",
      width: "80px",
      render: (r) =>
        r.status === "queued" || r.status === "blocked" ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <span className="mono text-ink-primary">{fmtPct(r.passRate)}</span>
        ),
    },
    {
      key: "regressions",
      header: "Reg.",
      align: "right",
      width: "60px",
      render: (r) => (
        <span className={r.regressions > 0 ? "mono text-signal-warning" : "mono text-ink-muted"}>
          {r.regressions}
        </span>
      ),
    },
    {
      key: "reviewer",
      header: "Reviewer",
      render: (r) =>
        r.reviewer ? (
          <span className="text-ink-secondary">{r.reviewer}</span>
        ) : (
          <span className="text-ink-muted">— awaiting</span>
        ),
    },
    {
      key: "startedAt",
      header: "Started",
      align: "right",
      width: "110px",
      render: (r) => (
        <span className="text-ink-muted">{relativeTime(r.startedAt)}</span>
      ),
    },
    {
      key: "durationS",
      header: "Duration",
      align: "right",
      width: "100px",
      render: (r) => (
        <span className="mono text-ink-secondary">
          {r.durationS === 0 ? "—" : fmtDuration(r.durationS)}
        </span>
      ),
    },
  ];
}

function SummaryStat({
  label,
  value,
  tone = "default",
  pulse,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger" | "warning" | "info";
  pulse?: boolean;
}) {
  const color =
    tone === "success"
      ? "#4ADE80"
      : tone === "danger"
        ? "#F87171"
        : tone === "warning"
          ? "#FBBF24"
          : tone === "info"
            ? "#60A5FA"
            : "#94A3C2";
  return (
    <div className="card px-4 py-3">
      <div className="caption flex items-center gap-2 text-ink-muted">
        <span
          className={`h-1.5 w-1.5 rounded-full ${pulse ? "animate-pulseRing" : ""}`}
          style={{ background: color }}
        />
        {label}
      </div>
      <div className="mt-1.5 text-[1.4rem] font-semibold text-ink-primary">
        {value}
      </div>
    </div>
  );
}
