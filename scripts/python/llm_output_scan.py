#!/usr/bin/env python3
"""Async LLM output scanner.

Pulls a sample of recent LLM responses from Loki, scans each for PII / secrets /
prompt-injection success indicators, and emits Prometheus metrics + a JSON
report. Runs as a CronJob (every 15 min) so the request hot-path stays fast —
the Envoy Lua filter at the gateway handles the regex-only hot scan; this script
is the deeper second pass.

What it catches that the gateway regex doesn't:
  - PII shapes Presidio understands (names, addresses, phone numbers, MRNs).
  - Prompt-injection *success* indicators in the model's output ("I will now
    ignore my previous instructions", "Here is my system prompt:", base64 blobs
    that decode to instructions).
  - Cross-chunk patterns that the streaming filter's 256-byte window missed.

Exit codes:
  0 — scan completed, no high-severity findings
  1 — scan completed, at least one high-severity finding (PHI, key leak)
  2 — scan failed (Loki unreachable, malformed responses)
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Iterable

import requests

# High-severity patterns we always flag, even without Presidio.
SECRET_PATTERNS = {
    "aws_access_key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "openai_key":     re.compile(r"sk-[A-Za-z0-9]{48}"),
    "github_pat":     re.compile(r"ghp_[A-Za-z0-9]{36}"),
    "jwt":            re.compile(r"eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),
    "svc_hostname":   re.compile(r"[a-z0-9\-]+\.[a-z0-9\-]+\.svc\.cluster\.local"),
    "mrn":            re.compile(r"\bMRN[:#]?\s*\d{6,10}\b", re.IGNORECASE),
}

# Phrases that suggest a prompt-injection attack succeeded.
INJECTION_SUCCESS = [
    re.compile(r"ignore (the|my|all|your|prior|previous) (prior|previous|above|earlier) (instructions|prompts|rules)", re.IGNORECASE),
    re.compile(r"here (is|are) (my|the) (system prompt|instructions|rules)", re.IGNORECASE),
    re.compile(r"\bI (will|am going to) now\b", re.IGNORECASE),
    re.compile(r"\bsudo mode\b|\bDAN mode\b|\bjailbreak\b", re.IGNORECASE),
]


@dataclass
class Finding:
    sample_id: str
    kind: str                   # secret | injection_success | base64_payload | pii
    detail: str
    severity: str               # high | medium | low
    excerpt: str

@dataclass
class ScanResult:
    total: int = 0
    findings: list[Finding] = field(default_factory=list)
    by_kind: dict[str, int] = field(default_factory=dict)


def fetch_samples(loki_url: str, query: str, limit: int, hours: int) -> Iterable[dict]:
    """Pull recent LLM response logs from Loki."""
    end = int(time.time() * 1e9)
    start = end - hours * 3600 * 1_000_000_000
    r = requests.get(
        f"{loki_url}/loki/api/v1/query_range",
        params={"query": query, "start": start, "end": end, "limit": limit},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json().get("data", {}).get("result", [])
    for stream in data:
        for ts, line in stream.get("values", []):
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            yield {"id": f"{ts}-{stream.get('stream', {}).get('pod', '?')}",
                   "response": rec.get("response", ""),
                   "tenant": rec.get("tenant", "unknown")}


def scan_secrets(sample_id: str, body: str) -> list[Finding]:
    out: list[Finding] = []
    for kind, rx in SECRET_PATTERNS.items():
        for m in rx.finditer(body):
            excerpt = body[max(0, m.start() - 20):m.end() + 20]
            out.append(Finding(sample_id, "secret", kind, "high", excerpt))
    return out


def scan_injection_success(sample_id: str, body: str) -> list[Finding]:
    out: list[Finding] = []
    for rx in INJECTION_SUCCESS:
        m = rx.search(body)
        if m:
            excerpt = body[max(0, m.start() - 20):m.end() + 60]
            out.append(Finding(sample_id, "injection_success", rx.pattern[:40], "medium", excerpt))
    # Base64-decoded payload that contains "instruct" or "system" is suspicious.
    for b64 in re.findall(r"[A-Za-z0-9+/=]{40,}", body):
        try:
            decoded = base64.b64decode(b64, validate=True).decode("utf-8", "ignore").lower()
        except (ValueError, UnicodeDecodeError):
            continue
        if "instruct" in decoded or "system prompt" in decoded:
            out.append(Finding(sample_id, "base64_payload", "decodes to instruction-like text",
                               "medium", b64[:60]))
    return out


def scan_pii_presidio(sample_id: str, body: str) -> list[Finding]:
    """Best-effort PII scan. Presidio is optional — if not installed, return []."""
    try:
        from presidio_analyzer import AnalyzerEngine  # type: ignore
    except ImportError:
        return []
    analyzer = AnalyzerEngine()
    results = analyzer.analyze(text=body, language="en")
    out: list[Finding] = []
    for r in results:
        if r.score < 0.6:
            continue
        excerpt = body[max(0, r.start - 20):r.end + 20]
        severity = "high" if r.entity_type in {"US_SSN", "CREDIT_CARD", "MEDICAL_LICENSE"} else "medium"
        out.append(Finding(sample_id, "pii", r.entity_type, severity, excerpt))
    return out


def push_metrics(pushgateway: str, result: ScanResult) -> None:
    """Push counters keyed by kind to the Prometheus pushgateway."""
    lines = ["# TYPE llm_output_scan_findings_total counter"]
    for kind, n in result.by_kind.items():
        lines.append(f'llm_output_scan_findings_total{{kind="{kind}"}} {n}')
    lines.append(f"# TYPE llm_output_scan_samples_total counter")
    lines.append(f"llm_output_scan_samples_total {result.total}")
    body = "\n".join(lines) + "\n"
    requests.post(f"{pushgateway}/metrics/job/llm-output-scan", data=body, timeout=10).raise_for_status()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--loki-url", default=os.getenv("LOKI_URL", "http://loki-gateway.observability:3100"))
    ap.add_argument("--pushgateway", default=os.getenv("PUSHGATEWAY", "http://prometheus-pushgateway.observability:9091"))
    ap.add_argument("--query", default='{app="inference-gateway", message_type="response"} | json')
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--hours", type=int, default=1)
    ap.add_argument("--json", action="store_true", help="Emit findings as JSON on stdout")
    ap.add_argument("--no-push", action="store_true", help="Skip the Prometheus push (useful for local runs)")
    args = ap.parse_args()

    result = ScanResult()
    try:
        for sample in fetch_samples(args.loki_url, args.query, args.limit, args.hours):
            result.total += 1
            body = sample["response"] or ""
            for f in (*scan_secrets(sample["id"], body),
                      *scan_injection_success(sample["id"], body),
                      *scan_pii_presidio(sample["id"], body)):
                result.findings.append(f)
                result.by_kind[f.detail] = result.by_kind.get(f.detail, 0) + 1
    except requests.RequestException as e:
        print(f"loki query failed: {e}", file=sys.stderr)
        return 2

    if not args.no_push:
        try:
            push_metrics(args.pushgateway, result)
        except requests.RequestException as e:
            print(f"pushgateway failed (continuing): {e}", file=sys.stderr)

    if args.json:
        print(json.dumps({
            "total": result.total,
            "by_kind": result.by_kind,
            "findings": [f.__dict__ for f in result.findings],
        }, indent=2))
    else:
        print(f"scanned={result.total}  findings={len(result.findings)}")
        for kind, n in sorted(result.by_kind.items(), key=lambda x: -x[1]):
            print(f"  {kind}: {n}")

    high = [f for f in result.findings if f.severity == "high"]
    return 1 if high else 0


if __name__ == "__main__":
    sys.exit(main())
