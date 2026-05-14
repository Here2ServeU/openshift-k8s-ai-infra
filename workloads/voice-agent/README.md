# Voice-agent simulation tier

The voice worker tier of the T2S platform. Implements the topology and operational pattern described in [`docs/onboarding/voice-agent-infra.md`](../../docs/onboarding/voice-agent-infra.md): a separate worker pool that holds long-lived bidirectional sessions with the agent under test, driven by configurable personas (tone, speech speed, call quality).

The split from `t2s-worker` is deliberate. Text workers are short-lived SQS consumers; voice workers commit to a call for its full duration, scale on active-call concurrency (not queue length), and use a different rollout strategy so active calls drain rather than getting killed.

## Layout

| File | Purpose |
|---|---|
| `namespace.yaml` | `t2s-voice` namespace + pod-security labels |
| `worker.yaml` | `t2s-worker-voice` deployment + headless service |
| `scaledobject.yaml` | KEDA `ScaledObject` keyed on `voice_call_active_count` |
| `personas-configmap.yaml` | Sample persona definitions (tone, speech speed, call quality) — referenced by content hash for reproducibility |
| `networkpolicy.yaml` | Restricts egress to the LLM gateway, S3 artifact bucket, and observability |
| `servicemonitor.yaml` | Prometheus scrape config for voice-specific metrics |
| `prometheusrule.yaml` | Alerts: active-call concurrency near max, ASR confidence drop, audio upload p99 |

## Personas are data, not code

The four sample personas in `personas-configmap.yaml` cover the axes researchers asked for:

- `tone` — `neutral`, `frustrated`, `cheerful`, `terse`
- `speech_speed_wpm` — distribution centered on a target words-per-minute
- `call_quality` — `clean`, `mobile`, `degraded` (jitter / packet loss / dropout profile)
- `interruption_probability` — chance of the persona barge-in mid-agent-utterance

A run is uniquely keyed by `(persona_sha, agent_digest, suite_version)`. The platform never patches a persona in place — adding a variant means a new entry in the configmap and a new sha.

## What this directory does *not* contain

The actual ASR, TTS, codec, and RTC stacks are application-level concerns in the T2S application repo. This directory owns the platform-side contract: the scaling signal, the node pool, the rollout policy that drains active calls, and the observability + alerts.
