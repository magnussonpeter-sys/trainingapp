import type { SimulationReport } from "@/lib/simulation/types";

function getPlannerStats(report: SimulationReport) {
  const summaries = report.dailySnapshots
    .map((snapshot) => snapshot.generatedWorkoutSummary)
    .filter((summary) => summary !== undefined);

  return {
    total: summaries.length,
    ai: summaries.filter((summary) => summary.plannerSource === "ai").length,
    fullAppChain: summaries.filter((summary) => summary.plannerSource === "full_app_chain").length,
    fallback: summaries.filter((summary) => summary.plannerSource === "ai_fallback").length,
    synthetic: summaries.filter((summary) => summary.plannerSource === "synthetic").length,
    realAppPlanner: summaries.filter((summary) => summary.plannerSource === "real_app_planner").length,
    lastNote: [...summaries].reverse().find((summary) => summary.plannerNote)?.plannerNote,
  };
}

export default function SimulationPlannerStatusCard({
  report,
}: {
  report: SimulationReport;
}) {
  const stats = getPlannerStats(report);
  const plannedWorkoutDayLabels = Array.isArray(report.plannedWorkoutDayLabels)
    ? report.plannedWorkoutDayLabels
    : [];
  const modeLabel =
    report.config.plannerMode === "full_app_chain"
      ? "Full app-kedja – veckoplan + AI-pass"
      : report.config.plannerMode === "hybrid_ai"
        ? "Hybrid AI-labb"
        : report.config.plannerMode === "real_app_planner"
          ? "Riktig veckoplanering – mockat pass"
        : "Syntetisk snabbmodell";
  const effectiveProfile = report.effectiveUserProfile;

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
          <p className="text-2xl font-semibold text-emerald-800">{stats.ai + stats.fullAppChain}</p>
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
        Planerade träningspass i körningen: {stats.total}. Planerade veckodagar:{" "}
        {plannedWorkoutDayLabels.join(", ").toLowerCase() || "inga"}.{" "}
        {stats.realAppPlanner > 0 ? `Riktig planner: ${stats.realAppPlanner}. ` : ""}
        {stats.fullAppChain > 0 ? `Full app-kedja: ${stats.fullAppChain}. ` : ""}
        {stats.lastNote ? `Senaste status: ${stats.lastNote}` : null}
      </p>
      {effectiveProfile ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Effektiv profil
          </p>
          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <p>
              <span className="font-medium text-slate-900">Preset:</span>{" "}
              {effectiveProfile.presetProfileId ?? report.profile.id}
            </p>
            <p>
              <span className="font-medium text-slate-900">Mål:</span>{" "}
              {effectiveProfile.effectiveGoal}
            </p>
            <p>
              <span className="font-medium text-slate-900">Nivå:</span>{" "}
              {effectiveProfile.effectiveExperienceLevel}
            </p>
            <p>
              <span className="font-medium text-slate-900">Källa:</span>{" "}
              {effectiveProfile.sourceProfile}
            </p>
            <p>
              <span className="font-medium text-slate-900">Ålder:</span>{" "}
              {effectiveProfile.effectiveAge ?? "-"}
            </p>
            <p>
              <span className="font-medium text-slate-900">Längd:</span>{" "}
              {effectiveProfile.effectiveHeightCm ?? "-"} cm
            </p>
            <p>
              <span className="font-medium text-slate-900">Vikt:</span>{" "}
              {effectiveProfile.effectiveWeightKg ?? "-"} kg
            </p>
            <p>
              <span className="font-medium text-slate-900">Vanlig passlängd:</span>{" "}
              {effectiveProfile.effectivePreferredDurationMinutes ?? "-"} min
            </p>
            <p>
              <span className="font-medium text-slate-900">Sportspecifikt mål:</span>{" "}
              {effectiveProfile.effectiveSportFocus}
            </p>
            <p>
              <span className="font-medium text-slate-900">Prioriterade muskler:</span>{" "}
              {effectiveProfile.effectivePriorityMuscles.join(", ") || "inga"}
            </p>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Planerade träningsdagar:{" "}
            {effectiveProfile.effectivePlannedTrainingDays.length > 0
              ? effectiveProfile.effectivePlannedTrainingDays.join(", ")
              : "inga"}
            . Utrustning:{" "}
            {effectiveProfile.effectiveEquipment.length > 0
              ? effectiveProfile.effectiveEquipment.join(", ")
              : "okänd"}
            .
          </p>
          {effectiveProfile.warnings.length > 0 ? (
            <p className="mt-2 text-xs leading-5 text-amber-700">
              Profilvarningar: {effectiveProfile.warnings.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}
      {report.notes?.length ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {report.notes.join(" ")}
        </p>
      ) : null}
    </section>
  );
}
