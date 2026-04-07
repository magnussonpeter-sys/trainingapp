"use client";

// Samlad översikt under preview-header.
// Samma kortstil som i /run och /home.

type PreviewMetaRowProps = {
  durationMinutes: number;
  exerciseCount: number;
  totalSets: number;
  timedExercises: number;
  gymLabel?: string;
};

function MetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}

export default function PreviewMetaRow({
  durationMinutes,
  exerciseCount,
  totalSets,
  timedExercises,
  gymLabel,
}: PreviewMetaRowProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetaCard label="Tid" value={`${durationMinutes} min`} />
      <MetaCard label="Övningar" value={String(exerciseCount)} />
      <MetaCard label="Totala set" value={String(totalSets)} />
      <MetaCard label="Tidsövningar" value={String(timedExercises)} />
      <MetaCard label="Gym" value={gymLabel?.trim() || "Valt gym"} />
    </section>
  );
}