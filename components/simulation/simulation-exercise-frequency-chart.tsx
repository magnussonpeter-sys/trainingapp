import type { SimulationExerciseAggregate } from "@/lib/simulation/types";

export default function SimulationExerciseFrequencyChart({
  aggregates,
}: {
  aggregates: SimulationExerciseAggregate[];
}) {
  const top = aggregates.slice(0, 8);
  const max = Math.max(1, ...top.map((item) => item.timesSelected));

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Övningsfrekvens</h2>
      <p className="mt-1 text-sm text-slate-500">
        Mest valda övningar i simuleringen. Komplett lista visas under grafen.
      </p>
      <div className="mt-4 space-y-3">
        {top.map((item) => (
          <div key={item.exerciseId}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-slate-800">{item.exerciseName}</span>
              <span className="text-slate-500">{item.timesSelected} val</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(item.timesSelected / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
        <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.8fr_0.8fr] bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Övning</span>
          <span>Vald</span>
          <span>Klar</span>
          <span>Effort</span>
          <span>Vikt</span>
        </div>
        <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto bg-white">
          {aggregates.map((item) => (
            <div
              key={item.exerciseId}
              className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.8fr_0.8fr] px-3 py-3 text-sm text-slate-700"
            >
              <span className="font-medium text-slate-900">{item.exerciseName}</span>
              <span>{item.timesSelected}</span>
              <span>{item.timesCompleted}</span>
              <span>{item.avgEffortScore}</span>
              <span>
                {item.avgActualWeightKg != null
                  ? `${item.avgActualWeightKg} kg`
                  : "-"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
