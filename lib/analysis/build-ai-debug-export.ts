import {
  getExerciseById,
  getSportRelevanceHint,
} from "@/lib/exercise-catalog";
import type {
  AiDebugAdherenceDiagnostics,
  AiDebugAdherencePeriod,
  AiDebugCompletedWorkout,
  AiDebugCompletedWorkoutExercise,
  AiDebugCurrentPlanSnapshot,
  AiDebugDataQuality,
  AiDebugExerciseSelectionDiagnostic,
  AiDebugExport,
  AiDebugExportOptions,
  AiDebugGeneratedWorkout,
  AiDebugGeneratedWorkoutExercise,
  AiDebugLatestWorkoutEvaluationContext,
  AiDebugLongTermMuscleTrend,
  AiDebugMuscleBudgetSnapshotEntry,
  AiDebugPlannerDiagnostic,
  AiDebugProgressionDiagnostic,
  AiDebugWorkoutValidity,
  StoredAiGeneratedWorkoutSnapshot,
} from "@/lib/analysis/ai-debug-types";
import type {
  MuscleBudgetEntry,
  MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import {
  buildWeeklyWorkoutStructure,
  formatSplitStyle,
  formatWorkoutFocus,
  getAdaptiveFocusScore,
  type WeeklyWorkoutStructure,
} from "@/lib/weekly-workout-structure";
import {
  getWorkoutLogAnalysisExclusionReason,
  isWorkoutLogExcludedFromAnalysis,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import {
  normalizeSportFocus,
  type SportFocus,
} from "@/types/training-profile";
import type { Workout, WorkoutFocus } from "@/types/workout";

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
  sport_focus?: string | null;
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
  generatedWorkout: Workout | null;
  draftWorkout: Workout | null;
  progressionSnapshots: Record<string, ProgressionSnapshot>;
  options: AiDebugExportOptions;
};

type LatestWorkoutSource =
  | "generated_workout"
  | "preview_draft"
  | "completed_ai_workout"
  | "fallback_from_history"
  | "missing";

type LatestWorkoutCandidate = {
  snapshot: StoredAiGeneratedWorkoutSnapshot;
  source: Exclude<LatestWorkoutSource, "missing">;
  sourceConfidence: "high" | "medium" | "low";
};

type NormalizedWeeklyPlanningSettings = {
  experience_level?: string | null;
  training_goal?: "strength" | "hypertrophy" | "health" | "body_composition" | null;
  sport_focus?: SportFocus | null;
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

const EXERCISE_IDS_THAT_OFTEN_NEED_LOAD = new Set([
  "dumbbells",
  "barbell",
  "ez_bar",
  "trap_bar",
  "kettlebells",
  "smith_machine",
  "cable_machine",
  "machines",
  "medicine_ball",
]);

const FOCUS_TO_BUDGET_GROUPS: Record<WorkoutFocus, MuscleBudgetGroup[]> = {
  full_body: ["quads", "glutes", "back", "chest", "core"],
  upper_body: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower_body: ["quads", "hamstrings", "glutes", "calves"],
  core: ["core"],
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
    sport_focus: normalizeSportFocus(settings.sport_focus),
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

function filterLogsWithinDays(logs: WorkoutLog[], days: number) {
  const now = Date.now();
  const threshold = days * 24 * 60 * 60 * 1000;

  return logs.filter((log) => {
    const completedAtMs = parseDateMs(log.completedAt);
    return completedAtMs > 0 && now - completedAtMs <= threshold;
  });
}

function filterAnalysisLogs(logs: WorkoutLog[]) {
  return logs.filter((log) => !isWorkoutLogExcludedFromAnalysis(log));
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
  weeklyStructure: WeeklyWorkoutStructure;
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

function primaryMusclesToBudgetGroups(exerciseId: string) {
  const catalogExercise = getExerciseById(exerciseId);

  return Array.from(
    new Set(
      (catalogExercise?.primaryMuscles ?? [])
        .map((muscle) => mapStimulusGroup(muscle))
        .filter((value): value is MuscleBudgetGroup => value !== null),
    ),
  );
}

function hasCompletedWorkInSet(
  set: WorkoutLog["exercises"][number]["sets"][number],
) {
  return (
    (typeof set.actualReps === "number" && set.actualReps > 0) ||
    (typeof set.actualDuration === "number" && set.actualDuration > 0)
  );
}

function countCompletedWorkingSets(exercise: WorkoutLog["exercises"][number]) {
  return exercise.sets.filter((set) => hasCompletedWorkInSet(set)).length;
}

function countPlannedSets(log: WorkoutLog) {
  return log.exercises.reduce((sum, exercise) => sum + Math.max(0, exercise.plannedSets), 0);
}

function countCompletedWorkingSetsInLog(log: WorkoutLog) {
  return log.exercises.reduce((sum, exercise) => sum + countCompletedWorkingSets(exercise), 0);
}

function getLogDurationMinutes(log: WorkoutLog) {
  return Math.max(0, Math.round((log.durationSeconds ?? 0) / 60));
}

function buildWorkoutValidity(
  log: WorkoutLog,
  plannedDurationMinutes: number | null,
): AiDebugWorkoutValidity {
  const completedWorkingSets = countCompletedWorkingSetsInLog(log);
  const plannedSets = countPlannedSets(log);
  const durationMinutes = getLogDurationMinutes(log);
  const durationCompletionRatio =
    plannedDurationMinutes && plannedDurationMinutes > 0
      ? roundToSingleDecimal(durationMinutes / plannedDurationMinutes)
      : null;
  const setCompletionRatio =
    plannedSets > 0 ? roundToSingleDecimal(completedWorkingSets / plannedSets) : null;

  if (log.status !== "completed") {
    return {
      classification: "aborted_or_invalid",
      reason: "Passet är inte markerat som completed och bör tolkas försiktigt.",
      plannedDurationMinutes,
      actualDurationMinutes: durationMinutes,
      durationCompletionRatio,
      plannedSets,
      completedSets: completedWorkingSets,
      setCompletionRatio,
      countsForMuscleBudget: false,
      countsForWeeklyRhythm: false,
      countsForAdherence: false,
      confidence: "high",
    };
  }

  if (log.exercises.length === 0) {
    return {
      classification: "empty_completed",
      reason: "Passet är markerat som completed men innehåller inga övningar.",
      plannedDurationMinutes,
      actualDurationMinutes: durationMinutes,
      durationCompletionRatio,
      plannedSets,
      completedSets: completedWorkingSets,
      setCompletionRatio,
      countsForMuscleBudget: false,
      countsForWeeklyRhythm: false,
      countsForAdherence: false,
      confidence: "high",
    };
  }

  if (completedWorkingSets === 0) {
    return {
      classification: "empty_completed",
      // Ett sparat pass utan tydliga arbetsset bör inte räknas som verklig träningsstimulans.
      reason: "Passet innehåller sparade övningar men inga tydligt genomförda arbetsset.",
      plannedDurationMinutes,
      actualDurationMinutes: durationMinutes,
      durationCompletionRatio,
      plannedSets,
      completedSets: completedWorkingSets,
      setCompletionRatio,
      countsForMuscleBudget: false,
      countsForWeeklyRhythm: false,
      countsForAdherence: false,
      confidence: "medium",
    };
  }

  if (durationMinutes < 5) {
    return {
      classification: "too_short",
      reason: "Passet innehåller arbete men är mycket kort och bör vägas försiktigt.",
      plannedDurationMinutes,
      actualDurationMinutes: durationMinutes,
      durationCompletionRatio,
      plannedSets,
      completedSets: completedWorkingSets,
      setCompletionRatio,
      countsForMuscleBudget: true,
      countsForWeeklyRhythm: false,
      countsForAdherence: true,
      confidence: "medium",
    };
  }

  if (plannedSets > 0 && completedWorkingSets / plannedSets < 0.6) {
    return {
      classification: "partial",
      reason: "Passet innehåller genomförda set men täcker tydligt mindre arbete än planerat.",
      plannedDurationMinutes,
      actualDurationMinutes: durationMinutes,
      durationCompletionRatio,
      plannedSets,
      completedSets: completedWorkingSets,
      setCompletionRatio,
      countsForMuscleBudget: true,
      countsForWeeklyRhythm: true,
      countsForAdherence: true,
      confidence: "medium",
    };
  }

  if (durationCompletionRatio !== null && durationCompletionRatio < 0.7) {
    return {
      classification: "valid_shortened",
      reason: "Passet innehåller tydliga arbetsset men blev klart kortare än planerad passlängd.",
      plannedDurationMinutes,
      actualDurationMinutes: durationMinutes,
      durationCompletionRatio,
      plannedSets,
      completedSets: completedWorkingSets,
      setCompletionRatio,
      countsForMuscleBudget: true,
      countsForWeeklyRhythm: true,
      countsForAdherence: true,
      confidence: "medium",
    };
  }

  return {
    classification: "valid_full",
    reason: "Passet har rimlig varaktighet och innehåller tydliga arbetsset.",
    plannedDurationMinutes,
    actualDurationMinutes: durationMinutes,
    durationCompletionRatio,
    plannedSets,
    completedSets: completedWorkingSets,
    setCompletionRatio,
    countsForMuscleBudget: true,
    countsForWeeklyRhythm: true,
    countsForAdherence: true,
    confidence: "high",
  };
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

    const setCount = Math.max(0, countCompletedWorkingSets(exercise) || exercise.plannedSets || 0);
    const primaryGroups = Array.from(
      new Set(
        catalogExercise.primaryMuscles
          .map((muscle) => mapStimulusGroup(muscle))
          .filter((value): value is MuscleBudgetGroup => value !== null),
      ),
    );
    const secondaryGroups = Array.from(
      new Set(
        (catalogExercise.secondaryMuscles ?? [])
          .map((muscle) => mapStimulusGroup(muscle))
          .filter(
            (value): value is MuscleBudgetGroup =>
              value !== null && !primaryGroups.includes(value),
          ),
      ),
    );

    for (const group of primaryGroups) {
      totals[group] += setCount;
    }

    for (const group of secondaryGroups) {
      totals[group] += setCount * (group === "core" ? 0.2 : 0.35);
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
  const completedSets = countCompletedWorkingSets(exercise);
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
    completedSets,
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
  plannedDurationByWorkoutName: Map<string, number>;
  limit: number;
}): AiDebugCompletedWorkout[] {
  return params.logs
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
        durationMinutes: getLogDurationMinutes(log),
        workoutName: log.workoutName,
        goal: params.settings?.training_goal ?? null,
        source: getSourceLabel(log),
        blockCount: null,
        exercises,
        primaryMuscles,
        secondaryMuscles,
        estimatedStimulusPerMuscle: buildStimulusEstimate(log.exercises),
        workoutValidity: buildWorkoutValidity(
          log,
          params.plannedDurationByWorkoutName.get(log.workoutName) ?? null,
        ),
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

function buildSnapshotFromWorkout(params: {
  workout: Workout;
  source: Exclude<LatestWorkoutSource, "missing">;
  sourceConfidence: "high" | "medium" | "low";
}): LatestWorkoutCandidate {
  return {
    source: params.source,
    sourceConfidence: params.sourceConfidence,
    snapshot: {
      createdAt: params.workout.createdAt ?? new Date().toISOString(),
      requestedDurationMinutes: params.workout.duration ?? null,
      goal: params.workout.goal ?? null,
      selectedGym: params.workout.gymLabel ?? params.workout.gym ?? null,
      equipmentSeed: [],
      workoutFocusTag: params.workout.plannedFocus ?? null,
      request: null,
      weeklyBudget: null,
      weeklyPlan: null,
      normalizedWorkout: params.workout,
      aiDebug: params.workout.aiDebug ?? null,
    },
  };
}

function buildWorkoutFromCompletedLog(log: WorkoutLog): Workout {
  return {
    name: log.workoutName,
    duration: Math.max(1, getLogDurationMinutes(log)),
    goal: undefined,
    blocks: [
      {
        type: "straight_sets",
        title: "Återskapat från genomfört pass",
        exercises: log.exercises.map((exercise) => ({
          id: exercise.exerciseId,
          name: exercise.exerciseName,
          sets: Math.max(1, exercise.plannedSets),
          reps: exercise.plannedReps ?? null,
          duration: exercise.plannedDuration ?? null,
          rest: 60,
        })),
      },
    ],
    createdAt: log.completedAt,
  };
}

function buildFallbackSnapshotFromCompletedLog(log: WorkoutLog): LatestWorkoutCandidate {
  return {
    source: getSourceLabel(log) === "ai" ? "completed_ai_workout" : "fallback_from_history",
    sourceConfidence: getSourceLabel(log) === "ai" ? "medium" : "low",
    snapshot: {
      createdAt: log.completedAt,
      requestedDurationMinutes: null,
      goal: null,
      selectedGym: null,
      equipmentSeed: [],
      workoutFocusTag: null,
      request: null,
      weeklyBudget: null,
      weeklyPlan: null,
      normalizedWorkout: buildWorkoutFromCompletedLog(log),
      aiDebug: null,
    },
  };
}

function buildGeneratedWorkoutExercise(
  exercise: NonNullable<Workout["blocks"]>[number]["exercises"][number],
  sportFocus: SportFocus | null,
): AiDebugGeneratedWorkoutExercise {
  const catalogExercise = getExerciseById(exercise.id);

  return {
    exerciseId: exercise.id,
    exerciseName: catalogExercise?.name ?? exercise.name,
    movementPattern: catalogExercise?.movementPattern ?? null,
    primaryMuscles: catalogExercise?.primaryMuscles ?? [],
    secondaryMuscles: catalogExercise?.secondaryMuscles ?? [],
    sportRelevanceHint: catalogExercise
      ? getSportRelevanceHint(catalogExercise, sportFocus)
      : 0,
    suggestedWeight: exercise.suggestedWeight ?? null,
    suggestedWeightLabel: exercise.suggestedWeightLabel ?? null,
    progressionNote: exercise.progressionNote ?? null,
  };
}

function buildGeneratedWorkoutSummary(
  candidate: LatestWorkoutCandidate,
  anonymize: boolean,
  sportFocus: SportFocus | null,
): AiDebugGeneratedWorkout {
  const snapshot = candidate.snapshot;
  const exercises =
    snapshot.normalizedWorkout?.blocks.flatMap((block) => {
      return block.exercises.map((exercise) =>
        buildGeneratedWorkoutExercise(exercise, sportFocus),
      );
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
    source: candidate.source,
    sourceConfidence: candidate.sourceConfidence,
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
  generatedWorkout: Workout | null;
  draftWorkout: Workout | null;
  logs: WorkoutLog[];
  limit: number;
}): LatestWorkoutCandidate[] {
  const candidates: LatestWorkoutCandidate[] = [];

  if (params.draftWorkout?.aiDebug) {
    candidates.push(
      buildSnapshotFromWorkout({
        workout: params.draftWorkout,
        source: "preview_draft",
        sourceConfidence: "high",
      }),
    );
  }

  if (params.generatedWorkout?.aiDebug) {
    candidates.push(
      buildSnapshotFromWorkout({
        workout: params.generatedWorkout,
        source: "generated_workout",
        sourceConfidence: "high",
      }),
    );
  }

  for (const snapshot of params.generatedWorkouts) {
    candidates.push({
      snapshot,
      source: "generated_workout",
      sourceConfidence: snapshot.aiDebug ? "high" : "medium",
    });
  }

  const latestCompletedAiWorkout = [...params.logs]
    .filter((log) => log.status === "completed" && getSourceLabel(log) === "ai")
    .sort((left, right) => parseDateMs(right.completedAt) - parseDateMs(left.completedAt))[0];

  if (latestCompletedAiWorkout) {
    candidates.push(buildFallbackSnapshotFromCompletedLog(latestCompletedAiWorkout));
  }

  const latestCompletedWorkout = [...params.logs]
    .filter((log) => log.status === "completed")
    .sort((left, right) => parseDateMs(right.completedAt) - parseDateMs(left.completedAt))[0];

  if (latestCompletedWorkout && !latestCompletedAiWorkout) {
    candidates.push(buildFallbackSnapshotFromCompletedLog(latestCompletedWorkout));
  }

  const unique = new Map<string, LatestWorkoutCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.snapshot.createdAt}:${candidate.snapshot.normalizedWorkout?.name ?? "workout"}`;
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
  }

  return Array.from(unique.values())
    .sort(
      (left, right) =>
        parseDateMs(right.snapshot.createdAt) - parseDateMs(left.snapshot.createdAt),
    )
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
      const completedSets = exercise.sets.filter((set) => hasCompletedWorkInSet(set));
      const lastSet = completedSets[completedSets.length - 1] ?? exercise.sets[exercise.sets.length - 1];
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

function buildBodyweightProgressionSuggestion(
  exercise: NonNullable<Workout["blocks"]>[number]["exercises"][number],
) {
  const catalogExercise = getExerciseById(exercise.id);

  if (!catalogExercise) {
    return null;
  }

  if ((catalogExercise.requiredEquipment ?? []).includes("rings")) {
    return "Behåll repsnivån men gör vinkeln något tyngre, använd längre ROM eller lägg in en kort paus i toppläget.";
  }

  if (exercise.duration) {
    return "Behåll ungefär samma arbetstid men öka kontroll, paus eller ett extra set om tekniken känns stabil.";
  }

  if (exercise.reps) {
    return "Öka 1–2 reps, lägg till en kort paus eller ett extra set innan du gör varianten tyngre.";
  }

  return "Behåll utförandet och öka svårigheten stegvis via tempo, ROM, paus eller fler set.";
}

function buildProgressionMissingDataWarnings(params: {
  exercise: NonNullable<Workout["blocks"]>[number]["exercises"][number];
  progressionSnapshot: ProgressionSnapshot | null;
  lastWeight: number | null;
  suggestedWeight: number | null;
}) {
  const warnings: string[] = [];

  if (
    typeof params.lastWeight === "number" &&
    typeof params.suggestedWeight === "number" &&
    params.suggestedWeight > params.lastWeight &&
    params.progressionSnapshot?.lastExtraReps == null &&
    params.progressionSnapshot?.lastTimedEffort == null
  ) {
    warnings.push(
      "Viktökningen kan vara aggressiv eftersom tidigare effort/RIR saknas.",
    );
  }

  if (
    params.suggestedWeight == null &&
    params.progressionSnapshot == null &&
    !params.exercise.progressionNote
  ) {
    warnings.push("Övningen saknar tydlig progressionshistorik och bör tolkas försiktigt.");
  }

  return warnings;
}

function buildProgressionInterpretation(params: {
  confidenceFlag: AiDebugProgressionDiagnostic["confidenceFlag"];
  progressionSeemsAggressive: boolean;
  progressionSeemsConservative: boolean;
  missingDataWarnings: string[];
  suggestedWeight: number | null;
}) {
  if (params.progressionSeemsAggressive) {
    return "Progressionen ser relativt offensiv ut och bör dubbelkollas mot faktisk effort.";
  }

  if (params.progressionSeemsConservative) {
    return "Progressionen ser försiktig ut, vilket kan vara rimligt om tekniken eller datakvaliteten är osäker.";
  }

  if (params.missingDataWarnings.length > 0) {
    return "Progressionen bör tolkas som ett försiktigt förslag snarare än en stark rekommendation.";
  }

  if (params.suggestedWeight == null) {
    return "Övningen saknar belastningsförslag och bör främst bedömas via reps, tempo eller svårighetsgrad.";
  }

  if (params.confidenceFlag === "high" || params.confidenceFlag === "medium") {
    return "Progressionen vilar på viss historik och verkar användbar som nästa försök.";
  }

  return "Progressionen bygger på begränsad historik och bör ses som en försiktig startpunkt.";
}

function buildProgressionDiagnostics(params: {
  workouts: LatestWorkoutCandidate[];
  logs: WorkoutLog[];
  progressionSnapshots: Record<string, ProgressionSnapshot>;
  weeklyStructure: WeeklyWorkoutStructure;
  limit: number;
}): AiDebugProgressionDiagnostic[] {
  const allExercises = params.workouts.flatMap((snapshot) => {
    return snapshot.snapshot.normalizedWorkout?.blocks.flatMap((block) => block.exercises) ?? [];
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
      const completedSets = lastEntry?.exercise.sets.filter((set) => hasCompletedWorkInSet(set)) ?? [];
      const lastSet = completedSets[completedSets.length - 1] ?? lastEntry?.exercise.sets[lastEntry.exercise.sets.length - 1];
      const suggestedWeight =
        typeof exercise.suggestedWeight === "number" ? exercise.suggestedWeight : null;
      const rawSuggestedWeight = exercise.suggestedWeight ?? null;
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
        suggestedWeight !== null &&
        typeof lastWeight === "number" &&
        (suggestedWeight - lastWeight >= 5 ||
          suggestedWeight > lastWeight * 1.15);
      const seemsConservative =
        suggestedWeight !== null &&
        typeof lastWeight === "number" &&
        suggestedWeight <= lastWeight &&
        (progressionSnapshot?.lastExtraReps ?? 0) >= 4;
      const primaryBudgetEntries = primaryMusclesToBudgetGroups(exercise.id).map(
        (group) =>
          params.weeklyStructure.muscleBudget.find((entry) => entry.group === group) ?? null,
      );
      const hasRecoverablePrimary = primaryBudgetEntries.some(
        (entry) =>
          entry !== null &&
          entry.remainingSets > 0 &&
          entry.loadStatus !== "high_risk" &&
          entry.loadStatus !== "over",
      );
      const allPrimaryOverloaded =
        primaryBudgetEntries.length > 0 &&
        primaryBudgetEntries.every(
          (entry) =>
            entry !== null &&
            (entry.loadStatus === "high_risk" || entry.loadStatus === "over"),
        );
      const budgetAwareProgressionRecommendation =
        params.weeklyStructure.selectedPlanMode === "recovery_mobility"
          ? "avoid_for_now"
          : allPrimaryOverloaded
            ? "avoid_for_now"
            : params.weeklyStructure.selectedPlanMode === "selective_priority_accessory" &&
                !hasRecoverablePrimary
              ? "deload"
              : hasRecoverablePrimary
                ? suggestedWeight !== null && seemsAggressive
                  ? "maintain"
                  : "progress"
                : "maintain";
      const missingDataWarnings = buildProgressionMissingDataWarnings({
        exercise,
        progressionSnapshot,
        lastWeight,
        suggestedWeight,
      });

      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        lastPerformedAt: lastEntry?.completedAt ?? progressionSnapshot?.updatedAt ?? null,
        recentHistorySummary: buildRecentHistorySummary(history),
        lastUsedWeight: lastWeight,
        lastReps:
          progressionSnapshot?.lastReps ??
          (typeof lastSet?.actualReps === "number" ? lastSet.actualReps : null),
        lastDuration:
          progressionSnapshot?.lastDuration ??
          (typeof lastSet?.actualDuration === "number" ? lastSet.actualDuration : null),
        suggestedWeight: rawSuggestedWeight,
        suggestedReps: exercise.reps ?? null,
        suggestedDuration: exercise.duration ?? null,
        progressionRuleUsed: rule,
        progressionReason: exercise.progressionNote ?? null,
        confidenceFlag,
        progressionSeemsAggressive: seemsAggressive,
        progressionSeemsConservative: seemsConservative,
        recommendedAiInterpretation: buildProgressionInterpretation({
          confidenceFlag,
          progressionSeemsAggressive: seemsAggressive,
          progressionSeemsConservative: seemsConservative,
          missingDataWarnings,
          suggestedWeight,
        }),
        missingDataWarnings,
        bodyweightProgressionSuggestion:
          rawSuggestedWeight == null ? buildBodyweightProgressionSuggestion(exercise) : null,
        budgetAwareProgressionRecommendation,
      };
    });
}

function getGoalDefaults(goal: string | null | undefined) {
  const resolvedGoal =
    typeof goal === "string" && goal.trim() ? goal.trim() : "health";

  return GOAL_DEFAULT_PRIORITIES[resolvedGoal] ?? GOAL_DEFAULT_PRIORITIES.health;
}

function getGoalPattern(goal?: string | null): WorkoutFocus[] {
  if (goal === "strength") {
    return ["lower_body", "upper_body", "full_body"];
  }

  if (goal === "hypertrophy") {
    return ["upper_body", "lower_body", "upper_body", "core"];
  }

  if (goal === "body_composition") {
    return ["upper_body", "lower_body", "core", "full_body"];
  }

  return ["full_body", "upper_body", "lower_body"];
}

function getPatternPreferredFocus(weeklyStructure: WeeklyWorkoutStructure, goal?: string | null) {
  const pattern = getGoalPattern(goal);
  const nextPatternIndex = weeklyStructure.completedLast7Days % pattern.length;
  return pattern[nextPatternIndex] ?? pattern[0] ?? "full_body";
}

function buildFocusTradeoffs(params: {
  weeklyStructure: WeeklyWorkoutStructure;
  focusScores: ReturnType<typeof getAdaptiveFocusScore>[];
  patternPreferredFocus: WorkoutFocus;
}) {
  const overloaded = params.weeklyStructure.muscleBudget
    .filter((entry) => entry.loadStatus === "over" || entry.loadStatus === "high_risk")
    .map((entry) => entry.label.toLowerCase());
  const tradeoffs: string[] = [];

  if (params.weeklyStructure.nextFocus !== params.patternPreferredFocus) {
    tradeoffs.push(
      `Veckorytmen pekade mot ${formatWorkoutFocus(params.patternPreferredFocus).toLowerCase()}, men modellen valde ${formatWorkoutFocus(params.weeklyStructure.nextFocus).toLowerCase()}.`,
    );
  }

  if (overloaded.length > 0) {
    tradeoffs.push(`Överbelastning i ${overloaded.join(", ")} drog ned vissa fokusval.`);
  }

  const runnerUp = [...params.focusScores]
    .sort((left, right) => right.score - left.score)
    .find((entry) => entry.focus !== params.weeklyStructure.nextFocus);

  if (runnerUp) {
    tradeoffs.push(
      `${formatWorkoutFocus(runnerUp.focus)} var ett alternativ men fick lägre totalpoäng än ${formatWorkoutFocus(params.weeklyStructure.nextFocus).toLowerCase()}.`,
    );
  }

  return tradeoffs;
}

function buildWhyNotFocus(
  focusScores: ReturnType<typeof getAdaptiveFocusScore>[],
  selectedFocus: WorkoutFocus,
  requestedFocus: WorkoutFocus,
) {
  if (selectedFocus === requestedFocus) {
    return undefined;
  }

  const match = focusScores.find((entry) => entry.focus === requestedFocus);
  if (!match) {
    return undefined;
  }

  return `${formatWorkoutFocus(requestedFocus)} fick ${roundToSingleDecimal(match.score)} i fokuspoäng. ${match.reason}.`;
}

function buildPlannerDiagnostics(params: {
  weeklyStructure: WeeklyWorkoutStructure;
  settings: SettingsLike | null;
  latestGeneratedWorkout: StoredAiGeneratedWorkoutSnapshot | null;
}): AiDebugPlannerDiagnostic {
  const budgetRanking = [...params.weeklyStructure.muscleBudget]
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 6);
  const availableEquipment = params.latestGeneratedWorkout?.equipmentSeed ?? [];
  const duration = params.latestGeneratedWorkout?.requestedDurationMinutes ?? null;
  const patternPreferredFocus = getPatternPreferredFocus(
    params.weeklyStructure,
    params.settings?.training_goal,
  );
  const focusScores = (
    ["upper_body", "lower_body", "core", "full_body"] as WorkoutFocus[]
  ).map((focus) =>
    getAdaptiveFocusScore({
      focus,
      entries: params.weeklyStructure.muscleBudget,
      configuredPriorityMuscles: params.weeklyStructure.configuredPriorityMuscles,
      patternPreferredFocus,
    }),
  );

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
        : "Planeringen använder historik, budget och coachbeslut utan separat readiness-signal.",
    focusScores,
    whyNotLowerBody: buildWhyNotFocus(
      focusScores,
      params.weeklyStructure.nextFocus,
      "lower_body",
    ),
    whyNotFullBody: buildWhyNotFocus(
      focusScores,
      params.weeklyStructure.nextFocus,
      "full_body",
    ),
    whyNotPriorityOnly:
      params.weeklyStructure.priorityMuscles.length > 0
        ? "Prioriterade muskler vägs in, men modellen försöker fortfarande hålla ihop hel veckorytm och återhämtning."
        : undefined,
    selectedFocusTradeoffs: buildFocusTradeoffs({
      weeklyStructure: params.weeklyStructure,
      focusScores,
      patternPreferredFocus,
    }),
    selectedPlanMode: params.weeklyStructure.selectedPlanMode,
    targetMuscles: params.weeklyStructure.targetMuscles,
    avoidMuscles: params.weeklyStructure.avoidMuscles,
    limitedMuscles: params.weeklyStructure.limitedMuscles,
    focusIntent: params.weeklyStructure.focusIntent,
    recoveryOverrideApplied: params.weeklyStructure.recoveryOverrideApplied,
    recoveryOverrideReason: params.weeklyStructure.recoveryOverrideReason,
    stimulusCreditModelVersion: "v2_capped_groups_secondary_stabilizer_discount",
    capsPerMuscleGroupApplied: true,
  };
}

function buildExerciseSelectionDiagnostics(params: {
  latestGeneratedWorkout: LatestWorkoutCandidate | null;
  weeklyStructure: WeeklyWorkoutStructure;
  settings: SettingsLike | null;
  limit: number;
}): AiDebugExerciseSelectionDiagnostic[] {
  const topNeeds = params.weeklyStructure.muscleBudget
    .filter((entry) => entry.remainingSets > 0)
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 4)
    .map((entry) => entry.group);
  const overloaded = params.weeklyStructure.muscleBudget
    .filter((entry) => entry.loadStatus === "over" || entry.loadStatus === "high_risk")
    .map((entry) => entry.group);
  const diagnostics: AiDebugExerciseSelectionDiagnostic[] = [];

  const snapshot = params.latestGeneratedWorkout?.snapshot;
  const availableEquipment = new Set(snapshot?.equipmentSeed ?? []);
  const exercises =
    snapshot?.normalizedWorkout?.blocks.flatMap((block) => block.exercises) ?? [];

  for (const exercise of exercises) {
    if (diagnostics.length >= params.limit) {
      return diagnostics;
    }

    const catalogExercise = getExerciseById(exercise.id);
    const primaryMuscles = catalogExercise?.primaryMuscles ?? [];
    const secondaryMuscles = catalogExercise?.secondaryMuscles ?? [];
    const directMainMuscles = primaryMuscles
      .map((muscle) => mapStimulusGroup(muscle))
      .filter((value): value is MuscleBudgetGroup => value !== null);
    const indirectMainMuscles = secondaryMuscles
      .map((muscle) => mapStimulusGroup(muscle))
      .filter((value): value is MuscleBudgetGroup => value !== null)
      .filter((group) => !directMainMuscles.includes(group));
    const hitsPriorityMusclesDirectly = directMainMuscles.filter((group) =>
      getPriorityMuscles(params.settings).includes(group),
    );
    const hitsPriorityMusclesIndirectly = indirectMainMuscles.filter((group) =>
      getPriorityMuscles(params.settings).includes(group),
    );
    const hitsUnderservedMuscles = directMainMuscles
      .concat(indirectMainMuscles)
      .filter((group, index, current) => current.indexOf(group) === index)
      .filter((group) => topNeeds.includes(group));
    const hitsOverloadedMuscles = directMainMuscles
      .concat(indirectMainMuscles)
      .filter((group, index, current) => current.indexOf(group) === index)
      .filter((group) => overloaded.includes(group));
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
      exerciseId: exercise.id,
      exerciseName: catalogExercise?.name ?? exercise.name,
      movementPattern: catalogExercise?.movementPattern ?? null,
      requiredEquipment: catalogExercise?.requiredEquipment ?? [],
      availableInSelectedGym,
      primaryMuscles,
      secondaryMuscles,
      directMainMuscles,
      indirectMainMuscles,
      hitsPriorityMusclesDirectly,
      hitsPriorityMusclesIndirectly,
      hitsUnderservedMuscles,
      hitsOverloadedMuscles,
      whyThisExerciseFitsGoal: goalFitText,
      whyThisExerciseFitsEquipment:
        (catalogExercise?.requiredEquipment ?? []).length > 0
          ? `Övningen kräver ${catalogExercise?.requiredEquipment.join(", ")} och matchar vald utrustning: ${availableInSelectedGym ? "ja" : "nej"}.`
          : null,
      whyThisExerciseFitsCurrentWeeklyNeed:
        hitsUnderservedMuscles.length > 0
          ? `Övningen träffar veckobehov i ${hitsUnderservedMuscles.map((group) => MUSCLE_LABELS[group]).join(", ")}.`
          : "Ingen stark direkt träff mot mest eftersatta muskelgrupper kunde härledas.",
      whyThisExerciseFitsLongTermPlan:
        params.weeklyStructure.targetMuscles.some((group) =>
          directMainMuscles.includes(group),
        )
          ? `Övningen följer det selektiva planläget genom direkt träff på ${params.weeklyStructure.targetMuscles
              .filter((group) => directMainMuscles.includes(group))
              .map((group) => MUSCLE_LABELS[group])
              .join(", ")}.`
          : hitsPriorityMusclesDirectly.length > 0
          ? `Övningen ger direkt volym till prioriterade muskler: ${hitsPriorityMusclesDirectly.map((group) => MUSCLE_LABELS[group]).join(", ")}.`
          : hitsPriorityMusclesIndirectly.length > 0
            ? `Övningen ger främst indirekt träff på prioriterade muskler: ${hitsPriorityMusclesIndirectly.map((group) => MUSCLE_LABELS[group]).join(", ")}.`
            : "Övningen bidrar mer till helheten än till användarens prioriterade muskler.",
      progressionBasis:
        exercise.progressionNote ??
        (exercise.suggestedWeight != null
          ? "Förslag finns men exakt regel saknas i debugdatan."
          : null),
      alternativeCandidatesRejected: null,
      rejectionReasons: null,
    });
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

function getSelectedGymIdFromSnapshot(snapshot: StoredAiGeneratedWorkoutSnapshot | null) {
  const rawGym = snapshot?.request?.gym;
  return typeof rawGym === "string" && rawGym.trim() ? rawGym : null;
}

function inferHistoricallyUsedEquipment(logs: WorkoutLog[]) {
  const equipment = new Set<string>();

  for (const log of logs) {
    for (const exercise of log.exercises) {
      const catalogExercise = getExerciseById(exercise.exerciseId);
      for (const equipmentId of catalogExercise?.requiredEquipment ?? []) {
        equipment.add(equipmentId);
      }
    }
  }

  return Array.from(equipment).sort();
}

function buildEquipmentContext(params: {
  gyms: GymLike[];
  latestGeneratedWorkout: LatestWorkoutCandidate | null;
  logs: WorkoutLog[];
}) {
  const snapshot = params.latestGeneratedWorkout?.snapshot ?? null;
  const selectedGymLabel = snapshot?.selectedGym ?? null;
  const selectedGymId = getSelectedGymIdFromSnapshot(snapshot);
  const matchedGym =
    params.gyms.find((gym) => String(gym.id) === selectedGymId) ??
    params.gyms.find((gym) => gym.name === selectedGymLabel) ??
    null;
  const selectedGymEquipment = Array.isArray(matchedGym?.equipment)
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
  const equipmentSeedForLatestGeneration = snapshot?.equipmentSeed ?? [];
  const historicallyUsedEquipment28d = inferHistoricallyUsedEquipment(
    filterLogsWithinDays(params.logs, 28).filter((log) => log.status === "completed"),
  );
  const inferredAvailableEquipment = historicallyUsedEquipment28d.filter(
    (equipmentId) => !selectedGymEquipment.includes(equipmentId),
  );
  const equipmentForNextGeneration =
    selectedGymEquipment.length > 0
      ? selectedGymEquipment
      : equipmentSeedForLatestGeneration.length > 0
        ? equipmentSeedForLatestGeneration
        : [];
  const notes: string[] = [];
  let confidence: "high" | "medium" | "low" = "high";

  if (!selectedGymLabel && historicallyUsedEquipment28d.length > 0) {
    confidence = "medium";
    notes.push(
      "Inget valt gym i userContext, men historiken antyder nylig användning av registrerad utrustning.",
    );
  }

  if (equipmentForNextGeneration.length === 0 && historicallyUsedEquipment28d.length > 0) {
    confidence = "low";
    notes.push(
      "Inget tydligt equipment-seed finns för nästa generering trots att historiken visar utrustning. Detta ska inte tolkas som valt gym.",
    );
  }

  if (selectedGymEquipment.length === 0 && equipmentSeedForLatestGeneration.length > 0) {
    notes.push("Senaste generering sparade equipment-seed men valt gyms utrustning kunde inte härledas direkt.");
  }

  return {
    selectedGymId,
    selectedGymLabel,
    selectedGymEquipment,
    equipmentSeedForLatestGeneration,
    historicallyUsedEquipment28d,
    inferredAvailableEquipment,
    equipmentForNextGeneration,
    confidence,
    notes,
  };
}

function buildPlanRiskDiagnostics(weeklyStructure: WeeklyWorkoutStructure) {
  const risks: Array<{
    date: string;
    focus: WorkoutFocus | null;
    riskLevel: "low" | "medium" | "high";
    reason: string;
    affectedMuscles: MuscleBudgetGroup[];
    recommendation: string;
  }> = [];
  const notes: string[] = [];

  for (const day of weeklyStructure.upcomingDays) {
    if (!day.focus) {
      continue;
    }

    const affectedMuscles = FOCUS_TO_BUDGET_GROUPS[day.focus] ?? [];
    const riskyEntries = weeklyStructure.muscleBudget.filter(
      (entry) =>
        affectedMuscles.includes(entry.group) &&
        (entry.loadStatus === "high_risk" || entry.remainingSets <= 0),
    );

    if (riskyEntries.length === 0) {
      continue;
    }

    const riskLevel =
      riskyEntries.some((entry) => entry.loadStatus === "high_risk") ? "high" : "medium";
    const reason = `${formatWorkoutFocus(day.focus)} träffar ${riskyEntries
      .map((entry) => `${entry.label.toLowerCase()} (${entry.loadStatus}, ${roundToSingleDecimal(entry.remainingSets)} kvar)`)
      .join(", ")}.`;
    const recommendation =
      day.focus === "core"
        ? "Ändra core-pass till recovery/mobility eller byt fokus till mindre belastade muskelgrupper."
        : "Överväg ett lättare eller omdirigerat pass om detta fokus verkligen behövs just nu.";

    risks.push({
      date: day.date,
      focus: day.focus,
      riskLevel,
      reason,
      affectedMuscles: riskyEntries.map((entry) => entry.group),
      recommendation,
    });
  }

  if (risks.some((risk) => risk.focus === "core" && risk.riskLevel === "high")) {
    notes.push("Kommande separat core-fokus krockar med hög core-belastning i aktuell budget.");
  }

  return {
    upcomingFocusRisks: risks,
    notes,
  };
}

function buildAnalysisAvailability(params: {
  latestWorkoutEvaluationContext: AiDebugLatestWorkoutEvaluationContext;
  progressionDiagnostics: AiDebugProgressionDiagnostic[];
  exerciseSelectionDiagnostics: AiDebugExerciseSelectionDiagnostic[];
}) {
  const limitations: string[] = [];
  const canEvaluateFallbackWorkout =
    params.latestWorkoutEvaluationContext.source === "fallback_from_history";
  const canEvaluateLatestGeneratedWorkout =
    params.latestWorkoutEvaluationContext.source !== "missing" &&
    params.latestWorkoutEvaluationContext.source !== "fallback_from_history";
  const canEvaluateExerciseSelection =
    (canEvaluateLatestGeneratedWorkout || canEvaluateFallbackWorkout) &&
    params.exerciseSelectionDiagnostics.length > 0;
  const canEvaluateProgression =
    (canEvaluateLatestGeneratedWorkout || canEvaluateFallbackWorkout) &&
    params.progressionDiagnostics.length > 0;

  if (params.latestWorkoutEvaluationContext.source === "missing") {
    limitations.push("Inget senaste AI-genererat pass hittades.");
  }

  if (canEvaluateFallbackWorkout) {
    limitations.push(
      "Senaste pass är fallback från historik, inte säkert senaste AI-genererade pass.",
    );
  }

  if (!canEvaluateExerciseSelection) {
    limitations.push("ExerciseSelectionDiagnostics saknas eftersom inget tydligt senaste pass kunde byggas.");
  }

  if (!canEvaluateProgression) {
    limitations.push("ProgressionDiagnostics saknas eftersom inget senaste pass kunde identifieras.");
  }

  return {
    canEvaluateLatestGeneratedWorkout,
    canEvaluateFallbackWorkout,
    canEvaluateExerciseSelection,
    canEvaluateProgression,
    canEvaluateLongTermPlan: true,
    canEvaluateAdherence: true,
    limitations,
  };
}

function isExerciseLikelyLoaded(exerciseId: string) {
  const catalogExercise = getExerciseById(exerciseId);
  if (!catalogExercise) {
    return false;
  }

  return (catalogExercise.requiredEquipment ?? []).some((equipmentId) =>
    EXERCISE_IDS_THAT_OFTEN_NEED_LOAD.has(equipmentId),
  );
}

function buildDataQuality(logs: WorkoutLog[]): AiDebugDataQuality {
  const completed7d = filterAnalysisLogs(filterLogsWithinDays(logs, 7)).filter(
    (log) => log.status === "completed",
  );
  const completed28d = filterAnalysisLogs(filterLogsWithinDays(logs, 28)).filter(
    (log) => log.status === "completed",
  );
  const excluded28d = filterLogsWithinDays(logs, 28).filter((log) =>
    isWorkoutLogExcludedFromAnalysis(log),
  );
  const valid7d = completed7d.filter(
    (log) => buildWorkoutValidity(log, null).classification === "valid_full",
  );
  const valid28d = completed28d.filter(
    (log) => {
      const classification = buildWorkoutValidity(log, null).classification;
      return classification === "valid_full" || classification === "valid_shortened";
    },
  );
  const veryShortWorkoutCount28d = completed28d.filter(
    (log) => buildWorkoutValidity(log, null).classification === "too_short",
  ).length;
  const emptyWorkoutCount28d = completed28d.filter(
    (log) => buildWorkoutValidity(log, null).classification === "empty_completed",
  ).length;
  let missingEffortCount28d = 0;
  let loadRelevantSetCount28d = 0;
  let missingWeightCount28d = 0;

  for (const log of completed28d) {
    for (const exercise of log.exercises) {
      for (const set of exercise.sets) {
        if (!hasCompletedWorkInSet(set)) {
          continue;
        }

        if (set.repsLeft == null && set.timedEffort == null) {
          missingEffortCount28d += 1;
        }

        if (isExerciseLikelyLoaded(exercise.exerciseId)) {
          loadRelevantSetCount28d += 1;

          if (set.actualWeight == null) {
            missingWeightCount28d += 1;
          }
        }
      }
    }
  }

  const reasons: string[] = [];
  const notes: string[] = [];
  let overallConfidence: AiDebugDataQuality["overallConfidence"] = "high";

  if (valid28d.length < 3) {
    overallConfidence = "low";
    reasons.push("Få tydligt giltiga pass senaste 28 dagarna.");
  } else if (valid28d.length < 6) {
    overallConfidence = "medium";
    reasons.push("Historiken är användbar men fortfarande ganska tunn.");
  }

  if (veryShortWorkoutCount28d >= 2) {
    overallConfidence = overallConfidence === "high" ? "medium" : overallConfidence;
    reasons.push("Flera mycket korta pass gör veckorytmen svårare att tolka.");
  }

  if (emptyWorkoutCount28d > 0) {
    overallConfidence = "low";
    reasons.push("Minst ett completed-pass saknar övningar.");
  }

  if (excluded28d.length > 0) {
    notes.push("Minst ett pass är manuellt exkluderat från analys och påverkar inte coachmotorn.");
  }

  if (missingEffortCount28d > 0) {
    notes.push("Effort/RIR saknas för en del av sethistoriken.");
  }

  if (loadRelevantSetCount28d > 0 && missingWeightCount28d > 0) {
    notes.push("Viktdata saknas för vissa belastade set.");
  }

  if (reasons.length === 0) {
    reasons.push("Historiken innehåller tillräckligt många giltiga pass för försiktiga slutsatser.");
  }

  return {
    overallConfidence,
    reasons,
    completedWorkoutCount7d: completed7d.length,
    completedWorkoutCount28d: completed28d.length,
    validWorkoutCount7d: valid7d.length,
    validWorkoutCount28d: valid28d.length,
    veryShortWorkoutCount28d,
    emptyWorkoutCount28d,
    excludedWorkoutCount28d: excluded28d.length,
    excludedWorkoutReasons: Array.from(
      new Set(
        excluded28d
          .map((log) => getWorkoutLogAnalysisExclusionReason(log))
          .filter((value): value is string => Boolean(value)),
      ),
    ),
    missingEffortCount28d,
    missingWeightCount28d,
    notes,
  };
}

function buildCurrentPlanSnapshot(params: {
  weeklyStructure: WeeklyWorkoutStructure;
  settings: SettingsLike | null;
}): AiDebugCurrentPlanSnapshot {
  const patternPreferredFocus = getPatternPreferredFocus(
    params.weeklyStructure,
    params.settings?.training_goal,
  );
  const topNeeds = params.weeklyStructure.muscleBudget
    .filter((entry) => entry.remainingSets > 0)
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 3)
    .map((entry) => entry.label.toLowerCase());
  const planInterpretation =
    // Den här texten ska hjälpa extern AI att läsa planen som en coach, inte bara som rådata.
    topNeeds.length > 0
      ? `Planen försöker nu kombinera ${topNeeds.join(", ")} med veckorytm och återhämtning. ${params.weeklyStructure.optimalPlanText}`
      : params.weeklyStructure.optimalPlanText;

  return {
    trainingGoal: params.settings?.training_goal ?? null,
    experienceLevel: params.settings?.experience_level ?? null,
    splitStyle: formatSplitStyle(params.weeklyStructure.splitStyle),
    selectedWeeklyFocus: params.weeklyStructure.nextFocus,
    selectedPlanMode: params.weeklyStructure.selectedPlanMode,
    targetMuscles: params.weeklyStructure.targetMuscles,
    avoidMuscles: params.weeklyStructure.avoidMuscles,
    limitedMuscles: params.weeklyStructure.limitedMuscles,
    focusIntent: params.weeklyStructure.focusIntent,
    recoveryOverrideApplied: params.weeklyStructure.recoveryOverrideApplied,
    recoveryOverrideReason: params.weeklyStructure.recoveryOverrideReason,
    patternPreferredFocus,
    reasonForSelectedFocus: params.weeklyStructure.summaryText,
    coachDecision: params.weeklyStructure.coachDecision,
    goalFeedback: params.weeklyStructure.goalFeedback,
    goalTrajectory: params.weeklyStructure.goalTrajectory,
    trainingDoseAdjustment: params.weeklyStructure.trainingDoseAdjustment,
    trainingGap: params.weeklyStructure.trainingGap,
    optimalPlanText: params.weeklyStructure.optimalPlanText,
    completedLast7Days: params.weeklyStructure.completedLast7Days,
    passCount: params.weeklyStructure.passCount,
    confidenceScore: params.weeklyStructure.confidenceScore,
    upcomingDays: params.weeklyStructure.upcomingDays,
    upcomingSteps: params.weeklyStructure.upcomingSteps,
    planInterpretation,
  };
}

function buildAdherencePeriod(params: {
  logs: WorkoutLog[];
  windowType: AiDebugAdherencePeriod["windowType"];
  windowStart: string;
  windowEnd: string;
  plannedSessions: number | null;
  targetMinutes: number | null;
}) {
  const completedLogs = params.logs.filter((log) => log.status === "completed");
  const completedMinutes = completedLogs.reduce(
    (sum, log) => sum + getLogDurationMinutes(log),
    0,
  );
  const validCompletedSessions = completedLogs.filter((log) => {
    const validity = buildWorkoutValidity(log, null);
    return (
      validity.classification === "valid_full" ||
      validity.classification === "valid_shortened" ||
      validity.classification === "partial"
    );
  }).length;
  const completionRatio =
    params.targetMinutes && params.targetMinutes > 0
      ? roundToSingleDecimal(completedMinutes / params.targetMinutes)
      : null;

  let interpretation = "Tillräckligt med data saknas för en stark tolkning.";

  if (params.targetMinutes == null || params.plannedSessions == null) {
    interpretation = "Det finns ingen tydlig minutplan att jämföra mot för denna period.";
  } else if (completedLogs.length === 0) {
    interpretation = "Inga completed-pass hittades i perioden.";
  } else if (validCompletedSessions < completedLogs.length) {
    interpretation =
      "Det finns completed-pass av lägre kvalitet i perioden, så följsamheten bör tolkas försiktigt.";
  } else if ((completionRatio ?? 0) >= 0.85) {
    interpretation = "Genomförandet ligger nära planerad träningsmängd i denna period.";
  } else if ((completionRatio ?? 0) >= 0.6) {
    interpretation = "En del av planeringen följs, men inte hela målvolymen ännu.";
  } else {
    interpretation = "Genomförandet är begränsat i förhållande till planerad träningsmängd.";
  }

  return {
    windowType: params.windowType,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    plannedSessions: params.plannedSessions,
    completedSessions: completedLogs.length,
    validCompletedSessions,
    completedMinutes,
    targetMinutes: params.targetMinutes,
    completionRatio,
    interpretation,
  } satisfies AiDebugAdherencePeriod;
}

function buildAdherenceDiagnostics(params: {
  logs: WorkoutLog[];
  weeklyStructure: WeeklyWorkoutStructure;
}) {
  const last7Logs = filterLogsWithinDays(params.logs, 7);
  const last28Logs = filterLogsWithinDays(params.logs, 28);
  const now = new Date();
  const last7Start = new Date(now);
  last7Start.setDate(now.getDate() - 6);
  const last28Start = new Date(now);
  last28Start.setDate(now.getDate() - 27);
  const last7Days = buildAdherencePeriod({
    logs: last7Logs,
    windowType: "rolling_7_days",
    windowStart: last7Start.toISOString().slice(0, 10),
    windowEnd: now.toISOString().slice(0, 10),
    plannedSessions: params.weeklyStructure.goalTrajectory.weeklyFrequencyTarget,
    targetMinutes: params.weeklyStructure.goalTrajectory.weeklyFrequencyTarget * 30,
  });
  const last28Days = buildAdherencePeriod({
    logs: last28Logs,
    windowType: "rolling_28_days",
    windowStart: last28Start.toISOString().slice(0, 10),
    windowEnd: now.toISOString().slice(0, 10),
    plannedSessions: roundToSingleDecimal(
      params.weeklyStructure.goalTrajectory.weeklyFrequencyTarget * 4,
    ),
    targetMinutes: params.weeklyStructure.goalTrajectory.weeklyFrequencyTarget * 30 * 4,
  });
  const notes: string[] = [];
  let signal: AiDebugAdherenceDiagnostics["missedOrLowQualityTrainingSignal"] = "none";

  const lowQualityCount = last28Logs.filter((log) => {
    const classification = buildWorkoutValidity(log, null).classification;
    return classification === "too_short" || classification === "empty_completed";
  }).length;

  if (lowQualityCount >= 3) {
    signal = "clear";
    notes.push("Flera mycket korta eller tomma completed-pass gör veckorytmen osäker.");
  } else if (lowQualityCount >= 2) {
    signal = "moderate";
    notes.push("Det finns flera lågkvalitativa completed-pass i 28-dagarsfönstret.");
  } else if (lowQualityCount === 1) {
    signal = "mild";
    notes.push("Minst ett completed-pass bör tolkas försiktigt.");
  }

  if ((last7Days.completionRatio ?? 1) < 0.5 && signal !== "clear") {
    signal = signal === "none" ? "moderate" : signal;
    notes.push("Senaste 7 dagarna når bara en mindre del av planerad minutvolym.");
  }

  return {
    last7Days,
    last28Days,
    missedOrLowQualityTrainingSignal: signal,
    notes,
    consistencyCheck: {
      hasConflictingSignals: params.weeklyStructure.trainingGap.windowType !== last7Days.windowType,
      notes:
        params.weeklyStructure.trainingGap.windowType !== last7Days.windowType
          ? [
              "trainingGap använder nuvarande vecka medan adherenceDiagnostics.last7Days använder rullande 7 dagar. Jämför dem inte direkt.",
            ]
          : [],
    },
  } satisfies AiDebugAdherenceDiagnostics;
}

function buildLongTermMuscleTrends(params: {
  weeklyStructure: WeeklyWorkoutStructure;
}): AiDebugLongTermMuscleTrend[] {
  return params.weeklyStructure.muscleBudget.map((entry) => {
    const userPriorityRank = params.weeklyStructure.configuredPriorityMuscles.indexOf(entry.group);
    const completionRatioCurrentWeek =
      entry.targetSets > 0 ? roundToSingleDecimal(entry.completedSets / entry.targetSets) : 0;
    const longTermInterpretation =
      userPriorityRank >= 0 && entry.recent4WeekAvgSets < entry.targetSets * 0.7
        ? `${entry.label} är användarprioriterad men har låg rullande volym jämfört med veckomålet.`
        : entry.recent4WeekAvgSets >= entry.targetSets
          ? `${entry.label} har redan en rullande volym nära eller över veckomålet.`
          : `${entry.label} ligger fortfarande under sin nuvarande målvolym över tid.`;
    const recommendationForNext7Days =
      entry.loadStatus === "high_risk" || entry.loadStatus === "over"
        ? `Behåll ${entry.label.toLowerCase()} mer kontrollerad tills återhämtningen ser bättre ut.`
        : entry.remainingSets > 0
          ? `Lägg in ungefär ${roundToSingleDecimal(entry.remainingSets)} set till för ${entry.label.toLowerCase()} under nästa 7-dagarsperiod.`
          : `Ingen extra volym behövs direkt för ${entry.label.toLowerCase()} just nu.`;

    return {
      muscle: entry.group,
      label: entry.label,
      priorityLevel: entry.priority,
      userPriorityRank: userPriorityRank >= 0 ? userPriorityRank + 1 : null,
      targetSetsCurrentWeek: entry.targetSets,
      completedSetsCurrentWeek: entry.completedSets,
      remainingSetsCurrentWeek: entry.remainingSets,
      completionRatioCurrentWeek,
      rolling4WeekAverage: entry.recent4WeekAvgSets,
      trend: entry.progressStatus,
      longTermInterpretation,
      recommendationForNext7Days,
    };
  });
}

function collectWorkoutMuscles(
  workout: Workout | null,
  mode: "primary" | "secondary",
) {
  const muscles = new Set<MuscleBudgetGroup>();

  for (const block of workout?.blocks ?? []) {
    for (const exercise of block.exercises) {
      const catalogExercise = getExerciseById(exercise.id);
      const rawMuscles =
        mode === "primary"
          ? catalogExercise?.primaryMuscles ?? []
          : catalogExercise?.secondaryMuscles ?? [];

      for (const rawMuscle of rawMuscles) {
        const group = mapStimulusGroup(rawMuscle);
        if (group) {
          muscles.add(group);
        }
      }
    }
  }

  return Array.from(muscles);
}

function buildLatestWorkoutEvaluationContext(params: {
  latestGeneratedWorkout: LatestWorkoutCandidate | null;
  weeklyStructure: WeeklyWorkoutStructure;
  settings: SettingsLike | null;
}): AiDebugLatestWorkoutEvaluationContext {
  const latestWorkout = params.latestGeneratedWorkout?.snapshot.normalizedWorkout ?? null;
  if (!latestWorkout) {
    return {
      source: "missing",
      sourceConfidence: "high",
      latestGeneratedWorkoutName: null,
      requestedDurationMinutes: null,
      plannedFocus: null,
      selectedBecause: null,
      fitsLongTermPlan: "unclear",
      musclesDirectlyTargeted: [],
      musclesIndirectlyTargeted: [],
      priorityMusclesHitDirectly: [],
      priorityMusclesHitIndirectly: [],
      priorityMusclesMissing: [],
      underservedMusclesAddressed: [],
      underservedMusclesNotAddressed: [],
      overloadedMusclesHitDirectly: [],
      overloadedMusclesHitIndirectly: [],
      expectedRoleInPlan: "unclear",
      interpretation:
        "Inget senaste AI-genererat pass kunde hittas. Denna export kan användas för plan- och historikanalys, men inte för detaljerad övningsvalsanalys.",
    };
  }

  const direct = collectWorkoutMuscles(latestWorkout, "primary");
  const indirect = collectWorkoutMuscles(latestWorkout, "secondary").filter(
    (group) => !direct.includes(group),
  );
  const priorityMuscles = getPriorityMuscles(params.settings);
  const underserved = params.weeklyStructure.muscleBudget
    .filter((entry) => entry.remainingSets > 0)
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 5)
    .map((entry) => entry.group);
  const overloaded = params.weeklyStructure.muscleBudget
    .filter((entry) => entry.loadStatus === "over" || entry.loadStatus === "high_risk")
    .map((entry) => entry.group);
  const priorityMusclesHitDirectly = priorityMuscles.filter((group) =>
    direct.includes(group),
  );
  const priorityMusclesHitIndirectly = priorityMuscles.filter(
    (group) => !direct.includes(group) && indirect.includes(group),
  );
  // Saknade prioriterade muskler mäts mot direkt träff, eftersom indirekt volym ofta inte räcker.
  const priorityMusclesMissing = priorityMuscles.filter(
    (group) => !direct.includes(group),
  );
  const underservedMusclesAddressed = underserved.filter(
    (group) => direct.includes(group) || indirect.includes(group),
  );
  const underservedMusclesNotAddressed = underserved.filter(
    (group) => !direct.includes(group) && !indirect.includes(group),
  );
  const overloadedMusclesHitDirectly = overloaded.filter((group) => direct.includes(group));
  const overloadedMusclesHitIndirectly = overloaded.filter(
    (group) => !direct.includes(group) && indirect.includes(group),
  );
  const expectedRoleInPlan =
    params.weeklyStructure.selectedPlanMode === "recovery_mobility"
      ? "recovery_or_light_session"
      : params.weeklyStructure.selectedPlanMode === "selective_priority_accessory"
        ? "short_extra_session"
        : (params.latestGeneratedWorkout?.snapshot.requestedDurationMinutes ?? latestWorkout.duration) <= 25
      ? "short_extra_session"
      : params.weeklyStructure.trainingGap.status === "major_gap"
        ? "catch_up_session"
        : params.weeklyStructure.trainingGap.status === "recovery_first"
          ? "recovery_or_light_session"
          : "main_workout";
  const fitsLongTermPlan =
    params.latestGeneratedWorkout?.snapshot.workoutFocusTag === params.weeklyStructure.nextFocus
      ? "yes"
      : underservedMusclesAddressed.length >= Math.max(1, Math.ceil(underserved.length / 2))
        ? "partly"
        : "unclear";
  const interpretation = [
    `Planläge: ${params.weeklyStructure.selectedPlanMode}. ${params.weeklyStructure.focusIntent}`,
    `${latestWorkout.name} riktar främst ${direct.map((group) => MUSCLE_LABELS[group].toLowerCase()).join(", ") || "inga tydliga muskelgrupper"}.`,
    priorityMusclesMissing.length > 0
      ? `Direkt volym saknas för ${priorityMusclesMissing.map((group) => MUSCLE_LABELS[group].toLowerCase()).join(", ")} trots användarprioritet.`
      : "Alla prioriterade muskler får direkt träff i passet.",
    underservedMusclesNotAddressed.length > 0
      ? `Vissa eftersatta grupper täcks inte: ${underservedMusclesNotAddressed.map((group) => MUSCLE_LABELS[group].toLowerCase()).join(", ")}.`
      : "Passet träffar de flesta mest eftersatta muskelgrupperna.",
    overloadedMusclesHitDirectly.length > 0
      ? `Passet lägger direkt träff på redan högt belastade grupper: ${overloadedMusclesHitDirectly.map((group) => MUSCLE_LABELS[group].toLowerCase()).join(", ")}.`
      : "",
  ].join(" ");

  return {
    source: params.latestGeneratedWorkout?.source ?? "missing",
    sourceConfidence: params.latestGeneratedWorkout?.sourceConfidence ?? "high",
    latestGeneratedWorkoutName: latestWorkout.name,
    requestedDurationMinutes:
      params.latestGeneratedWorkout?.snapshot.requestedDurationMinutes ?? latestWorkout.duration,
    plannedFocus: params.latestGeneratedWorkout?.snapshot.workoutFocusTag ?? latestWorkout.plannedFocus ?? null,
    selectedBecause: params.weeklyStructure.summaryText,
    fitsLongTermPlan,
    musclesDirectlyTargeted: direct,
    musclesIndirectlyTargeted: indirect,
    priorityMusclesHitDirectly,
    priorityMusclesHitIndirectly,
    priorityMusclesMissing,
    underservedMusclesAddressed,
    underservedMusclesNotAddressed,
    overloadedMusclesHitDirectly,
    overloadedMusclesHitIndirectly,
    expectedRoleInPlan,
    interpretation,
  };
}

function buildWarnings(params: {
  logs: WorkoutLog[];
  dataQuality: AiDebugDataQuality;
  latestWorkoutEvaluationContext: AiDebugLatestWorkoutEvaluationContext;
  progressionDiagnostics: AiDebugProgressionDiagnostic[];
  weeklyStructure: WeeklyWorkoutStructure;
  settings: SettingsLike | null;
  generatedWorkouts: LatestWorkoutCandidate[];
  planRiskDiagnostics: ReturnType<typeof buildPlanRiskDiagnostics>;
  adherenceDiagnostics: AiDebugAdherenceDiagnostics;
}) {
  const warnings: string[] = [];

  if (params.logs.length === 0) {
    warnings.push("Inga genomförda pass hittades. Historikdelen blir tunn.");
  }

  if (params.generatedWorkouts.length === 0) {
    warnings.push("Inga lokalt sparade AI-genererade pass hittades ännu.");
  }
  if (params.latestWorkoutEvaluationContext.source === "missing") {
    warnings.push("Inget senaste AI-genererat pass hittades. Exporten kan inte användas för full passanalys.");
  }
  if (params.latestWorkoutEvaluationContext.source === "fallback_from_history") {
    warnings.push("Senaste pass hämtades från fallback-historik och kan avvika från senaste generering.");
  }

  if (!params.settings?.training_goal) {
    warnings.push("Användaren saknar sparat träningsmål i inställningarna.");
  }

  if (params.dataQuality.veryShortWorkoutCount28d >= 2) {
    // Många korta pass tenderar att skapa brus i både rytm- och progressionsanalys.
    warnings.push("Historiken innehåller flera mycket korta pass som bör tolkas försiktigt.");
  }

  if (params.dataQuality.emptyWorkoutCount28d > 0) {
    warnings.push("Minst ett completed-pass saknar övningar och bör inte väga tungt i analysen.");
  }

  if (params.dataQuality.excludedWorkoutCount28d > 0) {
    warnings.push(
      `Minst ${params.dataQuality.excludedWorkoutCount28d} pass är exkluderade från analysen och påverkar inte coachmotorn.`,
    );
  }

  const totalCompletedSets = params.logs
    .filter((log) => log.status === "completed")
    .reduce((sum, log) => sum + countCompletedWorkingSetsInLog(log), 0);

  if (totalCompletedSets > 0 && params.dataQuality.missingEffortCount28d / totalCompletedSets > 0.6) {
    warnings.push("Majoriteten av seten saknar effort/RIR, vilket gör progression svårare att bedöma.");
  }

  if (params.latestWorkoutEvaluationContext.priorityMusclesMissing.length) {
    warnings.push(
      `Senaste pass saknar direkt träff för prioriterade muskler: ${params.latestWorkoutEvaluationContext.priorityMusclesMissing
        .map((group) => MUSCLE_LABELS[group].toLowerCase())
        .join(", ")}.`,
    );
  }

  if (
    params.progressionDiagnostics.some(
      (item) =>
        item.progressionSeemsAggressive &&
        item.missingDataWarnings.some((warning) => warning.includes("effort/RIR")),
    )
  ) {
    warnings.push("Minst en progression ser offensiv ut trots att effort/RIR saknas.");
  }

  if (
    params.weeklyStructure.trainingGap.thirtyDayEffect?.confidence === "low" ||
    params.weeklyStructure.confidenceScore === "low"
  ) {
    warnings.push("Långsiktig plan bör tolkas försiktigt eftersom datatilliten är låg.");
  }

  if (params.planRiskDiagnostics.upcomingFocusRisks.some((risk) => risk.riskLevel === "high")) {
    warnings.push("Kommande plan innehåller minst ett fokus med hög risk givet aktuell muskelbudget.");
  }

  if (params.adherenceDiagnostics.consistencyCheck.hasConflictingSignals) {
    warnings.push(params.adherenceDiagnostics.consistencyCheck.notes.join(" | "));
  }

  return warnings;
}

export function buildAiDebugExport(
  params: BuildAiDebugExportParams,
): AiDebugExport {
  const historyWindowDays = getRequestedHistoryWindow(params.options);
  const analysisLogs = filterAnalysisLogs(params.logs);
  const filteredLogs = filterLogsByWindow(analysisLogs, historyWindowDays);
  const weeklyStructure = buildWeeklyWorkoutStructure({
    logs: analysisLogs,
    settings: normalizeWeeklyPlanningSettings(params.settings),
  });
  const generatedWorkouts = params.options.includeGeneratedWorkouts
    ? getLatestGeneratedWorkouts({
        generatedWorkouts: params.generatedWorkouts,
        generatedWorkout: params.generatedWorkout,
        draftWorkout: params.draftWorkout,
        logs: analysisLogs,
        limit: params.options.exportType === "full" ? 5 : 3,
      })
    : [];
  const latestGeneratedWorkout = generatedWorkouts[0] ?? null;
  const progressionDiagnostics = params.options.includeProgressionDiagnostics
    ? buildProgressionDiagnostics({
        workouts: generatedWorkouts,
        logs: filteredLogs,
        progressionSnapshots: params.progressionSnapshots,
        weeklyStructure,
        limit: params.options.exportType === "full" ? 24 : 12,
      })
    : [];
  const dataQuality = buildDataQuality(params.logs);
  const adherenceDiagnostics = buildAdherenceDiagnostics({
    logs: analysisLogs,
    weeklyStructure,
  });
  const planRiskDiagnostics = buildPlanRiskDiagnostics(weeklyStructure);
  const latestWorkoutEvaluationContext = buildLatestWorkoutEvaluationContext({
    latestGeneratedWorkout,
    weeklyStructure,
    settings: params.settings,
  });
  const exerciseSelectionDiagnostics = buildExerciseSelectionDiagnostics({
    latestGeneratedWorkout,
    weeklyStructure,
    settings: params.settings,
    limit: params.options.exportType === "full" ? 20 : 10,
  });
  const analysisAvailability = buildAnalysisAvailability({
    latestWorkoutEvaluationContext,
    progressionDiagnostics,
    exerciseSelectionDiagnostics,
  });
  const equipmentContext = buildEquipmentContext({
    gyms: params.gyms,
    latestGeneratedWorkout,
    logs: analysisLogs,
  });
  const plannedDurationByWorkoutName = new Map<string, number>();
  for (const candidate of generatedWorkouts) {
    const name = candidate.snapshot.normalizedWorkout?.name?.trim();
    const duration = candidate.snapshot.requestedDurationMinutes ?? candidate.snapshot.normalizedWorkout?.duration ?? null;
    if (name && duration && !plannedDurationByWorkoutName.has(name)) {
      plannedDurationByWorkoutName.set(name, duration);
    }
  }
  const warnings = buildWarnings({
    logs: analysisLogs,
    dataQuality,
    latestWorkoutEvaluationContext,
    progressionDiagnostics,
    weeklyStructure,
    settings: params.settings,
    generatedWorkouts,
    planRiskDiagnostics,
    adherenceDiagnostics,
  });
  const debugPurpose = {
    description:
      "Detta underlag är avsett för extern AI-utvärdering av träningsappens passförslag, veckoplanering och långsiktiga målstyrning.",
    primaryQuestions: [
      "Är senaste föreslagna pass rimligt utifrån mål, utrustning, historik och prioriterade muskler?",
      "Är passet rimligt som nästa steg i den längre planen?",
      "Får prioriterade muskelgrupper tillräcklig återkommande volym?",
      "Finns bias i modellen, t.ex. för stort benfokus, för mycket core/axlar eller för lite armar?",
      "Är progressionen rimlig och försiktig nog utifrån användarens nivå och faktisk historik?",
      "Är datakvaliteten tillräcklig för att dra slutsatser?",
    ],
    intendedAiRole: "Agera som kritisk träningscoach och modellgranskare, inte som passgenerator.",
  };

  return {
    meta: {
      createdAt: new Date().toISOString(),
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      commitHash: process.env.NEXT_PUBLIC_COMMIT_SHA ?? null,
      exportType: params.options.exportType,
      schemaVersion: "ai-debug-export.v3",
      source: "analysis-debug-export",
    },
    debugPurpose,
    userContext: {
      trainingGoal: params.settings?.training_goal ?? null,
      sportFocus: normalizeSportFocus(params.settings?.sport_focus),
      sex: params.settings?.sex ?? null,
      age: typeof params.settings?.age === "number" ? params.settings.age : null,
      heightCm:
        typeof params.settings?.height_cm === "number" ? params.settings.height_cm : null,
      weightKg:
        typeof params.settings?.weight_kg === "number" ? params.settings.weight_kg : null,
      experienceLevel: params.settings?.experience_level ?? null,
      priorityMuscles: getPriorityMuscles(params.settings),
      selectedGym: getSelectedGym({
        latestGeneratedWorkout: latestGeneratedWorkout?.snapshot ?? null,
        gyms: params.gyms,
        anonymize: params.options.anonymize,
      }),
      availableEquipment: equipmentContext.equipmentForNextGeneration,
    },
    effortScaleLegend: {
      scaleType: "app_internal_effort",
      values: [
        { value: 0, label: "mycket lätt", interpretation: "Användaren upplevde setet som mycket lätt." },
        { value: 2, label: "lätt", interpretation: "Troligen flera repetitioner kvar i tanken." },
        { value: 4, label: "lagom", interpretation: "Rimlig arbetsnivå för normal träning." },
        { value: 6, label: "tungt", interpretation: "Hög ansträngning; progression bör vara försiktig." },
      ],
      note: "Exakt skala används som coachingstöd och ska inte tolkas som exakt RIR om appen inte uttryckligen registrerar RIR.",
    },
    equipmentContext,
    dataQuality,
    currentPlanSnapshot: buildCurrentPlanSnapshot({
      weeklyStructure,
      settings: params.settings,
    }),
    adherenceDiagnostics,
    analysisAvailability,
    muscleBudgetSnapshot: buildMuscleBudgetSnapshot({
      weeklyStructure,
      settings: params.settings,
    }),
    longTermMuscleTrends: buildLongTermMuscleTrends({
      weeklyStructure,
    }),
    recentCompletedWorkouts: params.options.includeCompletedWorkouts
      ? buildCompletedWorkouts({
          logs: filteredLogs,
          settings: params.settings,
          plannedDurationByWorkoutName,
          limit: params.options.exportType === "full" ? 10 : 5,
        })
      : [],
    recentGeneratedWorkouts: generatedWorkouts.map((candidate) =>
      buildGeneratedWorkoutSummary(
        candidate,
        params.options.anonymize,
        normalizeSportFocus(params.settings?.sport_focus),
      ),
    ),
    latestWorkoutEvaluationContext,
    planRiskDiagnostics,
    progressionDiagnostics,
    plannerDiagnostics: params.options.includePlannerDiagnostics
      ? buildPlannerDiagnostics({
          weeklyStructure,
          settings: params.settings,
          latestGeneratedWorkout: latestGeneratedWorkout?.snapshot ?? null,
        })
      : null,
    exerciseSelectionDiagnostics,
    aiEvaluationInstructions: {
      description:
        "Analysera både senaste passet och den längre planeringen. Skilj på fysiologiska problem, planeringsproblem och datakvalitetsproblem.",
      analysisPriorities: [
        "Skilj mellan brister i senaste passet och brister i den långsiktiga planen.",
        "Var särskilt uppmärksam på korta eller tomma pass i historiken.",
        "Bedöm om prioriterade muskler får direkt volym, inte bara indirekt träff.",
        "Bedöm om planens kommande steg verkar kunna täcka kvarvarande budget.",
      ],
      responseTemplate: [
        "1. Kort slutsats",
        "2. Senaste passet",
        "3. Långsiktig plan",
        "4. Prioriterade muskler",
        "5. Progression",
        "6. Historik och datakvalitet",
        "7. Bias/systematiska fel",
        "8. Rekommenderade modelländringar",
      ],
    },
    evaluationQuestions: [...debugPurpose.primaryQuestions],
    warnings,
  };
}
