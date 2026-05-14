#!/usr/bin/env python3
"""GPU fleet utilization vs. cost — candidates for downsizing.

Pulls DCGM exporter samples from Prometheus, joins to a static spot-price
table per instance type, and prints the bottom quartile of utilization
sorted by $/hour. Anything in that quartile is a candidate for migration
to a smaller MIG slice, a cheaper instance type, or scale-to-zero.

Read-only. Prom range queries only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from statistics import mean

import requests

# Approximate spot $/hr by instance type. Real source is a tagged price feed;
# this constant is fine for a daily report.
SPOT_PRICE_USD_PER_HR = {
    "p4d.24xlarge": 12.0,
    "g5.12xlarge": 2.5,
    "g5.2xlarge": 0.45,
    "g4dn.xlarge": 0.20,
    "a2-highgpu-1g": 1.5,
    "a2-highgpu-4g": 5.8,
    "Standard_NC24ads_A100_v4": 3.7,
}


def prom_range(base: str, query: str, hours: int) -> list[dict]:
    end = int(__import__("time").time())
    start = end - hours * 3600
    r = requests.get(
        f"{base}/api/v1/query_range",
        params={"query": query, "start": start, "end": end, "step": "300"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("data", {}).get("result", [])


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--prom-url",
                   default=os.getenv("PROM_URL", "http://prometheus-operated.observability.svc:9090"))
    p.add_argument("--hours", type=int, default=24)
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    try:
        util = prom_range(args.prom_url,
                          "avg by (node, instance_type) (DCGM_FI_DEV_GPU_UTIL)",
                          args.hours)
    except requests.RequestException as e:
        print(f"prometheus error: {e}", file=sys.stderr)
        return 3

    by_node: dict[tuple[str, str], list[float]] = defaultdict(list)
    for series in util:
        m = series.get("metric", {})
        key = (m.get("node", "?"), m.get("instance_type", "?"))
        for _ts, val in series.get("values", []):
            try:
                by_node[key].append(float(val))
            except ValueError:
                continue

    rows = []
    for (node, itype), samples in by_node.items():
        if not samples:
            continue
        avg_util = mean(samples)
        price = SPOT_PRICE_USD_PER_HR.get(itype, 0.0)
        wasted_per_hr = price * (1 - avg_util / 100.0)
        rows.append({
            "node": node, "instance_type": itype,
            "avg_util_pct": round(avg_util, 1),
            "spot_usd_per_hr": price,
            "wasted_usd_per_hr": round(wasted_per_hr, 2),
        })
    rows.sort(key=lambda r: (r["avg_util_pct"], -r["wasted_usd_per_hr"]))

    candidates = [r for r in rows if r["avg_util_pct"] < 25.0]

    if args.json:
        print(json.dumps({"hours": args.hours, "rows": rows,
                          "downsize_candidates": candidates}, indent=2))
    else:
        print(f"{'node':40s} {'type':24s} {'util%':>7s} {'$/hr':>7s} {'wasted$/hr':>10s}")
        for r in rows:
            mark = " *" if r["avg_util_pct"] < 25 else ""
            print(f"{r['node']:40s} {r['instance_type']:24s} "
                  f"{r['avg_util_pct']:7.1f} {r['spot_usd_per_hr']:7.2f} "
                  f"{r['wasted_usd_per_hr']:10.2f}{mark}")
        print(f"\n{len(candidates)} candidate(s) for downsizing/scale-to-zero "
              f"(util < 25% over {args.hours}h)")
    return 1 if candidates else 0


if __name__ == "__main__":
    sys.exit(main())
