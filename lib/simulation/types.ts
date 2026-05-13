import type {
  SimulationWorkoutGenerationMode,
  WorkoutGenerationMode,
} from "@/lib/workout-generation/types";

export type { SimulationWorkoutGenerationMode };

export type SimulationGoal =
  | "strength"
  | "hypertrophy"
  | "body_composition"
  | "health";

export type SimulationWeeklyPlanFlexibility =
  | "strict"
  | "balanced"
  | "flexible";

export type SimulationPlannerMode =
  | "synthetic"
  | "hybrid_ai"
  | "real_app_planner"
  | "full_app_chain";

export type SimulationScenario =
  | "normal"
  | "realistic_user"
  | "missed_workouts"
  | "short_sessions"
  | "spontaneous_lower_before_planned_lower"
  | "high_fatigue"
  | "low_adherence"
  | "priority_upper_body";

export type SimulationExperienceLevel =
  | "beginner"
  | "intermediate"
  | "advanced";

export type SimulationSportFocus =
  | "none"
  | "running"
  | "cross_country_skiing"
  | "alpine_skiing"
  | "cycling"
  | "ball_sports"
  | "swimming"
  | "golf"
  | "surf_sports"
  | "general_athletic";

export type SimulationPriorityMuscle =
  | "chest"
  | "back"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "calves"
  | "core";

export type SimulationEnergyTrend =
  | "stable"
  | "improving"
  | "declining";

export type SimulationRecoveryProfile =
  | "poor"
  | "average"
  | "good";

export type SimulationAdherenceProfile =
  | "low"
  | "medium"
  | "high";

export type SimulationExercisePerformance = {
  exerciseId: string;
  exerciseName: string;
  variantGroup?: string;
  plannedSets: number;
  plannedReps?: number;
  plannedDurationSec?: number;
  plannedWeightKg?: number;
  completedSets: number;
  actualAvgReps?: number;
  actualAvgDurationSec?: number;
  actualAvgWeightKg?: number;
  extraRepsEstimate?: number;
  effortScore: number;
  exerciseRating: number;
  completed: boolean;
};

export type SimulationWorkoutResult = {
  workoutId: string;
  workoutName: string;
  dayIndex: number;
  date: string;
  goal: SimulationGoal;
  plannedDurationMin: number;
  actualDurationMin: number;
  completed: boolean;
  skipped: boolean;
  skipReason?: "fatigue" | "life" | "motivation" | "random";
  sessionDifficultyScore: number;
  sessionSatisfactionScore: number;
  estimatedLoadScore: number;
  exerciseResults: SimulationExercisePerformance[];
};

export type SimulationUserProfile = {
  id: string;
  name: string;
  age: number;
  sex: "male" | "female" | "other";
  heightCm: number;
  weightKg: number;
  goal: SimulationGoal;
  experienceLevel: SimulationExperienceLevel;
  sportFocus?: SimulationSportFocus;
  primaryPriorityMuscle?: SimulationPriorityMuscle | null;
  secondaryPriorityMuscle?: SimulationPriorityMuscle | null;
  tertiaryPriorityMuscle?: SimulationPriorityMuscle | null;
  preferredWorkoutDaysPerWeek: number;
  preferredSessionDurationMin: number;
  weeklyPlanMinDurationMin?: number;
  weeklyPlanMaxDurationMin?: number;
  weeklyPlanFlexibility?: SimulationWeeklyPlanFlexibility;
  adherenceProfile: SimulationAdherenceProfile;
  recoveryProfile: SimulationRecoveryProfile;
  energyTrend: SimulationEnergyTrend;
  motivationBase: number;
  recoveryCapacity: number;
  lifeStressBase: number;
  strengthBase: number;
  hypertrophyResponsiveness: number;
  skillLearningRate: number;
  availableGymId?: number | null;
  availableEquipmentIds: string[];
  favoriteExerciseIds?: string[];
  dislikedExerciseIds?: string[];
};

