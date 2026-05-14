import type { Rubric } from "@/lib/lab-mock-data";
import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/utils";

/**
 * Horizontal bar for a single rubric score. Shows current value, optional
 * delta vs. previous version, and the weight.
 */
export function ScoreBar({ rubric }: { rubric: Rubric }) {
  const pct = Math.max(0, Math.min(1, rubric.score));
  const tone = pct >= 0.95 ? "success" : pct >= 0.85 ? "warning" : "danger";
  const fill =
    tone === "success" ? "#4ADE80" : tone === "warning" ? "#FBBF24" : "#F87171";

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.875rem] font-medium text-ink-primary">
            {rubric.display}
          </div>
          <p className="mt-0.5 text-[0.75rem] leading-[1rem] text-ink-muted">
            {rubric.description}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-[0.95rem] font-semibold" style={{ color: fill }}>
            {fmtPct(pct, 1)}
          </div>
          <div className="mt-0.5 flex items-center justify-end gap-2 text-[0.6875rem]">
            <span className="text-ink-muted">w {(rubric.weight * 100).toFixed(0)}%</span>
            {rubric.delta !== undefined && rubric.delta !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5",
                  rubric.delta > 0
                    ? "bg-signal-success/[0.08] text-signal-success"
                    : "bg-signal-danger/[0.08] text-signal-danger",
                )}
              >
                {rubric.delta > 0 ? "↑" : "↓"} {(Math.abs(rubric.delta) * 100).toFixed(1)}pp
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas/60">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct * 100}%`, background: fill }}
        />
      </div>
    </div>
  );
}
