import { Sparkline } from "./sparkline";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "flat";

export function MetricCard({
  label,
  value,
  unit,
  hint,
  trend,
  trendValue,
  series,
  emphasis = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  trend?: Trend;
  trendValue?: string;
  series?: number[];
  emphasis?: "default" | "accent" | "warning" | "danger";
}) {
  const ring =
    emphasis === "accent"
      ? "before:bg-accent"
      : emphasis === "warning"
        ? "before:bg-signal-warning"
        : emphasis === "danger"
          ? "before:bg-signal-danger"
          : "before:bg-border";

  return (
    <div
      className={cn(
        "card relative overflow-hidden p-5 transition-colors",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:opacity-80",
        ring,
      )}
    >
      <div className="caption text-ink-muted">{label}</div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[1.65rem] font-semibold leading-none tracking-[-0.01em] text-ink-primary">
          {value}
        </span>
        {unit && (
          <span className="text-[0.8125rem] text-ink-secondary">{unit}</span>
        )}
        {trend && trendValue && (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-medium",
              trend === "up" && "bg-signal-success/[0.08] text-signal-success",
              trend === "down" && "bg-signal-danger/[0.08] text-signal-danger",
              trend === "flat" && "bg-elevated text-ink-secondary",
            )}
          >
            <TrendGlyph trend={trend} />
            {trendValue}
          </span>
        )}
      </div>

      {series && series.length > 0 && (
        <div className="mt-4 h-10">
          <Sparkline data={series} accent={emphasis === "danger" ? "danger" : "accent"} />
        </div>
      )}

      {hint && (
        <p className="mt-3 text-[0.75rem] leading-[1rem] text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function TrendGlyph({ trend }: { trend: Trend }) {
  if (trend === "flat") {
    return (
      <svg viewBox="0 0 8 8" className="h-2 w-2">
        <path d="M1 4 H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  const points = trend === "up" ? "M1 6 L4 2 L7 6" : "M1 2 L4 6 L7 2";
  return (
    <svg viewBox="0 0 8 8" className="h-2 w-2">
      <path d={points} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </svg>
  );
}
