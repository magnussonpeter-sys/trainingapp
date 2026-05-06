import { getExerciseById } from "@/lib/exercise-catalog";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import { getWorkoutPlanCredit } from "@/lib/planning/weekly-plan";
import type { WorkoutLog } from "@/lib/workout-log-storage";

export type TrainingHistoryRecentWorkout = {
  workoutLogId: string;
  workoutName: string;
  completedAt: string;
  durationMinutes: number;
  sessionCredit: number;
  reason: string;
  topExercises: Array<{
    exerciseId: string;
    exerciseName: string;
    variantGroup: string | null;
  }>;
};

export type TrainingHistoryProgressionMemoryItem = {
  exerciseId: string;
  exerciseName: string;
  variantGroup: string | null;
  lastPerformedAt: string;
  lastWorkingSet: {
    weight: number | null;
    reps: number | null;
    duration: number | null;
    effort: string | number | null;
  };
  suggestedPreviousWeight: number | null;
  trend: "increasing" | "stable" | "decreasing" | "unknown";
  sourceLogId: string;
};

export type TrainingHistoryMediumTermSummary = {
  windowDays: number;
  completedWorkoutCount: number;
  meaningfulWorkoutCount: number;
  totalTrainingMinutes: number;
  typicalWorkoutDurationMinutes: number | null;
  adherenceEstimate: number | null;
  muscleVolumeByGroup: Partial<Record<MuscleBudgetGroup, number>>;
  frequentlyUsedExercises: string[];
  recoveryLimitedMuscles: MuscleBudgetGroup[];
  undertrainedMuscles: MuscleBudgetGroup[];
  notes: string[];
};

export type TrainingHistoryContext = {
  dataQuality: "rich" | "mixed" | "limited";
  recentWorkouts: TrainingHistoryRecentWorkout[];
  exerciseProgressionMemory: TrainingHistoryProgressionMemoryItem[];
  mediumTermTrainingSummary: TrainingHistoryMediumTermSummary;
};

const RAW_MUSCLE_TO_BUDGET_GROUP: Record<string, MuscleBudgetGroup | null> = {
  chest: "chest",
  lats: "back",
  upper_back: "back",
  traps: "back",
  external_rotators: "back",
  quads: "quads",
  adductors: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  shoulders: "shoulders",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  biceps: "biceps",
  brachialis: "biceps",
  triceps: "triceps",
  calves: "calves",
  core: "core",
  obliques: "core",
  lower_back: "core",
  hip_flexors: "core",
  forearms: null,
  feet: null,
};

function getWorkoutDurationMinutes(log: WorkoutLog) {
  return Math.max(0, Math.round((log.durationSeconds ?? 0) / 60));
}

function getMedianValue(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }

  return sorted[middle];
}

function getSetPerformanceScore(set: WorkoutLog["exercises"][number]["sets"][number]) {
  if (typeof set.actualWeight === "number" && typeof set.actualReps === "number") {
    return set.actualWeight * set.actualReps;
  }

  if (typeof set.actualReps === "number" && set.actualReps > 0) {
    return set.actualReps;
  }

  if (typeof set.actualDuration === "number" && set.actualDuration > 0) {
    return set.actualDuration;
  }

  if (set.repsLeft !== null || set.timedEffort !== null) {
    return 1;
  }

  return 0;
}

function buildMuscleVolumeByGroup(logs: WorkoutLog[]) {
  const totals: Partial<Record<MuscleBudgetGroup, number>> = {};

  for (const log of logs) {
    const credit = getWorkoutPlanCredit(log);
    if (!credit.countsAsMeaningful || credit.muscleSetCreditScale <= 0) {
      continue;
    }

    for (const exercise of log.exercises) {
      const catalogExercise = getExerciseById(exercise.exerciseId);
      if (!catalogExercise) {
        continue;
      }

      const perGroupCredits = new Map<MuscleBudgetGroup, number>();

      for (const rawMuscle of catalogExercise.primaryMuscles ?? []) {
        const group = RAW_MUSCLE_TO_BUDGET_GROUP[rawMuscle] ?? null;
        if (!group) {
          continue;
        }

        perGroupCredits.set(group, Math.min(1, (perGroupCredits.get(group) ?? 0) + 1));
      }

      for (const rawMuscle of catalogExercise.secondaryMuscles ?? []) {
        const group = RAW_MUSCLE_TO_BUDGET_GROUP[rawMuscle] ?? null;
        if (!group) {
          continue;
        }

        const secondaryCredit = group === "core" ? 0.2 : 0.35;
        perGroupCredits.set(group, Math.min(1, (perGroupCredits.get(group) ?? 0) + secondaryCredit));
      }

      for (const [group, creditValue] of perGroupCredits) {
        totals[group] = (totals[group] ?? 0) + exercise.sets.length * creditValue * credit.muscleSetCreditScale;
      }
    }
  }

  return totals;
}

