import {
  buildTrainingHistoryContext,
  type TrainingHistoryContext,
} from "@/lib/planning/training-history-context";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import {
  normalizeSportFocus,
} from "@/types/training-profile";

import type {
  GenerateWorkoutWithAiCoreInput,
  UserSettingsSummary,
} from "@/lib/workouts/generate-workout-core";
import type {
  RecoverySeverity,
  TrainingConstraint,
  WorkoutCoachContext,
} from "@/lib/workout-generation/types";

function getLongTermPriorityMuscles(params: {
  settings: UserSettingsSummary | null;
  weeklyPlanContext: GenerateWorkoutWithAiCoreInput["weeklyPlanContext"];
}) {
  const weeklyPlanPriorities =
    params.weeklyPlanContext?.longTermPriorityMuscles ??
    params.weeklyPlanContext?.profilePriorityMuscles ??
    [];

  if (weeklyPlanPriorities.length > 0) {
    return weeklyPlanPriorities;
  }

  return [
    params.settings?.primary_priority_muscle,
    params.settings?.secondary_priority_muscle,
    params.settings?.tertiary_priority_muscle,
  ].filter(
    (value): value is MuscleBudgetGroup =>
      typeof value === "string" && value.length > 0,
  );
}

function normalizeGoal(
  value: string,
): WorkoutCoachContext["goal"] {
  return value === "strength" ||
    value === "hypertrophy" ||
    value === "health" ||
    value === "body_composition"
    ? value
    : "health";
}

function getSelectedFocus(
  params: Pick<GenerateWorkoutWithAiCoreInput, "nextFocus" | "selectedPlanMode">,
) {
  return params.selectedPlanMode === "recovery" ||
    params.selectedPlanMode === "recovery_mobility" ||
    params.selectedPlanMode === "light_accessory"
    ? "recovery_strength"
    : (params.nextFocus ?? "full_body");
}

function getRecoverySeverity(params: {
  focus: WorkoutCoachContext["selectedFocus"];
  muscle: MuscleBudgetGroup;
  limitedMuscles: MuscleBudgetGroup[];
}) {
  if (!params.limitedMuscles.includes(params.muscle)) {
    return {
      severity: "none" as RecoverySeverity,
      reason: "not_limited",
    };
  }

  if (params.focus === "recovery_strength") {
    return {
      severity: "allow_light_recovery" as RecoverySeverity,
      reason: "recovery_day_prefers_light_variant",
    };
  }

  return {
    severity: "avoid_heavy_loading" as RecoverySeverity,
    reason: "recent_training_load",
  };
}

function getTypicalCompletedDuration(
  trainingHistoryContext: TrainingHistoryContext,
) {
  return trainingHistoryContext.mediumTermTrainingSummary.typicalWorkoutDurationMinutes;
}

function clampSessionRatio(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1.4, value));
}

export function getPlanningDurationBucket(displayDurationMinutes: number) {
  if (displayDurationMinutes < 20) return 15;
  if (displayDurationMinutes < 25) return 20;
  if (displayDurationMinutes < 30) return 25;
  if (displayDurationMinutes < 35) return 30;
  if (displayDurationMinutes < 45) return 35;
  if (displayDurationMinutes < 60) return 45;
  return 60;
}

function getRecentExerciseIdentity(trainingHistoryContext: TrainingHistoryContext) {
  const recentExerciseIds: string[] = [];
  const recentVariantGroups: string[] = [];

  for (const workout of trainingHistoryContext.recentWorkouts) {
    for (const exercise of workout.topExercises) {
      if (
        typeof exercise.exerciseId === "string" &&
        exercise.exerciseId.length > 0 &&
        !recentExerciseIds.includes(exercise.exerciseId)
      ) {
        recentExerciseIds.push(exercise.exerciseId);
      }
      if (
        typeof exercise.variantGroup === "string" &&
        exercise.variantGroup.length > 0 &&
        !recentVariantGroups.includes(exercise.variantGroup)
      ) {
        recentVariantGroups.push(exercise.variantGroup);
      }
    }
  }

  for (const memory of trainingHistoryContext.exerciseProgressionMemory) {
    if (
      typeof memory.exerciseId === "string" &&
      memory.exerciseId.length > 0 &&
      !recentExerciseIds.includes(memory.exerciseId)
    ) {
      recentExerciseIds.push(memory.exerciseId);
    }
    if (
      typeof memory.variantGroup === "string" &&
      memory.variantGroup.length > 0 &&
      !recentVariantGroups.includes(memory.variantGroup)
    ) {
      recentVariantGroups.push(memory.variantGroup);
    }
  }

  return {
    recentExerciseIds: recentExerciseIds.slice(0, 16),
    recentVariantGroups: recentVariantGroups.slice(0, 12),
  };
}

