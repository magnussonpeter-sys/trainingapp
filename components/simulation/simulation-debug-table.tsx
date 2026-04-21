import type {
  SimulationDailySnapshot,
  SimulationPlannerDebugEntry,
} from "@/lib/simulation/types";

type PlannerSource = NonNullable<
  SimulationDailySnapshot["generatedWorkoutSummary"]
>["plannerSource"];

function format(value: number) {
  return Math.round(value * 10) / 10;
}

function plannerLabel(source?: PlannerSource) {
  if (source === "ai") {
    return "AI";
  }

  if (source === "ai_fallback") {
    return "Fallback";
  }

  if (source === "synthetic") {
    return "Syntetisk";
  }

  return "-";
}

export default function SimulationDebugTable({
  plannerDebug,
  snapshots,
}: {
  plannerDebug?: SimulationPlannerDebugEntry[];
  snapshots: SimulationDailySnapshot[];
}) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Dag-för-dag debug</h2>
      <p className="mt-1 text-sm text-slate-500">Detaljtabell för att kunna felsöka modellens beslut.</p>
      <div className="mt-4 max-h-[520px] overflow-auto rounded-3xl border border-slate-200">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Datum</th>
              <th className="px-3 py-3">Readiness före</th>
              <th className="px-3 py-3">Fatigue före</th>
              <th className="px-3 py-3">Plan</th>
              <th className="px-3 py-3">Källa</th>
              <th className="px-3 py-3">Resultat</th>
              <th className="px-3 py-3">Load</th>
              <th className="px-3 py-3">Readiness efter</th>
              <th className="px-3 py-3">Fatigue efter</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {snapshots.map((snapshot) => (
              <tr key={snapshot.dayIndex}>
                <td className="px-3 py-3 text-slate-800">{snapshot.date}</td>
                <td className="px-3 py-3">{format(snapshot.stateBefore.readiness)}</td>
                <td className="px-3 py-3">{format(snapshot.stateBefore.fatigue)}</td>
                <td className="px-3 py-3">{snapshot.plannedTraining.isPlannedTrainingDay ? "Träning" : "Vila"}</td>
                <td
                  className="px-3 py-3 text-xs font-semibold text-slate-600"
                  title={snapshot.generatedWorkoutSummary?.plannerNote}
                >
                  {plannerLabel(snapshot.generatedWorkoutSummary?.plannerSource)}
                </td>
                <td className="px-3 py-3">
                  {snapshot.workoutResult?.skipped
                    ? `Missat (${snapshot.workoutResult.skipReason})`
                    : snapshot.workoutResult?.completed
                      ? "Genomfört"
                      : snapshot.workoutResult
                        ? "Delvis"
                        : "-"}
                </td>
                <td className="px-3 py-3">{snapshot.workoutResult?.estimatedLoadScore ?? "-"}</td>
                <td className="px-3 py-3">{format(snapshot.stateAfter.readiness)}</td>
                <td className="px-3 py-3">{format(snapshot.stateAfter.fatigue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plannerDebug?.length ? (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Planner-debug: identitet före/efter normalisering
          </h3>
          <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
            {plannerDebug.map((entry) => (
              <div key={`${entry.dayIndex}-${entry.source}`} className="rounded-2xl bg-white p-3 text-xs text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-slate-900">
                  <span>Dag {entry.dayIndex + 1} · {entry.date} · {plannerLabel(entry.source)}</span>
                  <span>{entry.repeatedAggregationKeys.length} nyligen upprepade</span>
                </div>
                <p className="mt-2 text-slate-500">{entry.note}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="font-semibold text-slate-700">Före</p>
                    <p className="mt-1 leading-5">
                      {entry.beforeNormalization.map((exercise) => `${exercise.exerciseName} [${exercise.aggregationKey}]`).join(", ")}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">Efter</p>
                    <p className="mt-1 leading-5">
                      {entry.afterNormalization.map((exercise) => `${exercise.exerciseName} [${exercise.aggregationKey}]`).join(", ")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