function getMeaningfulLogs(logs: WorkoutLog[]) {
  return logs
    .filter((log) => log.status === "completed")
    .map((log) => ({
      log,
      credit: getWorkoutPlanCredit(log),
    }))
    .filter(({ credit }) => credit.countsAsMeaningful && credit.sessionCredit >= 0.2)
    .sort(
      (left, right) =>
        new Date(right.log.completedAt).getTime() - new Date(left.log.completedAt).getTime(),
    );
}

function getRecoveryLimitedMusclesFromHistory(logs: WorkoutLog[], now: Date) {
  const recentVolume: Partial<Record<MuscleBudgetGroup, number>> = {};
  const cutoffTime = now.getTime() - 48 * 60 * 60 * 1000;

  for (const log of logs) {
    if (new Date(log.completedAt).getTime() < cutoffTime) {
      continue;
    }

    const volume = buildMuscleVolumeByGroup([log]);
    for (const [group, value] of Object.entries(volume) as Array<[MuscleBudgetGroup, number]>) {
      recentVolume[group] = (recentVolume[group] ?? 0) + value;
    }
  }

  return (Object.keys(recentVolume) as MuscleBudgetGroup[])
    .filter((group) => (recentVolume[group] ?? 0) >= 2.5)
    .sort((left, right) => (recentVolume[right] ?? 0) - (recentVolume[left] ?? 0));
}

function buildProgressionMemory(logs: WorkoutLog[], now: Date) {
  const cutoffTime = now.getTime() - 84 * 24 * 60 * 60 * 1000;
  const grouped = new Map<
    string,
    Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string | null;
      performedAt: string;
      sourceLogId: string;
      lastWorkingSet: {
        weight: number | null;
        reps: number | null;
        duration: number | null;
        effort: string | number | null;
      };
      score: number;
    }>
  >();

  for (const log of logs) {
    if (new Date(log.completedAt).getTime() < cutoffTime) {
      continue;
    }

    const credit = getWorkoutPlanCredit(log);
    if (!credit.countsAsMeaningful) {
      continue;
    }

    for (const exercise of log.exercises) {
      const catalogExercise = getExerciseById(exercise.exerciseId);
      const variantGroup = catalogExercise?.variantGroup ?? null;
      const key = variantGroup ?? exercise.exerciseId;
      const sortedSets = [...exercise.sets].sort((left, right) => left.setNumber - right.setNumber);
      const bestSet =
        [...sortedSets].sort(
          (left, right) => getSetPerformanceScore(right) - getSetPerformanceScore(left),
        )[0] ?? null;

      if (!bestSet) {
        continue;
      }

      const item = {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        variantGroup,
        performedAt: log.completedAt,
        sourceLogId: log.id,
        lastWorkingSet: {
          weight: typeof bestSet.actualWeight === "number" ? bestSet.actualWeight : null,
          reps: typeof bestSet.actualReps === "number" ? bestSet.actualReps : null,
          duration: typeof bestSet.actualDuration === "number" ? bestSet.actualDuration : null,
          effort: bestSet.repsLeft ?? bestSet.timedEffort ?? exercise.rating ?? null,
        },
        score: getSetPerformanceScore(bestSet),
      };

      const current = grouped.get(key) ?? [];
      current.push(item);
      grouped.set(key, current);
    }
  }

  return Array.from(grouped.values())
    .map((items) => {
      const sorted = [...items].sort(
        (left, right) =>
          new Date(right.performedAt).getTime() - new Date(left.performedAt).getTime(),
      );
      const latest = sorted[0];
      const comparator = sorted[1] ?? null;
      let trend: TrainingHistoryProgressionMemoryItem["trend"] = "unknown";

      if (comparator && latest.score > 0 && comparator.score > 0) {
        if (latest.score > comparator.score * 1.05) {
          trend = "increasing";
        } else if (latest.score < comparator.score * 0.95) {
          trend = "decreasing";
        } else {
          trend = "stable";
        }
      }

      return {
        exerciseId: latest.exerciseId,
        exerciseName: latest.exerciseName,
        variantGroup: latest.variantGroup,
        lastPerformedAt: latest.performedAt,
        lastWorkingSet: latest.lastWorkingSet,
        suggestedPreviousWeight: latest.lastWorkingSet.weight,
        trend,
        sourceLogId: latest.sourceLogId,
      } satisfies TrainingHistoryProgressionMemoryItem;
    })
    .sort(
      (left, right) =>
        new Date(right.lastPerformedAt).getTime() - new Date(left.lastPerformedAt).getTime(),
    )
    .slice(0, 18);
}

