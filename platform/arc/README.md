# Actions Runner Controller (ARC) — in-cluster CI runners

The private-environment build path (ADR-011). GitHub-hosted runners stay the
default for public/dev builds; these manifests exist for environments where
hosted runners can't reach the things CI needs — a private AKS API endpoint, a
VNet-locked container registry, an internal artifact store — which is the
normal posture for a HIPAA-regulated deployment.

Two pieces:

| File | What it is |
|---|---|
| [`application.yaml`](application.yaml) | ArgoCD Applications for the ARC controller + a `gha-runner-scale-set` — ephemeral, per-job runners that scale 0..N on GitHub's job queue |
| [`kaniko-build-example.yaml`](kaniko-build-example.yaml) | The build step ARC runners execute: Kaniko builds in userspace, no privileged pods, no Docker daemon |

## Install

Apply [`application.yaml`](application.yaml) (deliberately not referenced from the app-of-apps — this is opt-in for private environments). Two Applications, matching ARC's two-chart install: controller first, then the runner scale set.

Workflows then target the scale set by name:

```yaml
jobs:
  build:
    runs-on: aks-private-builders
```

## Why Kaniko and not Docker-in-Docker

DinD needs a privileged pod — a non-starter under restricted PodSecurity / the
`restricted-v2` SCC on OpenShift, and exactly the kind of exception a HIPAA
security review exists to reject. Kaniko executes each Dockerfile stage in
userspace and pushes directly to the registry. The cosign signing step is
unchanged: signing keys come via Workload Identity, and the digest Kaniko
outputs is what gets signed — same supply-chain contract as the hosted-runner
path in [`service-image-ci.yml`](../../.github/workflows/service-image-ci.yml).

## Operational notes

- Runners are **ephemeral** — one job per pod, then destroyed. No cache or
  credential bleed between builds. Layer caching goes through the registry
  (`--cache=true --cache-repo=<registry>/kaniko-cache`), not a shared volume.
- Runner pods are workloads like any other: they run on the system pool with
  resource requests, a default-deny NetworkPolicy with explicit egress to
  GitHub, the registry, and nothing else — they hold registry push
  credentials, so they get *more* network scrutiny, not less.
- The controller and listener are on the patch cadence in
  [`docs/security/operational-hygiene.md`](../../docs/security/operational-hygiene.md)
  like every other platform component.
- Scale-to-zero means the first job after a quiet period pays pod-start
  latency (~30s). If that matters, set `minRunners: 1` and pay for one warm
  runner.
