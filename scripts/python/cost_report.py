#!/usr/bin/env python3
"""Cost report joining OpenCost allocation with AWS Cost Explorer.

Buckets cost by the `team`, `workload`, `cost-center` tags that every
resource in this repo is required to carry. Output answers questions like
"what did `t2s-worker-voice` cost this week?" without anyone having to
open the AWS console.

Read-only. Hits the OpenCost API in the cluster and the AWS Cost Explorer
API in the configured region.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from collections import defaultdict

import boto3
import requests
from botocore.exceptions import BotoCoreError, ClientError


def opencost_allocation(base_url: str, window: str) -> dict:
    r = requests.get(
        f"{base_url}/allocation",
        params={"window": window, "aggregate": "label:workload", "accumulate": "true"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("data", [{}])[0] or {}


def aws_explorer(region: str, start: dt.date, end: dt.date) -> dict:
    client = boto3.client("ce", region_name=region)
    resp = client.get_cost_and_usage(
        TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
        Granularity="DAILY",
        Metrics=["UnblendedCost"],
        GroupBy=[
            {"Type": "TAG", "Key": "workload"},
            {"Type": "TAG", "Key": "team"},
        ],
    )
    by_workload: dict[str, float] = defaultdict(float)
    for day in resp.get("ResultsByTime", []):
        for grp in day.get("Groups", []):
            keys = grp.get("Keys", [])
            workload = keys[0].split("$", 1)[-1] if keys else "unknown"
            amount = float(grp["Metrics"]["UnblendedCost"]["Amount"])
            by_workload[workload or "untagged"] += amount
    return dict(by_workload)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--opencost-url",
                   default=os.getenv("OPENCOST_URL", "http://opencost.opencost.svc:9003"))
    p.add_argument("--window", default="7d", help="OpenCost window (e.g. 24h, 7d, 30d)")
    p.add_argument("--region", default=os.getenv("AWS_REGION", "us-east-1"))
    p.add_argument("--days", type=int, default=7, help="AWS Cost Explorer lookback days")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    try:
        oc = opencost_allocation(args.opencost_url, args.window)
    except requests.RequestException as e:
        print(f"opencost error: {e}", file=sys.stderr)
        return 3

    end = dt.date.today()
    start = end - dt.timedelta(days=args.days)
    try:
        aws = aws_explorer(args.region, start, end)
    except (BotoCoreError, ClientError) as e:
        print(f"cost explorer error: {e}", file=sys.stderr)
        return 3

    workloads = sorted(set(oc.keys()) | set(aws.keys()))
    rows = []
    for w in workloads:
        oc_cost = float(oc.get(w, {}).get("totalCost", 0.0)) if isinstance(oc.get(w), dict) else 0.0
        aws_cost = aws.get(w, 0.0)
        rows.append({"workload": w, "opencost_usd": round(oc_cost, 2),
                     "aws_explorer_usd": round(aws_cost, 2),
                     "delta_usd": round(aws_cost - oc_cost, 2)})

    if args.json:
        print(json.dumps({"window": args.window, "rows": rows}, indent=2))
    else:
        print(f"{'workload':32s} {'opencost($)':>12s} {'aws($)':>12s} {'delta($)':>12s}")
        for r in rows:
            print(f"{r['workload']:32s} {r['opencost_usd']:12.2f} "
                  f"{r['aws_explorer_usd']:12.2f} {r['delta_usd']:12.2f}")

    # Non-zero exit if any workload's untagged spend is significant.
    untagged = aws.get("untagged", 0.0)
    if untagged > 50.0:
        print(f"WARN: ${untagged:.2f} in untagged spend over {args.days}d", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
