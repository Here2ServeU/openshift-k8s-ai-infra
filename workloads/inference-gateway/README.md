# Inference Gateway

Envoy in front of every model backend. The OpenAI-compatible API (`/v1/chat/completions`) terminates here, and the gateway routes per-request to the right backend based on the `model` field in the request body.

## Why a gateway

Without one, every client needs to know "Llama-3 lives at vllm-llama3-8b.workloads.svc, Mistral at vllm-mistral-7b.workloads.svc..." That's a routing concern that doesn't belong in client code. The gateway lets us:

- Present one URL to all clients (`chat.api.example.com/v1/...`).
- Migrate models, change replicas, or even swap runtimes (vLLM → Triton) without touching clients.
- Rate-limit per tenant centrally (Envoy's `local_ratelimit` filter).
- Inject `x-trace-id` and emit OTel spans so we have one trace from edge → model.
- Validate request shape before it costs GPU cycles (oversized prompts → 413 immediately).
- A/B route at the gateway level — orthogonal to Argo Rollouts' canary, useful for experiments that span model versions.

## Why Envoy and not nginx / HAProxy / etc.

- **Streaming**: vLLM streams tokens via Server-Sent Events. Envoy supports HTTP/2 + streaming first-class; nginx's chunked-streaming has gotchas (proxy_buffering needs explicit `off`, but it's still per-line-buffered without further tweaks).
- **OTel native**: Envoy's `OpenTelemetryConfig` tracer talks OTLP directly. The trace span attributes line up with vLLM's own spans (both speak `gen_ai.*`).
- **Lua filter**: simple, fast, no separate sidecar. The body-based routing rule is 8 lines of Lua.
- **gRPC**: when we add structured inference (predict/explain via KServe v2 gRPC), Envoy is the same gateway. No second proxy.

## What's NOT here (yet)

- **JWT auth** — Envoy's `jwt_authn` filter is the right place. Pointed to a JWKS URL it just works. Skipped for the demo to keep the auth story stub'd out (call this out in interviews).
- **Prompt guardrails** — e.g., Llama Guard 2 or NeMo Guardrails as a sidecar. Easy to slot in.
- **Cost tagging** — emit `gen_ai.usage.input_tokens` / `output_tokens` as a metric so the cost dashboard can divide by tenant. The OTel exporter does this; the Lua filter pulls token counts from vLLM's streaming response body. Sketch in the ADR.

## Local demo

```bash
make demo        # port-forwards svc/inference-gateway:8080 and sends a chat completion
```
