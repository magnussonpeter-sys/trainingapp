"use client";

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  kicker?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

// Gemensamt kort för sektioner på home, history, gyms och settings.
export default function SectionCard({
  title,
  subtitle,
  kicker,
  actions,
  children,
  className = "",
  contentClassName = "",
}: SectionCardProps) {
  return (
    <section
      className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`.trim()}
    >
      {title || subtitle || kicker || actions ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            {kicker ? (
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
                {kicker}
              </p>
            ) : null}

            {title ? (
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                {title}
              </h2>
            ) : null}

            {subtitle ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
            ) : null}
          </div>

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}

      <div className={`${title || subtitle || kicker || actions ? "mt-4" : ""} ${contentClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}