function buildTrainingGapSummary(params: {
  goal: WorkoutCoachContext["goal"];
  plannedMinutes: number | null;
  completedMinutes: number | null;
  typicalCompletedDuration: number | null;
  completedSessions: number | null;
  plannedSessions: number | null;
  hasSpontaneousWorkoutThisWeek: boolean;
}) {
  if (
    typeof params.plannedMinutes !== "number" ||
    typeof params.completedMinutes !== "number" ||
    params.plannedMinutes <= 0
  ) {
    return "Historiken är ännu tunn, så passet baseras främst på fokus, utrustning och senaste träningsspår.";
  }

  const ratio = params.completedMinutes / params.plannedMinutes;
  const typicalText =
    typeof params.typicalCompletedDuration === "number"
      ? `När du väl tränar klarar du ofta runt ${params.typicalCompletedDuration} minuter.`
      : "När du väl tränar finns det viss passlängd att bygga vidare på.";

  if (
    typeof params.completedSessions === "number" &&
    typeof params.plannedSessions === "number" &&
    params.completedSessions > params.plannedSessions
  ) {
    return `${typicalText} Du tränar just nu mer än grundplanen, så dagens pass ska fortfarande ge progression men också lämna återhämtningsmarginal.`;
  }

  if (params.hasSpontaneousWorkoutThisWeek) {
    return `${typicalText} Du har redan fått in extra träning den här veckan, så dagens pass behöver vara träffsäkert i stället för att bara lägga på mer volym.`;
  }

  if (params.goal === "hypertrophy" && ratio < 0.65) {
    return `${typicalText} Men total träningsdos ligger under det som normalt krävs för tydlig muskeltillväxt, så dagens pass prioriterar de viktigaste rollerna först.`;
  }

  if (params.goal === "strength" && ratio < 0.65) {
    return `${typicalText} Men flera missade eller kortare pass gör att progressionen blir ojämn, så dagens pass prioriterar tydliga huvudroller.`;
  }

  if (ratio < 0.75) {
    return `${typicalText} Den totala veckodosen ligger dock under plan, så vi fokuserar på högsta nytta per övning i dag.`;
  }

  return `${typicalText} Veckodosen ligger nära plan, så dagens pass kan följa normal struktur.`;
}

