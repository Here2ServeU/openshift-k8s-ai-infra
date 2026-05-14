export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <div className="caption mb-2 text-accent">{eyebrow}</div>}
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.01em] text-ink-primary">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-[1.45rem] text-ink-secondary">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  hint,
  right,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        {eyebrow && <div className="caption text-ink-muted">{eyebrow}</div>}
        <h2 className="mt-1 text-[1.0625rem] font-semibold text-ink-primary">
          {title}
        </h2>
        {hint && <p className="mt-1 text-[0.8125rem] text-ink-muted">{hint}</p>}
      </div>
      {right}
    </div>
  );
}