export type SimulationEffectiveUserProfile = {
  sourceProfile: string;
  presetProfileId: string | null;
  effectiveGoal: SimulationGoal;
  effectiveExperienceLevel: SimulationExperienceLevel;
  effectiveSportFocus: SimulationSportFocus;
  effectivePriorityMuscles: SimulationPriorityMuscle[];
  effectiveAge: number | null;
  effectiveHeightCm: number | null;
  effectiveWeightKg: number | null;
  effectivePlannedTrainingDays: number[];
  effectivePreferredDurationMinutes: number | null;
  effectiveEquipment: string[];
  sourceByField: {
    goal: "preset" | "override" | "fallback";
    experienceLevel: "preset" | "override" | "fallback";
    sportFocus: "preset" | "override" | "fallback";
    priorityMuscles: "preset" | "override" | "fallback";
    age: "preset" | "override" | "fallback";
    heightCm: "preset" | "override" | "fallback";
    weightKg: "preset" | "override" | "fallback";
    plannedTrainingDays: "preset" | "override" | "fallback";
    preferredDurationMinutes: "preset" | "override" | "fallback";
    equipment: "preset" | "override" | "fallback";
  };
  warnings: string[];
};

export type SimulationUserState = {
  dayIndex: number;
  readiness: number;
  fatigue: number;
  motivation: number;
  soreness: number;
  lifeStress: number;
  strengthLevel: number;
  workCapacity: number;
  movementSkill: number;
  bodyWeightKg: number;
  completedWorkouts: number;
  skippedWorkouts: number;
  consecutiveTrainingDays: number;
  consecutiveMissedPlannedDays: number;
  lastWorkoutDate?: string;
  lastDeloadDayIndex?: number | null;
};

export type SimulationDayPlan = {
  dayIndex: number;
  date: string;
  weekdayIndex: number;
  weekday: string;
  isPlannedTrainingDay: boolean;
  targetDurationMin: number;
};

export type SimulationDailySnapshot = {
  dayIndex: number;
  date: string;
  dayEvent: "planned_training" | "missed_planned" | "spontaneous_training" | "rest";
  stateBefore: SimulationUserState;
  plannedTraining: SimulationDayPlan;
  generatedWorkoutSummary?: {
    workoutId: string;
    workoutName: string;
    blockCount: number;
    exerciseCount: number;
    estimatedVolumeScore: number;
    plannerSource?:
      | "synthetic"
      | "ai"
      | "ai_fallback"
      | "real_app_planner"
      | "full_app_chain";
    plannerNote?: string;
    passGenerationMode?: "mock_synthetic" | "real_ai" | "fallback_mock";
  };
  workoutResult?: SimulationWorkoutResult;
  stateAfter: SimulationUserState;
};

export type SimulationPlannerDebugExercise = {
  exerciseId: string;
  exerciseName: string;
  variantGroup?: string;
  aggregationKey: string;
};

