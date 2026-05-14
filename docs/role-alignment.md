# Role alignment — Senior DevOps Engineer (AI Engineering & Research)

This document maps each line of the role brief to concrete evidence in this repo. It's the interview cheat sheet: every responsibility, required skill, and "plus" is paired with a file you can open during the conversation.

The platform exists to support a research-to-production AI team building **T2S** — an evaluation and simulation platform for AI agents — and adjacent LLM data pipelines. Everything below is in service of that.

---

## Key responsibilities

### Infrastructure as Code (IaC)

> Design, build, and maintain scalable cloud infrastructure using Terraform or CloudFormation.

- Multi-cloud Terraform under [`terraform/`](../terraform/) — separate roots for [`aws/`](../terraform/aws/), [`gcp/`](../terraform/gcp/), and [`azure/`](../terraform/azure/).
- ADR-007: [why one repo with three cloud roots beats one root with cloud conditionals](decisions/007-multi-cloud-terraform.md).
- CI plans all three clouds on every PR ([`infra-ci.yml`](../.github/workflows/infra-ci.yml) and [`ci/.github/workflows/terraform.yml`](../ci/.github/workflows/terraform.yml)) so drift between clouds is visible at review time.
- AWS root provisions EKS + GPU node group + Karpenter + IRSA; GCP root provisions GKE + GPU node pool + Workload Identity; Azure root provisions AKS + GPU spot pool + Workload Identity.

### Kubernetes orchestration

> Manage and optimize secure Kubernetes clusters, specifically for hosting data-heavy React/Node.js applications and Python-based AI services.

- The T2S service group is the explicit React/Node + Python pattern: [`workloads/t2s-platform/`](../workloads/t2s-platform/) (`t2s-ui` is React/Next, `t2s-api` is Python, `t2s-worker` is Python).
- ADR-008: [why we ship the service group as one ArgoCD application with independent rollouts](decisions/008-t2s-service-group.md).
- Voice tier sits beside it in [`workloads/voice-agent/`](../workloads/voice-agent/) — separate worker pool because RTC sessions don't scale like SQS consumers.
- Secure defaults everywhere: Pod-Security `restricted`, `runAsNonRoot`, `readOnlyRootFilesystem`, `capabilities: drop: [ALL]`, IRSA / WI for cloud auth, default-deny NetworkPolicies.

### CI/CD pipeline development

> Build and automate robust deployment pipelines to ensure rapid, high-frequency releases for the T2S platform.

- Service image CI: [`.github/workflows/service-image-ci.yml`](../.github/workflows/service-image-ci.yml) — build, cosign-sign, SBOM-attest, push.
- T2S release: [`.github/workflows/t2s-release.yml`](../.github/workflows/t2s-release.yml) — environment promotion across `dev` / `staging` / `prod` for the `t2s-api` / `t2s-worker` / `t2s-ui` group.
- Model release: [`.github/workflows/model-release.yml`](../.github/workflows/model-release.yml) — separate pipeline for model artifacts (validate → promote → smoke-eval).
- ArgoCD GitOps + Argo Rollouts canary with `AnalysisTemplate` SLO gating — see [`workloads/llm-serving/helm/templates/rollout.yaml`](../workloads/llm-serving/helm/templates/rollout.yaml).
- Path from commit to production: code merge → image built/signed → values file PR → ArgoCD sync → Argo Rollouts canary → analysis → promote-or-rollback. Total time end-to-end is 10–20 minutes (canary bake periods dominate, not the pipeline).

### MLOps support

> Collaborate with AI scientists to streamline the deployment of LLM and RLHF workflows, managing the infrastructure required for model evaluation and simulation.

- vLLM serving in [`workloads/llm-serving/`](../workloads/llm-serving/), KServe for traditional ML in [`workloads/kserve-models/`](../workloads/kserve-models/).
- Model registry: [`workloads/model-registry/`](../workloads/model-registry/) — content-addressed digests in object storage, cosign-signed.
- Eval pipeline: [`workloads/eval-platform/`](../workloads/eval-platform/) — Argo Workflows running `lm-eval-harness`.
- MLflow tracking server in [`platform/mlflow/`](../platform/mlflow/) — experiment metadata and lineage.
- Voice-agent simulation in [`workloads/voice-agent/`](../workloads/voice-agent/) — the literal example from the role brief.

### Security & compliance

> Implement security best practices (OWASP, IAM roles) to ensure data privacy within our annotation and video surveillance tools.

