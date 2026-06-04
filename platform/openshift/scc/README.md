# Security Context Constraints (SCC) strategy

OpenShift admits pods through **SCCs** instead of (well, in addition to, since 4.11) Pod
Security Admission. The operating rule in this platform:

> **Every application workload runs under `restricted-v2`. No app pod gets `anyuid`,
> `hostmount-anyuid`, or `privileged`. If a vendor image can't run under `restricted-v2`,
> we fix the image, not the policy.**

`restricted-v2` (the default since OCP 4.11) means: no privilege escalation, all
capabilities dropped (`ALL`), `runAsNonRoot`, an OpenShift-assigned arbitrary UID from the
namespace's range, and `seccompProfile: RuntimeDefault`. The cloud profiles already satisfy
Pod Security Admission `restricted`, so the same pods admit cleanly here — the
[`values-openshift.yaml`](../../../workloads/llm-serving/helm/values-openshift.yaml) Helm
values just make the `securityContext` explicit and remove any hardcoded `runAsUser`.

## Why the vLLM image needs care (and what we do about it)

The upstream `vllm/vllm-openai` image was built to run as root and writes to `$HOME` and a
Hugging Face cache directory. Under `restricted-v2` it runs as an arbitrary high UID with
GID 0, so those writes must target group-writable, world-agnostic paths. We handle this
*in the pod spec*, not with a looser SCC:

- `HF_HOME` / `XDG_CACHE_HOME` / `HOME` are pointed at the `emptyDir`-backed `/models` and
  `/tmp` mounts (writable by any UID).
- `fsGroup` is left unset so OpenShift assigns one from the namespace range and the
  `emptyDir` volumes inherit it.
- `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`,
  `seccompProfile.type: RuntimeDefault`.

This is encoded in `values-openshift.yaml`. The result: vLLM serves under `restricted-v2`
with **no custom SCC at all**.

## The one legitimate exception: the GPU Operator

The NVIDIA GPU Operator's operands (driver build, device plugin, DCGM) genuinely need
privileged access — they load a kernel module and touch `/dev/nvidia*`. That's why
`nvidia-gpu-operator` is the *only* namespace pinned to `privileged` in
[`operators/00-namespaces-operatorgroups.yaml`](../operators/00-namespaces-operatorgroups.yaml).
The operator manages those SCC grants itself; we don't hand them out.

## If you ever truly need a custom SCC

Clone `restricted-v2`, widen the *minimum* necessary, and bind it to a single named
ServiceAccount — never to a group or `system:authenticated`. The pattern is in
[`custom-scc-example.yaml`](custom-scc-example.yaml), shipped as a *documented anti-pattern*
you should be able to justify in a review before applying.
