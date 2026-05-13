# ADR-001: vLLM as the LLM serving runtime

**Status**: Accepted
**Date**: 2026-01

## Context

We need a runtime for serving open-weights LLMs (Llama-3, Mistral, Qwen, etc.) on Kubernetes. Candidates:

- **Hugging Face Transformers (raw)** — flexible, but no batching, no KV cache management, throughput is terrible under concurrency.
- **Text Generation Inference (TGI)** — HF's production runtime. Continuous batching, paged attention. Good ecosystem.
- **vLLM** — UC Berkeley project. PagedAttention (their innovation), continuous batching, OpenAI-compatible API.
- **NVIDIA Triton + TensorRT-LLM** — peak performance, but compiling models to TRT engines adds an opaque step to the release pipeline and locks us to NVIDIA.
- **SGLang / LMDeploy / others** — newer, less battle-tested.

## Decision

**Use vLLM as the default LLM runtime**, with a clean abstraction (`workloads/llm-serving/helm/templates/deployment.yaml` parameterized on `runtime.image`) that lets us swap to TGI or Triton per model without rewriting the chart.

## Rationale

| Criterion | vLLM | TGI | Triton+TRT-LLM |
|---|---|---|---|
| Throughput (tokens/sec, batch ~32) | High | High | Highest (~+15-25%) |
| TTFT under load | Best (PagedAttention reduces fragmentation) | Good | Good |
| OpenAI API compatibility | Built-in | Plugin | Custom |
| Cold start (model load) | ~30-60s | ~30-60s | + 5-15min TRT compile |
| Multi-model / dynamic loading | Yes (since 0.6) | Limited | Hard |
| Hardware portability | NVIDIA, AMD ROCm (beta), Intel | NVIDIA primary | NVIDIA only |
| Community release cadence | Weekly | Monthly | Quarterly |

The release cadence is the deciding factor for a research-to-prod environment. Every major model family that drops needs runtime patches; vLLM ships them within days.

For latency-critical workloads where the 15-25% throughput edge matters (e.g., a production chatbot at scale), the abstraction lets us promote specific models to Triton+TRT-LLM without changing the workload Helm chart.

## Consequences

- **Positive**: One OpenAI-compatible API across all served models. Continuous batching means we hit good GPU utilization (60-80%) without manual batching logic at the gateway.
- **Negative**: vLLM's release pace also means we pin a specific version per model — upgrades are not free. Quantization support (AWQ, GPTQ) is good but has rough edges per architecture.
- **Risk**: vLLM is single-vendor (UC Berkeley) academic project, though now under a foundation. If it stalls, TGI is a viable fallback with similar architecture.

## What we actually changed

- `workloads/llm-serving/helm/values.yaml` — `runtime.image: vllm/vllm-openai:v0.7.0`
- `workloads/llm-serving/helm/templates/deployment.yaml` — startup probe with 300s grace for model load
- `observability/dashboards/llm-serving.json` — wired to vLLM's `/metrics` endpoint
