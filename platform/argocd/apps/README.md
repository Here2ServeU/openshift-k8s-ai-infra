# Platform apps

Each YAML here is an ArgoCD `Application` that installs one platform component. Sync waves order them so dependencies (CRDs, cert-manager) come up before consumers.

| Wave | App | What it gives us |
|---|---|---|
| -3 | cert-manager | TLS for ingress + webhook certs |
| -2 | ingress-nginx | Edge traffic + streaming-friendly defaults |
| -2 | external-secrets | Pull secrets from cloud KMS into the cluster |
| -1 | keda | Event-driven autoscaling (see ADR-003) |
| -1 | argo-rollouts | Canary deploys with SLO-gated promotion (ADR-006) |
| 0 | argo-workflows | Eval + data pipeline runner |
| 0 | kserve | Serves traditional ML models alongside LLMs |
| 0 | nvidia-gpu-operator | Device plugin + DCGM exporter |
| 1 | observability | kube-prom + Loki + Tempo + OTel |
| 1 | karpenter-nodepools | GPU NodePool CRDs (AWS only) |
| 2 | workloads | Second app-of-apps for user workloads |

## Adding a new platform component

Drop a new `NN-name.yaml` here. The root app-of-apps recurses this directory and ArgoCD will sync it.
