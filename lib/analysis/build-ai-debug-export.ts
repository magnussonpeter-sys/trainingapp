import { getExerciseById } from "@/lib/exercise-catalog";
import type {
  AiDebugCompletedWorkout,
  AiDebugCompletedWorkoutExercise,
  AiDebugExerciseSelectionDiagnostic,
  AiDebugExport,
  AiDebugExportOptions,
  AiDebugGeneratedWorkout,
  AiDebugGeneratedWorkoutExercise,
  AiDebugMuscleBudgetSnapshotEntry,
  AiDebugPlannerDiagnostic,
  AiDebugProgressionDiagnostic,
  StoredAiGeneratedWorkoutSnapshot,
} from "@/lib/analysis/ai-debug-types";
import { buildWeeklyWorkoutStructure } from "@/lib/weekly-workout-structure";
import type {
  MuscleBudgetEntry,
  MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import type { WorkoutLog } from "@/lib/workout-log-storage";
import type { Workout } from "@/types/workout";

type ProgressionSnapshot = {
  lastWeight: number | null;
  lastReps: number | null;
  lastDuration: number | null;
  lastExtraReps: number | null;
  lastTimedEffort: "easy" | "moderate" | "hard" | null;
  updatedAt: string;
};

type SettingsLike = {
  training_goal?: string | null;
  sex?: string | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  experience_level?: string | null;
  primary_priority_muscle?: string | null;
  secondary_priority_muscle?: string | null;
  tertiary_priority_muscle?: string | null;
};

type GymLike = {
  id: string | number;
  name: string;
  equipment?: Array<Record<string, unknown>>;
};

type BuildAiDebugExportParams = {
  settings: SettingsLike | null;
  logs: WorkoutLog[];
  gyms: GymLike[];
  generatedWorkouts: StoredAiGeneratedWorkoutSnapshot[];
  draftWorkout: Workout | null;
  progressionSnapshots: Record<string, ProgressionSnapshot>;
  options: AiDebugExportOptions;
};

type NormalizedWeeklyPlanningSettings = {
  experience_level?: string | null;
  training_goal?: "strength" | "hypertrophy" | "health" | "body_composition" | null;
  primary_priority_muscle?: MuscleBudgetGroup | null;
  secondary_priority_muscle?: MuscleBudgetGroup | null;
  tertiary_priority_muscle?: MuscleBudgetGroup | null;
};

const MUSCLE_LABELS: Record<MuscleBudgetGroup, string> = {
  chest: "Bröst",
  back: "Rygg",
  quads: "Framsida lår",
  hamstrings: "Baksida lår",
  glutes: "Säte",
  shoulders: "Axlar",
  biceps: "Biceps",
  triceps: "Triceps",
  calves: "Vader",
  core: "Bål",
};

const GOAL_DEFAULT_PRIORITIES: Record<
  string,
  Record<MuscleBudgetGroup, "high" | "medium" | "low">
> = {
  strength: {
    chest: "medium",
    back: "high",
    quads: "high",
    hamstrings: "medium",
    glutes: "high",
    shoulders: "medium",
    biceps: "low",
    triceps: "medium",
    calves: "low",
    core: "medium",
  },
  hypertrophy: {
    chest: "high",
    back: "high",
    quads: "high",
    hamstrings: "medium",
    glutes: "medium",
    shoulders: "high",
    biceps: "medium",
    triceps: "medium",
    calves: "low",
    core: "low",
  },
  body_composition: {
    chest: "medium",
    back: "high",
    quads: "high",
    hamstrings: "medium",
    glutes: "medium",
    shoulders: "medium",
    biceps: "low",
    triceps: "low",
    calves: "low",
    core: "high",
  },
  health: {
    chest: "medium",
    back: "medium",
    quads: "medium",
    hamstrings: "medium",
    glutes: "medium",
    shoulders: "medium",
    biceps: "low",
    triceps: "low",
    calves: "low",
    core: "medium",
  },
};

function parseDateMs(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function getPriorityMuscles(settings: SettingsLike | null) {
  return [
    settings?.primary_priority_muscle ?? null,
    settings?.secondary_priority_muscle ?? null,
    settings?.tertiary_priority_muscle ?? null,
  ].filter((value): value is MuscleBudgetGroup => typeof value === "string");
}

function normalizeWeeklyPlanningSettings(
  settings: SettingsLike | null,
): NormalizedWeeklyPlanningSettings | undefined {
  if (!settings) {
    return undefined;
  }

  const trainingGoal =
    settings.training_goal === "strength" ||
    settings.training_goal === "hypertrophy" ||
    settings.training_goal === "health" ||
    settings.training_goal === "body_composition"
      ? settings.training_goal
      : null;
  const [primary, secondary, tertiary] = getPriorityMuscles(settings);

  return {
    experience_level: settings.experience_level ?? null,
    training_goal: trainingGoal,
    primary_priority_muscle: primary ?? null,
    secondary_priority_muscle: secondary ?? null,
    tertiary_priority_muscle: tertiary ?? null,
  };
}

function getRequestedHistoryWindow(options: AiDebugExportOptions) {
  if (options.includeLast30Days) {
    return 30;
  }

  if (options.includeLast7Days) {
    return 7;
  }

  return 90;
}

function filterLogsByWindow(logs: WorkoutLog[], windowDays: number) {
  const now = Date.now();
  const threshold = windowDays * 24 * 60 * 60 * 1000;

  return logs.filter((log) => {
    const completedAtMs = parseDateMs(log.completedAt);
    return completedAtMs > 0 && now - completedAtMs <= threshold;
  });
}

function getSourceLabel(log: WorkoutLog) {
  const context = (log as WorkoutLog & { context?: Record<string, unknown> }).context;
  const metadata = (log as WorkoutLog & { metadata?: Record<string, unknown> }).metadata;
  const sourceValue =
    typeof context?.source === "string"
      ? context.source
      : typeof metadata?.source === "string"
        ? metadata.source
        : null;

  return sourceValue === "ai" || sourceValue === "manual"
    ? sourceValue
    : "not_available";
}

function getGoalDefaultPriority(
  goal: string | null | undefined,
  muscle: MuscleBudgetGroup,
) {
  const normalizedGoal =
    typeof goal === "string" && goal.trim() ? goal.trim() : "health";

  return (
    GOAL_DEFAULT_PRIORITIES[normalizedGoal]?.[muscle] ??
    GOAL_DEFAULT_PRIORITIES.health[muscle]
  );
}

function getEffectivePriorityReason(params: {
  entry: MuscleBudgetEntry;
  defaultPriority: string;
  priorityMuscles: MuscleBudgetGroup[];
}) {
  const rank = params.priorityMuscles.indexOf(params.entry.group);

  if (rank === 0) {
    return "Förstaprioritet från användarens muskelval.";
  }

  if (rank === 1) {
    return "Andraprioritet från användarens muskelval.";
  }

  if (rank === 2) {
    return "Tredje prioritet från användarens muskelval.";
  }

  if (params.entry.priority !== params.defaultPriority) {
    return "Prioriteten justerades av veckobudgetens aktuella behov.";
  }

  if (params.entry.remainingSets > 0) {
    return "Prioriteten drivs främst av återstående veckobudget.";
  }

  return "Prioriteten följer målprofilens standardviktning.";
}

function buildMuscleBudgetSnapshot(params: {
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
  settings: SettingsLike | null;
}): AiDebugMuscleBudgetSnapshotEntry[] {
  const priorityMuscles = getPriorityMuscles(params.settings);

  return params.weeklyStructure.muscleBudget.map((entry) => {
    const defaultPriority = getGoalDefaultPriority(
      params.settings?.training_goal,
      entry.group,
    );

    return {
      muscle: entry.group,
      label: entry.label,
      targetSets: entry.targetSets,
      completedSets: entry.completedSets,
      remainingSets: entry.remainingSets,
      status: entry.loadStatus,
      trend: entry.progressStatus,
      rolling4WeekAverage: entry.recent4WeekAvgSets,
      priorityLevel: entry.priority,
      goalDefaultPriority: defaultPriority,
      adjustedPriority: entry.priority,
      effectivePriorityReason: getEffectivePriorityReason({
        entry,
        defaultPriority,
        priorityMuscles,
      }),
    };
  });
}

function mapStimulusGroup(rawMuscle: string) {
  if (
    rawMuscle === "chest" ||
    rawMuscle === "back" ||
    rawMuscle === "quads" ||
    rawMuscle === "hamstrings" ||
    rawMuscle === "glutes" ||
    rawMuscle === "shoulders" ||
    rawMuscle === "biceps" ||
    rawMuscle === "triceps" ||
    rawMuscle === "calves" ||
    rawMuscle === "core"
  ) {
    return rawMuscle as MuscleBudgetGroup;
  }

  if (rawMuscle === "lats" || rawMuscle === "upper_back" || rawMuscle === "traps") {
    return "back" as const;
  }

  if (
    rawMuscle === "front_delts" ||
    rawMuscle === "side_delts" ||
    rawMuscle === "rear_delts"
  ) {
    return "shoulders" as const;
  }

  if (rawMuscle === "obliques" || rawMuscle === "lower_back") {
    return "core" as const;
  }

  return null;
}

function buildStimulusEstimate(exercises: WorkoutLog["exercises"]) {
  const totals = Object.fromEntries(
    Object.keys(MUSCLE_LABELS).map((key) => [key, 0]),
  ) as Record<MuscleBudgetGroup, number>;

  for (const exercise of exercises) {
    const catalogExercise = getExerciseById(exercise.exerciseId);
    if (!catalogExercise) {
      continue;
    }

    const setCount = Math.max(0, exercise.sets.length || exercise.plannedSets || 0);

    for (const primary of catalogExercise.primaryMuscles) {
      const mapped = mapStimulusGroup(primary);
      if (mapped) {
        totals[mapped] += setCount;
      }
    }

    for (const secondary of catalogExercise.secondaryMuscles ?? []) {
      const mapped = mapStimulusGroup(secondary);
      if (mapped) {
        totals[mapped] += setCount * 0.5;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(totals)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => [key, roundToSingleDecimal(value)]),
  );
}

function buildCompletedWorkoutExercise(
  exercise: WorkoutLog["exercises"][number],
): AiDebugCompletedWorkoutExercise {
  const catalogExercise = getExerciseById(exercise.exerciseId);
  const completedReps = exercise.sets.reduce((sum, set) => {
    return sum + (typeof set.actualReps === "number" ? set.actualReps : 0);
  }, 0);
  const completedDuration = exercise.sets.reduce((sum, set) => {
    return sum + (typeof set.actualDuration === "number" ? set.actualDuration : 0);
  }, 0);
  const usedWeightValues = exercise.sets
    .map((set) => set.actualWeight)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const lastWeight = usedWeightValues.length > 0 ? usedWeightValues[usedWeightValues.length - 1] : null;

  return {
    exerciseId: exercise.exerciseId,
    exerciseName: catalogExercise?.name ?? exercise.exerciseName,
    movementPattern: catalogExercise?.movementPattern ?? null,
    primaryMuscles: catalogExercise?.primaryMuscles ?? [],
    secondaryMuscles: catalogExercise?.secondaryMuscles ?? [],
    prescribedSets: exercise.plannedSets,
    prescribedReps: exercise.plannedReps ?? null,
    prescribedDuration: exercise.plannedDuration ?? null,
    completedSets: exercise.sets.length,
    completedReps: completedReps > 0 ? completedReps : null,
    completedDuration: completedDuration > 0 ? completedDuration : null,
    usedWeight: lastWeight,
    effort: exercise.extraReps ?? exercise.timedEffort ?? null,
    feedback: exercise.rating ?? null,
  };
}

function buildCompletedWorkouts(params: {
  logs: WorkoutLog[];
  settings: SettingsLike | null;
  limit: number;
}): AiDebugCompletedWorkout[] {
  return params.logs
    .filter((log) => log.status === "completed")
    .sort((left, right) => parseDateMs(right.completedAt) - parseDateMs(left.completedAt))
    .slice(0, params.limit)
    .map((log) => {
      const exercises = log.exercises.map((exercise) =>
        buildCompletedWorkoutExercise(exercise),
      );
      const primaryMuscles = Array.from(
        new Set(exercises.flatMap((exercise) => exercise.primaryMuscles)),
      );
      const secondaryMuscles = Array.from(
        new Set(exercises.flatMap((exercise) => exercise.secondaryMuscles)),
      );

      return {
        date: log.completedAt,
        durationMinutes: Math.max(1, Math.round(log.durationSeconds / 60)),
        workoutName: log.workoutName,
        goal: params.settings?.training_goal ?? null,
        source: getSourceLabel(log),
        blockCount: null,
        exercises,
        primaryMuscles,
        secondaryMuscles,
        estimatedStimulusPerMuscle: buildStimulusEstimate(log.exercises),
      };
    });
}

function sanitizeRequest(
  request: Record<string, unknown> | null,
  anonymize: boolean,
) {
  if (!request) {
    return null;
  }

  const rest = { ...request };
  delete rest.userId;

  if (!anonymize) {
    return rest;
  }

  return {
    ...rest,
    gym: typeof rest.gym === "string" && rest.gym.trim() ? "selected_gym" : rest.gym,
    gymLabel:
      typeof rest.gymLabel === "string" && rest.gymLabel.trim()
        ? "selected_gym"
        : rest.gymLabel,
  };
}

function buildGeneratedWorkoutExercise(
  exercise: NonNullable<Workout["blocks"]>[number]["exercises"][number],
): AiDebugGeneratedWorkoutExercise {
  const catalogExercise = getExerciseById(exercise.id);

  return {
    exerciseId: exercise.id,
    exerciseName: catalogExercise?.name ?? exercise.name,
    movementPattern: catalogExercise?.movementPattern ?? null,
    primaryMuscles: catalogExercise?.primaryMuscles ?? [],
    secondaryMuscles: catalogExercise?.secondaryMuscles ?? [],
    suggestedWeight: exercise.suggestedWeight ?? null,
    suggestedWeightLabel: exercise.suggestedWeightLabel ?? null,
    progressionNote: exercise.progressionNote ?? null,
  };
}

function buildGeneratedWorkoutSummary(
  snapshot: StoredAiGeneratedWorkoutSnapshot,
  anonymize: boolean,
): AiDebugGeneratedWorkout {
  const exercises =
    snapshot.normalizedWorkout?.blocks.flatMap((block) => {
      return block.exercises.map((exercise) => buildGeneratedWorkoutExercise(exercise));
    }) ?? [];

  return {
    createdAt: snapshot.createdAt,
    requestedDurationMinutes: snapshot.requestedDurationMinutes,
    goal: snapshot.goal,
    selectedGym:
      anonymize && snapshot.selectedGym ? "selected_gym" : snapshot.selectedGym,
    equipmentSeed: snapshot.equipmentSeed,
    rawPreviewInput: sanitizeRequest(snapshot.request, anonymize),
    normalizedWorkout: snapshot.normalizedWorkout,
    workoutFocusTag: snapshot.workoutFocusTag,
    chosenExercises: exercises,
    whyChosen: null,
    suggestedProgression: exercises
      .filter(
        (exercise) =>
          exercise.suggestedWeight !== null || exercise.progressionNote !== null,
      )
      .map((exercise) => ({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        suggestedWeight: exercise.suggestedWeight,
        progressionNote: exercise.progressionNote,
      })),
  };
}

function getLatestGeneratedWorkouts(params: {
  generatedWorkouts: StoredAiGeneratedWorkoutSnapshot[];
  draftWorkout: Workout | null;
  limit: number;
}): StoredAiGeneratedWorkoutSnapshot[] {
  const history = [...params.generatedWorkouts];

  if (params.draftWorkout?.aiDebug) {
    history.unshift({
      createdAt: params.draftWorkout.createdAt ?? new Date().toISOString(),
      requestedDurationMinutes: params.draftWorkout.duration ?? null,
      goal: params.draftWorkout.goal ?? null,
      selectedGym: params.draftWorkout.gymLabel ?? params.draftWorkout.gym ?? null,
      equipmentSeed: [],
      workoutFocusTag: params.draftWorkout.plannedFocus ?? null,
      request: null,
      weeklyBudget: null,
      weeklyPlan: null,
      normalizedWorkout: params.draftWorkout,
      aiDebug: params.draftWorkout.aiDebug ?? null,
    });
  }

  const unique = new Map<string, StoredAiGeneratedWorkoutSnapshot>();

  for (const snapshot of history) {
    const key = `${snapshot.createdAt}:${snapshot.normalizedWorkout?.name ?? "workout"}`;
    if (!unique.has(key)) {
      unique.set(key, snapshot);
    }
  }

  return Array.from(unique.values())
    .sort((left, right) => parseDateMs(right.createdAt) - parseDateMs(left.createdAt))
    .slice(0, params.limit);
}

function getRecentExerciseHistory(logs: WorkoutLog[], exerciseId: string) {
  const matching = logs
    .filter((log) => log.status === "completed")
    .flatMap((log) =>
      log.exercises
        .filter((exercise) => exercise.exerciseId === exerciseId)
        .map((exercise) => ({
          completedAt: log.completedAt,
          exercise,
        })),
    )
    .sort((left, right) => parseDateMs(right.completedAt) - parseDateMs(left.completedAt));

  return matching.slice(0, 4);
}

function inferProgressionRule(params: {
  exercise: NonNullable<Workout["blocks"]>[number]["exercises"][number];
  progressionSnapshot: ProgressionSnapshot | null;
  historyCount: number;
}) {
  const suggestedWeight =
    typeof params.exercise.suggestedWeight === "number"
      ? params.exercise.suggestedWeight
      : null;
  const lastWeight = params.progressionSnapshot?.lastWeight ?? null;

  if (params.exercise.duration && params.progressionSnapshot?.lastDuration) {
    return "timed_progression_from_recent_duration";
  }

  if (suggestedWeight === null) {
    return params.progressionSnapshot ? "bodyweight_or_non_load_progression" : "not_applicable";
  }

  if (lastWeight === null) {
    return params.historyCount > 0 ? "history_without_weight_fallback" : "fallback_without_history";
  }

  if (suggestedWeight > lastWeight) {
    return "increase_from_recent_performance";
  }

  if (suggestedWeight < lastWeight) {
    return "conservative_regression";
  }

  return "maintain_recent_load";
}

function buildRecentHistorySummary(
  history: ReturnType<typeof getRecentExerciseHistory>,
) {
  if (history.length === 0) {
    return "Ingen nylig historik för exakt samma övning.";
  }

  return history
    .map(({ completedAt, exercise }) => {
      const lastSet = exercise.sets[exercise.sets.length - 1];
      const weight =
        typeof lastSet?.actualWeight === "number" ? `${lastSet.actualWeight} kg` : "ingen vikt";
      const reps =
        typeof lastSet?.actualReps === "number"
          ? `${lastSet.actualReps} reps`
          : typeof lastSet?.actualDuration === "number"
            ? `${lastSet.actualDuration} sek`
            : "utan exakt setdata";

      return `${completedAt.slice(0, 10)}: ${weight}, ${reps}`;
    })
    .join(" | ");
}

function buildProgressionDiagnostics(params: {
  workouts: StoredAiGeneratedWorkoutSnapshot[];
  logs: WorkoutLog[];
  progressionSnapshots: Record<string, ProgressionSnapshot>;
  limit: number;
}): AiDebugProgressionDiagnostic[] {
  const allExercises = params.workouts.flatMap((snapshot) => {
    return snapshot.normalizedWorkout?.blocks.flatMap((block) => block.exercises) ?? [];
  });
  const uniqueExercises = new Map<string, NonNullable<Workout["blocks"]>[number]["exercises"][number]>();

  for (const exercise of allExercises) {
    if (!uniqueExercises.has(exercise.id)) {
      uniqueExercises.set(exercise.id, exercise);
    }
  }

  return Array.from(uniqueExercises.values())
    .slice(0, params.limit)
    .map((exercise) => {
      const history = getRecentExerciseHistory(params.logs, exercise.id);
      const progressionSnapshot = params.progressionSnapshots[exercise.id] ?? null;
      const lastEntry = history[0];
      const lastSet = lastEntry?.exercise.sets[lastEntry.exercise.sets.length - 1];
      const suggestedWeight =
        exercise.suggestedWeight ?? null;
      const numericSuggestedWeight =
        typeof suggestedWeight === "number" ? suggestedWeight : null;
      const lastWeight =
        progressionSnapshot?.lastWeight ??
        (typeof lastSet?.actualWeight === "number" ? lastSet.actualWeight : null);
      const historyCount = history.length;
      const rule = inferProgressionRule({
        exercise,
        progressionSnapshot,
        historyCount,
      });
      const confidenceFlag =
        historyCount >= 3 ? "high" : historyCount === 2 ? "medium" : historyCount === 1 ? "low" : "very_low";
      const seemsAggressive =
        numericSuggestedWeight !== null &&
        typeof lastWeight === "number" &&
        (numericSuggestedWeight - lastWeight >= 5 ||
          numericSuggestedWeight > lastWeight * 1.15);
      const seemsConservative =
        numericSuggestedWeight !== null &&
        typeof lastWeight === "number" &&
        numericSuggestedWeight <= lastWeight &&
        (progressionSnapshot?.lastExtraReps ?? 0) >= 4;

      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        lastPerformedAt: lastEntry?.completedAt ?? progressionSnapshot?.updatedAt ?? null,
        lastUsedWeight: lastWeight,
        lastReps:
          progressionSnapshot?.lastReps ??
          (typeof lastSet?.actualReps === "number" ? lastSet.actualReps : null),
        lastDuration:
          progressionSnapshot?.lastDuration ??
          (typeof lastSet?.actualDuration === "number" ? lastSet.actualDuration : null),
        recentHistorySummary: buildRecentHistorySummary(history),
        suggestedWeight,
        suggestedReps: exercise.reps ?? null,
        suggestedDuration: exercise.duration ?? null,
        progressionRuleUsed: rule,
        progressionReason: exercise.progressionNote ?? null,
        confidenceFlag,
        progressionSeemsAggressive: seemsAggressive,
        progressionSeemsConservative: seemsConservative,
      };
    });
}

function getGoalDefaults(goal: string | null | undefined) {
  const resolvedGoal =
    typeof goal === "string" && goal.trim() ? goal.trim() : "health";

  return GOAL_DEFAULT_PRIORITIES[resolvedGoal] ?? GOAL_DEFAULT_PRIORITIES.health;
}

function buildPlannerDiagnostics(params: {
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
  settings: SettingsLike | null;
  latestGeneratedWorkout: StoredAiGeneratedWorkoutSnapshot | null;
}): AiDebugPlannerDiagnostic {
  const budgetRanking = [...params.weeklyStructure.muscleBudget]
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 6);
  const availableEquipment = params.latestGeneratedWorkout?.equipmentSeed ?? [];
  const duration = params.latestGeneratedWorkout?.requestedDurationMinutes ?? null;

  return {
    weeklyFocusSelected: params.weeklyStructure.nextFocus ?? null,
    focusReason: params.weeklyStructure.summaryText ?? null,
    goalDefaults: getGoalDefaults(params.settings?.training_goal),
    priorityOverrides: getPriorityMuscles(params.settings),
    remainingBudgetRanking: budgetRanking.map((entry) => ({
      muscle: entry.group,
      remainingSets: entry.remainingSets,
      priority: entry.priority,
    })),
    muscleGroupsConsideredMostUnderserved: budgetRanking
      .filter((entry) => entry.remainingSets > 0)
      .map((entry) => entry.group),
    muscleGroupsConsideredOverloaded: params.weeklyStructure.muscleBudget
      .filter((entry) => entry.loadStatus === "over" || entry.loadStatus === "high_risk")
      .map((entry) => entry.group),
    structurePatternUsed: params.weeklyStructure.splitStyle ?? null,
    durationConstraintImpact:
      typeof duration === "number"
        ? `${duration} min begärdes, vilket sannolikt begränsar antal block och övningar.`
        : null,
    equipmentConstraintImpact:
      availableEquipment.length > 0
        ? `Tillgänglig utrustning i valt gym: ${availableEquipment.join(", ")}.`
        : "Ingen tydlig equipment-seed sparad för senaste AI-pass.",
    recoveryConstraintImpact:
      params.weeklyStructure.confidenceScore === "low"
        ? "Låg datatillit gör att planeringen bör tolkas mer försiktigt."
        : "Ingen explicit recovery-signal används i veckovyn utöver historik och muskelbudget.",
  };
}

function buildExerciseSelectionDiagnostics(params: {
  workouts: StoredAiGeneratedWorkoutSnapshot[];
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
  settings: SettingsLike | null;
  limit: number;
}): AiDebugExerciseSelectionDiagnostic[] {
  const topNeeds = params.weeklyStructure.muscleBudget
    .filter((entry) => entry.remainingSets > 0)
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 4)
    .map((entry) => entry.group);
  const diagnostics: AiDebugExerciseSelectionDiagnostic[] = [];

  for (const snapshot of params.workouts) {
    const availableEquipment = new Set(snapshot.equipmentSeed);
    const exercises =
      snapshot.normalizedWorkout?.blocks.flatMap((block) => block.exercises) ?? [];

    for (const exercise of exercises) {
      if (diagnostics.length >= params.limit) {
        return diagnostics;
      }

      const catalogExercise = getExerciseById(exercise.id);
      const primaryMuscles = catalogExercise?.primaryMuscles ?? [];
      const secondaryMuscles = catalogExercise?.secondaryMuscles ?? [];
      const mappedNeeds = primaryMuscles
        .map((muscle) => mapStimulusGroup(muscle))
        .filter((value): value is MuscleBudgetGroup => value !== null)
        .filter((group) => topNeeds.includes(group));
      const availableInSelectedGym =
        (catalogExercise?.requiredEquipment ?? []).length === 0 ||
        (catalogExercise?.requiredEquipment ?? []).every((equipmentId) => {
          return availableEquipment.has(equipmentId);
        });
      const goal = params.settings?.training_goal ?? "health";
      const goalFitText =
        catalogExercise?.primaryGoalTags?.length
          ? `Övningen har mål-taggarna ${catalogExercise.primaryGoalTags.join(", ")} och täcker ${catalogExercise.movementPattern}.`
          : `Övningen täcker rörelsemönstret ${catalogExercise?.movementPattern ?? "okänt"} för målet ${goal}.`;

      diagnostics.push({
        exerciseName: catalogExercise?.name ?? exercise.name,
        movementPattern: catalogExercise?.movementPattern ?? null,
        requiredEquipment: catalogExercise?.requiredEquipment ?? [],
        availableInSelectedGym,
        primaryMuscles,
        secondaryMuscles,
        whyThisExerciseFitsGoal: goalFitText,
        whyThisExerciseFitsEquipment:
          (catalogExercise?.requiredEquipment ?? []).length > 0
            ? `Övningen kräver ${catalogExercise?.requiredEquipment.join(", ")} och matchar vald utrustning: ${availableInSelectedGym ? "ja" : "nej"}.`
            : null,
        whyThisExerciseFitsCurrentWeeklyNeed:
          mappedNeeds.length > 0
            ? `Övningen träffar veckobehov i ${mappedNeeds.map((group) => MUSCLE_LABELS[group]).join(", ")}.`
            : "Ingen stark direkt träff mot mest eftersatta muskelgrupper kunde härledas.",
        progressionBasis:
          exercise.progressionNote ??
          (exercise.suggestedWeight != null
            ? "Förslag finns men exakt regel saknas i debugdatan."
            : null),
        alternativeCandidatesRejected: null,
        rejectionReasons: null,
      });
    }
  }

  return diagnostics;
}

