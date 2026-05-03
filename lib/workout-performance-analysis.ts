import type { CompletedExercise, CompletedSet } from "@/lib/workout-log-storage";

export type WorkoutPerformanceSummary = {
  completedSetCount: number;
  totalPlannedSets: number;
  skippedSetCount: number;
  comparableSetCount: number;
  lowerThanPlannedSetCount: number;
  matchedPlannedSetCount: number;
  higherThanPlannedSetCount: number;
  plannedVolume: number;
  actualVolume: number;
  volumeRatio: number | null;
  plannedReps: number;
  actualReps: number;
  repsRatio: number | null;
  plannedDuration: number;
  actualDuration: number;
  durationRatio: number | null;
  overallRatio: number | null;
};

function safePositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function isSubstantiveCompletedSet(set: CompletedSet) {
  // Ett set ska bara räknas som genomfört om verkligt arbete faktiskt loggades.
  const actualReps = safePositiveNumber(set.actualReps);
  const actualDuration = safePositiveNumber(set.actualDuration);

  return actualReps !== null || actualDuration !== null;
}

function getSetCompletionRatio(set: CompletedSet) {
  const plannedWeight = safePositiveNumber(set.plannedWeight);
  const actualWeight = safePositiveNumber(set.actualWeight);
  const plannedReps = safePositiveNumber(set.plannedReps);
  const actualReps = safePositiveNumber(set.actualReps);
  const plannedDuration = safePositiveNumber(set.plannedDuration);
  const actualDuration = safePositiveNumber(set.actualDuration);

  if (plannedWeight && actualWeight && plannedReps && actualReps) {
    return (actualWeight * actualReps) / (plannedWeight * plannedReps);
  }

  if (plannedReps && actualReps) {
    return actualReps / plannedReps;
  }

  if (plannedDuration && actualDuration) {
    return actualDuration / plannedDuration;
  }

  return null;
}

function getRatio(actual: number, planned: number) {
  return planned > 0 ? actual / planned : null;
}

function getAverageRatio(ratios: number[]) {
  if (ratios.length === 0) {
    return null;
  }

  return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
}

export function buildWorkoutPerformanceSummary(params: {
  completedExercises: CompletedExercise[];
  totalPlannedSets: number;
}): WorkoutPerformanceSummary {
  const { completedExercises, totalPlannedSets } = params;
  const ratios: number[] = [];
  let completedSetCount = 0;
  let comparableSetCount = 0;
  let lowerThanPlannedSetCount = 0;
  let matchedPlannedSetCount = 0;
  let higherThanPlannedSetCount = 0;
  let plannedVolume = 0;
  let actualVolume = 0;
  let plannedReps = 0;
  let actualReps = 0;
  let plannedDuration = 0;
  let actualDuration = 0;

  for (const exercise of completedExercises) {
    for (const set of exercise.sets) {
      const setPlannedReps = safePositiveNumber(set.plannedReps);
      const setActualReps = safePositiveNumber(set.actualReps);
      const setPlannedWeight = safePositiveNumber(set.plannedWeight);
      const setActualWeight = safePositiveNumber(set.actualWeight);
      const setPlannedDuration = safePositiveNumber(set.plannedDuration);
      const setActualDuration = safePositiveNumber(set.actualDuration);
      const countsAsCompleted = isSubstantiveCompletedSet(set);

      if (countsAsCompleted) {
        completedSetCount += 1;
      }

      if (setPlannedReps) plannedReps += setPlannedReps;
      if (countsAsCompleted && setActualReps) actualReps += setActualReps;
      if (setPlannedDuration) plannedDuration += setPlannedDuration;
      if (countsAsCompleted && setActualDuration) actualDuration += setActualDuration;

      if (setPlannedWeight && setPlannedReps) {
        plannedVolume += setPlannedWeight * setPlannedReps;
      }
      if (countsAsCompleted && setActualWeight && setActualReps) {
        actualVolume += setActualWeight * setActualReps;
      }

      if (!countsAsCompleted) {
        continue;
      }

      const ratio = getSetCompletionRatio(set);
      if (ratio === null) {
        continue;
      }

      comparableSetCount += 1;
      ratios.push(ratio);

      // Små avvikelser räknas som enligt plan så feedbacken inte blir petig.
      if (ratio < 0.85) {
        lowerThanPlannedSetCount += 1;
      } else if (ratio > 1.1) {
        higherThanPlannedSetCount += 1;
      } else {
        matchedPlannedSetCount += 1;
      }
    }
  }

  return {
    completedSetCount,
    totalPlannedSets,
    skippedSetCount: Math.max(0, totalPlannedSets - completedSetCount),
    comparableSetCount,
    lowerThanPlannedSetCount,
    matchedPlannedSetCount,
    higherThanPlannedSetCount,
    plannedVolume,
    actualVolume,
    volumeRatio: getRatio(actualVolume, plannedVolume),
    plannedReps,
    actualReps,
    repsRatio: getRatio(actualReps, plannedReps),
    plannedDuration,
    actualDuration,
    durationRatio: getRatio(actualDuration, plannedDuration),
    overallRatio: getAverageRatio(ratios),
  };
}

export function getPerformanceStatus(summary: WorkoutPerformanceSummary) {
  if (summary.completedSetCount === 0) {
    return "none" as const;
  }

  if (summary.overallRatio !== null) {
    if (summary.overallRatio < 0.75) return "much_lower" as const;
    if (summary.overallRatio < 0.9) return "lower" as const;
    if (summary.overallRatio > 1.15) return "higher" as const;
    return "on_plan" as const;
  }

  if (summary.skippedSetCount > summary.completedSetCount) {
    return "lower" as const;
  }

  return "unknown" as const;
}
