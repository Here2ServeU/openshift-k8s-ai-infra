# Running this platform on OpenShift

Most of this platform is plain Kubernetes and runs the same everywhere. This doc is about
the parts that are *not* the same on **Red Hat OpenShift** — the parts you'll actually be
asked about when you're hired to run GPU/AI platforms on OpenShift in an enterprise. If you
only read one onboarding doc before an OpenShift conversation, read this one and
[ADR-010](../decisions/010-openshift-target.md).

You'll work with this layer when:

- The target cluster is ROSA, ARO, or self-managed OpenShift instead of EKS/GKE/AKS.
- A pod won't start and the event says `unable to validate against any security context constraint`.
- GPU nodes join but `nvidia.com/gpu` never appears as allocatable.
- A platform component needs installing and the org's policy is "OperatorHub, not random Helm."
- Someone asks "should we use OpenShift AI or your vLLM stack?"

---

## The mental model: four seams

The workload layer (`workloads/`) does not change between vanilla Kubernetes and OpenShift.
Four things change, and they're all in [`platform/openshift/`](../../platform/openshift/):

```
        VANILLA K8s (EKS/GKE/AKS/kind)            OPENSHIFT (ROSA/ARO/self-managed)
        ─────────────────────────────            ─────────────────────────────────
install Helm chart via ArgoCD App        ──►     OperatorHub Subscription (OLM)
GPU     GPU Operator, driver in the AMI  ──►     NFD → GPU Operator, driver built on RHCOS
secure  Pod Security Admission           ──►     SecurityContextConstraints (restricted-v2)
ingress ingress-nginx + cloud LB         ──►     OpenShift Route (HAProxy router)
```

Internalize those four and OpenShift stops being mysterious. Everything else — ArgoCD, KEDA,
Prometheus/Grafana, vLLM, KServe, the model-puller, the SLOs — is identical.

---

## Seam 1 — OperatorHub instead of "helm install"

On OpenShift you install platform components through **OLM** (Operator Lifecycle Manager):
you create a `Subscription`, OLM resolves it against a catalog (`redhat-operators`,
`certified-operators`, `community-operators`) and manages upgrades. The enterprise reason is
governance — operators are versioned, signed, and lifecycle-managed, not `curl | helm
install`.

In this repo: [`platform/openshift/operators/`](../../platform/openshift/operators/) has the
Subscriptions for NFD, the NVIDIA GPU Operator (from the *certified* catalog), the Red Hat
cert-manager operator, and Red Hat OpenShift AI. A `Subscription` needs an `OperatorGroup` in
its namespace first — that's what `00-namespaces-operatorgroups.yaml` sets up.

> **Gotcha:** OLM is asynchronous. After `make ocp-operators`, the CRDs (`ClusterPolicy`,
> `NodeFeatureDiscovery`, `DataScienceCluster`) don't exist until each operator's CSV reports
> `Succeeded`. That's why the CRs are split into `make ocp-gpu` / `make ocp-ai`, which wait
> for the CSV first. Applying the CR too early fails with "no matches for kind."

## Seam 2 — GPU on an immutable host

This is the one people get wrong. On EKS the driver is in the GPU AMI; on OpenShift the host
is **RHCOS**, immutable — there's nothing to install a driver *into*. The NVIDIA GPU Operator
builds the kernel module **in-cluster** against the running RHCOS kernel, using the Driver
Toolkit. Concretely:

1. **NFD runs first** and labels GPU nodes `feature.node.kubernetes.io/pci-10de.present=true`.
2. The GPU Operator's `ClusterPolicy` has **`driver.enabled: true`** (the opposite of our
   cloud profiles) and `use_ocp_driver_toolkit: true`.
3. Its DaemonSets (driver, toolkit, device-plugin, DCGM, GFD) land only on NFD-labelled
   nodes, build/load the driver, and *then* `nvidia.com/gpu` becomes allocatable.

If GPUs never show up as allocatable, the debugging order is: NFD labelled the node? →
ClusterPolicy `driver` pod running and `Ready` on that node? → device-plugin pod `Ready`? The
[`gpu-node-not-ready`](../runbooks/gpu-node-not-ready.md) runbook applies, with this extra
RHCOS-specific first step.