export function buildWorkoutGenerationCoachContext(params: {
  input: GenerateWorkoutWithAiCoreInput;
  constraints?: TrainingConstraint[];
}) {
  const goal = normalizeGoal(params.input.goal);
  const selectedFocus = getSelectedFocus(params.input);
  const longTermPriorityMuscles = getLongTermPriorityMuscles({
    settings: params.input.settings,
    weeklyPlanContext: params.input.weeklyPlanContext,
  });
  const trainingHistoryContext = buildTrainingHistoryContext({
    workoutLogs: params.input.historyLogs,
    weeklyPlanPriorityMuscles: longTermPriorityMuscles,
    weeklyPlanDeficits: params.input.weeklyPlanContext?.muscleSetDeficits ?? null,
    weeklyBudget: params.input.weeklyBudget,
  });
  const globalUndertrainedMuscles =
    trainingHistoryContext.mediumTermTrainingSummary.undertrainedMuscles;
  const priorityBeforeFocus = Array.from(
    new Set([
      ...longTermPriorityMuscles,
      ...(params.input.weeklyPlanContext?.priorityMuscles ?? []),
    ]),
  );
  const upperBodyMuscles: MuscleBudgetGroup[] = [
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "core",
  ];
  const lowerBodyMuscles: MuscleBudgetGroup[] = [
    "quads",
    "hamstrings",
    "glutes",
    "calves",
    "core",
  ];
  const focusCompatiblePriorities = priorityBeforeFocus.filter((muscle) => {
    if (selectedFocus === "upper_body") return upperBodyMuscles.includes(muscle);
    if (selectedFocus === "lower_body") return lowerBodyMuscles.includes(muscle);
    return true;
  });
  const deferredPriorities = priorityBeforeFocus.filter(
    (muscle) => !focusCompatiblePriorities.includes(muscle),
  );
  const recoveryLimitedMuscles = Array.from(
    new Set([
      ...(params.input.weeklyPlanContext?.recoveryLimitedMuscles ?? []),
      ...trainingHistoryContext.mediumTermTrainingSummary.recoveryLimitedMuscles,
    ]),
  );
  const recoverySummary = {
    recoverySeverityByMuscle: recoveryLimitedMuscles.map((muscle) => ({
      muscle,
      ...getRecoverySeverity({
        focus: selectedFocus,
        muscle,
        limitedMuscles: recoveryLimitedMuscles,
      }),
    })),
  };
  const typicalCompletedDuration = getTypicalCompletedDuration(trainingHistoryContext);
  const plannedSessions = params.input.trainingGap?.plannedSessions ?? null;
  const completedSessions = params.input.trainingGap?.completedSessions ?? null;
  const plannedMinutes = params.input.trainingGap?.plannedMinutes ?? null;
  const completedMinutes = params.input.trainingGap?.completedMinutes ?? null;
  const adherenceSessionsRatio = clampSessionRatio(
    typeof plannedSessions === "number" && plannedSessions > 0
      ? (completedSessions ?? 0) / plannedSessions
      : null,
  );
  const adherenceMinutesRatio = clampSessionRatio(
    typeof plannedMinutes === "number" && plannedMinutes > 0
      ? (completedMinutes ?? 0) / plannedMinutes
      : null,
  );
  const trainingDoseAdherence = clampSessionRatio(
    typeof plannedMinutes === "number" && plannedMinutes > 0
      ? (completedMinutes ?? 0) / plannedMinutes
      : null,
  );
  const { recentExerciseIds, recentVariantGroups } =
    getRecentExerciseIdentity(trainingHistoryContext);
  const hasSpontaneousWorkoutThisWeek =
    params.input.weeklyPlanContext?.hasSpontaneousWorkoutThisWeek ?? false;
  const displayDurationMinutes = params.input.durationMinutes;
  const planningDurationBucket = getPlanningDurationBucket(displayDurationMinutes);

  const coachContext: WorkoutCoachContext = {
    goal,
    experienceLevel: params.input.settings?.experience_level ?? null,
    selectedFocus,
    selectedFocusReason:
      params.input.weeklyPlanContext?.coachText ??
      `Fokus ${selectedFocus} valdes utifrån planerad veckorytm och nuvarande behov.`,
    durationMinutes: displayDurationMinutes,
    displayDurationMinutes,
    planningDurationBucket,
    timeBudgetMinutes: displayDurationMinutes,
    durationReason:
      typeof typicalCompletedDuration === "number" &&
      displayDurationMinutes > typicalCompletedDuration + 10
        ? "Requested duration is longer than typical completed sessions, so slots will be prioritized tightly."
        : "Requested duration is within the current realistic range.",
    // Bucket används bara internt för stabilare slot-kontrakt; UI kan fortfarande visa exakt tid.
    durationBucketReason:
      planningDurationBucket === displayDurationMinutes
        ? "Requested duration already matches the planning bucket."
        : `Requested ${displayDurationMinutes} min uses the ${planningDurationBucket}-minute planning bucket for a more stable slot contract.`,
    selectedEquipment: params.input.equipment,
    sportFocus: normalizeSportFocus(params.input.settings?.sport_focus),
    typicalCompletedDuration7d: typicalCompletedDuration,
    typicalCompletedDuration14d: typicalCompletedDuration,
    typicalCompletedDuration30d: typicalCompletedDuration,
    completedSessions7d: completedSessions,
    plannedSessions7d: plannedSessions,
    completedMinutes7d: completedMinutes,
    plannedMinutes7d: plannedMinutes,
    adherenceSessionsRatio,
    adherenceMinutesRatio,
    trainingDoseAdherence,
    trainingGapSummary: buildTrainingGapSummary({
      goal,
      plannedMinutes,
      completedMinutes,
      typicalCompletedDuration,
      completedSessions,
      plannedSessions,
      hasSpontaneousWorkoutThisWeek,
    }),
    recentExerciseIds,
    recentVariantGroups,
    globalUndertrainedMuscles,
    focusCompatiblePriorities,
    deferredPriorities,
    recoverySummary,
    injuryConstraints: params.constraints ?? [],
    hasSpontaneousWorkoutThisWeek,
    coachDecisionReason:
      params.input.focusIntent ??
      "Coach context byggdes från mål, historik, träningsgap och fokuskompatibla prioriteringar.",
  };

  return {
    coachContext,
    trainingHistoryContext,
    longTermPriorityMuscles,
  };
}
