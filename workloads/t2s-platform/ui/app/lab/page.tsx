import Link from "next/link";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Sparkline } from "@/components/sparkline";
import { DataTable, type Column } from "@/components/data-table";
import { WelcomeCard } from "@/components/welcome-card";
import { me, myModels, myRuns, labKpis, labThroughput7d } from "@/lib/lab-mock-data";
import type { EvalRun } from "@/lib/mock-data";
import { fmtDuration, fmtPct, relativeTime, shortSha } from "@/lib/utils";

export const metadata = { title: "Workbench" };

export default function Workbench() {
  const active = myRuns.filter((r) => r.status === "running" || r.status === "queued");
  const completed = myRuns.filter((r) => r.status !== "running" && r.status !== "queued");

  return (
    <>
      <WelcomeCard variant="lab" />

      <PageHeader
        eyebrow={`Lab · ${me.lab}`}
        title={`Welcome back, Dr. ${me.name.split(" ").slice(-1)[0]}.`}
        description={`${active.length} eval ${active.length === 1 ? "run is" : "runs are"} in flight on your models. The last 7 days landed ${labKpis.passingThisWeek} passes and ${labKpis.failingThisWeek} failure — drill in below to see what regressed.`}
        actions={
          <>
            <Link
              href="/lab/runs"
              className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary"
            >
              My runs
            </Link>
            <Link
              href="/lab/launch"
              className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent transition hover:bg-accent/[0.14]"
            >
              + Launch eval
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active runs"
          value={String(labKpis.activeRuns)}
          hint="Across triage and consent-flow models."
          emphasis="accent"
        />
        <MetricCard
          label="Pass rate · this month"
          value={fmtPct(labKpis.totalPassThisMonth)}
          hint="Weighted across all clinical-grade suites you ran."
          trend="up"
          trendValue="+1.4pp"
          series={[0.91, 0.92, 0.93, 0.92, 0.93, 0.94, 0.94, 0.93, 0.94, 0.94]}
        />
        <MetricCard
          label="Runs · 7d"
          value={String(labThroughput7d.reduce((a, b) => a + b, 0))}
          hint="Last 7 days. Median time-to-finish ~38m."
          series={labThroughput7d}
          emphasis="accent"
        />
        <MetricCard
          label="Compute spend · MTD"
          value={`$${labKpis.costThisMonth.toFixed(0)}`}
          hint="Includes voice-worker minutes and LLM tokens. Cap: $1,200/mo."
          emphasis="warning"
        />
      </div>

      {/* Quick launch + your models */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <SectionTitle
            eyebrow="Quick actions"
            title="What do you want to do next?"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ActionTile
              href="/lab/launch"
              title="Launch eval"
              hint="Pick agent + suite + personas. 4 clicks, then go."
              kbd="L"
            />
            <ActionTile
              href={`/lab/runs/${myRuns[0].id}`}
              title="Open running"
              hint={`${myRuns[0].agent} · ${myRuns[0].suite.slice(0, 28)}…`}
              kbd="R"
            />
            <ActionTile
              href="/lab/runs"
              title="Compare versions"
              hint="A/B between two of your runs to spot regressions."
              kbd="C"
            />
          </div>
        </div>

        <div className="card p-5">
          <SectionTitle
            eyebrow="Your models"
            title={`${myModels.length} registered`}
            right={
              <Link href="/lab/runs" className="text-[0.75rem] text-accent hover:underline">
                history →
              </Link>
            }
          />
          <ul className="flex flex-col gap-2">
            {myModels.map((m) => {
              const prodTag = m.versions.find((v) => v.status === "prod")?.tag;
              const canaryTag = m.versions.find((v) => v.status === "canary")?.tag;
              return (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-canvas/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-[0.875rem] text-ink-primary">{m.display}</div>
                    <div className="mt-0.5 mono text-[0.6875rem] text-ink-muted">
                      {m.framework} · {m.versions.length} versions
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[0.6875rem]">
                    {prodTag && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-signal-success/[0.08] px-1.5 py-0.5 text-signal-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-signal-success" />
                        prod · {prodTag}
                      </span>
                    )}
                    {canaryTag && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-signal-info/[0.08] px-1.5 py-0.5 text-signal-info">
                        <span className="h-1.5 w-1.5 rounded-full bg-signal-info animate-pulseRing" />
                        canary · {canaryTag}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Running + recent completed */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionTitle
            eyebrow="In flight"
            title="Active right now"
            right={
              <Link href="/lab/runs" className="text-[0.8125rem] text-accent hover:underline">
                all runs →
              </Link>
            }
          />
          {active.length === 0 ? (
            <div className="card flex items-center justify-between p-6">
              <div>
                <div className="text-[0.95rem] text-ink-primary">No active runs.</div>
                <div className="mt-0.5 text-[0.8125rem] text-ink-muted">
                  Last completed {relativeTime(completed[0].startedAt)} — kick off another?
                </div>
              </div>
              <Link
                href="/lab/launch"
                className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent"
              >
                + Launch
              </Link>
            </div>
          ) : (
            <DataTable<EvalRun>
              rowKey={(r) => r.id}
              rows={active}
              highlight={(r) => r.status === "running"}
              columns={compactCols()}
            />
          )}
        </div>

        <div className="lg:col-span-2">
          <SectionTitle
            eyebrow="Throughput"
            title="Last 7 days"
            hint="Daily eval-run count."
          />
          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <div className="text-[1.5rem] font-semibold text-ink-primary">
                {labThroughput7d.reduce((a, b) => a + b, 0)}
              </div>
              <div className="text-[0.75rem] text-ink-muted">runs · 7d</div>
            </div>
            <div className="mt-3 h-24">
              <Sparkline data={labThroughput7d} accent="accent" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[0.6875rem] text-ink-muted">
              <div>
                <div className="text-[0.875rem] text-ink-primary">
                  {fmtDuration(labKpis.meanTimeToFinish)}
                </div>
                <div>median TTC</div>
              </div>
              <div>
                <div className="text-[0.875rem] text-ink-primary">
                  {labKpis.passingThisWeek}
                </div>
                <div>passes · 7d</div>
              </div>
              <div>
                <div className="text-[0.875rem] text-signal-danger">
                  {labKpis.failingThisWeek}
                </div>
                <div>failures · 7d</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent completed */}
      <div className="mt-6">
        <SectionTitle
          eyebrow="Your eval history"
          title="Recently completed"
        />
        <DataTable<EvalRun>
          rowKey={(r) => r.id}
          rows={completed.slice(0, 4)}
          columns={compactCols()}
        />
      </div>
    </>
  );
}

function ActionTile({
  href,
  title,
  hint,
  kbd,
}: {
  href: string;
  title: string;
  hint: string;
  kbd: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-md border border-border-subtle bg-canvas/40 p-4 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.9375rem] font-medium text-ink-primary">{title}</span>
        <span className="kbd">{kbd}</span>
      </div>
      <p className="mt-1.5 text-[0.75rem] leading-[1rem] text-ink-muted">{hint}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[0.75rem] text-accent opacity-0 transition group-hover:opacity-100">
        Open →
      </span>
    </Link>
  );
}

function compactCols(): Column<EvalRun>[] {
  return [
    {
      key: "id",
      header: "Run · agent",
      render: (r) => (
        <Link
          href={`/lab/runs/${r.id}`}
          className="block min-w-0 hover:text-accent"
        >
          <div className="truncate text-ink-primary">{r.suite}</div>
          <div className="mt-1 mono text-[0.6875rem] text-ink-muted">
            {r.agent} · {shortSha(r.agentDigest.replace(/^sha256:/, ""), 12)}
          </div>
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "100px",
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
        <span
          className={
            r.regressions > 0 ? "mono text-signal-warning" : "mono text-ink-muted"
          }
        >
          {r.regressions}
        </span>
      ),
    },
    {
      key: "startedAt",
      header: "When",
      align: "right",
      width: "110px",
      render: (r) => (
        <span className="text-ink-muted">{relativeTime(r.startedAt)}</span>
      ),
    },
  ];
}
