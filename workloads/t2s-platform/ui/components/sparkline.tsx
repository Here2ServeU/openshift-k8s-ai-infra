/**
 * Server-renderable inline-SVG sparkline. No client JS, no dependencies.
 * Uses the brand accent by default; can be tinted danger/warning/info.
 */
export function Sparkline({
  data,
  height = 40,
  width = 220,
  accent = "accent",
  fill = true,
}: {
  data: number[];
  height?: number;
  width?: number;
  accent?: "accent" | "danger" | "warning" | "info";
  fill?: boolean;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const stepX = width / (data.length - 1);
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - 4 - ((d - min) / range) * (height - 8);
    return [x, y] as const;
  });

  const pathD = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  const stroke =
    accent === "danger"
      ? "#F87171"
      : accent === "warning"
        ? "#FBBF24"
        : accent === "info"
          ? "#60A5FA"
          : "#5EEAD4";

  const gradId = `spark-${accent}-grad`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={areaD} fill={`url(#${gradId})`} />}
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* terminal dot */}
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.25" fill={stroke} />
    </svg>
  );
}
