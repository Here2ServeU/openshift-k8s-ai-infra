import { MetricCard } from "@/components/metric-card";
import { Sparkline } from "@/components/sparkline";
import { StatusBadge } from "@/components/status-badge";
import { RingGauge } from "@/components/ring-gauge";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { WelcomeCard } from "@/components/welcome-card";
import {
  evalRuns,
  evalThroughput,
  ttftMs,
  asrConfidence,
  slo,
  audit,
  type EvalRun,
  type AuditEntry,
} from "@/lib/mock-data";
import { fmtDuration, fmtPct, relativeTime, shortSha } from "@/lib/utils";

export default function MissionControl() {
  const runningCount = evalRuns.filter((r) => r.status === "running").length;
  const passing30d = 0.991;
  const regressionsThisWeek = evalRuns.reduce((s, r) => s + r.regressions, 0);

  const recentRuns = evalRuns.slice(0, 5);
  const recentAudit = audit.slice(0, 5);

  return (
    <>
      <WelcomeCard variant="platform" />

      <PageHeader
        eyebrow="Mission Control"
        title="AI agents under evaluation, in real time"
        description="Live view of every evaluation cohort in flight across regulated healthcare AI/robotics deployments. Every metric on this page is wired to a signed evidence trail."
        actions={
          <>
            <button className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary">
              Export evidence pack
            </button>
            <button className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent transition hover:bg-accent/[0.14]">
              + New eval run
            </button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active eval runs"
          value={String(runningCount + 1)}
          hint="Across IEC 62304 §5.3 and FDA SaMD IIb cohorts"
          trend="up"
          trendValue="+2 vs 24h"
          series={evalThroughput.slice(-40)}
          emphasis="accent"
        />
        <MetricCard
          label="Pass rate · 30d"
          value={fmtPct(passing30d)}
          hint="Clinical-grade suites only. SLO target ≥ 98.5%."
          trend="up"
          trendValue="+0.3pp"
          series={asrConfidence.map((v) => Math.min(1, v + 0.04)).slice(-40)}
          emphasis="default"
        />
        <MetricCard
          label="Regressions · 7d"
          value={String(regressionsThisWeek)}
          unit="across 6 agents"
          hint="One blocking — IEC 62366-1 §5.6 hearing-aid usability."
          trend="up"
          trendValue="+1"
          series={[1, 0, 2, 1, 3, 2, 4, 6, 7, 5, 8, 8]}
          emphasis="warning"
        />
        <MetricCard
          label="Voice ASR confidence"
          value={fmtPct(asrConfidence[asrConfidence.length - 1])}
          hint="Across all live personas. Below 0.92 triggers an audio-path triage."
          trend="flat"
          trendValue="0.4pp"
          series={asrConfidence.slice(-40)}
          emphasis="accent"
        />
      </div>

      {/* SLO ring + live signals */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <SectionTitle
            eyebrow="Service-level objectives"
            title="In budget"
            hint="Multi-burn-rate alerts against the 30d window."
          />
          <div className="mt-4 flex flex-col gap-5">
            {slo.map((s) => (
              <RingGauge
                key={s.name}
                value={s.unit === "s" ? Math.max(0, 1 - s.current / (s.target * 2)) : s.current}
                target={s.unit === "s" ? 0.5 : s.target}
                label={s.name}
                unit={s.window}
              />
            ))}
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <SectionTitle
            eyebrow="Live signals"
            title="Eval throughput · TTFT · ASR confidence"
            right={
              <div className="flex items-center gap-3 text-[0.6875rem] text-ink-muted">
                <Legend swatch="#5EEAD4">throughput</Legend>
                <Legend swatch="#60A5FA">ttft p95</Legend>
                <Legend swatch="#FBBF24">asr</Legend>
              </div>
            }
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="rounded-md border border-border-subtle bg-canvas/40 p-4">
              <div className="caption text-ink-muted">Eval runs/min</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[1.35rem] font-semibold text-ink-primary">
                  {evalThroughput[evalThroughput.length - 1]}
                </span>
                <span className="text-[0.75rem] text-ink-muted">runs/min</span>
              </div>
              <div className="mt-3 h-14">
                <Sparkline data={evalThroughput} accent="accent" />
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-canvas/40 p-4">
              <div className="caption text-ink-muted">TTFT · p95</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[1.35rem] font-semibold text-ink-primary">
                  {ttftMs[ttftMs.length - 1]}
                </span>
                <span className="text-[0.75rem] text-ink-muted">ms</span>
              </div>
              <div className="mt-3 h-14">
                <Sparkline data={ttftMs} accent="info" />
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-canvas/40 p-4">
              <div className="caption text-ink-muted">ASR confidence</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[1.35rem] font-semibold text-ink-primary">
                  {asrConfidence[asrConfidence.length - 1]}
                </span>
                <span className="text-[0.75rem] text-ink-muted">mean</span>
              </div>
              <div className="mt-3 h-14">
                <Sparkline data={asrConfidence} accent="warning" />
              </div>
            </div>
          </div>

          {/* Compliance lane indicators */}
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Lane label="FDA SaMD" tone="success" value="In budget" />
            <Lane label="IEC 62304" tone="success" value="In budget" />
            <Lane label="EU MDR" tone="warning" value="Watching" />
            <Lane label="IEC 62366-1" tone="danger" value="1 blocker" />
          </div>
        </div>
      </div>

      {/* Two-up bottom — recent runs + audit feed */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionTitle
            eyebrow="Latest eval runs"
            title="What's in flight right now"
            right={
              <a href="/eval-runs" className="text-[0.8125rem] text-accent hover:underline">
                View all →
              </a>
            }
          />
          <DataTable<EvalRun>
            rowKey={(r) => r.id}
            rows={recentRuns}
            highlight={(r) => r.status === "running" || r.status === "failed"}
            columns={runColumns()}
          />
        </div>

        <div className="lg:col-span-2">
          <SectionTitle
            eyebrow="Audit trail"
            title="Cryptographic events"
            right={
              <a href="/audit-trail" className="text-[0.8125rem] text-accent hover:underline">
                Open ledger →
              </a>
            }
          />
          <div className="card divide-y divide-border-subtle/70">
            {recentAudit.map((e) => (
              <AuditLine key={e.id} entry={e} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function runColumns(): Column<EvalRun>[] {
  return [
    {
      key: "suite",
      header: "Suite · agent",
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-ink-primary">{r.suite}</div>
          <div className="mt-1 mono text-[0.6875rem] text-ink-muted">
            {r.agent} · {shortSha(r.agentDigest.replace(/^sha256:/, ""), 12)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      render: (r) => <StatusBadge variant={r.status} />,
    },
    {
      key: "passRate",
      header: "Pass",
      align: "right",
      width: "90px",
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
        <span
          className={
            r.regressions > 0
              ? "mono text-signal-warning"
              : "mono text-ink-muted"
          }
        >
          {r.regressions}
        </span>
      ),
    },
    {
      key: "regulation",
      header: "Regulation",
      render: (r) => <span className="text-ink-secondary">{r.regulation}</span>,
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

function AuditLine({ entry }: { entry: AuditEntry }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[0.8125rem] text-ink-primary">
            <span className="text-ink-secondary">{entry.actor}</span>{" "}
            <span className="text-accent">{entry.action}</span>{" "}
            <span className="text-ink-primary">{entry.subject}</span>
          </span>
          <span className="shrink-0 text-[0.6875rem] text-ink-muted">
            {relativeTime(entry.ts)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 mono text-[0.6875rem] text-ink-muted">
          {entry.digest !== "—" && <span>{entry.digest}</span>}
          <span>· {entry.signer}</span>
        </div>
      </div>
    </div>
  );
}

function Lane({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "#4ADE80"
      : tone === "warning"
        ? "#FBBF24"
        : "#F87171";
  return (
    <div
      className="flex items-center justify-between rounded-md border bg-canvas/40 px-3 py-2"
      style={{ borderColor: `${color}33` }}
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[0.8125rem] text-ink-primary">{label}</span>
      </div>
      <span className="text-[0.6875rem]" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-3 rounded-sm" style={{ background: swatch }} />
      {children}
    </span>
  );
}
