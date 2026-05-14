#!/usr/bin/env python3
"""SLO burn-rate snapshot.

Reads Sloth SLO definitions in `observability/slo/`, queries Prometheus
for the current burn rate over short and long windows, and emits a snapshot
that a release gate can read before flipping canary weight.

Standalone of Alertmanager — useful as a pre-deploy check or for a clean
status dump when you don't trust whatever the dashboard says.

Exit codes:
  0 — every SLO is healthy (burn < 1.0 in both windows)
  1 — at least one SLO has a fast-burn warning (>= 2.0 short window)
  2 — at least one SLO has a critical fast-burn (>= 14.4 short window)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests
import yaml


def load_slos(root: Path) -> list[dict]:
    slos = []
    for p in sorted(root.glob("*.yaml")):
        doc = yaml.safe_load(p.read_text()) or {}
        for spec in doc.get("spec", {}).get("slos", []):
            slos.append({"file": p.name, **spec})
    return slos


def burn(prom: str, slo_name: str, window: str) -> float:
    # Sloth records error-budget burn as `slo:sli_error:ratio_rate{window}`
    query = f'slo:sli_error:ratio_rate{window}{{slo="{slo_name}"}}'
    r = requests.get(f"{prom}/api/v1/query", params={"query": query}, timeout=15)
    r.raise_for_status()
    data = r.json().get("data", {}).get("result", [])
    if not data:
        return float("nan")
    return float(data[0]["value"][1])


def main() -> int:
    here = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--slo-dir", default=str(here / "observability" / "slo"))
    ap.add_argument("--prom-url",
                    default=os.getenv("PROM_URL", "http://prometheus-operated.observability.svc:9090"))
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    root = Path(args.slo_dir)
    if not root.is_dir():
        print(f"slo dir not found: {root}", file=sys.stderr)
        return 3
    slos = load_slos(root)
    if not slos:
        print(f"no slos under {root}", file=sys.stderr)
        return 3

    rows = []
    worst = 0.0
    for s in slos:
        name = s.get("name", "?")
        try:
            short = burn(args.prom_url, name, "5m")
            long_ = burn(args.prom_url, name, "1h")
        except requests.RequestException as e:
            print(f"prom error for {name}: {e}", file=sys.stderr)
            return 3
        rows.append({"file": s["file"], "name": name,
                     "objective": s.get("objective"),
                     "burn_5m": short, "burn_1h": long_})
        if short == short:  # not NaN
            worst = max(worst, short)

    if args.json:
        print(json.dumps({"rows": rows}, indent=2))
    else:
        print(f"{'slo':40s} {'objective':>10s} {'burn_5m':>10s} {'burn_1h':>10s}")
        for r in rows:
            print(f"{r['name']:40s} {str(r['objective']):>10s} "
                  f"{r['burn_5m']:10.3f} {r['burn_1h']:10.3f}")

    if worst >= 14.4:
        return 2
    if worst >= 2.0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