- [`docs/security/owasp-posture.md`](security/owasp-posture.md) — OWASP Top 10 (web app) and OWASP Kubernetes Top 10 each mapped to where the control lives in this repo.
- IRSA on AWS, Workload Identity on GCP/Azure — no long-lived cloud keys in any pod. Pattern is in [`workloads/voice-agent/worker.yaml`](../workloads/voice-agent/worker.yaml).
- Default-deny NetworkPolicies on every workload namespace, with explicit egress to observability + cloud APIs only. IMDS blocked at the egress allow-list to prevent SSRF.
- Container scanning: Trivy `fs` + `config` + `image`, gitleaks for credentials, Semgrep with `p/kubernetes` and `p/r2c-security-audit` rulesets. Wired in [`ci/.github/workflows/security-scan.yml`](../ci/.github/workflows/security-scan.yml).
- External Secrets Operator pulls from cloud secret managers — no raw `Secret` lives in Git.

### Monitoring & observability

> Establish deep visibility into system performance and cost-tracking for cloud resources.

- OTel Collector → Prometheus + Loki + Tempo → Grafana ([`platform/observability/`](../platform/observability/)). ADR-005 explains [why one ingestion point](decisions/005-otel-collector.md).
- LLM-specific dashboards: TTFT, TPOT, tokens/sec, KV-cache util, queue depth ([`observability/dashboards/llm-serving.json`](../observability/dashboards/llm-serving.json)).
- T2S-specific signals: API latency, queue age, worker utilization, Redis pressure, Postgres saturation, S3 throughput, eval pass rate ([`observability/alerts/t2s-platform.yaml`](../observability/alerts/t2s-platform.yaml) + [`observability/slo/t2s-slo.yaml`](../observability/slo/t2s-slo.yaml)).
- Cost: every cloud resource tagged with `team` / `env` / `workload` / `cost-center`, joined to OpenCost allocation in the cost dashboard ([`observability/dashboards/cost.json`](../observability/dashboards/cost.json)). Python report in [`scripts/python/cost_report.py`](../scripts/python/cost_report.py).

---

## Required skills

| JD line | Evidence |
|---|---|
| 6+ years DevOps/SRE in cloud-native environments | Whole repo is the artifact; the [`docs/onboarding/`](onboarding/) directory is built specifically to show senior-level operating principles, scaling judgement, and architectural reasoning. |
| Expert Kubernetes (cluster security, networking, scaling) | Pod-Security, NetworkPolicies on every workload, Karpenter / GKE NAP / AKS spot pools, KEDA on queue + GPU util + custom Prometheus signals. ADR-002, ADR-003. |
| Strong Python and shell scripting | Operational Python under [`scripts/python/`](../scripts/python/) — SQS audit, cost report, model artifact validation, GPU utilization report, SLO burn check. Shell scripts in [`scripts/`](../scripts/) for orchestration. |
| Hands-on AWS / GCP / Azure | All three Terraform roots are real and CI-tested. ADR-007 covers the trade-offs of the multi-cloud abstraction. |
| IaC mastery (Terraform, Pulumi, similar) | Terraform with explicit module separation, drift detection via plan-on-every-PR. |
| Security mindset, K8s + container scanning | See OWASP doc above. Trivy + gitleaks + Semgrep wired into CI. |

---

## Plusses

| JD line | Evidence |
|---|---|
| Supporting ML/AI teams / GPU-accelerated workloads | NVIDIA GPU Operator config, MIG + time-slicing in [`platform/nvidia-gpu-operator/`](../platform/nvidia-gpu-operator/), DCGM-exporter scraped into Prom, Karpenter NodePool for GPU bursts ([`platform/karpenter/nodepool-gpu.yaml`](../platform/karpenter/nodepool-gpu.yaml)). |
| MLOps tools (Kubeflow, MLflow, W&B) | MLflow tracking server in [`platform/mlflow/`](../platform/mlflow/) with rationale for choosing it over W&B and Kubeflow Pipelines. |
| Vector databases / high-scale data processing | Qdrant cluster in [`workloads/vector-db/`](../workloads/vector-db/) — 3-replica StatefulSet, NetworkPolicy, nightly S3 snapshot. Ray-based ETL pipeline in [`workloads/data-pipeline/`](../workloads/data-pipeline/). |
| Automating simulation environments / sandboxes | Voice-agent simulation tier with persona configmaps in [`workloads/voice-agent/`](../workloads/voice-agent/). Eval suites in [`workloads/eval-platform/`](../workloads/eval-platform/). |

---

## Top 3 technical execution responsibilities

### 1. CI/CD pipelines and deployment infrastructure for the `t2s-{api,worker,ui}` service group

