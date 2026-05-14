# Everse platform service group

This workload models the infrastructure shape from the interview brief: a React/Node UI, a Python API, and queue-backed evaluation workers that run AI-agent simulation suites.

## Service topology

```
everse-ui  ->  everse-api  ->  Postgres / Redis / S3
                    |
                    v
                 SQS queue
                    |
                    v
              everse-worker -> LLM gateway / eval artifacts
```

## What this demonstrates

- **Release ownership**: `everse-api`, `everse-worker`, and `everse-ui` are deployed as one Argo CD application with independent rollouts and shared environment promotion.
- **Queue-based scaling**: workers scale on SQS backlog through KEDA, with a Prometheus fallback so the system keeps scaling decisions observable.
- **Operational signals**: API latency, queue age, worker utilization, Redis pressure, Postgres saturation, S3 throughput, and eval pass/regression rates are first-class metrics.
- **Security posture**: service accounts are separated by workload, IRSA/Workload Identity annotations are the cloud boundary, network policies limit east-west traffic, and pods run without root privileges.

## Interview framing

Use this directory when asked, "How would you run Everse on Falcon/Kubernetes?"

The answer is: keep the UI/API/worker group as a single product deployment unit, but scale and secure each component according to its bottleneck. The API scales on request latency and CPU. Workers scale on queue depth and oldest-message age. Artifact storage stays in object storage with signed digests. Model and eval promotion happens through GitOps so rollbacks are a revert, not a manual cluster mutation.
