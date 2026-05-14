"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";

type NavItem = {
  href: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
};

const STROKE = "currentColor";

const ICON = {
  reticle: (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
      <circle cx="10" cy="10" r="7" stroke={STROKE} strokeWidth="1.4" />
      <path
        d="M10 1.5V5 M10 15V18.5 M1.5 10H5 M15 10H18.5"
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="10" cy="10" r="1.6" fill={STROKE} />
    </svg>
  ),
  runs: (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M3 5h14M3 10h10M3 15h14"
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="10" r="1.6" fill={STROKE} />
    </svg>
  ),
  persona: (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
      <circle cx="10" cy="7" r="3" stroke={STROKE} strokeWidth="1.4" />
      <path
        d="M3.5 17c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5"
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M10 2.5l6 2v5.5c0 4-2.7 6.5-6 7.5-3.3-1-6-3.5-6-7.5V4.5l6-2z"
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 10.5l1.8 1.8 3.5-3.6"
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  ledger: (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
      <rect
        x="3.5"
        y="3"
        width="13"
        height="14"
        rx="1.5"
        stroke={STROKE}
        strokeWidth="1.4"
      />
      <path
        d="M7 7h6M7 10h6M7 13h4"
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  beaker: (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M8 2.5h4M8.75 2.5v5.25L4 16a1 1 0 0 0 .87 1.5h10.26A1 1 0 0 0 16 16l-4.75-8.25V2.5"
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6.5 12h7" stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  launch: (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M3.5 12.5l4-4 5 5-4 4-5-5zM12.5 8.5l4-4-2-2-4 4 2 2zM7.5 13.5l-3 3"
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13.5" cy="6.5" r="0.9" fill={STROKE} />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
      <rect x="3" y="4" width="14" height="3" rx="0.5" stroke={STROKE} strokeWidth="1.4" />
      <rect x="3" y="9" width="14" height="3" rx="0.5" stroke={STROKE} strokeWidth="1.4" />
      <rect x="3" y="14" width="14" height="3" rx="0.5" stroke={STROKE} strokeWidth="1.4" />
    </svg>
  ),
};

const PLATFORM_NAV: NavItem[] = [
  { href: "/", label: "Mission Control", hint: "Overview", icon: ICON.reticle },
  { href: "/eval-runs", label: "Eval Runs", hint: "Active & historical", icon: ICON.runs },
  { href: "/personas", label: "Personas", hint: "Simulation profiles", icon: ICON.persona },
  { href: "/compliance", label: "Compliance", hint: "Regulatory gates", icon: ICON.shield },
  { href: "/audit-trail", label: "Audit Trail", hint: "Signed evidence", icon: ICON.ledger },
];

const LAB_NAV: NavItem[] = [
  { href: "/lab", label: "Workbench", hint: "Your activity at a glance", icon: ICON.beaker },
  { href: "/lab/launch", label: "Launch eval", hint: "Submit a new run", icon: ICON.launch },
  { href: "/lab/runs", label: "My runs", hint: "Your eval history", icon: ICON.list },
];

export function Sidebar() {
  const pathname = usePathname();
  const inLab = pathname.startsWith("/lab");
  const NAV = inLab ? LAB_NAV : PLATFORM_NAV;
  const section = inLab ? "Lab" : "Platform";

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border-subtle bg-[#0B1124] lg:flex">
      <div className="flex h-[64px] items-center px-5 border-b border-border-subtle">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-4">
        <div className="caption mb-2 flex items-center gap-2 px-2">
          {section}
          {inLab && (
            <span className="rounded-sm border border-accent/30 bg-accent/[0.08] px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.06em] text-accent">
              Researcher
            </span>
          )}
        </div>
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active =
              item.href === "/" || item.href === "/lab"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    "group relative flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors",
                    active
                      ? "bg-elevated text-ink-primary"
                      : "text-ink-secondary hover:bg-elevated/60 hover:text-ink-primary",
                  ].join(" ")}
                >
                  {active && (
                    <span
                      className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent"
                      aria-hidden
                    />
                  )}
                  <span
                    className={[
                      "mt-0.5 transition-colors",
                      active ? "text-accent" : "text-ink-muted group-hover:text-ink-secondary",
                    ].join(" ")}
                  >
                    {item.icon}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[0.875rem] font-medium leading-none">
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="mt-1 text-[0.6875rem] tracking-[0.02em] text-ink-muted">
                        {item.hint}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="caption mb-2 mt-7 px-2">Domain</div>
        <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
          <div className="flex items-center gap-2 text-[0.8125rem] text-ink-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseRing" />
            Regulated healthcare AI
          </div>
          <p className="mt-1.5 text-[0.6875rem] leading-[0.95rem] text-ink-muted">
            FDA SaMD · IEC 62304 · ISO 13485 · EU MDR · HIPAA
          </p>
        </div>
      </nav>

      <div className="px-5 py-4 border-t border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[0.75rem] font-semibold text-accent">
            EN
          </div>
          <div className="min-w-0">
            <div className="truncate text-[0.8125rem] text-ink-primary">
              Dr. Emmanuel Naweji
            </div>
            <div className="truncate text-[0.6875rem] text-ink-muted">
              {inLab ? "Researcher · clinical AI" : "Platform owner · on-call"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
