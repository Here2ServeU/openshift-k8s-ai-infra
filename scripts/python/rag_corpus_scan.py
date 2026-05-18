#!/usr/bin/env python3
"""RAG corpus injection-marker scan.

Before a document is indexed into Qdrant, this script scans it for indirect
prompt-injection markers — "system:" prefixes, role tags, "Ignore previous
instructions" phrases, base64-encoded payloads, zero-width characters used
for instruction smuggling. Documents that match high-confidence patterns are
quarantined (moved to a `rag-quarantine/` prefix in the corpus bucket) and
not indexed.

This is the LLM03 (Training Data Poisoning) / LLM01 indirect-injection control
documented in docs/security/llm-security-posture.md.

Usage:
  rag_corpus_scan.py --input s3://my-corpus/raw/ --output s3://my-corpus/clean/ \
                     --quarantine s3://my-corpus/rag-quarantine/

Exit codes:
  0 — every document scanned was clean (or quarantined cleanly)
  1 — at least one document quarantined
  2 — scan failed (bucket unreachable, malformed input)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from typing import Iterable

# Patterns at high confidence — these are not natural text.
HIGH_CONF_PATTERNS = [
    (re.compile(r"<\|im_start\|>|<\|im_end\|>|<\|system\|>"), "chat_template_marker"),
    (re.compile(r"\bignore (the|my|all|your|prior|previous) (prior|previous|above|earlier) (instructions|prompts|rules)\b", re.IGNORECASE), "instruction_override"),
    (re.compile(r"\bsystem\s*:\s*you (are|must|will)\b", re.IGNORECASE), "system_prompt_injection"),
    # Zero-width characters used to smuggle instructions past human review
    (re.compile(r"[​‌‍⁠﻿]"), "zero_width_character"),
]

# Patterns at medium confidence — flag but don't quarantine on first match alone.
MED_CONF_PATTERNS = [
    (re.compile(r"\bDAN\b|\bjailbreak\b|\bsudo mode\b", re.IGNORECASE), "jailbreak_keyword"),
    (re.compile(r"```\s*(system|prompt)\b", re.IGNORECASE), "code_fence_system"),
]


@dataclass
class DocVerdict:
    doc_id: str
    clean: bool
    findings: list[tuple[str, str]] = field(default_factory=list)   # (kind, excerpt)
    confidence: str = "low"   # high | medium | low


def scan_text(doc_id: str, text: str) -> DocVerdict:
    v = DocVerdict(doc_id=doc_id, clean=True)
    for rx, kind in HIGH_CONF_PATTERNS:
        for m in rx.finditer(text):
            v.findings.append((kind, text[max(0, m.start() - 20):m.end() + 20]))
            v.confidence = "high"
            v.clean = False
    med_hits = 0
    for rx, kind in MED_CONF_PATTERNS:
        for m in rx.finditer(text):
            v.findings.append((kind, text[max(0, m.start() - 20):m.end() + 20]))
            med_hits += 1
    # Two or more medium hits = quarantine. One alone = log and pass.
    if med_hits >= 2:
        v.confidence = max(v.confidence, "medium")
        v.clean = False
    return v


def iter_docs(input_uri: str) -> Iterable[tuple[str, str]]:
    """Yield (doc_id, text) tuples from the input source.

    Supports s3:// (boto3) and local file paths. For boto3, content type is
    assumed text/plain; binary types are skipped.
    """
    if input_uri.startswith("s3://"):
        import boto3  # imported lazily so --help works without boto3
        s3 = boto3.client("s3")
        bucket, _, prefix = input_uri[5:].partition("/")
        token = None
        while True:
            kw = {"Bucket": bucket, "Prefix": prefix}
            if token:
                kw["ContinuationToken"] = token
            resp = s3.list_objects_v2(**kw)
            for obj in resp.get("Contents", []):
                key = obj["Key"]
                body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
                try:
                    yield key, body.decode("utf-8")
                except UnicodeDecodeError:
                    continue
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
    else:
        from pathlib import Path
        for p in Path(input_uri).rglob("*"):
            if p.is_file():
                try:
                    yield str(p), p.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", required=True, help="s3://bucket/prefix or local path")
    ap.add_argument("--output", help="Where clean docs go (same scheme as --input)")
    ap.add_argument("--quarantine", help="Where flagged docs go")
    ap.add_argument("--dry-run", action="store_true", help="Scan only; don't move anything")
    ap.add_argument("--json", action="store_true", help="JSON output for CI")
    args = ap.parse_args()

    verdicts: list[DocVerdict] = []
    try:
        for doc_id, text in iter_docs(args.input):
            verdicts.append(scan_text(doc_id, text))
    except Exception as e:
        print(f"scan failed: {e}", file=sys.stderr)
        return 2

    clean = [v for v in verdicts if v.clean]
    dirty = [v for v in verdicts if not v.clean]

    if args.json:
        print(json.dumps({
            "total": len(verdicts),
            "clean": len(clean),
            "quarantined": len(dirty),
            "details": [{"id": v.doc_id, "confidence": v.confidence,
                         "findings": [{"kind": k, "excerpt": e} for k, e in v.findings]}
                        for v in dirty],
        }, indent=2))
    else:
        print(f"scanned={len(verdicts)} clean={len(clean)} quarantined={len(dirty)}")
        for v in dirty[:20]:
            kinds = sorted({k for k, _ in v.findings})
            print(f"  {v.confidence:6}  {v.doc_id:60}  {','.join(kinds)}")

    if args.dry_run:
        return 1 if dirty else 0

    # Real move logic would be here. We deliberately keep it as a stub for the
    # portfolio version — the contract is the verdict, not the bucket plumbing.
    return 1 if dirty else 0


if __name__ == "__main__":
    sys.exit(main())
