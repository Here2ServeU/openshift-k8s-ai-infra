# k8s-ai-ml-infra

> **A production-grade Kubernetes platform for serving, evaluating, and operating LLMs and ML models at scale — runs on AWS, GCP, Azure, or your laptop.**

This repo is a working reference architecture for the infrastructure problems you hit when you take models from research to production: GPU scheduling, sub-second autoscaling on bursty traffic, high-frequency model releases, end-to-end observability, and cost control on expensive accelerator fleets.

The same manifests deploy locally on `kind` (for development and demos), on AWS EKS, on GCP GKE, or on Azure AKS. Cloud differences live behind Terraform modules; the workload layer is portable.

---

## What it demonstrates

| Pillar | What's in here |
|---|---|
| **Kubernetes for AI workloads** | NVIDIA GPU Operator, MIG/time-slicing, node pools with taints/tolerations, topology-aware scheduling, RuntimeClass for vLLM |
| **CI/CD for high-frequency releases** | GitHub Actions → OCI image build (cosign-signed, SBOM) → ArgoCD GitOps → Argo Rollouts canary with SLO-gated promotion |
| **Observability** | OpenTelemetry Collector → Prometheus + Loki + Tempo → Grafana. LLM-specific dashboards (TTFT, TPOT, tokens/sec, KV-cache util, queue depth) |
| **Scaling & reliability** | KEDA on queue depth + GPU util; Karpenter (AWS) / GKE node auto-provisioning for spot GPU bursts; PDBs + topology spread; multi-burn-rate SLO alerts |
| **Cost optimization** | Spot GPU node pools, scale-to-zero for off-hours dev models, request-coalescing at gateway, FinOps tags on every resource, OpenCost dashboards |
| **End-to-end LLM workflows** | vLLM serving, KServe for traditional ML, model registry (S3/GCS, content-addressed), Argo Workflows for eval (`lm-eval-harness`), inference gateway with routing/guardrails |
| **Everse-style platform ops** | React/Node UI + Python API + queue-backed evaluation workers, SQS/KEDA scaling, Postgres/Redis/S3 dependencies, service-group promotion |

---

## Architecture

```
                       ┌─────────────────────────────────────────────────────┐
   User / SDK ─────────►│  Ingress (NGINX) ──► Inference Gateway              │
                       │     • auth, rate limit, request shape validation     │
                       │     • A/B + canary routing, prompt guardrails        │
                       └─────────────────┬───────────────────────────────────┘
                                         │
                ┌────────────────────────┼───────────────────────────┐
                ▼                        ▼                           ▼
        ┌──────────────┐         ┌──────────────┐           ┌──────────────┐
        │  vLLM        │         │  KServe      │           │  Embedding   │
        │  (LLM serve) │         │  (sklearn,   │           │  Service     │
        │  Continuous  │         │   PyTorch,   │           │  (text-      │
        │  batching,   │         │   ONNX)      │           │   embed-3)   │
        │  PagedAttn   │         │              │           │              │
        └──────┬───────┘         └──────┬───────┘           └──────┬───────┘
               │                        │                          │
               ▼                        ▼                          ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │  Model Registry  —  S3 / GCS, content-addressed (sha256 digest)       │
    │  • init-container pulls + verifies signature on pod start             │
    │  • promote via PR: registry/<model>/<digest>  →  prod                 │
    └──────────────────────────────────────────────────────────────────────┘
                                         │
                                         │  scrape / push
                                         ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │  OTel Collector  ──►  Prometheus (metrics) + Loki (logs) + Tempo     │
    │                                              (traces) ──► Grafana    │
    └──────────────────────────────────────────────────────────────────────┘

  Control plane:                Autoscaling:                  Eval & data:
  • ArgoCD (GitOps)             • HPA (CPU)                   • Argo Workflows
  • Argo Rollouts (canary)      • KEDA (queue depth, GPU util) • lm-eval-harness
  • cert-manager + ESO          • Karpenter / GKE NAP (nodes)  • Ray (batch ETL)
```

See [`docs/architecture.md`](docs/architecture.md) for the long form, and [`docs/decisions/`](docs/decisions/) for the rationale on individual choices (vLLM vs TGI, Karpenter vs cluster-autoscaler, ArgoCD vs Flux, etc.).

---

## Quickstart — run it on your laptop

Requires Docker, `kind`, `kubectl`, `helm`, `make`, ~16GB RAM.

```bash
make local-up        # provision kind cluster + install platform + workloads
make demo            # port-forward LLM gateway, run a sample chat completion
make load-test       # k6 burst test against the LLM endpoint
make dashboards      # open Grafana with the LLM serving dashboard pre-loaded
make local-down
```

The local stack runs a small open-weights model (TinyLlama by default) on CPU so no GPU is required. Set `GPU=1` to use vLLM with CUDA if you have one.