function getSelectedGym(params: {
  latestGeneratedWorkout: StoredAiGeneratedWorkoutSnapshot | null;
  gyms: GymLike[];
  anonymize: boolean;
}) {
  const latestGym = params.latestGeneratedWorkout?.selectedGym ?? null;
  if (!latestGym) {
    return null;
  }

  return params.anonymize ? "selected_gym" : latestGym;
}

function getAvailableEquipment(params: {
  latestGeneratedWorkout: StoredAiGeneratedWorkoutSnapshot | null;
  gyms: GymLike[];
}) {
  if (params.latestGeneratedWorkout?.equipmentSeed?.length) {
    return params.latestGeneratedWorkout.equipmentSeed;
  }

  const matchedGym = params.gyms.find((gym) => {
    return gym.name === params.latestGeneratedWorkout?.selectedGym;
  });

  return Array.isArray(matchedGym?.equipment)
    ? matchedGym.equipment
        .map((item) => {
          const value =
            typeof item.equipment_type === "string"
              ? item.equipment_type
              : typeof item.equipmentType === "string"
                ? item.equipmentType
                : null;
          return value?.trim() || null;
        })
        .filter((value): value is string => Boolean(value))
    : [];
}

export function buildAiDebugExport(
  params: BuildAiDebugExportParams,
): AiDebugExport {
  const historyWindowDays = getRequestedHistoryWindow(params.options);
  const filteredLogs = filterLogsByWindow(params.logs, historyWindowDays);
  const weeklyStructure = buildWeeklyWorkoutStructure({
    logs: params.logs,
    settings: normalizeWeeklyPlanningSettings(params.settings),
  });
  const generatedWorkouts = params.options.includeGeneratedWorkouts
    ? getLatestGeneratedWorkouts({
        generatedWorkouts: params.generatedWorkouts,
        draftWorkout: params.draftWorkout,
        limit: params.options.exportType === "full" ? 5 : 3,
      })
    : [];
  const latestGeneratedWorkout = generatedWorkouts[0] ?? null;
  const progressionDiagnostics = params.options.includeProgressionDiagnostics
    ? buildProgressionDiagnostics({
        workouts: generatedWorkouts,
        logs: filteredLogs,
        progressionSnapshots: params.progressionSnapshots,
        limit: params.options.exportType === "full" ? 24 : 12,
      })
    : [];
  const warnings: string[] = [];

  if (params.logs.length === 0) {
    warnings.push("Inga genomförda pass hittades. Historikdelen blir tunn.");
  }

  if (generatedWorkouts.length === 0) {
    warnings.push("Inga lokalt sparade AI-genererade pass hittades ännu.");
  }

  if (Object.keys(params.progressionSnapshots).length === 0) {
    warnings.push("Ingen lokal progressionshistorik hittades för övningarna.");
  }

  if (!params.settings?.training_goal) {
    warnings.push("Användaren saknar sparat träningsmål i inställningarna.");
  }

  const evaluationQuestions = [
    "Är övningsvalen rimliga för målet?",
    "Är fördelningen mellan muskelgrupper rimlig?",
    "Får prioriterade muskler tillräckligt genomslag?",
    "Är progressionen rimlig utifrån historiken?",
    "Finns tecken på att modellen överdriver benfokus eller annan bias?",
    "Är passet väl anpassat till utrustning och passlängd?",
  ];

  return {
    meta: {
      createdAt: new Date().toISOString(),
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      commitHash: process.env.NEXT_PUBLIC_COMMIT_SHA ?? null,
      exportType: params.options.exportType,
      schemaVersion: "ai-debug-export.v1",
      source: "analysis-debug-export",
    },
    userContext: {
      trainingGoal: params.settings?.training_goal ?? null,
      sex: params.settings?.sex ?? null,
      age: typeof params.settings?.age === "number" ? params.settings.age : null,
      heightCm:
        typeof params.settings?.height_cm === "number" ? params.settings.height_cm : null,
      weightKg:
        typeof params.settings?.weight_kg === "number" ? params.settings.weight_kg : null,
      experienceLevel: params.settings?.experience_level ?? null,
      priorityMuscles: getPriorityMuscles(params.settings),
      selectedGym: getSelectedGym({
        latestGeneratedWorkout,
        gyms: params.gyms,
        anonymize: params.options.anonymize,
      }),
      availableEquipment: getAvailableEquipment({
        latestGeneratedWorkout,
        gyms: params.gyms,
      }),
    },
    muscleBudgetSnapshot: buildMuscleBudgetSnapshot({
      weeklyStructure,
      settings: params.settings,
    }),
    recentCompletedWorkouts: params.options.includeCompletedWorkouts
      ? buildCompletedWorkouts({
          logs: filteredLogs,
          settings: params.settings,
          limit: params.options.exportType === "full" ? 10 : 7,
        })
      : [],
    recentGeneratedWorkouts: generatedWorkouts.map((snapshot) =>
      buildGeneratedWorkoutSummary(snapshot, params.options.anonymize),
    ),
    progressionDiagnostics,
    plannerDiagnostics: params.options.includePlannerDiagnostics
      ? buildPlannerDiagnostics({
          weeklyStructure,
          settings: params.settings,
          latestGeneratedWorkout,
        })
      : null,
    exerciseSelectionDiagnostics: buildExerciseSelectionDiagnostics({
      workouts: generatedWorkouts,
      weeklyStructure,
      settings: params.settings,
      limit: params.options.exportType === "full" ? 20 : 10,
    }),
    evaluationQuestions,
    warnings,
  };
}
