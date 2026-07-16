# Runbook: AKS patching — stuck upgrades, urgent CVEs, drain failures

**Triggers**: `AKSUpgradeStalled` (node in `SchedulingDisabled` > 30 min during a maintenance window), Azure Service Health advisory / Activity Log failure on `Microsoft.ContainerService`, a KEV-listed node CVE that can't wait for Sunday, or post-window alert that node image versions are still mixed.

Background: control-plane patches and node OS images auto-apply inside weekly maintenance windows ([`terraform/azure/main.tf`](../../terraform/azure/main.tf), [ADR-011](../decisions/011-azure-operations.md)). This runbook is for when the automation stalls, or when a CVE can't wait for the window.

## 1. Identify what state the upgrade is in

```bash
az aks show -g ai-ml-infra-rg -n ai-ml-infra \
  --query '{prov:provisioningState, k8s:currentKubernetesVersion}' -o table
az aks nodepool list -g ai-ml-infra-rg --cluster-name ai-ml-infra \
  --query '[].{name:name, prov:provisioningState, image:nodeImageVersion}' -o table
kubectl get nodes -o custom-columns='NAME:.metadata.name,READY:.status.conditions[-1].type,SCHED:.spec.unschedulable,IMAGE:.status.nodeInfo.osImage'
```

A pool in `UpgradingNodeImageVersion` with one node `SchedulingDisabled` for a long time means a drain is blocked. Find the blocker:

```bash
kubectl get events --field-selector reason=FailedDraining -A --sort-by=.lastTimestamp | tail
kubectl get pdb -A | awk '$5 == 0'   # PDBs with 0 allowed disruptions
```

## 2. Respond by class

### Drain blocked by a PDB with zero disruption budget

The most common stall. Usually a single-replica workload with `minAvailable: 1`, or a GPU workload whose replacement can't schedule because the spot pool has no capacity.

- **Single-replica + PDB**: scale the workload to 2, let the drain proceed, scale back. Fix the real bug after (a single replica with `minAvailable: 1` is an un-drainable pod — Polaris should have caught it; add the exception to the backlog, not the cluster).
- **GPU replacement can't schedule**: nudge the GPU pool (`az aks nodepool scale` +1), wait for the new node, let the drain finish, autoscaler trims later. Spot capacity shortages show as `OutOfCapacity` in Activity Log — temporarily flip the pool to a second SKU if it persists.
- **Voice workers mid-call**: these tolerate `terminationGracePeriodSeconds` up to 15 min by design. That is not a stall — check pod age before forcing anything. Never `--disable-eviction` on the voice tier during business hours.

### Upgrade operation failed at the Azure level

`provisioningState: Failed` on the cluster or pool:

```bash
az aks operation-abort -g ai-ml-infra-rg -n ai-ml-infra   # if still wedged in-progress
az aks nodepool upgrade -g ai-ml-infra-rg --cluster-name ai-ml-infra \
  -n <pool> --node-image-only                             # re-run the node image upgrade
```

Abort first, retry second, support ticket third. Don't delete node pools to "unstick" an upgrade — that trades a stalled upgrade for a capacity incident.

### Urgent CVE — can't wait for the Sunday window

**Quick fix** (label as such in the incident channel): trigger the node image upgrade now, per pool, non-GPU pools first:

```bash
az aks nodepool upgrade -g ai-ml-infra-rg --cluster-name ai-ml-infra \
  -n system --node-image-only
```

If the fixed node image isn't published yet, the interim containment is workload-level: patched base image rebuild (CI can rebuild all service images on demand), plus a temporary NetworkPolicy tightening if the CVE is network-reachable. Log the decision and CVE ID against the SLA table in [operational-hygiene.md](../security/operational-hygiene.md).

### Deprecated API removal broke a workload after a minor upgrade

Minor upgrades are human-run, so this should be caught in staging by the deprecation scan — if you're reading this in prod, something skipped the process. Roll the *workload* back (ArgoCD revert) — you cannot roll back an AKS control plane. Then fix the manifest against the new API version.

## 3. Verify

- All pools show the same, current `nodeImageVersion`; no node `SchedulingDisabled`.
- `kubectl get nodes` — all `Ready`; GPU capacity restored (`nvidia.com/gpu` allocatable).
- Rollouts/replica counts back to spec; SLO dashboards clean; the nightly deployed-digest Trivy sweep no longer reports the CVE.
- If the window was missed or forced manually, confirm the *next* scheduled window is intact (`az aks maintenanceconfiguration list`).

## Common gotchas

- **The maintenance window is when Azure *starts*, not when it finishes.** A 4-hour window on a large pool can complete after the window closes. Judge stalls per-node (30 min), not per-window.
- **`--node-image-only` vs full upgrade**: node-image-only patches the OS without touching the Kubernetes version — it's the safe manual lever. A bare `az aks nodepool upgrade` without that flag also bumps k8s and will happily version-skew you.
- **Surge eats subnet IPs.** Upgrades create surge nodes; with Azure CNI each node reserves a /28-ish worth of pod IPs. If the subnet is tight, upgrades fail with IP exhaustion that looks like a capacity error.
- **Spot pools upgrade rudely.** Azure doesn't guarantee graceful surge on spot pools — expect the GPU pool to briefly dip. KEDA's fallback replicas and the warm on-demand floor are what absorb this; don't schedule the GPU pool's window during peak eval hours.
- **kured is not in play here** — AKS `NodeImage` channel replaces node images wholesale; there is no in-place reboot flow to babysit. If you're reading kured docs, you're on the wrong distro's runbook.
