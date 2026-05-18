# OWASP Top 10 + Kubernetes hardening posture

This document is the platform-side answer to "how do we keep an AI-evaluation platform with annotation tooling and voice-surveillance data from leaking the wrong thing?"

It maps each OWASP Top 10 (web application, 2021) category to where the controls live in this repo, plus the OWASP Kubernetes Top 10 (2022) and the Kubernetes-specific hardening this team has chosen. The point isn't checkbox compliance — the point is that on-call should be able to point to a file when an auditor asks where a control lives.

## OWASP Top 10 (web application)

| ID | Category | Where the control lives | Notes |
|---|---|---|---|
| A01 | Broken Access Control | [`workloads/inference-gateway/envoy-config.yaml`](../../workloads/inference-gateway/envoy-config.yaml) — JWT validation at the edge; per-route RBAC. Every workload has a dedicated `ServiceAccount`; no shared identities. | Annotation and surveillance tools never share the `default` SA. IRSA / Workload Identity is the only path to cloud data. |
| A02 | Cryptographic Failures | TLS at ingress via cert-manager (`platform/cert-manager/`). Object-store artifacts are signed (cosign); model digests are content-addressed. | No long-lived AWS keys in any pod — IRSA / WI annotations only. |
| A03 | Injection | Inference gateway runs prompt-injection guardrails before the model. SQL/ORM use is parameterized in the T2S API. Image inputs to annotation tools are validated server-side. | LLM-side injection is a moving target; canary lookups via the Qdrant guardrail layer in [`workloads/vector-db/`](../../workloads/vector-db/) cover known patterns. |
| A04 | Insecure Design | ADRs in [`docs/decisions/`](../decisions/) document threat trade-offs before code lands. | Specifically: ADR-004 (signed model digests) and ADR-008 (T2S service group isolation). |
| A05 | Security Misconfiguration | Trivy `config` scan in [`ci/.github/workflows/security-scan.yml`](../../ci/.github/workflows/security-scan.yml) blocks PRs on critical IaC misconfig. Pod-Security `restricted` enforced at namespace level. | Every namespace this repo provisions sets the three `pod-security.kubernetes.io/*` labels. |
| A06 | Vulnerable Components | Trivy `fs` scan on every PR. Cosign-signed images with SBOM attestation. Renovate (or Dependabot) keeps base images current. | Critical/High vulns fail the build; medium is informational. |
| A07 | Identification & Auth Failures | JWT at the gateway is a placeholder. Production wires to Okta / Auth0 / Cognito. Service-to-service auth via mTLS where a mesh is installed. | Listed explicitly under "What's NOT in here" in the top-level README so this stays visible. |
| A08 | Software & Data Integrity Failures | `scripts/python/model_artifact_validate.py` — sha256 + safetensors header + picklescan + license check before promotion. Cosign-signed images on every workload. Argo Rollouts with SLO-gated analysis blocks bad releases. | Model promotion is GitOps-mediated; rollback is `git revert`. |
| A09 | Security Logging & Monitoring Failures | OTel Collector → Prom + Loki + Tempo. Multi-burn-rate SLO alerts (Google SRE workbook style) live in [`observability/alerts/`](../../observability/alerts/). Audit logging enabled on the API server (Terraform). | Cluster audit logs ship to Loki with a 30-day retention. |
| A10 | Server-Side Request Forgery | Egress NetworkPolicies on every workload block the cloud metadata service explicitly (`except: 169.254.169.254/32`). Inference gateway disallows arbitrary URL fetches. | The IMDS block is present in [`workloads/voice-agent/networkpolicy.yaml`](../../workloads/voice-agent/networkpolicy.yaml) and [`workloads/vector-db/networkpolicy.yaml`](../../workloads/vector-db/networkpolicy.yaml). Roll the same block into new workloads. |

## OWASP Kubernetes Top 10 (2022)

