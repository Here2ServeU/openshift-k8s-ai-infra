/**
 * Mock data for the T2S demo. Tone, names, and identifiers are chosen to
 * read like a real regulated-healthcare evaluation platform: FDA SaMD,
 * IEC 62304, ISO 13485, EU MDR, HIPAA. Replace with API calls in real
 * deployment — see `app/api/` for the contract.
 */

export type RunStatus =
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "queued";

export type EvalRun = {
  id: string;
  suite: string;
  agent: string;
  agentDigest: string;
  persona: string;
  status: RunStatus;
  passRate: number;        // 0..1
  regressions: number;
  startedAt: string;       // ISO
  durationS: number;
  reviewer: string | null; // notified-body reviewer placeholder
  regulation: string;      // e.g. "FDA SaMD Class IIb"
};

export type Persona = {
  id: string;
  display: string;
  scenario: string;
  tone: "neutral" | "frustrated" | "anxious" | "cheerful" | "terse";
  callQuality: "clean" | "mobile" | "hearing-aid" | "degraded";
  speechWpm: number;
  interruptionPct: number;
  languages: string[];
  notes: string;
  sha: string;
};

export type ComplianceGate = {
  framework: string;
  clause: string;
  title: string;
  status: "green" | "amber" | "red";
  evidenceCount: number;
  owner: string;
  lastReviewed: string;
};

export type AuditEntry = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  subject: string;
  digest: string;
  signer: string;
  kind: "model" | "persona" | "release" | "policy" | "access";
};

// ---------- mission control ----------

export const slo = [
  { name: "Eval pass rate (clinical)", target: 0.985, current: 0.991, window: "30d" },
  { name: "API p95 latency", target: 0.4, current: 0.281, window: "30d", unit: "s" },
  { name: "Voice ASR confidence", target: 0.92, current: 0.946, window: "7d" },
  { name: "Queue freshness p95", target: 60, current: 38, window: "24h", unit: "s" },
];

// 120 samples of recent eval throughput (runs/minute), gentle sinusoid + jitter.
export const evalThroughput: number[] = Array.from({ length: 120 }, (_, i) => {
  const base = 24 + Math.sin(i / 7) * 8;
  return Math.max(0, Math.round(base + (deterministic(i) - 0.5) * 6));
});

export const ttftMs: number[] = Array.from({ length: 120 }, (_, i) => {
  const base = 220 + Math.cos(i / 11) * 30;
  return Math.round(base + (deterministic(i + 17) - 0.5) * 24);
});

export const asrConfidence: number[] = Array.from({ length: 120 }, (_, i) => {
  const base = 0.945 + Math.sin(i / 13) * 0.015;
  return Number((base + (deterministic(i + 31) - 0.5) * 0.012).toFixed(3));
});

// ---------- eval runs ----------

export const evalRuns: EvalRun[] = [
  {
    id: "run_01HXG3CY7K4Q9N2D8M5R6P0Z",
    suite: "iec-62304-§5.3-software-architecture",
    agent: "triage-v2.4.1",
    agentDigest: "sha256:9f2c3b18a7e6d4f5c2b1a3e9d8c7b6a5f4e3d2c1b0a9988776655443322110d",
    persona: "post-op-callback · frustrated-mobile",
    status: "running",
    passRate: 0.957,
    regressions: 1,
    startedAt: minutesAgo(7),
    durationS: 412,
    reviewer: null,
    regulation: "IEC 62304 §5.3, §5.7",
  },
  {
    id: "run_01HXG3BR2J8M5N4C7D6P9Q0X",
    suite: "fda-samd-class-iib-pre-submission",
    agent: "pharmacovigilance-intake-v1.9.0",
    agentDigest: "sha256:81b7e2c4d5a6f7c8b9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920a3b4c5d",
    persona: "ae-report-anxious-hearing-aid",
    status: "passed",
    passRate: 0.992,
    regressions: 0,
    startedAt: hoursAgo(2.4),
    durationS: 2_460,
    reviewer: "Dr. R. Kohli (notified body)",
    regulation: "FDA SaMD IIb",
  },
  {
    id: "run_01HXG3AC9D8H7K6L4M3N2P1Y",
    suite: "eu-mdr-clinical-evaluation-cohort-q2",
    agent: "consent-flow-v3.1.0",
    agentDigest: "sha256:55aa66bb77cc88dd99ee00ff11223344556677889900aabbccddeeff00112233",
    persona: "pre-anesthesia-screening-en-es-codeswitch",
    status: "failed",
    passRate: 0.831,
    regressions: 7,
    startedAt: hoursAgo(5.9),
    durationS: 3_180,
    reviewer: "M. Beltrán",
    regulation: "EU MDR Annex XIV",
  },
  {
    id: "run_01HXG39Q4R5T8V0X2Y6Z8A1B",
    suite: "iso-13485-§7.3-design-verification",
    agent: "surgical-asst-vision-v0.8.2",
    agentDigest: "sha256:c0ffee0011223344556677889900aabbccddeeff00112233445566778899aabb",
    persona: "or-suite-degraded-comms",
    status: "blocked",
    passRate: 0.0,
    regressions: 0,
    startedAt: hoursAgo(0.5),
    durationS: 0,
    reviewer: null,
    regulation: "ISO 13485 §7.3 + IEC 62304 §5.6",
  },
  {
    id: "run_01HXG38P3K9L7M6N5O4Q3R2S",
    suite: "hipaa-privacy-rule-de-identification",
    agent: "transcript-redactor-v4.0.0",
    agentDigest: "sha256:1234aabbccddeeff5566778899001122334455667788990011223344aabbccdd",
    persona: "follow-up-cheerful-clean",
    status: "passed",
    passRate: 1.0,
    regressions: 0,
    startedAt: hoursAgo(12.8),
    durationS: 1_120,
    reviewer: "S. Okafor",
    regulation: "HIPAA Privacy Rule §164.514",
  },
  {
    id: "run_01HXG37A2N5K8M3P6Q9R0S1T",
    suite: "iec-62366-usability-engineering",
    agent: "patient-portal-voice-v2.0.0",
    agentDigest: "sha256:deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb",
    persona: "elderly-clean · hearing-aid · slow-wpm",
    status: "queued",
    passRate: 0,
    regressions: 0,
    startedAt: minutesAgo(2),
    durationS: 0,
    reviewer: null,
    regulation: "IEC 62366-1",
  },
];

