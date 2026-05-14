export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function fmtNum(n: number, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    ...opts,
  }).format(n);
}

export function fmtPct(n: number, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtDuration(seconds: number) {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function shortSha(sha: string, len = 7) {
  return sha.slice(0, len);
}

export function relativeTime(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = (now - t) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
