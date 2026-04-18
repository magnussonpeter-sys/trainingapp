import {
  STRENGTH_PROGRESS_THRESHOLDS,
  STRENGTH_RECENT_EXPOSURES,
} from "@/lib/analysis/analysis-config";
import {
  estimateExerciseStrengthScore,
  getCompletedWorkouts,
  getExerciseDisplayLabel,
  getMovementPatternLabel,
  roundToSingleDecimal,
} from "@/lib/analysis/analysis-helpers";
import type { StrengthProgressData } from "@/lib/analysis/analysis-types";
import type { WorkoutLog } from "@/lib/workout-log-storage";

type Exposure = {
  key: string;
  label: string;
  completedAt: string;
  score: number;
};

function getTopStrengthExposures(logs: WorkoutLog[]) {
  const exposures: Exposure[] = [];

  for (const workout of getCompletedWorkouts(logs)) {
    for (const exercise of workout.exercises) {
      const score = estimateExerciseStrengthScore(exercise);
      if (!score) {
        continue;
      }

      const label = getExerciseDisplayLabel(exercise.exerciseId, exercise.exerciseName);
      const movementPattern = getMovementPatternLabel(exercise.exerciseId);

      exposures.push({
        key: exercise.exerciseId || movementPattern || label,
        label,
        completedAt: workout.completedAt,
        score,
      });
    }
  }

  return exposures;
}

export function calculateStrengthProgress(logs: WorkoutLog[]): StrengthProgressData {
  const exposures = getTopStrengthExposures(logs);

  if (exposures.length < 3) {
    return {
      title: "Styrkeprogress",
      status: "unclear",
      statusLabel: "Oklar trend",
      body: "Vi behöver fler återkommande belastade pass för att kunna bedöma styrkeutvecklingen säkrare.",
      keyData: `${exposures.length} relevanta exponeringar`,
      supportingPoints: [
        "Fler återkommande övningar gör analysen säkrare.",
        "Belastade set väger tyngst i den här bedömningen.",
      ],
      driverLabels: [],
      reliabilityLabel: "Låg tillförlitlighet",
    };
  }

  const grouped = new Map<string, Exposure[]>();
  for (const exposure of exposures) {
    const current = grouped.get(exposure.key) ?? [];
    current.push(exposure);
    grouped.set(exposure.key, current);
  }

  const candidates = Array.from(grouped.values())
    .map((items) => items.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()))
    .filter((items) => items.length >= 2);

  if (candidates.length === 0) {
    return {
      title: "Styrkeprogress",
      status: "unclear",
      statusLabel: "Oklar trend",
      body: "Det finns belastade set, men ännu inte tillräckligt många återkommande exponeringar i samma rörelser.",
      keyData: `${exposures.length} relevanta exponeringar`,
      supportingPoints: ["Fortsätt logga återkommande huvudövningar för en tydligare styrketrend."],
      driverLabels: [],
      reliabilityLabel: "Låg tillförlitlighet",
    };
  }

  const ranked = candidates
    .map((items) => {
      const recent = items.slice(-STRENGTH_RECENT_EXPOSURES);
      const previous = items.slice(-STRENGTH_RECENT_EXPOSURES * 2, -STRENGTH_RECENT_EXPOSURES);
      const recentAverage =
        recent.reduce((sum, item) => sum + item.score, 0) / recent.length;
      const previousAverage =
        previous.length > 0
          ? previous.reduce((sum, item) => sum + item.score, 0) / previous.length
          : items[0].score;
      const deltaPercent =
        previousAverage > 0 ? ((recentAverage - previousAverage) / previousAverage) * 100 : 0;

      return {
        label: items[0].label,
        exposureCount: items.length,
        deltaPercent,
      };
    })
    .sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent));

  const topDrivers = ranked.slice(0, 3);
  const averageDelta =
    topDrivers.reduce((sum, item) => sum + item.deltaPercent, 0) / topDrivers.length;

  const status =
    averageDelta >= STRENGTH_PROGRESS_THRESHOLDS.positivePercent
      ? "positive"
      : averageDelta <= STRENGTH_PROGRESS_THRESHOLDS.fallingPercent
        ? "watch"
        : "stable";

  const statusLabel =
    status === "positive"
      ? "Positiv trend"
      : status === "watch"
        ? "Fallande trend"
        : "Stabil trend";

  const body =
    status === "positive"
      ? `Du förbättrar dig i återkommande belastade rörelser, framför allt ${topDrivers
          .slice(0, 2)
          .map((item) => item.label)
          .join(" och ")}.`
      : status === "watch"
        ? `Prestationen ser något svagare ut i återkommande rörelser, särskilt ${topDrivers
            .slice(0, 2)
            .map((item) => item.label)
            .join(" och ")}.`
        : `Dina belastade huvudrörelser ligger ungefär stabilt just nu, med små förändringar i ${topDrivers
            .slice(0, 2)
            .map((item) => item.label)
            .join(" och ")}.`;

  const reliabilityLabel =
    topDrivers.every((item) => item.exposureCount >= 4)
      ? "Medelhög till hög tillförlitlighet"
      : "Medelhög tillförlitlighet";

  return {
    title: "Styrkeprogress",
    status,
    statusLabel,
    body,
    keyData: `Förändring cirka ${roundToSingleDecimal(averageDelta)}% i återkommande belastade rörelser`,
    supportingPoints: [
      `Analysen bygger främst på ${topDrivers.length} återkommande övningar eller rörelsemönster.`,
      "Styrketrenden baseras på uppskattad utveckling i belastade arbetsset.",
    ],
    driverLabels: topDrivers.map((item) => item.label),
    reliabilityLabel,
  };
}