export function buildTrainingHistoryContext(params: {
  workoutLogs: WorkoutLog[];
  now?: Date;
  weeklyPlanPriorityMuscles?: MuscleBudgetGroup[];
  weeklyPlanDeficits?: Record<MuscleBudgetGroup, number> | null;
  weeklyBudget?: Array<{
    group: MuscleBudgetGroup;
    remainingSets: number;
    loadStatus?: string;
  }>;
  adherenceEstimate?: number | null;
}) {
  const now = params.now ?? new Date();
  const meaningfulLogsWithCredit = getMeaningfulLogs(params.workoutLogs);
  const meaningfulLogs = meaningfulLogsWithCredit.map(({ log }) => log);
  const recentWorkouts = meaningfulLogsWithCredit.slice(0, 3).map(({ log, credit }) => ({
    workoutLogId: log.id,
    workoutName: log.workoutName,
    completedAt: log.completedAt,
    durationMinutes: getWorkoutDurationMinutes(log),
    sessionCredit: credit.sessionCredit,
    reason: credit.reason,
    topExercises: log.exercises.slice(0, 4).map((exercise) => {
      const catalogExercise = getExerciseById(exercise.exerciseId);

      return {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        variantGroup: catalogExercise?.variantGroup ?? null,
      };
    }),
  }));

  const mediumTermCutoffTime = now.getTime() - 42 * 24 * 60 * 60 * 1000;
  const mediumTermLogs = meaningfulLogs.filter(
    (log) => new Date(log.completedAt).getTime() >= mediumTermCutoffTime,
  );
  const meaningfulDurations = mediumTermLogs
    .map((log) => getWorkoutDurationMinutes(log))
    .filter((duration) => duration >= 8);
  const typicalWorkoutDurationMinutes = getMedianValue(meaningfulDurations);
  const exerciseNameCounts = new Map<string, number>();

  for (const log of mediumTermLogs) {
    for (const exercise of log.exercises) {
      exerciseNameCounts.set(
        exercise.exerciseName,
        (exerciseNameCounts.get(exercise.exerciseName) ?? 0) + 1,
      );
    }
  }

  const weeklyBudgetRecoveryLimited = (params.weeklyBudget ?? [])
    .filter((entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over")
    .map((entry) => entry.group);
  const historyRecoveryLimited = getRecoveryLimitedMusclesFromHistory(mediumTermLogs, now);
  const undertrainedMuscles = Object.entries(params.weeklyPlanDeficits ?? {})
    .filter((entry): entry is [MuscleBudgetGroup, number] => typeof entry[1] === "number")
    .filter(([, deficit]) => deficit > 1)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([group]) => group);
  const notes: string[] = [];

  if (meaningfulLogs.length < 4) {
    notes.push("limited_history");
  }

  const missingWeightHeavyMemory = meaningfulLogsWithCredit.filter(({ log }) =>
    log.exercises.some((exercise) =>
      exercise.sets.every((set) => typeof set.actualWeight !== "number"),
    ),
  ).length;
  const dataQuality =
    meaningfulLogs.length >= 8 && missingWeightHeavyMemory <= 1
      ? "rich"
      : meaningfulLogs.length >= 3
        ? "mixed"
        : "limited";

  return {
    dataQuality,
    recentWorkouts,
    exerciseProgressionMemory: buildProgressionMemory(meaningfulLogs, now),
    mediumTermTrainingSummary: {
      windowDays: 42,
      completedWorkoutCount: params.workoutLogs.filter((log) => log.status === "completed").length,
      meaningfulWorkoutCount: mediumTermLogs.length,
      totalTrainingMinutes: mediumTermLogs.reduce(
        (sum, log) => sum + getWorkoutDurationMinutes(log),
        0,
      ),
      typicalWorkoutDurationMinutes,
      adherenceEstimate: params.adherenceEstimate ?? null,
      muscleVolumeByGroup: buildMuscleVolumeByGroup(mediumTermLogs),
      frequentlyUsedExercises: Array.from(exerciseNameCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([exerciseName]) => exerciseName),
      recoveryLimitedMuscles: Array.from(
        new Set([...weeklyBudgetRecoveryLimited, ...historyRecoveryLimited]),
      ),
      undertrainedMuscles: Array.from(
        new Set([...(params.weeklyPlanPriorityMuscles ?? []), ...undertrainedMuscles]),
      ).slice(0, 5),
      notes,
    },
  } satisfies TrainingHistoryContext;
}
