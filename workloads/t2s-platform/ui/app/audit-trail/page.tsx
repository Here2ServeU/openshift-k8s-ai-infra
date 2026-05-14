import { PageHeader, SectionTitle } from "@/components/page-header";
import { audit, type AuditEntry } from "@/lib/mock-data";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Audit Trail" };

const KIND_LABEL: Record<AuditEntry["kind"], { label: string; color: string }> = {
  release: { label: "Release", color: "#5EEAD4" },
  model: { label: "Model", color: "#60A5FA" },
  persona: { label: "Persona", color: "#4ADE80" },
  policy: { label: "Policy", color: "#FBBF24" },
  access: { label: "Access", color: "#F87171" },
};

export default function AuditTrailPage() {
  const grouped = groupByDay(audit);

  return (
    <>
      <PageHeader
        eyebrow="Audit Trail"
        title="Tamper-evident record of every state change"
        description="Every entry is a signed cryptographic event. The trail is append-only and is what a notified body, FDA reviewer, or internal QA team is shown when they ask: who did what, when, with what authority, and against which artifact?"
        actions={
          <>
            <button className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary">
              Export 24h
            </button>
            <button className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary">
              Subscribe to S3 sink
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {Object.entries(KIND_LABEL).map(([k, { label, color }]) => {
          const count = audit.filter((e) => e.kind === k).length;
          return (
            <div key={k} className="card px-4 py-3">
              <div className="caption flex items-center gap-2 text-ink-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {label}
              </div>
              <div className="mt-1.5 text-[1.4rem] font-semibold text-ink-primary">
                {count}
              </div>
            </div>
          );
        })}
      </div>

      <SectionTitle
        eyebrow="Ledger"
        title="Most recent first"
        right={
          <span className="text-[0.6875rem] text-ink-muted">
            sink → S3 (WORM, 7y retention)
          </span>
        }
      />

      <div className="space-y-6">
        {grouped.map(({ day, entries }) => (
          <section key={day}>
            <div className="caption mb-2 text-ink-muted">{day}</div>
            <ol className="relative space-y-0">
              {/* timeline rail */}
              <span className="absolute left-[7px] top-2 bottom-2 w-px bg-border-subtle" />
              {entries.map((e) => (
                <Entry key={e.id} entry={e} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}

function Entry({ entry }: { entry: AuditEntry }) {
  const meta = KIND_LABEL[entry.kind];
  return (
    <li className="relative pl-7 pb-3">
      <span
        className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-[3px] border-canvas"
        style={{ background: meta.color }}
      />
      <div className="card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <span
              className="mr-2 inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[0.6875rem]"
              style={{
                color: meta.color,
                borderColor: `${meta.color}44`,
                background: `${meta.color}10`,
              }}
            >
              {meta.label}
            </span>
            <span className="text-[0.8125rem] text-ink-primary">
              <span className="text-ink-secondary">{entry.actor}</span>{" "}
              <span className="text-accent">{entry.action}</span>{" "}
              <span className="text-ink-primary">{entry.subject}</span>
            </span>
          </div>
          <span className="mono text-[0.6875rem] text-ink-muted">
            {relativeTime(entry.ts)} · {entry.id}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 mono text-[0.6875rem] text-ink-muted">
          {entry.digest !== "—" && (
            <span>
              digest <span className="text-ink-secondary">{entry.digest}</span>
            </span>
          )}
          {entry.signer !== "—" && (
            <span>
              signer <span className="text-ink-secondary">{entry.signer}</span>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function groupByDay(entries: AuditEntry[]) {
  const groups: Record<string, AuditEntry[]> = {};
  for (const e of entries) {
    const day = new Date(e.ts).toISOString().slice(0, 10);
    (groups[day] ||= []).push(e);
  }
  return Object.entries(groups)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, entries]) => ({ day, entries }));
}
