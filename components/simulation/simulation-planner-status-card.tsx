import type { SimulationReport } from "@/lib/simulation/types";

function getPlannerStats(report: SimulationReport) {
  const summaries = report.dailySnapshots
    .map((snapshot) => snapshot.generatedWorkoutSummary)
    .filter((summary) => summary !== undefined);

  return {
    total: summaries.length,
    ai: summaries.filter((summary) => summary.plannerSource === "ai").length,
    fallback: summaries.filter((summary) => summary.plannerSource === "ai_fallback").length,
    synthetic: summaries.filter((summary) => summary.plannerSource === "synthetic").length,
    lastNote: [...summaries].reverse().find((summary) => summary.plannerNote)?.plannerNote,
  };
}

export default function SimulationPlannerStatusCard({
  report,
}: {
  report: SimulationReport;
}) {
  const stats = getPlannerStats(report);
  const modeLabel =
    report.config.plannerMode === "hybrid_ai"
      ? "Hybrid: AI föreslår pass"
      : "Syntetisk snabbmodell";

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Planeringskälla
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {modeLabel}
      </h2>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-emerald-50 px-3 py-3">
          <p className="text-2xl font-semibold text-emerald-800">{stats.ai}</p>
          <p className="text-xs text-emerald-900">AI-pass</p>
        </div>
        <div className="rounded-2xl bg-amber-50 px-3 py-3">
          <p className="text-2xl font-semibold text-amber-800">{stats.fallback}</p>
          <p className="text-xs text-amber-900">Fallback</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <p className="text-2xl font-semibold text-slate-800">{stats.synthetic}</p>
          <p className="text-xs text-slate-600">Syntetiska</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Planerade träningspass i körningen: {stats.total}.{" "}
        {stats.lastNote ? `Senaste status: ${stats.lastNote}` : null}
      </p>
    </section>
  );
}

