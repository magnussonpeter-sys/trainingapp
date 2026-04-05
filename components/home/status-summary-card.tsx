"use client";

type StatusSummaryCardProps = {
  title: string;
  detail: string;
};

// En mycket liten statusyta i stället för stor dashboard.
export default function StatusSummaryCard({
  title,
  detail,
}: StatusSummaryCardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
        Kort status
      </p>

      <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </section>
  );
}