- Service image CI signs and SBOMs every image ([`.github/workflows/service-image-ci.yml`](../.github/workflows/service-image-ci.yml)).
- Environment promotion lives in [`.github/workflows/t2s-release.yml`](../.github/workflows/t2s-release.yml).
- Model artifact versioning: content-addressed digests, cosign-signed, promoted by PR — see [`scripts/promote-model.sh`](../scripts/promote-model.sh) and [ADR-004](decisions/004-model-artifacts.md).
- Rollback strategy: GitOps means rollback is `git revert`. Argo Rollouts auto-aborts a canary that fails its `AnalysisTemplate` and re-routes to stable.

### 2. Observability stack — metrics, logs, alerts, dashboards, on-call

- Stack: OTel Collector → Prom + Loki + Tempo → Grafana.
- Instrumentation for T2S-specific signals (API latency, queue depth + age, worker utilization, Redis, Postgres, S3 throughput, eval pass rate) lives in [`observability/alerts/t2s-platform.yaml`](../observability/alerts/t2s-platform.yaml).
- Voice-specific signals (`voice_call_active_count`, `voice_asr_confidence`, `voice_audio_artifact_upload_seconds`) in [`workloads/voice-agent/prometheusrule.yaml`](../workloads/voice-agent/prometheusrule.yaml).
- Runbooks for every paging alert: [`docs/runbooks/`](runbooks/) — `inference-latency-spike`, `t2s-queue-backlog`, `gpu-node-not-ready`, `model-rollback`, `cost-spike`.

### 3. Infrastructure reliability, scaling, and cost optimization

- Bursty eval workloads scale on SQS depth + age via KEDA ([`workloads/t2s-platform/worker.yaml`](../workloads/t2s-platform/worker.yaml)).
- GPU bursts scale via Karpenter on AWS / GKE NAP on GCP / AKS spot pool on Azure. Sub-minute provisioning of spot GPU capacity — ADR-002.
- Cost levers documented in [`docs/runbooks/cost-spike.md`](runbooks/cost-spike.md): spot pools, scale-to-zero on idle dev models, request coalescing at the gateway, FinOps tags joined to OpenCost.
- Capacity planning playbook for "10× more eval throughput next quarter" lives in [`docs/onboarding/scaling-playbook.md`](onboarding/scaling-playbook.md).

---

## What makes this role senior — three things, none of them people management

### 1. Autonomy & ownership

- ADRs in [`docs/decisions/`](decisions/) are the receipts. Each one names a decision the platform owner made (often without a textbook answer) and the conditions that would flip it.
- The "what's NOT in here" section of the [top-level README](../README.md) names the missing pieces that future-them needs to decide on — explicit ownership of the gaps, not pretending they aren't there.

### 2. Technical judgement under ambiguity

- [`docs/onboarding/scaling-playbook.md`](onboarding/scaling-playbook.md) is the worked example: how to respond to "can we run 10× more evals?" without breaking either budget or reliability.
- [`docs/runbooks/`](runbooks/) is the other side: incident response under partial information.
- Trade-offs called out explicitly in ADRs (KEDA *and* HPA, ArgoCD *over* Flux, Qdrant *over* pgvector) — not the answer is X, but the answer is X *under these conditions*.

### 3. Cross-functional influence

- [`docs/onboarding/operating-principles.md`](onboarding/operating-principles.md) Principle 3 is the explicit answer to "push back on research asks that won't scale."
- Voice-agent doc ([`docs/onboarding/voice-agent-infra.md`](onboarding/voice-agent-infra.md)) is a worked translation: research goals (configurable personas, soft-real-time SLAs) into infrastructure (separate worker tier, KEDA on active calls, longer cooldowns, drain-on-rollout).
- The first-90-days plan ([`docs/onboarding/first-90-days.md`](onboarding/first-90-days.md)) shows how the engineer is expected to land — listening before changing — which is itself a cross-functional posture.

---

## Industry-translation notes (the brief lists adjacencies)

The brief calls out fintech, ad-tech, video/audio streaming, genomics, IoT, gaming. The common thread is "high-throughput data pipelines with tight reliability and latency requirements." This repo's translation surface:

- Real-time evaluation + RTC voice sessions → low-latency request handling under bursty load (same shape as ad-tech RTB or HFT order paths).
- Long-running GPU eval cycles → batch + real-time hybrid workloads (same shape as genomics pipelines).
- SQS/worker pattern → queue-based architecture (same as IoT telemetry ingestion).
- Bursty GPU autoscaling → unpredictable load (same as gaming live-service spike traffic).

The point isn't that this repo is any of those industries — it's that the *operational primitives are the same*, and someone fluent in one can read this repo and see their patterns.