// ---------- personas ----------

export const personas: Persona[] = [
  {
    id: "post-op-callback-frustrated-mobile",
    display: "Post-op call-back · frustrated · mobile",
    scenario:
      "48-hour post-discharge follow-up. Patient experiencing unexpected pain, has tried OTC analgesics, has called the line once already.",
    tone: "frustrated",
    callQuality: "mobile",
    speechWpm: 178,
    interruptionPct: 0.15,
    languages: ["en-US"],
    notes:
      "Tests whether the agent surfaces the prior call from the EHR within 20s and routes to a clinician rather than re-asking history.",
    sha: "b41f8c3e7a2d9051",
  },
  {
    id: "ae-report-anxious-hearing-aid",
    display: "AE report · anxious · hearing-aid",
    scenario:
      "Adverse-event intake call. Caller is anxious, uses a hearing-aid (audio profile attenuates high frequencies), and asks the agent to repeat itself frequently.",
    tone: "anxious",
    callQuality: "hearing-aid",
    speechWpm: 138,
    interruptionPct: 0.08,
    languages: ["en-US"],
    notes:
      "Reproduces a real failure mode where ASR confidence drops 18% on hearing-aid audio and the agent's confidence thresholds were calibrated to clean audio only.",
    sha: "08aa291f44ce6b73",
  },
  {
    id: "pre-anesthesia-screening-en-es",
    display: "Pre-anesthesia · EN/ES code-switch",
    scenario:
      "Pre-anesthesia screening 24h before elective surgery. Caller code-switches between English and Spanish mid-sentence; clinical content is in both languages.",
    tone: "neutral",
    callQuality: "clean",
    speechWpm: 162,
    interruptionPct: 0.04,
    languages: ["en-US", "es-MX"],
    notes:
      "Gates EU MDR cohort runs. Detects ASR/LLM drift on code-switched clinical vocabulary (allergens, anticoagulants).",
    sha: "f72d61aa3b908e15",
  },
  {
    id: "or-suite-degraded-comms",
    display: "OR suite · degraded comms",
    scenario:
      "Operating-room voice control. PA system noise, surgical-mask attenuation, and intermittent WiFi dropout. Agent is the surgical assistant voice surface.",
    tone: "terse",
    callQuality: "degraded",
    speechWpm: 142,
    interruptionPct: 0.22,
    languages: ["en-US"],
    notes:
      "Highest-stakes profile. Targets IEC 62304 software safety class C — any false-positive command is a recordable event.",
    sha: "9c0b471e5d22a880",
  },
  {
    id: "elderly-clean-hearing-aid-slow",
    display: "Elderly · hearing-aid · slow",
    scenario:
      "Routine follow-up via patient portal voice. Speech rate ~120 WPM, audio profile attenuates 4kHz+, occasional silence pauses 4–6s.",
    tone: "neutral",
    callQuality: "hearing-aid",
    speechWpm: 122,
    interruptionPct: 0.02,
    languages: ["en-US"],
    notes:
      "Surfaces VAD threshold mistakes — the platform must not treat thinking pauses as end-of-utterance.",
    sha: "4d10aaff7c8b2295",
  },
  {
    id: "follow-up-cheerful-clean",
    display: "Routine follow-up · cheerful · clean",
    scenario:
      "Baseline control. Used to detect platform-wide regressions independent of audio quality.",
    tone: "cheerful",
    callQuality: "clean",
    speechWpm: 155,
    interruptionPct: 0.02,
    languages: ["en-US"],
    notes: "If this fails, the issue is upstream of audio.",
    sha: "12fa7099bb340e57",
  },
];

