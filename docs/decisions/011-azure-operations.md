# ADR-011: Azure-native operations for a HIPAA-regulated AI agent platform

**Status**: Accepted
**Date**: 2026-07

## Context

The platform increasingly runs AI agent workloads for clinical and enterprise-operations users — headless agents that act as intelligent workstations, integrating with enterprise applications and workflows in a high-trust healthcare environment. For that class of deployment the target is Azure (AKS), the compliance regime is HIPAA, and the operational bar is: observable, recoverable, secure, and maintainable at production scale.

That raises questions the AWS-first history of this repo didn't force us to answer:

- Do we keep the Prometheus/Loki/Tempo/Grafana stack on AKS, or move to Azure Log Analytics + Application Insights?
- Who patches what, on what cadence — AKS control plane, node OS images, base images, dependencies — and how is that evidenced for compliance?
- Where do secrets live on Azure and how do they rotate?
- Terraform is our IaC standard (ADR-007), but Azure-native teams standardize on Bicep. Do we fork?
- GitHub-hosted runners can't reach a private AKS cluster or a VNet-locked registry. What's the build path in a locked-down environment?

## Decision

### 1. Dual-export telemetry: OTel pipeline stays primary, Azure Monitor becomes a first-class sink

The OpenTelemetry Collector remains the single instrumentation point (ADR-005). On AKS we add the `azuremonitor` exporter alongside the Prometheus/Loki/Tempo exporters, plus Container Insights and AKS control-plane diagnostic settings feeding a Log Analytics workspace ([`terraform/azure/monitoring.tf`](../../terraform/azure/monitoring.tf)).

Grafana stays the operator surface for SLOs, GPU fleet, and cost. Log Analytics (KQL) is the surface for audit-grade queries, control-plane forensics, and cross-service log joins; Application Insights is the surface for agent transaction traces and dependency maps that Azure-native teams already live in.

### 2. Patching is a managed cadence, not an event

AKS auto-upgrade is set to the `patch` channel and node OS upgrades to the `NodeImage` channel, both constrained to an explicit weekend maintenance window defined in Terraform. Kubernetes minor upgrades stay a deliberate, human-run change. CVE remediation SLAs and the dependency/base-image refresh cadence are defined in [`docs/security/operational-hygiene.md`](../security/operational-hygiene.md); the pager side lives in [`docs/runbooks/aks-node-patching.md`](../runbooks/aks-node-patching.md).

### 3. Secrets live in Azure Key Vault, delivered by External Secrets Operator, rotated on schedule

Same shape as AWS/GCP: no secret material in Git or in CI variables; ESO syncs from Key Vault using Workload Identity; rotation is a calendar-driven cadence with per-class TTLs (see the hygiene doc). Application pods never mount Key Vault directly — ESO is the single choke point, so rotation is one write in Key Vault plus a bounded propagation delay.

### 4. Terraform remains the source of truth; a Bicep rendering exists on purpose

ADR-007 stands: one IaC language across clouds. But Azure-native platform teams review and extend Bicep faster than HCL, and some regulated shops mandate first-party tooling. We maintain a deliberately compact Bicep rendering of the same AKS stack ([`terraform/azure/bicep/`](../../terraform/azure/bicep/)) — same resources, same names, same outputs — as the on-ramp for those environments. It is a rendering, not a second source of truth: drift between the two is a bug in the Bicep file.

### 5. Private-environment builds run on Actions Runner Controller with Kaniko

GitHub-hosted runners stay the default for public/dev builds. For clusters with private API endpoints or VNet-locked registries, CI runs on self-hosted runner scale sets managed by Actions Runner Controller inside the cluster, and image builds use Kaniko — userspace builds, no privileged Docker daemon, compatible with the `restricted` PodSecurity/SCC posture ([`platform/arc/`](../../platform/arc/)). Images are cosign-signed either way; the signing step doesn't care which runner built the image.

## Rationale

### Dual-export instead of either/or