Whole-GPU vs. sharing: production vLLM serving takes a whole GPU; dev/eval pods share one via
**time-slicing** (`gpu/time-slicing-configmap.yaml`) — the OpenShift equivalent of our
scale-to-zero cost lever, applied at the device level.

## Seam 3 — Security Context Constraints

OpenShift admits pods through **SCCs**. The rule on this platform (see
[`scc/README.md`](../../platform/openshift/scc/README.md)):

> Every app pod runs under **`restricted-v2`**. We fix the image, not the policy.

`restricted-v2` means: arbitrary assigned UID (not root), no privilege escalation, all
capabilities dropped, `seccompProfile: RuntimeDefault`. The cloud profiles already pass Pod
Security Admission `restricted`, so the same pods admit here — `values-openshift.yaml` just
makes the `securityContext` explicit and redirects the vLLM image's `$HOME`/cache writes to
world-writable mounts so an arbitrary UID can write them.

The **only** privileged namespace is `nvidia-gpu-operator` (the driver build needs it, and the
operator owns that grant). When you see `unable to validate against any security context
constraint`, the answer is almost never "give it `anyuid`" — it's "find what the image writes
as root and redirect it." Being able to say that in a review is the job.

## Seam 4 — Routes

OpenShift's `Route` (HAProxy router) replaces ingress-nginx + a cloud LoadBalancer.
[`routes/inference-gateway-route.yaml`](../../platform/openshift/routes/inference-gateway-route.yaml)
exposes the gateway with edge TLS. The one LLM-specific tweak: bump
`haproxy.router.openshift.io/timeout` well past the 30s default so streamed token responses
aren't cut off mid-generation.

---

## Provisioning: ROSA, ARO, self-managed

Three ways to get an OpenShift cluster; the platform layer above is identical on all three.

- **ROSA** (Red Hat OpenShift Service on AWS) — `terraform/rosa`, HCP flavour (Red Hat runs
  the control plane, like EKS). This is the reference module.
- **ARO** (Azure Red Hat OpenShift) — same platform layer; swap the provisioning for the ARO
  resource and the GPU MachineSet's provider spec for Azure.
- **Self-managed** — installer-provisioned (IPI) or agent-based on bare metal / vSphere, for
  air-gapped or on-prem. Same platform layer; the GPU MachineSet provider spec differs.

GPU node capacity is a tainted, autoscaling **MachineSet** (`gpu/machineset-gpu.yaml`) scaled
by the cluster-autoscaler — OpenShift's supported answer to Karpenter (see ADR-010 for why we
don't use Karpenter here yet).

---

## RHOAI vs. the DIY stack — how to answer

You will get asked this. The honest answer is "both, for different lanes":

- **Red Hat OpenShift AI (RHOAI)** — supported KServe, a Workbenches console for data
  scientists, pipelines, Kueue gang-scheduling. Reach for it for the **self-service /
  experimentation lane** and when the org wants Red Hat support on the serving stack.
- **The DIY stack** (vLLM Rollout + Argo + MLflow, already in this repo) — for the
  **latency-critical production lane** where we pin vLLM versions, own the SLO-gated canary
  analysis, and keep a cloud-portable footprint.

They coexist on the same cluster. `03-openshift-ai.yaml` enables a deliberately narrow
`DataScienceCluster` (KServe, Workbenches, pipelines, Ray, Kueue, model registry) and leaves
the rest `Removed`.

---

## Quick command reference

```bash
oc login --token=<token> --server=https://api.<cluster>:6443

make ocp-operators   # Subscriptions (NFD, GPU Operator, cert-manager, RHOAI)
make ocp-gpu         # NodeFeatureDiscovery + ClusterPolicy + time-slicing (waits on CSVs)
make ocp-ai          # DataScienceCluster (RHOAI)
make ocp-route       # inference-gateway Route
make ocp-up          # all of the above + platform-up + workloads, in order

oc get csv -A                                   # operator install status
oc get clusterpolicy gpu-cluster-policy -o jsonpath='{.status.state}'   # GPU stack: Ready?
oc get nodes -l nvidia.com/gpu.present=true     # which nodes have GPUs
oc describe scc restricted-v2                    # the baseline every app pod runs under
oc adm policy who-can use scc privileged         # audit: who can escalate (should be ~nobody)
```
