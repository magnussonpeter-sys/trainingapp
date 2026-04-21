import type { SimulationEvaluation } from "@/lib/simulation/types";

export default function SimulationFlagsPanel({
  evaluation,
}: {
  evaluation: SimulationEvaluation;
}) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Tolkning
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {evaluation.summary}
      </h2>
      <div className="mt-4 grid gap-2">
        {evaluation.flags.length > 0 ? (
          evaluation.flags.map((flag) => (
            <div key={flag} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {flag}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Inga tydliga varningsflaggor i denna körning.
          </div>
        )}
      </div>
    </section>
  );
}

