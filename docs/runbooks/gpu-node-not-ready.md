# Runbook: GPU node `NotReady` or XID errors

**Triggers**: `GPUXIDError`, `KubeNodeNotReady` on a node labelled `workload-type=serving`, vLLM pods in `Pending` / `CrashLoopBackOff` despite GPU capacity showing.

## 1. Identify the node

```bash
kubectl get nodes -l workload-type=serving
kubectl describe node <node>
kubectl get events -A --field-selector involvedObject.name=<node>
```

Check the GPU operator's DCGM exporter:

```bash
kubectl logs -n gpu-operator -l app.kubernetes.io/component=dcgm-exporter
```

Look for **XID** lines. XID is NVIDIA's driver-level error code:

- **XID 13 / 31** — application fault, rarely actionable on the platform side.
- **XID 43 / 45** — usually transient, the pod restart resolves.
- **XID 74 / 79** — uncorrectable hardware errors. **Node replacement required.**

## 2. Respond by class

### Spot interruption (AWS / Azure)

You'll see a `karpenter` event or `Scheduled Events` annotation with a 2-minute eviction notice.

- **AWS / Karpenter**: handles automatically. NodePool's `disruption` policy drains and replaces. Verify a new node is being provisioned:
  ```bash
  kubectl get nodeclaim
  ```
- **Azure / AKS**: cluster autoscaler is less graceful with spot. Check the GPU pool's autoscaler events; if a replacement isn't coming, manually scale the node pool by +1 then -1 to nudge it.

### Driver hang (kubelet still up, but GPU is unresponsive)

Symptoms: `nvidia-smi` on the host hangs; new GPU pod allocations fail.

```bash
# Cordon to stop new schedules
kubectl cordon <node>
# Drain workloads (PDB protects against full evacuation)
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
# On AWS, Karpenter will replace; on others, delete the underlying VM:
#   AKS:  az aks nodepool scale ... (or delete the VM directly)
#   GKE:  gcloud compute instances delete ...
```

Karpenter / Cluster Autoscaler will provision a fresh node from the same NodePool spec.

### Uncorrectable hardware error (XID 74 / 79)

Same drain → delete flow. Additionally:

- Tag the node's underlying instance with `replaced-due-to: xid-<code>` for FinOps follow-up.
- File a support ticket with the cloud provider with the XID code, timestamp, and instance ID.

### MIG / time-slicing misconfiguration

If GPU pods can't allocate `nvidia.com/gpu: 1`:

```bash
kubectl describe node <node> | grep -A3 "Allocatable:"
# Should show nvidia.com/gpu count > 0. If 0:
kubectl get pods -n gpu-operator -o wide | grep <node>
kubectl logs -n gpu-operator <nvidia-device-plugin-pod-on-that-node>
```

Common cause: MIG profile change requires a node restart for the device plugin to re-enumerate. Drain + delete the node.

## 3. Verify recovery

- `kubectl get nodes` — new node `Ready` with `nvidia.com/gpu` capacity.
- `kubectl -n workloads get rollout vllm-llama3-8b` — replicas back to spec.
- TTFT / availability dashboards back below SLO targets.

## Common gotchas

- **PDB blocks drain**: if `minAvailable: 1` is set and we only have 1 replica, drain blocks. Either bump replicas first, or use `--disable-eviction` (only with strong justification).
- **Model artifact cache lost**: a fresh node has no model files cached. Pod startup takes ~60s longer than warm replicas. KEDA's `cooldownPeriod: 300` protects from thrash.
- **Karpenter consolidation racing**: if Karpenter is mid-consolidation when an XID fires, it may try to consolidate first. Manually cordon to stop that.
