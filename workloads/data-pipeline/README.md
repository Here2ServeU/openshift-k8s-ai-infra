# Data pipeline

The "high-throughput data pipeline" the job description asks for, scoped to the obvious AI/ML use case: **embed a corpus and index it for RAG**.

The pattern generalizes to other ETL — replace the embed step with whatever transform you need (tokenization, prompt scoring, dataset curation for fine-tuning).

## Shape

- **WorkflowTemplate** ([embedding-indexer-workflow.yaml](embedding-indexer-workflow.yaml)) — fan-out / fan-in DAG. Enumerate shards → embed in parallel → merge.
- **CronWorkflow** ([cronworkflow.yaml](cronworkflow.yaml)) — nightly schedule, `concurrencyPolicy: Forbid` so a slow run never piles on top of the next.
- **In-cluster embedding service** ([../kserve-models/embedding-service.yaml](../kserve-models/embedding-service.yaml)) — KServe `sentence-transformers/all-MiniLM-L6-v2`. KEDA scales it 1..6 based on CPU.

## Throughput math

- ~64 sentences/batch × 16 parallel shards × 6 embedding replicas = ~6,000 sentences/sec peak.
- A 100M-sentence corpus indexes in ~5 hours.
- Bottleneck is usually the embedding service's CPU, not the workflow runner. KEDA + HPA scale that up automatically.

For real production scale (billions of documents), the parallelism story would shift to Ray Data + GPU-backed embeddings. The same workflow shape works — swap the embed-shard image for one that runs `RayJob` against an autoscaled Ray cluster.

## Why Argo Workflows and not Ray for this

For embed-and-index at this scale (a few hundred million docs nightly), Argo Workflows is enough and matches the rest of the platform. Adding Ray earns its keep when:

- The transform is in-process Python with shared state (e.g., the model is too large to load per-task).
- You want elastic GPU scaling within the job (Ray autoscaler is sharper than starting/stopping pods).
- You need shuffle / sort / windowed operations that are awkward in DAG form.

A `RayCluster` workload is the obvious next addition; not built out here to keep the demo scope tight.
