export type SimulationGoal =
  | "strength"
  | "hypertrophy"
  | "body_composition"
  | "health";

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
  preferredWorkoutDaysPerWeek: number;
  preferredSessionDurationMin: number;
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
  effectiveAge: number | null;
  effectiveHeightCm: number | null;
  effectiveWeightKg: number | null;
  effectivePlannedTrainingDays: number[];
  effectivePreferredDurationMinutes: number | null;
  effectiveEquipment: string[];
  sourceByField: {
    goal: "preset" | "override" | "fallback";
    experienceLevel: "preset" | "override" | "fallback";
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
    mustKeepViolations: string[];
    offFocusWarnings: string[];
    offFocusViolations: string[];
    forbiddenExerciseViolations: string[];
    lostMovementPatterns: string[];
    lostPrimaryRoles: string[];
    lostPriorityMuscles: string[];
    deferredPriorityMuscles: string[];
    removedPrimaryExercises: string[];
    addedOffFocusExercises: string[];
    removedBecauseOffFocus: string[];
    removedBecauseRecovery: string[];
    removedBecauseDuplicateRole: string[];
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
    }>;
    afterCatalogMatch: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: string;
    }>;
    afterFocusRepair: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: string;
    }>;
    finalExercises: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: string;
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
    };
  };
};

export type SimulationConfig = {
  totalDays: number;
  startDate: string;
  randomSeed: number;
  plannerMode?: SimulationPlannerMode;
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
