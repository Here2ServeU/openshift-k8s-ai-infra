# Vector database — Qdrant

Qdrant runs as the in-cluster vector store for embedding-based retrieval. It backs:

- the embedding service in [`workloads/kserve-models/embedding-service.yaml`](../kserve-models/embedding-service.yaml) — write path, indexed by the data-pipeline embedding-indexer workflow,
- the retrieval-augmented eval suites in [`workloads/eval-platform/`](../eval-platform/),
- and a small set of eval-time guardrail lookups at the inference gateway (similarity-based prompt-injection canaries).

## Why Qdrant over the alternatives

A vector store decision usually comes down to whether you want a *library* (pgvector inside Postgres, LanceDB, sqlite-vec) or a *service* (Qdrant, Weaviate, Milvus, Pinecone). For this platform we want a service for three reasons:

1. **Operational isolation from Postgres.** The T2S Postgres also stores transactional state for the API. Mixing high-write embedding workloads onto the same instance produces unpredictable WAL and autovacuum pressure. Separate process, separate node pool, separate scaling.
2. **HNSW with tunable recall is first-class.** pgvector gets you there but with more knobs you'd rather not own. Qdrant exposes the right surface: `ef_construct`, `m`, payload index types.
3. **Snapshot + restore is a single API call.** Disaster recovery for an embedding index is "restore the snapshot in S3" rather than a Postgres restore plus reindex.

Qdrant over Weaviate / Milvus comes down to operational simplicity and resource footprint — none of the alternatives gave a meaningful capability edge for this team's working set (~1B vectors target, multiple smaller collections per project).

## Topology

```
embedding-indexer (Argo Workflow) ─┐
                                   │  upsert
                                   ▼
inference-gateway guardrail ───► qdrant ◄─── eval-platform (RAG-style suites)
                                   ▲
                                   │  snapshot / restore
                                   ▼
                                 S3 (ai-ml-infra-models/qdrant-snapshots/)
```

## Layout

| File | Purpose |
|---|---|
| `namespace.yaml` | `vector-db` namespace + pod-security labels |
| `statefulset.yaml` | 3-replica Qdrant StatefulSet with PV per pod, anti-affinity across zones |
| `service.yaml` | Headless + ClusterIP services (gRPC + HTTP) |
| `pdb.yaml` | Quorum-preserving PDB |
| `networkpolicy.yaml` | Locks ingress to the few namespaces that should reach the DB |
| `snapshot-cronjob.yaml` | Nightly snapshot to S3, retain 14d |
| `servicemonitor.yaml` | Prometheus scrape config |

## What this directory does *not* configure

- A managed-Postgres alternative for tiny use cases. If a workload only needs <1M vectors and already talks to Postgres, prefer pgvector and skip Qdrant entirely — the snapshot story for pgvector is your Postgres backup.
- TLS termination — handled at the cluster ingress or service-mesh layer. Internal traffic is mTLS via Linkerd / Istio if the cluster has one installed; otherwise plaintext over the cluster network protected by NetworkPolicy.
- Multi-tenancy beyond Qdrant's collection-level isolation. If we later need per-team isolation we'd run additional Qdrant instances, not lean on namespacing inside one.
