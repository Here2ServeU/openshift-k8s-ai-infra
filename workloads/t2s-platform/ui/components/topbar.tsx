"use client";

import { useEffect, useState } from "react";
import { RoleSwitcher } from "./role-switcher";

const ENVIRONMENTS = ["prod-us-east", "staging", "dev"] as const;
type Env = (typeof ENVIRONMENTS)[number];

export function Topbar() {
  const [env, setEnv] = useState<Env>("prod-us-east");
  const [now, setNow] = useState<string>("—");

  // Clock ticks client-side only — keeps SSR/CSR hydration clean.
  useEffect(() => {
    setNow(isoMinute());
    const id = setInterval(() => setNow(isoMinute()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-border-subtle bg-canvas/85 px-8 backdrop-blur-xl">
      <div className="flex items-center gap-6">
        <div className="hidden lg:block">
          <div className="caption text-ink-muted">Environment</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-success animate-pulseRing" />
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value as Env)}
              className="rounded-sm bg-transparent text-[0.875rem] font-medium text-ink-primary outline-none"
            >
              {ENVIRONMENTS.map((e) => (
                <option key={e} value={e} className="bg-elevated text-ink-primary">
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="h-6 w-px bg-border-subtle hidden lg:block" />

        <div className="hidden md:block">
          <div className="caption text-ink-muted">Cluster</div>
          <div className="mt-0.5 mono text-[0.8125rem] text-ink-primary">
            eks-prod-us-east-1 · falcon-7a3f9c1
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <RoleSwitcher />

        <button
          type="button"
          className="hidden md:flex items-center gap-2 rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-secondary transition hover:border-border hover:text-ink-primary"
        >
          <SearchIcon />
          <span>Search runs, models, evidence</span>
          <span className="kbd">⌘K</span>
        </button>

        <div className="hidden md:flex items-center gap-2 rounded-md border border-signal-success/30 bg-signal-success/[0.06] px-3 py-1.5 text-[0.75rem] text-signal-success">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-success" />
          SLOs healthy · burn 0.42×
        </div>

        <div className="text-right">
          <div className="caption text-ink-muted">UTC</div>
          <div className="mono text-[0.8125rem] text-ink-secondary">{now}</div>
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="m11 11 3 3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function isoMinute(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
  );
}