## Quickstart — deploy to AWS

```bash
cd terraform/aws
terraform init && terraform apply           # EKS + GPU node group + Karpenter + IRSA
aws eks update-kubeconfig --name ai-ml-infra
make platform-up                            # ArgoCD bootstraps everything else
```

## Quickstart — deploy to GCP

```bash
cd terraform/gcp
terraform init && terraform apply           # GKE + GPU node pool + Workload Identity
gcloud container clusters get-credentials ai-ml-infra
make platform-up
```

## Quickstart — deploy to Azure

```bash
cd terraform/azure
terraform init && terraform apply           # AKS + GPU spot node pool + Workload Identity
az aks get-credentials --resource-group ai-ml-infra-rg --name ai-ml-infra
make platform-up
```

---

## Repo layout

```
.
├── README.md                       # you are here
├── .github/workflows/              # Image build/sign, Terraform checks, service/model promotion
├── Makefile                        # top-level entry points (local-up, demo, load-test, ...)
├── docs/
│   ├── architecture.md             # detailed system design
│   ├── decisions/                  # ADRs — why we chose X over Y
│   ├── interview/                  # role-specific talk tracks and prep notes
│   ├── runbooks/                   # oncall playbooks for common incidents
│   └── diagrams/
├── terraform/
│   ├── aws/                        # EKS, VPC, IRSA, S3 model bucket, Karpenter
│   ├── gcp/                        # GKE, VPC, Workload Identity, GCS model bucket
│   ├── azure/                      # AKS, VNet, Workload Identity, Blob model storage
│   └── modules/                    # shared abstractions
├── local/                          # kind cluster config + bootstrap
├── platform/                       # cluster-scoped components (installed once per cluster)
│   ├── argocd/                     # app-of-apps root
│   ├── cert-manager/
│   ├── ingress-nginx/
│   ├── external-secrets/
│   ├── karpenter/                  # AWS only — node autoscaling
│   ├── keda/                       # event-driven workload autoscaling
│   ├── kube-prometheus-stack/      # Prom + Grafana + Alertmanager
│   ├── loki/                       # logs
│   ├── tempo/                      # traces
│   ├── opentelemetry-collector/    # single ingestion point
│   ├── nvidia-gpu-operator/        # device plugin, MIG, DCGM exporter
│   ├── argo-workflows/             # for eval + data jobs
│   ├── argo-rollouts/              # progressive delivery
│   └── kserve/
├── workloads/
│   ├── llm-serving/                # vLLM Helm chart + Rollout
│   ├── kserve-models/              # traditional ML inference services
│   ├── inference-gateway/          # Envoy-based routing + guardrails
│   ├── eval-platform/              # lm-eval-harness as Argo Workflow
│   ├── everse-platform/            # UI/API/worker service group for AI-agent evals
│   ├── data-pipeline/              # high-throughput Ray/Argo ETL example
│   └── model-registry/             # S3/GCS-backed registry + signing
├── observability/
│   ├── dashboards/                 # Grafana JSON — LLM serving, GPU fleet, cost, SLO
│   ├── alerts/                     # PrometheusRule CRDs (multi-burn-rate)
│   └── slo/                        # Sloth SLO definitions
├── ci/                             # policy configuration used by GitHub Actions
└── scripts/                        # demo.sh, load-test.sh, cost-report.sh
```

---

## Why this design

A few non-obvious calls are documented as ADRs in [`docs/decisions/`](docs/decisions/):

- [**ADR-001**: vLLM as the LLM serving runtime](docs/decisions/001-vllm-runtime.md) — continuous batching + PagedAttention give a ~3× throughput edge over naive HF Transformers for the open-weights models we target. TGI was a close second; the trade-offs are spelled out.
- [**ADR-002**: Karpenter for GPU node autoscaling](docs/decisions/002-karpenter-gpu-autoscaling.md) — sub-minute provisioning of spot GPU instances on bursty traffic, vs. cluster-autoscaler's ASG round-trip.
- [**ADR-003**: KEDA on top of HPA](docs/decisions/003-keda-queue-scaling.md) — token-generation latency is dominated by queue depth, not CPU. KEDA scales on Prom queries against `vllm_pending_requests`.
- [**ADR-004**: Content-addressed model artifacts in object storage](docs/decisions/004-model-artifacts.md) — why not the OCI registry, and how we get reproducible model deploys with signed digests.
- [**ADR-005**: OpenTelemetry Collector as the single ingestion point](docs/decisions/005-otel-collector.md) — one agent, three backends, vendor-portable instrumentation.
- [**ADR-006**: ArgoCD over Flux + Argo Rollouts for progressive delivery](docs/decisions/006-argocd-rollouts.md)
- [**ADR-007**: Terraform abstraction for multi-cloud portability](docs/decisions/007-multi-cloud-terraform.md)