| ID | Category | Where the control lives |
|---|---|---|
| K01 | Insecure Workload Configurations | Pod-Security `restricted` namespace labels; `runAsNonRoot`, `readOnlyRootFilesystem`, `capabilities: drop: [ALL]` on every container in this repo. |
| K02 | Supply Chain Vulnerabilities | Cosign keyless signing + SBOM attestation in `.github/workflows/service-image-ci.yml`. Trivy image scan blocks Critical/High. |
| K03 | Overly Permissive RBAC | One `ServiceAccount` per workload. ArgoCD's controller is the only thing with cluster-wide mutating permissions, and that ServiceAccount is itself bound by an `AppProject` allow-list. |
| K04 | Lack of Centralized Policy Enforcement | Trivy `config` scan in CI, plus Pod-Security admission at the namespace level. (Gatekeeper / Kyverno is the next step; deliberately deferred to keep the platform component count finite — see operating-principle 3.) |
| K05 | Inadequate Logging & Monitoring | See A09 above. |
| K06 | Broken Authentication Mechanisms | OIDC for kube-apiserver via the cloud provider's managed IdP integration (Terraform). IRSA / Workload Identity for pod-to-cloud auth — no static credentials. |
| K07 | Missing Network Segmentation | Every namespace this repo creates has a default-deny NetworkPolicy plus explicit allow-lists. The pattern is in [`workloads/t2s-platform/networkpolicy.yaml`](../../workloads/t2s-platform/networkpolicy.yaml). |
| K08 | Secrets Management Failures | External Secrets Operator pulls from AWS Secrets Manager / GCP Secret Manager / Azure Key Vault. No raw `Secret` lives in Git. |
| K09 | Misconfigured Cluster Components | etcd encryption at rest enabled in Terraform. API-server audit log enabled. Kubelet read-only port disabled. |
| K10 | Outdated and Vulnerable Kubernetes Components | Managed control planes (EKS / GKE / AKS) — version pinned in Terraform; the upgrade path is a deliberate PR. |

## Container security scanning

Three scanners, three different blast radii:

- **Trivy `fs`** — the source tree itself. Catches vulnerable dependencies in `requirements.txt`, `package.json`, etc.
- **Trivy `config`** — IaC and manifest scan over `terraform/`, `platform/`, `workloads/`. Catches `privileged: true`, missing `securityContext`, public S3 ACLs, etc.
- **Trivy `image`** — runs in the service image CI workflow. Critical/High blocks the build.

In addition: `gitleaks` for committed credentials, `semgrep` with the `p/kubernetes` and `p/r2c-security-audit` rulesets for code-pattern issues. All four upload SARIF to GitHub code-scanning so the security tab is the central view.

## What we explicitly do *not* claim

- This repo is not SOC 2 / HIPAA / ISO 27001 ready out of the box. Those frameworks need policy, vendor-management, and personnel controls this repo doesn't model.
- The OWASP MASVS controls overlap with this list but aren't fully covered (this is a server-side platform, not a mobile surface).
- The OWASP **LLM Top 10** mapping lives in its own doc: [`llm-security-posture.md`](llm-security-posture.md). That doc covers the input guardrail (Llama Guard 2), the response-path output scanner, and the Garak red-team pipeline. The architecture rationale and Prisma AIRS / Lakera / Robust Intelligence swap path are in [ADR-009](../decisions/009-ai-runtime-security.md).
- Penetration testing is out of scope. The expectation is an annual third-party pen-test on the cluster's externally exposed surface, plus continuous internal scanning above.

## Audit trail

Three things, in order, when an auditor asks "what's the chain of custody for what's running in production?":

1. *Image* — pull the image digest; check the cosign signature; pull the SBOM attestation.
2. *Manifest* — `git log` on the values file that references the digest; the merging PR has the review history.
3. *Model* — if it's the LLM serving path, the model artifact is content-addressed; cross-reference the digest with the MLflow run.

The point of recording it in that order is that the question "what's running?" is answered by an image digest, not a Git SHA. Git tells you *what was supposed to be running*; the image digest tells you *what is*.
