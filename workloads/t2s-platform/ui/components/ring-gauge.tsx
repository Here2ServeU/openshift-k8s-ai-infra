/**
 * SLO ring gauge. Renders 0..1 as a stroked arc with the brand accent.
 * Pure SVG, server-renderable.
 */
export function RingGauge({
  value,
  target,
  label,
  unit,
}: {
  value: number;
  target: number;
  label: string;
  unit?: string;
}) {
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, value));
  const dash = circ * clamped;

  const aboveTarget = value >= target;
  const color = aboveTarget ? "#5EEAD4" : "#FBBF24";

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="#232E47"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* target tick */}
        <g transform={`rotate(${target * 360 - 90} ${cx} ${cy})`}>
          <line
            x1={cx + r - 6}
            y1={cy}
            x2={cx + r + 6}
            y2={cy}
            stroke="#94A3C2"
            strokeWidth="1.5"
          />
        </g>
        <text
          x="50%"
          y="50%"
          dy=".05em"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-ink-primary"
          style={{ font: "600 0.95rem ui-sans-serif, system-ui", letterSpacing: "-0.01em" }}
        >
          {(value * 100).toFixed(1).replace(/\.0$/, "")}%
        </text>
      </svg>
      <div className="min-w-0">
        <div className="caption text-ink-muted">{label}</div>
        <div className="mt-1 text-[0.8125rem] text-ink-secondary">
          target ≥ {(target * 100).toFixed(1).replace(/\.0$/, "")}%{unit ? ` · ${unit}` : ""}
        </div>
        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[0.75rem]" style={{ color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {aboveTarget ? "in budget" : "watching"}
        </div>
      </div>
    </div>
  );
}
