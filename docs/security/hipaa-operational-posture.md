# HIPAA operational posture

How the platform is *operated* when the workloads on it touch PHI — AI agents supporting clinical and operational staff, eval pipelines over clinical transcripts, voice simulations of patient calls. Same spirit as [owasp-posture.md](owasp-posture.md): on-call should be able to point at a file when an auditor asks where a control lives.

**What this document is not.** HIPAA compliance is a program — BAAs, risk analysis, policies, workforce training, sanctions — that lives outside any repo. This document covers only the slice an infrastructure team owns: the HIPAA Security Rule's technical safeguards (§164.312) and the operational habits that keep them true over time. See "What we explicitly do not claim" at the bottom.

## Technical safeguards (§164.312) → where the control lives

| Safeguard | Requirement | Where the control lives | Notes |
|---|---|---|---|
| Access control §164.312(a) | Unique user identification, automatic logoff, encryption/decryption | One `ServiceAccount` per workload; Workload Identity federation instead of static keys ([`terraform/azure/main.tf`](../../terraform/azure/main.tf)); AKS AAD integration for human access with no standing cluster-admin; JWT auth at the inference gateway | "Unique user identification" applies to *agents* too: every headless agent runs as its own identity so its data access is attributable — see [ai-agent-operations.md](../onboarding/ai-agent-operations.md) |
| Audit controls §164.312(b) | Record and examine activity in systems containing ePHI | AKS control-plane diagnostics (`kube-audit-admin`, `guard`) → Log Analytics ([`terraform/azure/monitoring.tf`](../../terraform/azure/monitoring.tf)); gateway request logs with trace IDs; artifact access logging on the object store | Log Analytics is the audit surface *because* it's outside the cluster: RBAC'd separately, retention-managed, and readable by security without kubectl. Retention beyond the interactive window goes to archive tier — HIPAA documentation retention is 6 years, so set archive policy accordingly |
| Integrity §164.312(c) | Protect ePHI from improper alteration/destruction | Content-addressed model artifacts with signature verification at pod start ([ADR-004](../decisions/004-model-artifacts.md)); cosign-signed images enforced at admission; GitOps means every mutation is a reviewed commit with an author | The integrity story for *data* (Postgres, object store) is versioning + immutable audit logs; the integrity story for *code and models* is signing |
| Authentication §164.312(d) | Verify identity of persons/entities seeking access | AAD/OIDC for humans, Workload Identity for pods, GitHub App (not PATs) for CI runners ([`platform/arc/`](../../platform/arc/)) | No shared credentials anywhere is the operational rule; a shared credential is unattributable by construction |
| Transmission security §164.312(e) | Guard against unauthorized access to ePHI in transit | TLS at ingress (cert-manager); default-deny NetworkPolicy with explicit east-west allows; egress to managed services over 443 only; IMDS blocked per workload | In-cluster mTLS is listed as a gap below, honestly |

## The operational habits that keep the safeguards true

A control that was true at audit time and false three months later is worse than no control — it's a false attestation. The recurring work:

- **Patching cadence** — control-plane patch + node OS CVE remediation are automatic inside maintenance windows; minors are deliberate. Cadence and SLAs: [operational-hygiene.md](operational-hygiene.md).
- **Secrets rotation** — Key Vault + ESO with per-class TTLs; rotation is observable via `ExternalSecret` sync status. Also in the hygiene doc.
- **Access review** — quarterly diff of who/what can read PHI-adjacent stores: role assignments in Terraform are the source of truth, so the review is a `terraform plan` against reality plus a human read of the roles list.
- **Incident response** — every pageable alert has a runbook ([`docs/runbooks/`](../runbooks/)); post-incident reviews are blameless and produce either a fix, an alert change, or a runbook edit. An incident touching PHI additionally triggers the org's breach-assessment process — that decision belongs to privacy/legal, not on-call; on-call's job is to preserve evidence (don't delete pods/logs, snapshot first) and escalate.
- **Minimum necessary, applied to telemetry** — logs and traces are treated as a PHI surface. Structured logging with an explicit field allow-list at the OTel Collector (attribute processors strip free-text fields from agent spans); the response-path PII scanner ([ADR-009](../decisions/009-ai-runtime-security.md)) exists precisely because LLM output can echo PHI into places engineers read casually.

## PHI-aware defaults for AI agent workloads

The agent tier gets stricter defaults than ordinary services, because an agent that integrates with enterprise applications is a credential-rich, PHI-adjacent workload by design:

1. **Per-agent identity and scope.** Each agent type gets its own ServiceAccount, its own Workload Identity binding, and access to only the enterprise integrations it needs. "The agents" is not an identity.
2. **Every agent action is attributable.** Tool calls and integration writes carry the run/trace ID; the trace is the audit trail for "why did the system touch this record."
3. **Prompts and outputs are data, not logs.** Transcripts go to the artifact store (encrypted, access-logged, short-TTL signed URLs) — never to stdout, never to Loki/Log Analytics as free text.
4. **Guardrails on both paths.** Input-side injection screening and output-side PII/secret scanning at the gateway (ADR-009) apply to agent traffic the same as user traffic.

## What we explicitly do *not* claim

- This repo does not make a deployment HIPAA-compliant. No BAA, risk analysis, workforce policy, or physical safeguard is modeled here.
- In-cluster mTLS is not deployed (no mesh — deliberate component-count decision). East-west traffic relies on NetworkPolicy + the CNI; a PHI-heavy production deployment should revisit this.
- Field-level encryption for PHI columns and customer-managed keys for the data stores are called out in the Terraform production checklists but not wired by default.
- Log scrubbing is an allow-list plus a scanner, not a guarantee. Treat every telemetry store as if it might contain PHI when setting its access policy — because one day it will.