---

## SLOs

The platform ships with SLOs and multi-burn-rate alerts (Google SRE workbook style) for the LLM serving path:

| SLO | Target | Window |
|---|---|---|
| `llm_availability` — non-5xx responses | 99.5% | 30d rolling |
| `llm_ttft_p95` — time to first token | < 500 ms | 30d rolling |
| `llm_e2e_p95` — full response latency at 256 tokens | < 8 s | 30d rolling |
| `gpu_fleet_availability` | 99.9% | 30d rolling |

Alerts fire on a 2% / 5% / 10% error-budget burn matrix. See [`observability/slo/`](observability/slo/) and the runbook in [`docs/runbooks/inference-latency-spike.md`](docs/runbooks/inference-latency-spike.md).

---

## Cost story

Every cloud resource is tagged with `team`, `env`, `workload`, `cost-center`. The cost dashboard in Grafana joins those tags with OpenCost's per-pod allocation data so you can answer "what does it cost to serve TinyLlama for a week?" or "which model has the worst $/1M tokens?".

Spot GPU pools, scale-to-zero on dev models (KEDA `cooldownPeriod`), and request coalescing at the gateway are the biggest levers. See [`docs/runbooks/cost-spike.md`](docs/runbooks/cost-spike.md) for the response playbook.

---

## What's NOT in here

Be honest with yourself in interviews — call out what's stubbed vs. real:

- **No real authn/authz** beyond a placeholder JWT validator at the gateway. Wire this to your IdP (Okta, Auth0, Cognito) in a real deployment.
- **No production secrets** — External Secrets Operator is installed but configured to read from a local mock backend; swap to AWS Secrets Manager / GCP Secret Manager.
- **Eval suite is a sample** — `lm-eval-harness` runs on a tiny subset for demo speed. Real eval suites take hours per model.
- **No multi-tenancy** — single-namespace-per-workload model. vCluster or Capsule would be the next step.

---

## Onboarding

New to the team? Start in [`docs/onboarding/`](docs/onboarding/). The folder is the working introduction to the Everse platform — what it is, how it's built, what's already been decided, and where the load-bearing pieces are.

- [`README.md`](docs/onboarding/README.md) — 60-second platform pitch, responsibility map, FAQ for new platform engineers.
- [`first-90-days.md`](docs/onboarding/first-90-days.md) — what we expect you to focus on in your first 30/60/90 days.
- [`architecture-decisions.md`](docs/onboarding/architecture-decisions.md) — ten architectural calls you're inheriting, with reasoning and the conditions that would flip them.
- [`operating-principles.md`](docs/onboarding/operating-principles.md) — how we operate the platform day-to-day: ownership, judgment, cross-functional influence, on-call.
- [`voice-agent-infra.md`](docs/onboarding/voice-agent-infra.md) — how the voice/text agent simulation layer sits on Kubernetes.
- [`scaling-playbook.md`](docs/onboarding/scaling-playbook.md) — how we plan capacity changes (e.g. supporting 10× eval throughput).

### Where to look for specific topics

- **Running Everse on Kubernetes** → [`workloads/everse-platform/`](workloads/everse-platform/) + [`docs/onboarding/README.md`](docs/onboarding/README.md) + [ADR-008](docs/decisions/008-everse-service-group.md)
- **CI/CD from commit to production** → [`.github/workflows/service-image-ci.yml`](.github/workflows/service-image-ci.yml) + [`.github/workflows/everse-release.yml`](.github/workflows/everse-release.yml)
- **Autoscaling GPU workloads** → [`platform/keda/scaledobject-vllm.yaml`](platform/keda/scaledobject-vllm.yaml) + ADR-003
- **Canary model deploys** → [`workloads/llm-serving/helm/templates/rollout.yaml`](workloads/llm-serving/helm/templates/rollout.yaml) (Argo Rollout with SLO-gated analysis template)
- **LLM-serving observability** → [`observability/dashboards/llm-serving.json`](observability/dashboards/llm-serving.json) and ADR-005
- **Cloud cost on GPU fleets** → ADR-002 + [`docs/runbooks/cost-spike.md`](docs/runbooks/cost-spike.md)
- **Model-release pipeline** → [`.github/workflows/model-release.yml`](.github/workflows/model-release.yml) + [`workloads/model-registry/README.md`](workloads/model-registry/README.md)
- **Everse SLOs** → [`observability/slo/everse-slo.yaml`](observability/slo/everse-slo.yaml) (API availability, API latency, queue freshness, eval success rate)
- **Everse queue backlog incident** → [`docs/runbooks/everse-queue-backlog.md`](docs/runbooks/everse-queue-backlog.md)
- **Pushing back on research asks** → [`docs/onboarding/operating-principles.md`](docs/onboarding/operating-principles.md) (Principle 3)