// ---------- compliance ----------

export const compliance: ComplianceGate[] = [
  {
    framework: "FDA SaMD",
    clause: "21 CFR 820.30(g)",
    title: "Design validation — clinical-grade eval coverage",
    status: "green",
    evidenceCount: 142,
    owner: "Clinical Eval",
    lastReviewed: daysAgo(2),
  },
  {
    framework: "IEC 62304",
    clause: "§5.3",
    title: "Software architecture — partition by safety class",
    status: "green",
    evidenceCount: 38,
    owner: "Platform",
    lastReviewed: daysAgo(11),
  },
  {
    framework: "IEC 62304",
    clause: "§5.7.4",
    title: "Software unit verification — voice agents",
    status: "amber",
    evidenceCount: 23,
    owner: "Voice Agents",
    lastReviewed: daysAgo(4),
  },
  {
    framework: "ISO 13485",
    clause: "§7.3.7",
    title: "Design transfer to production cluster",
    status: "green",
    evidenceCount: 17,
    owner: "Platform",
    lastReviewed: daysAgo(6),
  },
  {
    framework: "EU MDR",
    clause: "Annex XIV",
    title: "Clinical evaluation — post-market evidence loop",
    status: "amber",
    evidenceCount: 91,
    owner: "Clinical Affairs",
    lastReviewed: daysAgo(3),
  },
  {
    framework: "HIPAA",
    clause: "§164.514",
    title: "De-identification — transcript redaction",
    status: "green",
    evidenceCount: 64,
    owner: "Privacy",
    lastReviewed: daysAgo(1),
  },
  {
    framework: "IEC 62366-1",
    clause: "§5.6",
    title: "Usability validation — accessibility (hearing-aid)",
    status: "red",
    evidenceCount: 8,
    owner: "Human Factors",
    lastReviewed: daysAgo(0),
  },
  {
    framework: "IEC 62304",
    clause: "§9.3",
    title: "Problem resolution — postmarket surveillance loop",
    status: "green",
    evidenceCount: 51,
    owner: "Quality",
    lastReviewed: daysAgo(8),
  },
];

// ---------- audit trail ----------

export const audit: AuditEntry[] = [
  {
    id: "evt_01HXG3CY7K0001",
    ts: minutesAgo(4),
    actor: "argo-rollouts",
    action: "canary.promoted",
    subject: "triage-v2.4.1",
    digest: "sha256:9f2c3b18a7e6",
    signer: "cosign/keyless · GH oidc",
    kind: "release",
  },
  {
    id: "evt_01HXG3CW2X0002",
    ts: minutesAgo(11),
    actor: "platform-bot",
    action: "model.promoted",
    subject: "transcript-redactor-v4.0.0",
    digest: "sha256:1234aabbccdd",
    signer: "cosign/keyless · GH oidc",
    kind: "model",
  },
  {
    id: "evt_01HXG3CR9F0003",
    ts: minutesAgo(28),
    actor: "e.naweji",
    action: "persona.added",
    subject: "elderly-clean-hearing-aid-slow",
    digest: "sha256:4d10aaff7c8b",
    signer: "user · GH oidc",
    kind: "persona",
  },
  {
    id: "evt_01HXG3BX1A0004",
    ts: hoursAgo(1.4),
    actor: "kyverno",
    action: "policy.blocked",
    subject: "pod/voice-worker-9f12 — root user",
    digest: "—",
    signer: "—",
    kind: "policy",
  },
  {
    id: "evt_01HXG3AT4M0005",
    ts: hoursAgo(2.9),
    actor: "external-secrets",
    action: "secret.rotated",
    subject: "t2s-runtime/voice-queue-url",
    digest: "—",
    signer: "kms/aws · auto",
    kind: "policy",
  },
  {
    id: "evt_01HXG39N7P0006",
    ts: hoursAgo(4.1),
    actor: "r.kohli",
    action: "evidence.signed-off",
    subject: "FDA SaMD pre-submission · run_01HXG3BR2J8",
    digest: "sha256:81b7e2c4d5a6",
    signer: "user · GH oidc · audit-log",
    kind: "release",
  },
  {
    id: "evt_01HXG38J2K0007",
    ts: hoursAgo(6.6),
    actor: "argo-rollouts",
    action: "canary.rolled-back",
    subject: "consent-flow-v3.0.4",
    digest: "sha256:7777aaccff00",
    signer: "cosign/keyless · auto",
    kind: "release",
  },
  {
    id: "evt_01HXG37B5L0008",
    ts: hoursAgo(9.2),
    actor: "iam",
    action: "access.granted",
    subject: "m.beltran · clinical-eval@prod (24h JIT)",
    digest: "—",
    signer: "okta · time-limited",
    kind: "access",
  },
];

// --- helpers ---

function deterministic(i: number) {
  // tiny seeded jitter — keeps server/client renders identical.
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000).toISOString();
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

function daysAgo(d: number) {
  return new Date(Date.now() - d * 86_400_000).toISOString();
}