export type SimulationPlannerDebugEntry = {
  dayIndex: number;
  date: string;
  weekday: string;
  isPlannedTrainingDay: boolean;
  plannerMode: SimulationPlannerMode;
  source:
    | "synthetic"
    | "ai"
    | "ai_fallback"
    | "real_app_planner"
    | "full_app_chain";
  beforeNormalization: SimulationPlannerDebugExercise[];
  afterNormalization: SimulationPlannerDebugExercise[];
  repeatedAggregationKeys: string[];
  note?: string;
  realAppPlanner?: {
    weekStartDate: string;
    suggestedNextFocus: string;
    suggestedNextWorkoutFocus: string;
    suggestedNextDurationMinutes: number;
    coachText: string;
    goalReached: boolean;
    priorityMuscles: string[];
    recoveryLimitedMuscles: string[];
    muscleSetDeficits: Record<string, number>;
    passGenerationMode: "mock_synthetic" | "real_ai" | "fallback_mock";
    aiRequestUsed?: boolean;
    promptContextSummary?: string;
    generationModeRequested?: WorkoutGenerationMode;
    generationEngineUsed?: "legacy_ai_chain" | "slot_based_v1" | null;
    generationFallbackUsed?: boolean;
    generationFallbackReason?: string | null;
    slotModel?: Record<string, unknown> | null;
    generationComparison?: {
      selectedEngine: "legacy_ai_chain" | "slot_based_v1" | "safe_slot_template";
      legacyPassed: boolean | null;
      slotPassed: boolean | null;
      legacyExerciseCount: number | null;
      slotExerciseCount: number | null;
      slotSafetyReasons: string[];
      selectedBecause: string;
    };
  };
  trainingHistoryContextSummary?: {
    recentWorkoutsCount: number;
    progressionMemoryExerciseCount: number;
    mediumTermWindowDays: number;
    dataQuality: "rich" | "mixed" | "limited";
    typicalWorkoutDurationMinutes: number | null;
  };
  validationDiagnostics?: {
    focusIntegrityScore: number;
    strengthSpecificityScore: number;
    qualityPreservationScore: number;
    goalSpecificityLoss: number;
    sportSpecificityLoss: number;
    catalogResolutionLoss: number;
    mustKeepViolations: string[];
    offFocusWarnings: string[];
    offFocusViolations: string[];
    forbiddenExerciseViolations: string[];
    lostMovementPatterns: string[];
    lostPrimaryRoles: string[];
    lostPriorityMuscles: string[];
    lostUsefulRoles: string[];
    lostPrimaryOrHighValueExercises: string[];
    lostSportRelevantExercises: string[];
    sportRelevantExercisesKept: string[];
    sportRelevantExercisesLost: string[];
    deferredPriorityMuscles: string[];
    removedPrimaryExercises: string[];
    addedOffFocusExercises: string[];
    removedBecauseOffFocus: string[];
    removedBecauseRecovery: string[];
    removedBecauseDuplicateRole: string[];
    fallbackExercisesAdded: string[];
    normalizationWarnings: string[];
    fallbackBiasWarning: string | null;
    durationTrimReason: string | null;
    roleTrimReason: string | null;
    compatibleExercisesRejectedWithReason: Array<{
      exerciseName: string;
      stage: "raw_to_catalog" | "catalog_to_focus_repair" | "focus_repair_to_final";
      reason: string;
    }>;
    priorityMuscleResolutionStatus: Array<{
      muscle: string;
      status:
        | "addressed_primary"
        | "addressed_secondary"
        | "partially_addressed"
        | "deferred_due_to_focus"
        | "deferred_due_to_recovery"
        | "dropped_by_catalog_resolution"
        | "dropped_by_focus_repair"
        | "dropped_by_duration_trim"
        | "not_relevant_for_today";
      reason: string;
    }>;
    qualityPenaltyBreakdown: Array<{
      code: string;
      amount: number;
      reason: string;
    }>;
    droppedHighValueExercises: string[];
    roleMismatchReplacements: string[];
    genericFallbacksAdded: string[];
    finalQualityWarnings: string[];
    safetyGateTriggered: boolean;
    safetyGateReasons: string[];
    safetyGateRecoveryMode:
      | "none"
      | "restore_raw_success"
      | "restore_raw_failed_safe_template_used"
      | "safe_template_success"
      | "failed"
      | null;
    recoveryLimitedSeverityByMuscle: Array<{
      muscle: string;
      severity: "hard_blocked" | "avoid_heavy_loading" | "allow_light_recovery";
    }>;
    blockedByRecoveryHard: string[];
    allowedAsLightRecovery: string[];
    rejectedDueToRecoveryReason: Array<{
      exerciseName: string;
      reason: string;
    }>;
    primaryLiftCount: number;
    loadedProgressionExerciseCount: number;
    bodyweightOnlyCount: number;
    mainLiftMissingWarnings: string[];
    repeatedPatternCount: number;
    repeatedVariantGroups: string[];
    plannedProgressionRepeats: string[];
    fallbackRepeats: string[];
    normalizationLossScore: number;
    aiRawExercises: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: string;
      qualityRoles: string[];
    }>;
    afterCatalogMatch: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: string;
      qualityRoles: string[];
    }>;
    afterFocusRepair: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: string;
      qualityRoles: string[];
    }>;
    finalExercises: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: string;
      qualityRoles: string[];
    }>;
    rawToCatalogDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
    catalogToFocusRepairDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
    focusRepairToFinalDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
    beforeAfterDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
    validationContext?: {
      plannedFocus: string | null;
      goal: string;
      experienceLevel: string | null;
      durationMinutes: number;
      priorityMuscles: string[];
      focusCompatiblePriorities: string[];
      deferredPriorities: string[];
      recoveryLimitedMuscles: string[];
      availableEquipment: string[];
      sportFocus?: string | null;
    };
    targetMainExerciseCount?: number;
    actualMainExerciseCountFromAi?: number;
    finalMainExerciseCount?: number;
    optionalBonusExerciseCount?: number;
    bonusExercisesUsed?: number;
    bonusExercisesRejectedReason?: string[];
    trimmedBecauseTooManyExercises?: boolean;
    trimmedExercises?: Array<{
      name: string;
      role: string | null;
      priorityRank: number;
      canDropIfShort: boolean;
      reason: string | null;
      trimReason: string;
    }>;
    keptExerciseRoles?: string[];
    lostExerciseRoles?: string[];
    fallbackAddedDespiteEnoughAiExercises?: boolean;
    durationTrimWarnings?: string[];
  };
};