Replacing Prometheus with Azure Monitor would orphan every dashboard, alert rule, SLO burn query, and KEDA trigger in this repo — and managed Prometheus on Azure still speaks PromQL, so the migration would buy nothing operationally. Replacing nothing and ignoring Azure Monitor is worse: in a HIPAA environment, Log Analytics is where the audit trail has to live (immutable, RBAC'd, retention-managed, queryable by the security team without cluster access), and control-plane logs (`kube-audit`, API server) are *only* available via diagnostic settings — no in-cluster scrape can see them.

Dual-export from one OTel pipeline costs one exporter block and a workspace, and it means instrumentation decisions stay made once. The failure mode we're avoiding is two teams instrumenting the same service twice, differently.

### Managed patch cadence

The alternative — pinning versions and upgrading when someone remembers — is how clusters end up three minors behind with a support clock ticking. `patch` channel + `NodeImage` channel makes the boring 90% of patching (control-plane patch versions, node OS CVEs) automatic and *scheduled*, which is exactly what a compliance auditor wants to see: a defined cadence with a maintenance window, not heroics. Minor upgrades stay manual because they change API surface and deprecations — those need a human reading release notes, a staging soak, and PDB-aware sequencing.

### Key Vault via ESO, not CSI driver

The Secrets Store CSI driver mounts secrets per-pod, which spreads Key Vault access policy across every workload identity and makes "what can read this secret" a graph problem. ESO gives one auditable sync path, keeps the workload contract a plain Kubernetes Secret (portable across clouds — same manifests on EKS/GKE), and makes rotation observable: the `ExternalSecret` status shows the last sync, so a stuck rotation is an alert, not a mystery.

### A Bicep rendering, not a Bicep fork

Two full IaC stacks drift; that's not a risk, it's a schedule. But "we only do Terraform" is a real adoption blocker in Azure-first shops. The compromise is a small, honest Bicep file covering the same stack with a stated contract: Terraform is canonical, the Bicep rendering follows it. If an environment goes Bicep-primary, the rendering is the starting point and this ADR gets revisited.

### ARC + Kaniko for locked-down builds

Docker-in-Docker on self-hosted runners needs privileged pods — a non-starter under `restricted-v2` SCC / restricted PSA, and a bad look in a HIPAA environment regardless. Kaniko builds in userspace from a normal pod. ARC's runner scale sets give ephemeral, per-job runners (no state bleeding between builds) that scale to zero — the same queue-driven scaling posture as the rest of the platform. The hosted-runner default stays because self-hosting runners you don't need is pure operational surface.

## Consequences

### Positive

- One instrumentation pipeline feeds both the operator surface (Grafana) and the compliance/audit surface (Log Analytics), with control-plane logs captured for the first time.
- Patching has a defined, evidenced cadence — the compliance answer to "how do you patch?" is a link to Terraform and a hygiene doc, not a meeting.
- Secrets rotation is one Key Vault write with observable propagation.
- Azure-native and regulated shops have a Bicep on-ramp and a build path that works with private clusters, without forking the platform.

### Negative

- Telemetry is stored twice on AKS; Log Analytics ingestion is priced per-GB and is the main new cost. We mitigate with retention tiers (30d interactive / archive beyond) and by keeping high-cardinality LLM metrics in Prometheus only.
- The Bicep rendering is a standing maintenance obligation — every Terraform change to the Azure stack needs a matching Bicep edit, enforced by review checklist, not tooling.
- ARC is one more platform component to patch and monitor (and its runners are in-cluster workloads with registry credentials — they get the same NetworkPolicy/identity scrutiny as any service).
- Auto-upgrade means the cluster changes without a human pressing the button. The maintenance window, PDBs, and surge settings bound the blast radius; the node-patching runbook covers the failure modes.

### Edge cases

- If Azure Managed Grafana + managed Prometheus reach feature parity for our LLM dashboards, the self-hosted Grafana could collapse into it — revisit when the alerting story (multi-burn-rate rules, runbook links) is portable.
- A future multi-region AKS deployment would need Log Analytics workspace-per-region vs. central-workspace analysis — deliberately not decided here.

## Cross-references

- [ADR-005: OTel Collector](005-otel-collector.md) — the pipeline this extends
- [ADR-007: Multi-cloud Terraform](007-multi-cloud-terraform.md) — the IaC standard the Bicep rendering deliberately does not replace
- [ADR-009: AI runtime security](009-ai-runtime-security.md) — guardrails for the agent workloads this operations layer serves
- [`terraform/azure/monitoring.tf`](../../terraform/azure/monitoring.tf)
- [`docs/security/hipaa-operational-posture.md`](../security/hipaa-operational-posture.md)
- [`docs/security/operational-hygiene.md`](../security/operational-hygiene.md)
- [`docs/runbooks/aks-node-patching.md`](../runbooks/aks-node-patching.md)
- [`docs/onboarding/ai-agent-operations.md`](../onboarding/ai-agent-operations.md)
