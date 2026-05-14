import type { RunStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type BadgeVariant = RunStatus | "green" | "amber" | "red";

const MAP: Record<
  BadgeVariant,
  { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral"; pulse?: boolean }
> = {
  running:  { label: "Running",  tone: "info",    pulse: true },
  passed:   { label: "Passed",   tone: "success" },
  failed:   { label: "Failed",   tone: "danger" },
  blocked:  { label: "Blocked",  tone: "warning" },
  queued:   { label: "Queued",   tone: "neutral" },
  green:    { label: "Green",    tone: "success" },
  amber:    { label: "Amber",    tone: "warning" },
  red:      { label: "Red",      tone: "danger" },
};

export function StatusBadge({
  variant,
  size = "sm",
  withGlyph = true,
}: {
  variant: BadgeVariant;
  size?: "sm" | "md";
  withGlyph?: boolean;
}) {
  const cfg = MAP[variant];

  const tone =
    cfg.tone === "success"
      ? "text-signal-success bg-signal-success/[0.08] border-signal-success/30"
      : cfg.tone === "warning"
        ? "text-signal-warning bg-signal-warning/[0.08] border-signal-warning/30"
        : cfg.tone === "danger"
          ? "text-signal-danger bg-signal-danger/[0.08] border-signal-danger/30"
          : cfg.tone === "info"
            ? "text-signal-info bg-signal-info/[0.08] border-signal-info/30"
            : "text-ink-secondary bg-elevated border-border-subtle";

  const dot =
    cfg.tone === "success"
      ? "bg-signal-success"
      : cfg.tone === "warning"
        ? "bg-signal-warning"
        : cfg.tone === "danger"
          ? "bg-signal-danger"
          : cfg.tone === "info"
            ? "bg-signal-info"
            : "bg-ink-muted";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border font-medium",
        size === "sm"
          ? "px-1.5 py-0.5 text-[0.6875rem]"
          : "px-2 py-1 text-[0.8125rem]",
        tone,
      )}
    >
      {withGlyph && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dot, cfg.pulse && "animate-pulseRing")}
        />
      )}
      {cfg.label}
    </span>
  );
}