export type SimulationConfig = {
  totalDays: number;
  startDate: string;
  randomSeed: number;
  plannerMode?: SimulationPlannerMode;
  generationMode?: SimulationWorkoutGenerationMode;
  scenario?: SimulationScenario;
  enablePlannerDebug?: boolean;
  enableMissedWorkouts: boolean;
  enableFatigueModel: boolean;
  enableWeightProgressionEstimate: boolean;
  enableDeloadDetection: boolean;
  minRestDayProbability: number;
  plannedWorkoutDayIndices?: number[];
  maxAiGeneratedWorkouts?: number;
  maxFatigue: number;
  maxSoreness: number;
  deloadFatigueThreshold: number;
  lowReadinessThreshold: number;
};

export type SimulationSeriesPoint = {
  dayIndex: number;
  date: string;
  readiness: number;
  fatigue: number;
  motivation: number;
  soreness: number;
  strengthLevel: number;
  workCapacity: number;
  bodyWeightKg: number;
  sessionLoad?: number;
  sessionDifficulty?: number;
  sessionSatisfaction?: number;
};

export type SimulationExerciseAggregate = {
  exerciseId: string;
  exerciseName: string;
  timesSelected: number;
  timesCompleted: number;
  avgEffortScore: number;
  avgExerciseRating: number;
  avgExtraRepsEstimate: number;
  avgPlannedWeightKg?: number;
  avgActualWeightKg?: number;
};

export type SimulationEvaluation = {
  adherenceRate: number;
  completionRate: number;
  avgSessionDifficulty: number;
  avgSessionSatisfaction: number;
  avgReadiness: number;
  avgFatigue: number;
  strengthTrend: number;
  workCapacityTrend: number;
  exerciseVariationScore: number;
  goalAlignmentScore: number;
  overloadRiskScore: number;
  stagnationRiskScore: number;
  progressionQualityScore: number;
  flags: string[];
  summary: string;
};

export type SimulationReport = {
  config: SimulationConfig;
  profile: SimulationUserProfile;
  effectiveUserProfile?: SimulationEffectiveUserProfile;
  plannedWorkoutDayIndices: number[];
  plannedWorkoutDayLabels: string[];
  aiGeneratedWorkoutCount?: number;
  aiFallbackWorkoutCount?: number;
  notes?: string[];
  dailySnapshots: SimulationDailySnapshot[];
  timeSeries: SimulationSeriesPoint[];
  exerciseAggregates: SimulationExerciseAggregate[];
  evaluation: SimulationEvaluation;
  plannerDebug?: SimulationPlannerDebugEntry[];
};
