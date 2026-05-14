# MLflow tracking + model registry

Lightweight MLflow tracking server, deployed via the community Helm chart. Backed by the Postgres instance that already runs alongside T2S and the same S3 bucket used for content-addressed model artifacts.

## Why MLflow lives here

Two questions the research team asks every week:

1. *Which experiment produced the model that's currently serving traffic?*
2. *What were the eval scores for the previous five candidate checkpoints?*

The model registry in [`workloads/model-registry/`](../../workloads/model-registry/) answers the first via sha-digest, but it's deliberately minimal — content-addressed blobs and a signed promotion path, not experiment metadata. MLflow is the layer where experiment runs, parameters, metrics, and lineage live. The Argo Rollouts canary AnalysisTemplate can read eval metrics out of MLflow before flipping weights.

## What this configures

- Tracking server pod, behind cluster-internal Service + Ingress (optional).
- Postgres backend store (uses the `t2s-postgres` instance already in-cluster; isolated database, separate user).
- S3 artifact store, same bucket as the model registry, prefix `mlflow/`.
- IRSA / Workload Identity binding so the pod's service account has scoped S3 access — never long-lived keys.
- ServiceMonitor so MLflow's Prometheus exporter is scraped.

## What this does *not* try to be

- **Not a training scheduler.** Argo Workflows owns long-running jobs; MLflow records what happened.
- **Not the source of truth for "what's in prod."** That's still GitOps: the live tag is whatever `values-<env>-<cloud>.yaml` references. MLflow tells you the lineage of how that tag got chosen.
- **Not multi-tenant out of the box.** Single MLflow instance, project scoping via tags on runs. Good enough for one research-to-production team; revisit when the user count crosses ~30.

## Alternatives we considered

| Tool | Why we didn't pick it as the default |
|---|---|
| Weights & Biases (W&B) | SaaS-first, billing per seat, data leaves the cluster. Easy to add a W&B logger alongside MLflow when a researcher wants the W&B UI specifically. |
| Kubeflow Pipelines | Bigger surface than this team needs; we already use Argo Workflows. Revisit if pipelines grow DAGs that Argo can't express ergonomically. |
| ClearML | Comparable feature set; smaller community in our hiring market. |

If a team member wants W&B specifically, the workers can log to both — MLflow stays the platform-owned record, W&B is opt-in per project.
