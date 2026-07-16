# Operational hygiene — the recurring work, on a cadence

Patching, CVE remediation, secrets rotation, dependency updates, and cloud maintenance are not projects; they're a cadence. This document is the schedule, the SLAs, and where each mechanism lives. If a task here relies on someone remembering it, that's a bug in this document.

The principle: **automate the boring 90%, calendar the deliberate 10%, alert on the drift.**

## The cadence at a glance

| What | Cadence | Mechanism | Human decision? |
|---|---|---|---|
| AKS control-plane patch versions | Weekly window (Sun 02:00 UTC) | `automatic_upgrade_channel = "patch"` ([`terraform/azure/main.tf`](../../terraform/azure/main.tf)) | No |
| Node OS CVEs (kernel, containerd, CVE-bearing node images) | Weekly window (Sun 06:00 UTC) | `node_os_upgrade_channel = "NodeImage"` | No |
| Kubernetes minor upgrades | Quarterly, deliberate | PR bumping `kubernetes_version` in Terraform; staging soak first | Yes — release notes, deprecation scan (`kubectl deprecations` / Pluto), then prod |
| Base image refresh | Weekly rebuild | CI rebuilds service images on a schedule even with no code change, so OS-layer fixes land without waiting for a feature PR | No |
| Application dependencies | Weekly PR batch | Renovate/Dependabot PRs, auto-merged when tests pass for patch bumps; human review for majors | Majors only |
| Container CVE scanning | Every PR + nightly sweep of *deployed* digests | Trivy in [`infra-ci.yml`](../../.github/workflows/infra-ci.yml) / [`service-image-ci.yml`](../../.github/workflows/service-image-ci.yml); nightly job re-scans what's actually running, because images rot after they ship | Only when a fix needs a major bump |
| Secrets rotation | Per-class TTL (below) | Key Vault write → ESO propagates; `ExternalSecret` sync status is the observability | Rotation itself no; TTL exceptions yes |
| Image signing keys | Keyless (cosign + OIDC) — nothing to rotate | Sigstore certificate is per-build and short-lived | No |
| Platform components (ArgoCD, KEDA, ESO, ARC, OTel, GPU operator) | Monthly review | Renovate tracks chart/operator versions; one batching PR a month | Yes — read changelogs, one component at a time |
| Cloud maintenance events (Azure planned maintenance, spot evictions) | Continuous | Scheduled Events surfaced to drain pods; maintenance windows constrain when Azure acts | No |

## CVE remediation SLAs

Severity is Trivy's, adjusted by exposure (internet-facing or PHI-adjacent workloads take the stricter interpretation):

| Severity | Exploit known / KEV-listed | SLA |
|---|---|---|
| Critical | yes | 48 hours |
| Critical | no | 7 days |
| High | — | 14 days |
| Medium | — | next monthly batch |
| Low | — | opportunistic (next rebuild picks it up) |

Rules that make the SLAs workable:

- **The clock starts at detection**, and detection is automated (nightly deployed-digest sweep), so "we didn't know" caps at 24h.
- **A CVE with no fixed version** gets a documented `.trivyignore` entry with an expiry date — never an open-ended suppression. Expired entries fail CI, which is the mechanism that forces re-triage.
- **Remediation = the fixed digest is running**, not "a PR exists." The GitOps trail (image PR → ArgoCD sync) is the evidence an auditor sees.
- Vulnerabilities in *unreachable* code paths can be downgraded one tier, but the reachability argument goes in the ignore-file comment, not in someone's head.

## Secrets rotation TTLs

Everything flows Key Vault → External Secrets Operator → Kubernetes Secret, so a rotation is one Key Vault write plus bounded propagation (ESO `refreshInterval`, 1h default). No secret is hand-placed in a cluster.

| Class | TTL | Notes |
|---|---|---|
| Cloud → workload identity | n/a | Federated Workload Identity: no long-lived credential exists. This is the answer wherever possible |
| Database credentials | 90 days | Rotate as user-pair swap (create new, flip ESO reference, drop old) to avoid a restart stampede |
| Third-party API keys (LLM providers, telephony) | 90 days, or provider max | Where the provider supports dual active keys, rotate with overlap |
| GitHub App key for ARC runners | 6 months | Installation-scoped app, not a PAT ([`platform/arc/`](../../platform/arc/)) |
| TLS (ingress) | Automated | cert-manager renews at 2/3 lifetime; alert if a cert is within 14 days of expiry — that means renewal is failing |
| Break-glass cluster credential | 30-day check | Sealed, audited on use; the *check* rotates, the credential rotates on any use or personnel change |

The alert that matters: `ExternalSecret` not synced within 2× its refresh interval. That's rotation failing silently — the failure mode that turns a routine rotation into an outage three weeks later when a pod finally restarts.

## Why the split between "automatic" and "deliberate"

Patch-level updates are monotonic bug/CVE fixes with strong compatibility guarantees; batching them behind a human review adds latency and no safety. Minor upgrades and platform-component majors change behavior — API removals, default flips, CRD migrations. Those get a human, a changelog read, and a staging soak, on a *calendar* so they can't silently accumulate. Running three minors behind isn't a stability strategy; it's deferred risk with interest — the upgrade you eventually can't avoid is the one with the biggest blast radius.

The weekend maintenance windows are deliberately when on-call is quiet-but-reachable. Auto-upgrade failures (typically PDB-blocked drains) page through the normal alert path — see [`docs/runbooks/aks-node-patching.md`](../runbooks/aks-node-patching.md).

## Evidence, for free

Because every mechanism above is either Terraform, CI, or GitOps, the compliance evidence is a byproduct:

- "Show me your patching policy" → `terraform/azure/main.tf` upgrade channels + this doc.
- "Show me this CVE was remediated" → the Trivy SARIF in code-scanning, the image-bump PR, the ArgoCD sync.
- "Show me your last secrets rotation" → Key Vault versioning + `ExternalSecret` status history.
- "Who approved the last cluster upgrade" → the PR.

The anti-pattern this replaces is the quarterly spreadsheet safari. If evidence collection takes more than an hour, the mechanism — not the auditor — is the problem.
