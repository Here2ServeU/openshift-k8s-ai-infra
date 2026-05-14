#!/usr/bin/env python3
"""Audit T2S SQS queues.

Reports depth, oldest-message age, in-flight count, and DLQ size for each
queue. Exits non-zero past warning / critical thresholds so CI and on-call
shims can branch on the result.

Exit codes:
  0 — every queue inside warning thresholds
  1 — at least one queue past WARN threshold
  2 — at least one queue past CRIT threshold or DLQ has messages
  3 — script error (bad args, AWS auth, etc.)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass

import boto3
from botocore.exceptions import BotoCoreError, ClientError

WARN_DEPTH = 200
CRIT_DEPTH = 1000
WARN_AGE_S = 300
CRIT_AGE_S = 900


@dataclass
class QueueState:
    name: str
    url: str
    depth: int
    in_flight: int
    oldest_age_s: int
    dlq_depth: int
    status: str  # ok | warn | crit | error


def _attr(client, url: str) -> dict:
    return client.get_queue_attributes(
        QueueUrl=url,
        AttributeNames=[
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
            "ApproximateAgeOfOldestMessage",
            "RedrivePolicy",
        ],
    )["Attributes"]


def audit_one(client, name: str) -> QueueState:
    try:
        url = client.get_queue_url(QueueName=name)["QueueUrl"]
        a = _attr(client, url)
        depth = int(a.get("ApproximateNumberOfMessages", 0))
        in_flight = int(a.get("ApproximateNumberOfMessagesNotVisible", 0))
        oldest = int(a.get("ApproximateAgeOfOldestMessage", 0))
        dlq_depth = 0
        if "RedrivePolicy" in a:
            rp = json.loads(a["RedrivePolicy"])
            dlq_arn = rp.get("deadLetterTargetArn", "")
            if dlq_arn:
                dlq_name = dlq_arn.split(":")[-1]
                dlq_url = client.get_queue_url(QueueName=dlq_name)["QueueUrl"]
                dlq_attrs = _attr(client, dlq_url)
                dlq_depth = int(dlq_attrs.get("ApproximateNumberOfMessages", 0))

        if dlq_depth > 0 or depth >= CRIT_DEPTH or oldest >= CRIT_AGE_S:
            status = "crit"
        elif depth >= WARN_DEPTH or oldest >= WARN_AGE_S:
            status = "warn"
        else:
            status = "ok"

        return QueueState(name, url, depth, in_flight, oldest, dlq_depth, status)
    except (BotoCoreError, ClientError) as e:
        return QueueState(name, "", 0, 0, 0, 0, f"error:{e.__class__.__name__}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--queue", action="append", required=True,
                   help="Queue name (repeat for multiple)")
    p.add_argument("--region", default=os.getenv("AWS_REGION", "us-east-1"))
    p.add_argument("--json", action="store_true", help="emit JSON instead of text")
    args = p.parse_args()

    try:
        client = boto3.client("sqs", region_name=args.region)
    except (BotoCoreError, ClientError) as e:
        print(f"sqs client error: {e}", file=sys.stderr)
        return 3

    results = [audit_one(client, q) for q in args.queue]

    if args.json:
        print(json.dumps([asdict(r) for r in results], indent=2))
    else:
        for r in results:
            print(f"{r.name:32s} depth={r.depth:6d} in_flight={r.in_flight:5d} "
                  f"oldest={r.oldest_age_s:5d}s dlq={r.dlq_depth:4d} [{r.status}]")

    if any(r.status == "crit" or r.status.startswith("error") for r in results):
        return 2
    if any(r.status == "warn" for r in results):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
