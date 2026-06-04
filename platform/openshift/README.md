# OpenShift platform profile

This directory makes **Red Hat OpenShift** a first-class deployment target alongside the
EKS / GKE / AKS / `kind` profiles. The workload layer (`workloads/`) is unchanged — what
differs on OpenShift is *how the cluster-scoped platform gets installed and secured*:

| Concern | Vanilla Kubernetes (this repo's default) | OpenShift |
|---|---|---|
| Component install | Helm charts via ArgoCD Applications | **OperatorHub Subscriptions** (OLM) — see [`operators/`](operators/) |
| GPU enablement | NVIDIA GPU Operator Helm chart, `driver.enabled=false` (cloud AMI ships the driver) | **NFD operator → NVIDIA GPU Operator → ClusterPolicy**, `driver.enabled=true` (RHCOS builds the driver via the Driver Toolkit) — see [`gpu/`](gpu/) |
| Pod security | Pod Security Admission (`restricted` namespace label) | **Security Context Constraints (SCC)** — target `restricted-v2`, never `privileged` for app pods — see [`scc/`](scc/) |
| External ingress | ingress-nginx + cert-manager | **OpenShift Routes** (HAProxy router, edge TLS) — see [`routes/`](routes/) |
| ML platform | DIY KServe + vLLM + MLflow (already in `workloads/` + `platform/`) | optionally **Red Hat OpenShift AI (RHOAI)** — KServe/ModelMesh/Workbenches as a supported product — see [ADR-010](../../docs/decisions/010-openshift-target.md) |
| Cluster provisioning | `terraform/{aws,gcp,azure}` | `terraform/rosa` (ROSA HCP) — same output contract |

The rationale for supporting *both* — and where the seams are — is in
[ADR-010: OpenShift as a deployment target](../../docs/decisions/010-openshift-target.md).

---

## Install order

OLM and the GPU stack have ordering dependencies (NFD must label nodes before the GPU
Operator's ClusterPolicy can place its DaemonSets). Apply in this sequence — the
`make ocp-*` targets do it for you:

```bash
# 0. Log in to the cluster as a user with cluster-admin
oc login --token=<token> --server=https://api.<cluster>.<domain>:6443

# 1. Namespaces + OperatorGroups + Subscriptions (NFD, GPU Operator, RHOAI, cert-manager)
make ocp-operators           # oc apply -f platform/openshift/operators/

# 2. Wait for the operators to install, then create the GPU CRs
make ocp-gpu                 # NodeFeatureDiscovery + ClusterPolicy + time-slicing

# 3. (optional) Red Hat OpenShift AI control plane
make ocp-ai                  # DataScienceCluster

# 4. Platform + workloads — same manifests as every other profile
make platform-up             # ArgoCD app-of-apps
helm upgrade --install llm-serving workloads/llm-serving/helm \
  -f workloads/llm-serving/helm/values-openshift.yaml -n workloads

# 5. Expose the inference gateway via a Route
make ocp-route               # oc apply -f platform/openshift/routes/
```

`make ocp-up` runs steps 1–5 in order with the right waits.

> **Why not drive this through the recursive app-of-apps?** The OperatorHub Subscriptions
> and SCCs are OpenShift-only CRDs (`operators.coreos.com`, `security.openshift.io`). The
> root [`app-of-apps`](../argocd/app-of-apps.yaml) recurses `platform/argocd/apps/` and is
> applied on *every* profile including `kind` and EKS, where those CRDs don't exist. So the
> OpenShift platform layer is applied via its own path. Once the OpenShift-only CRDs are
> installed, [`application.yaml`](application.yaml) lets ArgoCD reconcile this directory so
> day-2 management is still GitOps — it just can't bootstrap itself.

---

## What's GPU-specific on OpenShift

On EKS the GPU driver ships in the `AL2_x86_64_GPU` AMI; on GKE a DaemonSet installs it.
OpenShift runs **Red Hat CoreOS (RHCOS)**, an immutable host — you don't `dnf install` a
driver. Instead the NVIDIA GPU Operator builds the kernel module *in-cluster* against the
running RHCOS kernel using the **Driver Toolkit** image, so:

- `driver.enabled: true` in the [ClusterPolicy](gpu/clusterpolicy.yaml) (the opposite of our cloud profiles).
- **Node Feature Discovery** must run first — it sets `feature.node.kubernetes.io/pci-10de.present=true`
  on GPU nodes, which is the nodeSelector the GPU Operator's DaemonSets key off.
- MIG (A100/H100) and **time-slicing** (L4/L40S/T4) are configured by a ConfigMap the
  ClusterPolicy references — see [`gpu/time-slicing-configmap.yaml`](gpu/time-slicing-configmap.yaml).
- DCGM-exporter ships GPU metrics to the OpenShift user-workload Prometheus, so the same
  [`gpu-fleet.json`](../../observability/dashboards/gpu-fleet.json) dashboard works unchanged.

GPU node capacity itself is a **MachineSet** (ROSA / self-managed) rather than Karpenter —
see [`gpu/machineset-gpu.yaml`](gpu/machineset-gpu.yaml) and the autoscaling note in ADR-010.
```
