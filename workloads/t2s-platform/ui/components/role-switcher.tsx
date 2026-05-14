"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Two-state switcher between the platform-owner view (Mission Control, etc.)
 * and the researcher Lab. Route-based — no client state, the URL is the
 * source of truth.
 */
export function RoleSwitcher() {
  const pathname = usePathname();
  const inLab = pathname.startsWith("/lab");

  return (
    <div
      className="hidden md:inline-flex items-center rounded-md border border-border-subtle bg-surface p-0.5"
      role="tablist"
      aria-label="Switch role"
    >
      <Link
        href="/"
        role="tab"
        aria-selected={!inLab}
        className={cn(
          "rounded-sm px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
          !inLab
            ? "bg-accent/[0.14] text-accent"
            : "text-ink-secondary hover:text-ink-primary",
        )}
      >
        Platform
      </Link>
      <Link
        href="/lab"
        role="tab"
        aria-selected={inLab}
        className={cn(
          "rounded-sm px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
          inLab
            ? "bg-accent/[0.14] text-accent"
            : "text-ink-secondary hover:text-ink-primary",
        )}
      >
        Lab
      </Link>
    </div>
  );
}
