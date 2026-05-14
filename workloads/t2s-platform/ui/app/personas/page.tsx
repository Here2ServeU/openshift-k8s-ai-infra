import { PageHeader, SectionTitle } from "@/components/page-header";
import { personas, type Persona } from "@/lib/mock-data";

export const metadata = { title: "Personas" };

export default function PersonasPage() {
  return (
    <>
      <PageHeader
        eyebrow="Personas"
        title="Simulation profiles, calibrated to clinical reality"
        description="Personas drive the agent under test through configurable tone, speech rate, audio quality, and code-switching. Each profile is content-addressed — runs cite (persona_sha · agent_digest · suite_version) as a primary key."
        actions={
          <button className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[0.8125rem] font-medium text-accent transition hover:bg-accent/[0.14]">
            + New persona
          </button>
        }
      />

      <SectionTitle
        eyebrow="Calibration axes"
        title="The four knobs every persona exposes"
        hint="Locked in 2025-Q1 after a 12-run ablation; any further axis requires an ADR."
      />
      <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AxisCard
          axis="Tone"
          values="neutral · frustrated · anxious · cheerful · terse"
          why="Drives the LLM judge's prompt template. Anxious + frustrated are the highest-yield in catching brittle agents."
        />
        <AxisCard
          axis="Speech rate"
          values="115–195 WPM (Gaussian per persona)"
          why="Below 130 WPM stresses VAD end-of-utterance heuristics; above 175 stresses ASR accuracy."
        />
        <AxisCard
          axis="Call quality"
          values="clean · mobile · hearing-aid · degraded"
          why="Models jitter, packet loss, dropout, and per-band attenuation. Hearing-aid is the highest-value coverage gap for most teams."
        />
        <AxisCard
          axis="Languages"
          values="en-US · es-MX · code-switched"
          why="Code-switched profiles surface ASR/LLM drift in clinical vocabulary (allergens, anticoagulants, dosing units)."
        />
      </div>

      <SectionTitle
        eyebrow="Library"
        title="In-flight personas"
        hint="Selecting a card opens its full definition and the runs that have used it."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {personas.map((p) => (
          <PersonaCard key={p.id} persona={p} />
        ))}
      </div>
    </>
  );
}

function AxisCard({
  axis,
  values,
  why,
}: {
  axis: string;
  values: string;
  why: string;
}) {
  return (
    <div className="card p-4">
      <div className="caption text-ink-muted">{axis}</div>
      <div className="mt-2 text-[0.875rem] text-ink-primary">{values}</div>
      <p className="mt-2 text-[0.75rem] leading-[1rem] text-ink-secondary">
        {why}
      </p>
    </div>
  );
}

function PersonaCard({ persona }: { persona: Persona }) {
  const toneColor: Record<Persona["tone"], string> = {
    neutral: "#94A3C2",
    cheerful: "#5EEAD4",
    frustrated: "#FBBF24",
    anxious: "#F87171",
    terse: "#60A5FA",
  };
  const qualityColor: Record<Persona["callQuality"], string> = {
    clean: "#4ADE80",
    mobile: "#5EEAD4",
    "hearing-aid": "#FBBF24",
    degraded: "#F87171",
  };

  return (
    <article className="card flex flex-col p-5 transition-colors hover:bg-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1rem] font-semibold leading-tight text-ink-primary">
            {persona.display}
          </h3>
          <div className="mt-1.5 mono text-[0.6875rem] text-ink-muted">
            persona_sha: {persona.sha}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[0.8125rem] leading-[1.2rem] text-ink-secondary">
        {persona.scenario}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[0.75rem]">
        <Chip color={toneColor[persona.tone]} label="tone" value={persona.tone} />
        <Chip
          color={qualityColor[persona.callQuality]}
          label="audio"
          value={persona.callQuality}
        />
        <Chip color="#94A3C2" label="wpm" value={`${persona.speechWpm}`} />
        <Chip
          color="#94A3C2"
          label="interrupt"
          value={`${(persona.interruptionPct * 100).toFixed(0)}%`}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {persona.languages.map((l) => (
          <span
            key={l}
            className="rounded-sm border border-border-subtle bg-canvas/40 px-1.5 py-0.5 mono text-[0.6875rem] text-ink-secondary"
          >
            {l}
          </span>
        ))}
      </div>

      <div className="hairline mt-4 pt-3">
        <p className="text-[0.75rem] leading-[1rem] text-ink-muted">{persona.notes}</p>
      </div>
    </article>
  );
}

function Chip({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-border-subtle bg-canvas/40 px-2 py-1.5">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[0.6875rem] uppercase tracking-[0.06em] text-ink-muted">
          {label}
        </span>
      </span>
      <span className="text-ink-primary">{value}</span>
    </div>
  );
}
