import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBar } from "@/components/score-bar";
import { TranscriptTurn } from "@/components/transcript-turn";
import { detailedRuns, myRuns } from "@/lib/lab-mock-data";
import { fmtDuration, fmtPct, relativeTime, shortSha } from "@/lib/utils";

export const metadata = { title: "Run detail" };

export default function RunDetailPage({ params }: { params: { id: string } }) {
  const run = detailedRuns[params.id];
  // If we don't have a detailed mock for this id, fall back to its row from
  // myRuns so the page still renders with header info.
  const stub = run ?? myRuns.find((r) => r.id === params.id);
  if (!stub) notFound();

  const weighted =
    run?.rubrics.reduce((s, r) => s + r.score * r.weight, 0) ?? stub.passRate;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Link href="/lab/runs" className="text-accent hover:underline">
              My runs
            </Link>
            <span className="text-ink-muted">/</span>
            <span className="mono">{stub.id.slice(0, 18)}…</span>
          </span>
        }
        title={stub.suite}
        description={
          run?.scenario ??
          "Mock detail is only wired for the running triage cohort in this demo. Open run_01HXG3CY7K… from the list to see scores, transcripts, and evidence."
        }
        actions={
          <>
            <button className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary">
              Export evidence pack
            </button>
            {run?.comparedTo && (
              <button className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent transition hover:bg-accent/[0.14]">
                ↔ Compare with {run.comparedTo.agentVersion}
              </button>
            )}
          </>
        }
      />

      {/* Header strip */}
      <div className="card mb-6 grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-4 xl:grid-cols-6">
        <HeaderField label="Status">
          <StatusBadge variant={stub.status} size="md" />
        </HeaderField>
        <HeaderField label="Pass rate">
          <span className="mono text-[1.05rem] text-ink-primary">
            {stub.status === "queued" || stub.status === "blocked"
              ? "—"
              : fmtPct(weighted, 1)}
          </span>
          {run?.comparedTo && (
            <span className="ml-2 text-[0.6875rem] text-signal-success">
              ↑ {((weighted - run.comparedTo.passRate) * 100).toFixed(1)}pp vs {run.comparedTo.agentVersion}
            </span>
          )}
        </HeaderField>
        <HeaderField label="Regressions">
          <span
            className={
              stub.regressions > 0
                ? "mono text-[1.05rem] text-signal-warning"
                : "mono text-[1.05rem] text-ink-primary"
            }
          >
            {stub.regressions}
          </span>
        </HeaderField>
        <HeaderField label="Agent">
          <span className="text-[0.875rem] text-ink-primary">{stub.agent}</span>
          <div className="mono text-[0.6875rem] text-ink-muted">
            {shortSha(stub.agentDigest.replace(/^sha256:/, ""), 14)}
          </div>
        </HeaderField>
        <HeaderField label="Started">
          <span className="text-[0.875rem] text-ink-secondary">
            {relativeTime(stub.startedAt)}
          </span>
        </HeaderField>
        <HeaderField label="Duration">
          <span className="mono text-[0.875rem] text-ink-secondary">
            {stub.durationS === 0 ? "—" : fmtDuration(stub.durationS)}
          </span>
        </HeaderField>
      </div>

      {run ? (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Rubrics column */}
            <section className="lg:col-span-2">
              <SectionTitle
                eyebrow="Rubric breakdown"
                title="What the eval scored"
                hint="Weighted sum of the 6 rubrics. Each line cites its definition; deltas compare to the previous agent version."
              />
              <div className="card divide-y divide-border-subtle/60">
                {run.rubrics.map((r) => (
                  <ScoreBar key={r.id} rubric={r} />
                ))}
              </div>
            </section>

            {/* Transcript column */}
            <section className="lg:col-span-3">
              <SectionTitle
                eyebrow="Conversation transcript"
                title="Turn-by-turn replay"
                hint="Persona left, agent right. ASR confidence is shown per persona turn — below 0.92 is flagged."
                right={
                  <div className="flex items-center gap-2 text-[0.6875rem] text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-signal-success" />
                      success
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-signal-warning" />
                      low ASR
                    </span>
                  </div>
                }
              />
              <div className="card flex flex-col gap-5 p-5">
                {run.transcript.map((t, i) => (
                  <TranscriptTurn key={i} turn={t} />
                ))}
              </div>

              <p className="mt-3 text-[0.75rem] text-ink-muted">
                Full call recording (audio + transcript JSON + turn metadata) is in S3 at
                <span className="ml-1 mono text-ink-secondary">
                  s3://t2s-artifacts/{run.id}/
                </span>{" "}
                — 7-year WORM retention.
              </p>
            </section>
          </div>

          {/* Evidence + lineage */}
          <SectionTitle
            eyebrow="Chain of evidence"
            title="What an auditor sees"
          />
          <div className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
            <EvidenceCol
              label="Image digest"
              value="sha256:9f2c3b18a7e6…"
              hint="Cosign-keyless signature, SBOM attestation. Verified at pod start."
            />
            <EvidenceCol
              label="Manifest"
              value={`PR #1842 · 2 reviewers`}
              hint="GitOps trail on the values file that references the digest above."
            />
            <EvidenceCol
              label="MLflow lineage"
              value={`run_id: ${run.mlflowRunId.slice(0, 18)}…`}
              hint="Links to the training run, dataset hash, and cohort sign-off."
            />
          </div>

          <p className="mt-4 text-[0.75rem] text-ink-muted">
            This run produced{" "}
            <span className="text-ink-secondary">{run.evidenceCount} signed evidence artifacts</span>{" "}
            — included automatically in any 510(k) submission bundle export from{" "}
            <Link href="/compliance" className="text-accent hover:underline">
              the compliance view
            </Link>
            .
          </p>
        </>
      ) : (
        <div className="card flex items-center justify-between p-6">
          <div>
            <div className="text-[0.95rem] text-ink-primary">
              No detailed transcript bundled for this run in the demo.
            </div>
            <div className="mt-1 text-[0.8125rem] text-ink-muted">
              Real deployment fetches transcripts + scores from{" "}
              <span className="mono text-ink-secondary">/api/runs/{stub.id}</span>.
            </div>
          </div>
          <Link
            href="/lab/runs/run_01HXG3CY7K4Q9N2D8M5R6P0Z"
            className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent"
          >
            Open the live triage run →
          </Link>
        </div>
      )}
    </>
  );
}

function HeaderField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="caption text-ink-muted">{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function EvidenceCol({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-canvas/40 p-4">
      <div className="caption text-ink-muted">{label}</div>
      <div className="mt-1.5 mono text-[0.8125rem] text-accent">{value}</div>
      <p className="mt-2 text-[0.75rem] leading-[1rem] text-ink-secondary">{hint}</p>
    </div>
  );
}
