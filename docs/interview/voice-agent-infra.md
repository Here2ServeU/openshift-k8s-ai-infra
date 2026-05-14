# Voice and text agent simulation infrastructure

The job brief calls out voice AI specifically:

> Simulate voice and text agents through configurable personas (tone, speech speed, call quality).
> Execute test suites to assess agent performance in realistic scenarios.
> Analyze outcomes, compare agent versions, detect regressions, and ensure consistent behavior across deployments.

This doc explains how that workload sits on the Kubernetes platform — what's the same as a text-only eval pipeline, and what's specifically different about voice.

## Why voice is not just "text plus an audio file"

The text agent path is comparatively simple: prompt in, response out, score it, move on. Voice introduces three differences that change infrastructure:

1. **Soft real-time SLAs inside the eval itself.** A persona that pauses an extra 600 ms feels different to the agent under test than one that responds instantly. Eval correctness depends on timing accuracy, not just content accuracy.
2. **Audio artifacts are large and need durable storage.** A 5-minute test call is a few MB of audio plus a transcript. Multiplied across a regression sweep this is real storage and S3 request volume.
3. **Bidirectional streams.** Voice calls are duplex. The persona is talking *and* listening at the same time, which means workers can't be plain "consume → process → return" SQS consumers for the duration of the call.

## Topology

```
                      ┌──────────────────────────┐
                      │  everse-ui (suite runner)│
                      └─────────────┬────────────┘
                                    │  HTTPS
                                    ▼
                      ┌──────────────────────────┐
                      │  everse-api              │
                      │  • create run            │
                      │  • persist suite state   │
                      │  • enqueue per-call jobs │
                      └─────────────┬────────────┘
                                    │  SQS
                                    ▼
              ┌───────────────────────────────────────┐
              │  everse-worker (text)                 │
              │  • short-lived                        │
              │  • CPU pool, KEDA on backlog+age      │
              └───────────────────────────────────────┘

              ┌───────────────────────────────────────┐
              │  everse-worker-voice                  │
              │  • longer-lived (1 call = 1 pod-slot) │
              │  • CPU pool with audio codecs         │
              │  • holds RTC session for call length  │
              │  • emits incremental artifacts to S3  │
              │  • scales on active-call concurrency  │
              └───────────────┬───────────────────────┘
                              │
                              ▼  WebRTC / SIP
              ┌───────────────────────────────────────┐
              │  Agent under test                     │
              │  (in-cluster service or external API) │
              └───────────────────────────────────────┘
                              │
                              ▼  artifacts
              ┌───────────────────────────────────────┐
              │  S3                                   │
              │  • call.wav (audio)                   │
              │  • transcript.json                    │
              │  • turn-metadata.json (timing, ASR    │
              │    confidence, persona state)         │
              └───────────────────────────────────────┘
```

The key split: a **text worker tier** and a **voice worker tier**. They share the queue producer but have different scaling triggers and different node pools.

## Why a separate voice worker tier

- **Different scaling signal.** Voice workers can't be "drained" mid-call — once a call is active, the pod is committed until it ends. KEDA scales on *active concurrent calls* (a Prometheus query), not SQS backlog directly.
- **Different node profile.** Voice workers benefit from sustained CPU for codec work and benefit from a node pool that doesn't autoscale aggressively on idle, because killing a node with active calls is expensive.
- **Different cooldown.** Aggressive scale-down kills calls. Voice gets a long `scaleDown.stabilizationWindowSeconds` (10+ minutes).
- **Different rollout strategy.** Voice workers use `maxUnavailable: 0` and a long termination grace period so an active call drains naturally before the pod exits. No canary on a per-call A/B basis; that doesn't have meaningful signal.

## Persona simulation as data, not code

The set of personas the team wants to support (tone, speech speed, call quality) is config, not a code path. We model them as:

- A persona definition (YAML or JSON), versioned in Git or in a managed registry.
- An LLM judge persona that drives the conversation according to that definition.
- A network/audio-quality profile (jitter, packet loss, dropout) applied to the outbound media stream.

Reproducibility is enforced by content-addressing: `persona-sha + agent-digest + suite-version` is the unique key for a run. If those three match, the run is repeatable up to the LLM judge's seed.

## What changes in observability

In addition to the standard eval metrics, voice adds:

- `voice_call_active_count` — current concurrent calls, by worker tier. This is the scaling signal.
- `voice_call_setup_duration_seconds` — histogram from job claim to first audio packet. Long setup is a config or media-server issue.
- `voice_call_duration_seconds` — histogram. Useful for capacity planning and cost.
- `voice_call_failed_total{reason=...}` — by failure class: `media_setup_failed`, `agent_no_response`, `asr_timeout`, `persona_judge_failed`, `worker_oom`. Different reasons get different runbook entries.
- `voice_asr_confidence` — distribution. Low confidence is a transcript-quality signal that downstream scoring needs to weight.
- `voice_audio_artifact_upload_seconds` — uploads from a worker to S3 can spike when the network is saturated. Caught early, this is a tuning issue; caught late, evals fail silently because artifacts are missing.

The dashboard groups these by `agent_version` and `persona_id` so regressions are visible at a glance.

## What changes in alerting

A voice-specific alert set:

- **Active-call concurrency near max.** Capacity headroom is much smaller than for batch workers because we can't easily preempt active calls.
- **Voice worker OOMKill increase.** A memory pressure issue inside a codec loop is silent at the SQS layer; only the audio artifact size or upload pattern will show it.
- **ASR confidence drop.** A drop in ASR confidence below a baseline (say, 10% week-over-week) almost certainly means upstream audio quality changed; eval results from that day are suspect.
- **Audio artifact upload p99 > X.** Slow uploads mean run completion is misreported.

These are in addition to the standard `everse-api` and `everse-worker` alerts in [`observability/alerts/everse-platform.yaml`](../../observability/alerts/everse-platform.yaml).

## Cost shape for voice

Voice runs cost more than text runs per minute, dominated by:

- Worker pod-minutes (much longer per call than per text turn).
- LLM tokens, on both the agent-under-test side and the persona-judge side.
- Audio storage and request volume on S3.
- Optional: third-party ASR or TTS (if the team uses managed services rather than in-cluster models).

The `eval_run_cost_usd` metric breaks down into `voice_call_cost_usd` and `text_call_cost_usd` for visibility. The headline number that goes to leadership is `cost_per_voice_minute` because it's the unit researchers ask about.

## What I'd defend in the interview

- The split between text and voice worker tiers, with separate scaling triggers, is non-negotiable for production. Anyone trying to scale voice on plain SQS backlog will have ugly incidents.
- The persona definition belongs in versioned config, not in worker code. The day someone tries to A/B two persona variants and can't, you'll regret coupling personas to the worker image.
- Voice runs should write *incremental* artifacts (partial transcripts, turn timestamps) during the call, not just at the end. If a pod dies mid-call, the partial artifact is still useful for triage. Whole-run-or-nothing artifacts make incidents harder to debug.
- ASR confidence should be treated as a quality gate. If the audio path degrades, your eval results are wrong even if the agent is fine. The platform owns that signal.

## What this repo demonstrates vs. doesn't

This repo includes a worker scaffold and the scaling/observability patterns. It does **not** include the actual voice codec stack, RTC stack, or persona simulator — those are application-level concerns belonging in the Everse application repo. What the platform owes that team:

- A node pool sized and tainted for voice workloads.
- A KEDA configuration that scales on `voice_call_active_count` rather than queue length.
- The observability pipeline and alert set above.
- The artifact storage layout and access patterns.
- A rollout strategy that doesn't kill active calls.
