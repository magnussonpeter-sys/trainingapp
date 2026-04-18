import {
  HYPERTROPHY_AVERAGE_WEEKS,
  HYPERTROPHY_TARGETS,
} from "@/lib/analysis/analysis-config";
import {
  getCompletedWorkouts,
  getDoseGroupsForExercise,
  getWeekStart,
  roundToSingleDecimal,
} from "@/lib/analysis/analysis-helpers";
import type {
  HypertrophyDoseData,
  HypertrophyDoseGroup,
} from "@/lib/analysis/analysis-types";
import type { WorkoutLog } from "@/lib/workout-log-storage";

type DoseGroupKey = keyof typeof HYPERTROPHY_TARGETS;

function createEmptyGroup(key: DoseGroupKey): HypertrophyDoseGroup {
  const target = HYPERTROPHY_TARGETS[key];

  return {
    key,
    label: target.label,
    averageWeeklySets: 0,
    minTarget: target.min,
    maxTarget: target.max,
    status: "unclear",
  };
}

export function calculateHypertrophyDose(logs: WorkoutLog[]): HypertrophyDoseData {
  const completedWorkouts = getCompletedWorkouts(logs);

  if (completedWorkouts.length === 0) {
    return {
      title: "Hypertrofidos",
      status: "unclear",
      statusLabel: "För lite data",
      body: "Vi behöver genomförda pass för att kunna uppskatta hur mycket träningsvolym varje muskelgrupp får.",
      keyData: "0 genomförda pass",
      supportingPoints: ["När fler pass är loggade kan vi räkna snittset per muskelgrupp och vecka."],
      groups: Object.keys(HYPERTROPHY_TARGETS).map((key) =>
        createEmptyGroup(key as DoseGroupKey),
      ),
    };
  }

  const weekTotals = new Map<string, Record<DoseGroupKey, number>>();

  for (const workout of completedWorkouts) {
    const weekStart = getWeekStart(new Date(workout.completedAt).getTime());
    const weekKey = weekStart.toISOString().slice(0, 10);
    const totals =
      weekTotals.get(weekKey) ??
      {
        chest: 0,
        back: 0,
        legs: 0,
        shoulders: 0,
        arms: 0,
        core: 0,
      };

    for (const exercise of workout.exercises) {
      const groups = getDoseGroupsForExercise(exercise.exerciseId);
      if (groups.length === 0) {
        continue;
      }

      for (const group of groups) {
        totals[group] += exercise.sets.length;
      }
    }

    weekTotals.set(weekKey, totals);
  }

  const sortedWeeks = Array.from(weekTotals.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-HYPERTROPHY_AVERAGE_WEEKS);

  const groups = (Object.keys(HYPERTROPHY_TARGETS) as DoseGroupKey[]).map((key) => {
    const target = HYPERTROPHY_TARGETS[key];
    const averageWeeklySets =
      sortedWeeks.reduce((sum, [, values]) => sum + values[key], 0) /
      Math.max(sortedWeeks.length, 1);

    const status =
      averageWeeklySets === 0
        ? "under"
        : averageWeeklySets < target.min
          ? "under"
          : averageWeeklySets > target.max
            ? "high"
            : "within";

    return {
      key,
      label: target.label,
      averageWeeklySets: roundToSingleDecimal(averageWeeklySets),
      minTarget: target.min,
      maxTarget: target.max,
      status,
    } satisfies HypertrophyDoseGroup;
  });

  const underdosed = groups.filter((group) => group.status === "under");
  const overdosed = groups.filter((group) => group.status === "high");
  const wellDosed = groups.filter((group) => group.status === "within");

  const status =
    underdosed.length >= 3 ? "watch" : overdosed.length >= 2 ? "high" : "stable";
  const statusLabel =
    status === "watch"
      ? "Låg dos i flera grupper"
      : status === "high"
        ? "Hög total dos"
        : "Rimlig dos";

  const body =
    underdosed.length > 0
      ? `${underdosed
          .slice(0, 2)
          .map((group) => group.label.toLowerCase())
          .join(" och ")} ligger fortfarande lågt jämfört med appens coachintervall.`
      : overdosed.length > 0
        ? `Volymen är hög i ${overdosed
            .slice(0, 2)
            .map((group) => group.label.toLowerCase())
            .join(" och ")}, så det kan vara värt att bevaka återhämtningen.`
        : `Din volym ligger ganska nära en användbar hypertrofidos i ${wellDosed
            .slice(0, 2)
            .map((group) => group.label.toLowerCase())
            .join(" och ")}.`;

  return {
    title: "Hypertrofidos",
    status,
    statusLabel,
    body,
    keyData: `${sortedWeeks.length} veckor med snittset per muskelgrupp`,
    supportingPoints: [
      "Vi räknar arbetsset från genomförda pass och grupperar dem till breda muskelgrupper.",
      "Målzonerna är appens coachintervall för MVP-versionen, inte exakta facit.",
    ],
    groups,
  };
}
