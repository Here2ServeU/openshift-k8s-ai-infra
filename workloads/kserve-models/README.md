# KServe models

KServe sits next to vLLM in the architecture. vLLM owns LLMs; KServe owns everything else: sklearn / XGBoost classifiers, ONNX-exported PyTorch models, an embedding service for RAG pipelines.

Why have both:

| | vLLM | KServe |
|---|---|---|
| Best at | Generative LLMs | Anything with a `/predict` request/response |
| Scaling | Continuous batching at the runtime layer | Standard HPA |
| Model loading | Content-addressed from object storage | Same — KServe's storage initializer |
| API | OpenAI compatible | Native v2 (predict/explain) or transformer wrappers |

The inference gateway routes by path: `/v1/chat/completions` → vLLM, `/v1/embeddings` → KServe HF embedding service, `/v1/models/<name>/infer` → KServe predict.

## Sample services in here

- [`embedding-service.yaml`](embedding-service.yaml) — `sentence-transformers/all-MiniLM-L6-v2` for cheap embeddings used by retrieval pipelines.
- [`classifier-sklearn.yaml`](classifier-sklearn.yaml) — placeholder churn classifier showing the same digest-pinned `storageUri` pattern as vLLM (ADR-004).

## Deployment mode

We use `RawDeployment` (plain Deployment + HPA + Service) rather than the Serverless mode that depends on Knative. Knative is great if you already run it, but it's a heavy dependency to add just for KServe. With `RawDeployment` we get all the value (predictor + transformer + explainer protocol) without the extra control plane.
