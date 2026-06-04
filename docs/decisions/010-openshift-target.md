# ADR-010: OpenShift as a first-class deployment target

**Status**: Accepted
**Date**: 2026-06

## Context

The platform was built cloud-portable across EKS, GKE, AKS, and `kind` (ADR-007). A large
share of enterprise GPU/AI platforms — especially in regulated industries (healthcare,
finance, public sector) — standardize on **Red Hat OpenShift** rather than vanilla upstream
Kubernetes, because they want a supported, opinionated distribution with an integrated
security model, operator lifecycle management, and a single vendor to call at 2am.

If this platform is going to be credible for "OpenShift **and** Kubernetes platform
engineering in large-scale enterprise environments," OpenShift has to be a first-class
target with real artifacts — not a footnote that says "it's just Kubernetes, it'll work."
It mostly *will* work, but the parts that differ are exactly the parts an enterprise
platform team is hired to get right: pod security, GPU enablement on an immutable host,
operator lifecycle, and the supported ML stack.

## Decision

Support OpenShift as a peer of the existing cloud targets. The **workload layer is
unchanged**; the differences are isolated to four seams, each with explicit artifacts:

| Seam | Vanilla K8s (default) | OpenShift | Where |
|---|---|---|---|
| Component install | Helm via ArgoCD Applications | **OperatorHub Subscriptions (OLM)** | `platform/openshift/operators/` |
| GPU enablement | GPU Operator Helm chart, `driver.enabled=false` (cloud AMI ships driver) | **NFD → GPU Operator → ClusterPolicy**, `driver.enabled=true` (RHCOS builds the module via Driver Toolkit) | `platform/openshift/gpu/` |
| Pod security | Pod Security Admission `restricted` | **SCC `restricted-v2`**, no custom SCCs for app pods | `platform/openshift/scc/` |
| North-south ingress | ingress-nginx + cloud LB | **OpenShift Route** (HAProxy router, edge TLS) | `platform/openshift/routes/` |
| Provisioning | `terraform/{aws,gcp,azure}` | `terraform/rosa` (ROSA HCP), or ARO / self-managed | `terraform/rosa/` |
| ML platform | DIY KServe + vLLM + MLflow | **Red Hat OpenShift AI (RHOAI)** *or* the DIY stack | `platform/openshift/operators/03-openshift-ai.yaml` |

We keep the cloud-portable Helm contract from ADR-007: `terraform/rosa` emits the same
outputs (`cluster_oidc_issuer`, `model_bucket_uri`, `model_puller_role_arn`, GPU
label/taint), so `values-openshift.yaml` is rendered the same way as the other clouds and
the workload code never learns it's on OpenShift.

## The non-obvious calls

### 1. GPU driver: built in-cluster, not shipped in the image

On EKS the `AL2_x86_64_GPU` AMI ships the NVIDIA driver; on GKE a DaemonSet installs it. So
our cloud GPU Operator runs with `driver.enabled=false`. OpenShift runs **RHCOS**, an
immutable host you don't `dnf install` into — so the GPU Operator builds the kernel module
*in-cluster* against the running RHCOS kernel using the **Driver Toolkit**, and we set
`driver.enabled=true` (`use_ocp_driver_toolkit: true`). This also makes **Node Feature
Discovery a hard prerequisite**: the GPU Operator's DaemonSets target the
`feature.node.kubernetes.io/pci-10de.present` label NFD applies. Hence the strict install
order in `platform/openshift/README.md`.

### 2. Security: `restricted-v2`, and we fix the image instead of loosening policy

OpenShift admits pods through SCCs. The rule we adopt: **every app pod runs under
`restricted-v2`; no app pod gets `anyuid`/`privileged`.** The upstream `vllm/vllm-openai`
image wants to run as root and write to `$HOME`/HF cache; rather than grant it a looser SCC,
`values-openshift.yaml` redirects those writes to world-writable mounts and runs it as an
arbitrary assigned UID with all caps dropped. The *only* privileged namespace is
`nvidia-gpu-operator`, because the driver build genuinely needs it — and the operator owns
that grant, we don't. This is the difference between "it runs on OpenShift" and "it passes an
enterprise security review on OpenShift."

### 3. Node autoscaling: MachineSet + cluster-autoscaler, not Karpenter

ADR-002 chose Karpenter for sub-minute spot GPU provisioning on EKS. Karpenter-for-OpenShift
is not GA, and ROSA's supported path is the **MachineAPI**: a tainted GPU `MachineSet` scaled
by the cluster-autoscaler between a scale-to-zero floor and a ceiling. It's a ~2-3 min
provision vs. Karpenter's ~60-90s, but it's the supported, in-distribution mechanism — the
right call on a platform whose whole value proposition is "supported." The KEDA pod-level
layer above it (ADR-003) is unchanged.

### 4. RHOAI *and* the DIY stack — not either/or

Red Hat OpenShift AI gives you a supported KServe, a data-scientist console (Workbenches),
pipelines, and Kueue gang-scheduling. The DIY stack (vLLM + Argo + MLflow already in this
repo) gives you control over runtime versions and a cloud-portable footprint. We enable
**both** and let them serve different lanes: RHOAI for self-service experimentation and the
supported serving path; the DIY vLLM Rollout for the latency-critical, SLO-gated production
path where we want to pin vLLM versions and own the canary analysis. The `DataScienceCluster`
in `03-openshift-ai.yaml` enables only the components we use and leaves the rest `Removed`.

## Consequences

**Positive**
- The platform demonstrates the OpenShift-specific competencies (OLM, SCC, RHCOS GPU
  enablement, Routes, ROSA, RHOAI) rather than hand-waving "it's just K8s."
- Day-2 management stays GitOps: once the OpenShift CRDs exist, `platform/openshift/application.yaml`
  lets ArgoCD reconcile the whole layer.
- Nothing changes for the existing cloud profiles — the new Helm values/templates are
  additive and gated, so EKS/GKE/AKS/kind render identically to before.

**Negative / trade-offs**
- A second install path: the OperatorHub layer can't bootstrap from the recursive
  app-of-apps (the CRDs don't exist on non-OpenShift clusters), so it has its own `make
  ocp-*` entrypoints.
- Slower GPU burst (MachineSet vs. Karpenter) until Karpenter-for-OpenShift is GA.
- RHOAI is a heavy operator; we enable a deliberately narrow `DataScienceCluster` to keep the
  footprint reasonable.

## Alternatives considered

- **"It's just Kubernetes" — deploy the vanilla manifests on OpenShift unchanged.** Rejected:
  the pods would fail SCC admission (root user), GPU nodes would have no driver, and there'd
  be no Route — i.e. it wouldn't actually run, and certainly wouldn't pass review.
- **OpenShift only, drop the cloud profiles.** Rejected: portability across EKS/GKE/AKS is a
  core property (ADR-007) and a hiring signal in its own right.
- **OKD (community OpenShift) instead of ROSA for the reference cluster.** Reasonable for a
  zero-cost demo, but ROSA HCP is what enterprises actually run on AWS and matches the
  managed-control-plane story of the EKS module. We document ARO and self-managed as the
  other two landing zones.
