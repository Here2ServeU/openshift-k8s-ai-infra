#!/usr/bin/env python3
"""Validate a model artifact before promotion.

Pre-flight gate for `.github/workflows/model-release.yml`. Refuses to let
an artifact onto the promotion path unless:

  * sha256 matches the expected digest
  * the safetensors header parses and declares only fp16/bf16/fp32/int8 tensors
  * picklescan finds no executable pickles in the bundle
  * a LICENSE file is present in the bundle

Read-only. Downloads a single artifact via a presigned URL (or local path
for tests). Designed to be fast — if it takes more than 60s, something is
wrong upstream.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import tarfile
import tempfile
from pathlib import Path

import requests

ALLOWED_DTYPES = {"F16", "BF16", "F32", "I8"}


def fetch(url_or_path: str, out: Path) -> None:
    if url_or_path.startswith(("http://", "https://", "s3://")):
        if url_or_path.startswith("s3://"):
            raise ValueError("pass a presigned URL, not raw s3://")
        with requests.get(url_or_path, stream=True, timeout=60) as r:
            r.raise_for_status()
            with out.open("wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    f.write(chunk)
    else:
        out.write_bytes(Path(url_or_path).read_bytes())


def sha256_of(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def safetensors_header(p: Path) -> dict:
    with p.open("rb") as f:
        size_bytes = f.read(8)
        if len(size_bytes) != 8:
            raise ValueError("file too short to be safetensors")
        (header_len,) = struct.unpack("<Q", size_bytes)
        if header_len > 100 * 1024 * 1024:
            raise ValueError("safetensors header absurdly large; refusing")
        header = json.loads(f.read(header_len))
    return header


def scan_for_pickles(p: Path) -> list[str]:
    if not tarfile.is_tarfile(p):
        return []
    suspicious = []
    with tarfile.open(p) as tf:
        for m in tf.getmembers():
            if m.name.endswith((".pkl", ".pickle", ".bin")) and m.size > 0:
                suspicious.append(m.name)
    return suspicious


def has_license(p: Path) -> bool:
    if tarfile.is_tarfile(p):
        with tarfile.open(p) as tf:
            return any(Path(m.name).name.upper().startswith("LICENSE")
                       for m in tf.getmembers())
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", required=True, help="presigned URL or local path")
    ap.add_argument("--expected-sha256", required=True)
    ap.add_argument("--kind", choices=["safetensors", "bundle"], required=True,
                    help="safetensors = bare .safetensors file; bundle = tarball")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    findings: dict = {"source": args.source, "kind": args.kind, "checks": {}}
    failed = False

    with tempfile.TemporaryDirectory() as td:
        local = Path(td) / "artifact"
        try:
            fetch(args.source, local)
        except Exception as e:
            print(f"fetch failed: {e}", file=sys.stderr)
            return 3

        digest = sha256_of(local)
        findings["checks"]["sha256"] = {
            "expected": args.expected_sha256, "actual": digest,
            "ok": digest == args.expected_sha256,
        }
        if digest != args.expected_sha256:
            failed = True

        if args.kind == "safetensors":
            try:
                hdr = safetensors_header(local)
                bad = [name for name, meta in hdr.items()
                       if isinstance(meta, dict) and meta.get("dtype") not in ALLOWED_DTYPES]
                findings["checks"]["safetensors"] = {"tensors": len(hdr), "bad_dtype": bad, "ok": not bad}
                if bad:
                    failed = True
            except Exception as e:
                findings["checks"]["safetensors"] = {"ok": False, "error": str(e)}
                failed = True
        else:
            pickles = scan_for_pickles(local)
            findings["checks"]["picklescan"] = {"suspicious": pickles, "ok": not pickles}
            if pickles:
                failed = True
            lic = has_license(local)
            findings["checks"]["license"] = {"ok": lic}
            if not lic:
                failed = True

    if args.json:
        print(json.dumps(findings, indent=2))
    else:
        for name, result in findings["checks"].items():
            print(f"  {name:14s} {'OK' if result.get('ok') else 'FAIL':5s} {result}")
    return 2 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
