import type { Turn } from "@/lib/lab-mock-data";
import { cn } from "@/lib/utils";

/**
 * One turn in a conversational transcript. Persona on the left, agent on
 * the right — same visual language as a clinical call review.
 */
export function TranscriptTurn({ turn }: { turn: Turn }) {
  const isAgent = turn.speaker === "agent";
  const lowAsr = !isAgent && (turn.asrConfidence ?? 1) < 0.92;

  return (
    <div
      className={cn(
        "flex gap-3 px-1",
        isAgent ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div className="flex w-9 shrink-0 flex-col items-center">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-[0.625rem] font-semibold uppercase tracking-[0.06em]",
            isAgent
              ? "bg-accent/[0.14] text-accent"
              : "bg-elevated text-ink-secondary",
          )}
        >
          {isAgent ? "AI" : "P"}
        </div>
        <div className="mt-1 mono text-[0.625rem] text-ink-muted">
          {formatStart(turn.startS)}
        </div>
      </div>

      <div className={cn("min-w-0 flex-1", isAgent && "text-right")}>
        <div
          className={cn(
            "inline-block max-w-[68ch] rounded-lg border px-3.5 py-2.5 text-[0.875rem] leading-[1.35rem]",
            isAgent
              ? "border-accent/25 bg-accent/[0.06] text-ink-primary"
              : "border-border-subtle bg-surface text-ink-primary",
            "text-left",
          )}
        >
          {turn.text}
        </div>

        <div
          className={cn(
            "mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem]",
            isAgent ? "justify-end" : "justify-start",
          )}
        >
          {!isAgent && turn.asrConfidence !== undefined && (
            <span className={lowAsr ? "text-signal-warning" : "text-ink-muted"}>
              ASR {turn.asrConfidence.toFixed(3)}
              {lowAsr && " ⚠"}
            </span>
          )}
          {turn.flagged && (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-signal-success/30 bg-signal-success/[0.06] px-1.5 py-0.5 text-signal-success">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-success" />
              {turn.flagged}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatStart(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}
