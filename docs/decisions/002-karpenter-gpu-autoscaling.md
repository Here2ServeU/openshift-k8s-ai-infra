# ADR-002: Karpenter for GPU node autoscaling

**Status**: Accepted (AWS) / N/A on GCP (use GKE Node Auto-Provisioning)
**Date**: 2026-01

## Context

LLM serving traffic is bursty — typical pattern is 5-10× over baseline during product launches or eval runs. GPU instances (`g5.xlarge`, ~$1.00/hr on-demand) are too expensive to keep warm.

We need node-level autoscaling that:
1. Provisions a fresh GPU node in **under 90 seconds** from a pending pod.
2. Prefers **spot instances** with on-demand fallback.
3. Bin-packs efficiently (don't strand half a node).
4. Drains gracefully when scaling down.

Options:
- **Cluster Autoscaler** (CA) — the historical default. Tied to ASGs / MIGs. New node provisioning is ~3-5 min (ASG round-trip + AMI boot + kubelet register).
- **Karpenter** — AWS-native (now AKS-supported too). Talks to EC2 fleet API directly, skips ASGs.
- **GKE Node Auto-Provisioning** — GCP equivalent. Built into the control plane.

## Decision

- **AWS**: Karpenter with two NodePools:
  - `gpu-spot` — `g5.xlarge`, `g5.2xlarge`, `g4dn.xlarge`, spot, `karpenter.k8s.aws/instance-gpu-count: "1"`
  - `gpu-od-fallback` — same instance types, on-demand, lower weight
- **GCP**: GKE NAP with constraints (`min: 0, max: 8 GPUs`, `nvidia-l4` accelerator).
- **Local (kind)**: no autoscaling — fixed node pool.

## Rationale

- **Provisioning latency**: Karpenter consistently brings up a GPU node in 60-90s end-to-end (EC2 launch + GPU driver via DaemonSet + pod schedule). CA averages 3-5 minutes. For a 5× burst, that's the difference between dropping requests and absorbing them.
- **Bin-packing**: Karpenter's scheduler considers actual pod requirements, picks instance type per-batch. CA picks per-ASG.
- **Spot orchestration**: Karpenter's `consolidation` mode automatically migrates pods to cheaper nodes when capacity becomes available. Saves ~30% on long-running GPU workloads in practice.
- **Drift detection**: Karpenter notices when a node's spec drifts from the NodePool (e.g., AMI updated) and rolls it gracefully.

## Consequences

- **Positive**: Spot interruptions are handled via 2-minute notice → graceful pod eviction → Karpenter provisions replacement preemptively.
- **Negative**: Karpenter requires its own IAM role with `ec2:RunInstances` etc. — broader blast radius than CA's `AutoScalingGroup` permissions. Mitigated via IRSA scoped to specific tag conditions.
- **Lock-in**: Karpenter is AWS-first (AKS support is beta). For GCP we use GKE NAP, which means our autoscaling configuration isn't portable. Acceptable trade-off — abstracting node provisioning across clouds would mean writing our own controller.

## What we actually changed

- `terraform/aws/eks/karpenter.tf` — installs Karpenter via Helm with IRSA
- `platform/karpenter/nodepool-gpu.yaml` — the NodePool + EC2NodeClass for GPU
- `workloads/llm-serving/helm/templates/deployment.yaml` — `nodeSelector` for `karpenter.k8s.aws/instance-gpu-count` + tolerations for the `nvidia.com/gpu` taint
- `docs/runbooks/gpu-node-not-ready.md` — covers spot interruption response
