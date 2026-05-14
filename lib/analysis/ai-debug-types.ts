import type {
  AdaptiveFocusScore,
  PlannedTrainingMode,
  WeeklyPlanDay,
  WeeklyPlanStep,
} from "@/lib/weekly-workout-structure";
import type {
  CoachDecision,
} from "@/lib/planning/coach-decision";
import type {
  GoalTrajectory,
} from "@/lib/planning/goal-trajectory";
import type {
  MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import type {
  SportFocus,
} from "@/types/training-profile";
import type {
  Workout,
  WorkoutAiDebug,
  WorkoutFocus,
} from "@/types/workout";
import type {
  TrainingGap,
} from "@/lib/planning/training-gap";
import type {
  GoalFeedback,
} from "@/lib/planning/goal-feedback";

export type AiDebugExportType = "quick" | "full";

export type AiDebugExportOptions = {
  exportType: AiDebugExportType;
  includeLast7Days: boolean;
  includeLast30Days: boolean;
  includeGeneratedWorkouts: boolean;
  includeCompletedWorkouts: boolean;
  includeProgressionDiagnostics: boolean;
  includePlannerDiagnostics: boolean;
  anonymize: boolean;
};

export type StoredAiGeneratedWorkoutSnapshot = {
  createdAt: string;
  requestedDurationMinutes: number | null;
  goal: string | null;
  selectedGym: string | null;
  equipmentSeed: string[];
  workoutFocusTag: WorkoutFocus | null;
  request: Record<string, unknown> | null;
  weeklyBudget:
    | Array<{
        group: string;
        label?: string | null;
        priority?: string | null;
        targetSets?: number | null;
        completedSets?: number | null;
        effectiveSets?: number | null;
        remainingSets?: number | null;
        recent4WeekAvgSets?: number | null;
      }>
    | null;
  weeklyPlan:
    | Array<{
        date?: string | null;
        dayLabel?: string | null;
        focus?: string | null;
        type?: string | null;
      }>
    | null;
  normalizedWorkout: Workout | null;
  aiDebug: WorkoutAiDebug | null;
};

export type AiDebugExportMeta = {
  createdAt: string;
  appVersion: string | null;
  commitHash: string | null;
  exportType: AiDebugExportType;
  schemaVersion: string;
  source: "analysis-debug-export";
};

export type AiDebugPurpose = {
  description: string;
  primaryQuestions: string[];
  intendedAiRole: string;
};

export type AiDebugUserContext = {
  trainingGoal: string | null;
  sportFocus: SportFocus | null;
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  experienceLevel: string | null;
  priorityMuscles: MuscleBudgetGroup[];
  selectedGym: string | null;
  availableEquipment: string[];
};

export type AiDebugDataQuality = {
  overallConfidence: "high" | "medium" | "low";
  reasons: string[];
  completedWorkoutCount7d: number;
  completedWorkoutCount28d: number;
  validWorkoutCount7d: number;
  validWorkoutCount28d: number;
  veryShortWorkoutCount28d: number;
  emptyWorkoutCount28d: number;
  excludedWorkoutCount28d: number;
  excludedWorkoutReasons: string[];
  missingEffortCount28d: number;
  missingWeightCount28d: number;
  notes: string[];
};

export type AiDebugWorkoutValidity = {
  classification:
    | "valid_full"
    | "valid_shortened"
    | "partial"
    | "too_short"
    | "empty_completed"
    | "aborted_or_invalid";
  reason: string;
  plannedDurationMinutes: number | null;
  actualDurationMinutes: number;
  durationCompletionRatio: number | null;
  plannedSets: number;
  completedSets: number;
  setCompletionRatio: number | null;
  countsForMuscleBudget: boolean;
  countsForWeeklyRhythm: boolean;
  countsForAdherence: boolean;
  confidence: "high" | "medium" | "low";
};

export type AiDebugMuscleBudgetSnapshotEntry = {
  muscle: MuscleBudgetGroup;
  label: string;
  targetSets: number;
  completedSets: number;
  remainingSets: number;
  status: string;
  trend: string;
  rolling4WeekAverage: number;
  priorityLevel: string;
  goalDefaultPriority: string;
  adjustedPriority: string;
  effectivePriorityReason: string;
};

export type AiDebugCompletedWorkoutExercise = {
  exerciseId: string;
  exerciseName: string;
  movementPattern: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  prescribedSets: number;
  prescribedReps: number | null;
  prescribedDuration: number | null;
  completedSets: number;
  completedReps: number | null;
  completedDuration: number | null;
  usedWeight: number | null;
  effort: string | number | null;
  feedback: string | number | null;
};

export type AiDebugCompletedWorkout = {
  date: string;
  durationMinutes: number;
  workoutName: string;
  goal: string | null;
  source: "ai" | "manual" | "not_available";
  blockCount: number | null;
  exercises: AiDebugCompletedWorkoutExercise[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  estimatedStimulusPerMuscle: Record<string, number>;
  workoutValidity: AiDebugWorkoutValidity;
};

export type AiDebugGeneratedWorkoutExercise = {
  exerciseId: string;
  exerciseName: string;
  movementPattern: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  sportRelevanceHint: number;
  suggestedWeight: number | string | null;
  suggestedWeightLabel: string | null;
  progressionNote: string | null;
};

export type AiDebugGeneratedWorkout = {
  createdAt: string;
  requestedDurationMinutes: number | null;
  goal: string | null;
  selectedGym: string | null;
  equipmentSeed: string[];
  rawPreviewInput: Record<string, unknown> | null;
  normalizedWorkout: Workout | null;
  workoutFocusTag: WorkoutFocus | null;
  chosenExercises: AiDebugGeneratedWorkoutExercise[];
  whyChosen: string | null;
  source:
    | "generated_workout"
    | "preview_draft"
    | "completed_ai_workout"
    | "fallback_from_history";
  sourceConfidence: "high" | "medium" | "low";
  suggestedProgression: Array<{
    exerciseId: string;
    exerciseName: string;
    suggestedWeight: number | string | null;
    progressionNote: string | null;
  }>;
};

export type AiDebugProgressionDiagnostic = {
  exerciseId: string;
  exerciseName: string;
  lastPerformedAt: string | null;
  recentHistorySummary: string;
  lastUsedWeight: number | null;
  lastReps: number | null;
  lastDuration: number | null;
  suggestedWeight: number | string | null;
  suggestedReps: number | null;
  suggestedDuration: number | null;
  progressionRuleUsed: string;
  progressionReason: string | null;
  confidenceFlag: "high" | "medium" | "low" | "very_low";
  progressionSeemsAggressive: boolean;
  progressionSeemsConservative: boolean;
  recommendedAiInterpretation: string;
  missingDataWarnings: string[];
  bodyweightProgressionSuggestion: string | null;
  budgetAwareProgressionRecommendation:
    | "progress"
    | "maintain"
    | "deload"
    | "avoid_for_now";
};

export type AiDebugPlannerDiagnostic = {
  weeklyFocusSelected: WorkoutFocus | null;
  focusReason: string | null;
  goalDefaults: Record<string, string>;
  priorityOverrides: MuscleBudgetGroup[];
  remainingBudgetRanking: Array<{
    muscle: string;
    remainingSets: number;
    priority: string;
  }>;
  muscleGroupsConsideredMostUnderserved: string[];
  muscleGroupsConsideredOverloaded: string[];
  structurePatternUsed: string | null;
  durationConstraintImpact: string | null;
  equipmentConstraintImpact: string | null;
  recoveryConstraintImpact: string | null;
  focusScores?: AdaptiveFocusScore[];
  whyNotLowerBody?: string;
  whyNotFullBody?: string;
  whyNotPriorityOnly?: string;
  selectedFocusTradeoffs: string[];
  selectedPlanMode?: PlannedTrainingMode;
  targetMuscles?: MuscleBudgetGroup[];
  avoidMuscles?: MuscleBudgetGroup[];
  limitedMuscles?: MuscleBudgetGroup[];
  focusIntent?: string | null;
  recoveryOverrideApplied?: boolean;
  recoveryOverrideReason?: string | null;
  stimulusCreditModelVersion?: string;
  capsPerMuscleGroupApplied?: boolean;
};

export type AiDebugExerciseSelectionDiagnostic = {
  exerciseId: string;
  exerciseName: string;
  movementPattern: string | null;
  requiredEquipment: string[];
  availableInSelectedGym: boolean;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  directMainMuscles: MuscleBudgetGroup[];
  indirectMainMuscles: MuscleBudgetGroup[];
  hitsPriorityMusclesDirectly: MuscleBudgetGroup[];
  hitsPriorityMusclesIndirectly: MuscleBudgetGroup[];
  hitsUnderservedMuscles: MuscleBudgetGroup[];
  hitsOverloadedMuscles: MuscleBudgetGroup[];
  whyThisExerciseFitsGoal: string | null;
  whyThisExerciseFitsEquipment: string | null;
  whyThisExerciseFitsCurrentWeeklyNeed: string | null;
  whyThisExerciseFitsLongTermPlan: string | null;
  progressionBasis: string | null;
  alternativeCandidatesRejected: string[] | null;
  rejectionReasons: string[] | null;
};

export type AiDebugCurrentPlanSnapshot = {
  trainingGoal: string | null;
  experienceLevel: string | null;
  splitStyle: string | null;
  selectedWeeklyFocus: WorkoutFocus | null;
  selectedPlanMode: PlannedTrainingMode;
  targetMuscles: MuscleBudgetGroup[];
  avoidMuscles: MuscleBudgetGroup[];
  limitedMuscles: MuscleBudgetGroup[];
  focusIntent: string;
  recoveryOverrideApplied: boolean;
  recoveryOverrideReason: string | null;
  patternPreferredFocus: WorkoutFocus | null;
  reasonForSelectedFocus: string | null;
  coachDecision: CoachDecision;
  goalFeedback: GoalFeedback;
  goalTrajectory: GoalTrajectory;
  trainingGap: TrainingGap;
  optimalPlanText: string;
  completedLast7Days: number;
  passCount: number;
  confidenceScore: string;
  upcomingDays: WeeklyPlanDay[];
  upcomingSteps: WeeklyPlanStep[];
  planInterpretation: string;
};

export type AiDebugTrainingWindow = {
  windowType: "current_week" | "rolling_7_days" | "rolling_28_days" | "current_plan_window" | "custom";
  windowStart: string;
  windowEnd: string;
};

export type AiDebugAdherencePeriod = {
  windowType: AiDebugTrainingWindow["windowType"];
  windowStart: string;
  windowEnd: string;
  plannedSessions: number | null;
  completedSessions: number;
  validCompletedSessions: number;
  completedMinutes: number;
  targetMinutes: number | null;
  completionRatio: number | null;
  interpretation: string;
};

export type AiDebugAdherenceDiagnostics = {
  last7Days: AiDebugAdherencePeriod;
  last28Days: AiDebugAdherencePeriod;
  missedOrLowQualityTrainingSignal: "none" | "mild" | "moderate" | "clear";
  notes: string[];
  consistencyCheck: {
    hasConflictingSignals: boolean;
    notes: string[];
  };
};

export type AiDebugLongTermMuscleTrend = {
  muscle: MuscleBudgetGroup;
  label: string;
  priorityLevel: string;
  userPriorityRank: number | null;
  targetSetsCurrentWeek: number;
  completedSetsCurrentWeek: number;
  remainingSetsCurrentWeek: number;
  completionRatioCurrentWeek: number;
  rolling4WeekAverage: number;
  trend: string;
  longTermInterpretation: string;
  recommendationForNext7Days: string;
};

export type AiDebugLatestWorkoutEvaluationContext = {
  source:
    | "generated_workout"
    | "preview_draft"
    | "completed_ai_workout"
    | "fallback_from_history"
    | "missing";
  sourceConfidence: "high" | "medium" | "low";
  latestGeneratedWorkoutName: string | null;
  requestedDurationMinutes: number | null;
  plannedFocus: WorkoutFocus | null;
  selectedBecause: string | null;
  fitsLongTermPlan: "yes" | "partly" | "unclear" | "no";
  musclesDirectlyTargeted: MuscleBudgetGroup[];
  musclesIndirectlyTargeted: MuscleBudgetGroup[];
  priorityMusclesHitDirectly: MuscleBudgetGroup[];
  priorityMusclesHitIndirectly: MuscleBudgetGroup[];
  priorityMusclesMissing: MuscleBudgetGroup[];
  underservedMusclesAddressed: MuscleBudgetGroup[];
  underservedMusclesNotAddressed: MuscleBudgetGroup[];
  overloadedMusclesHitDirectly: MuscleBudgetGroup[];
  overloadedMusclesHitIndirectly: MuscleBudgetGroup[];
  expectedRoleInPlan:
    | "main_workout"
    | "short_extra_session"
    | "recovery_or_light_session"
    | "catch_up_session"
    | "unclear";
  interpretation: string;
};

export type AiDebugEffortScaleLegend = {
  scaleType: "app_internal_effort";
  values: Array<{
    value: number;
    label: string;
    interpretation: string;
  }>;
  note: string;
};

export type AiDebugEquipmentContext = {
  selectedGymId: string | null;
  selectedGymLabel: string | null;
  selectedGymEquipment: string[];
  equipmentSeedForLatestGeneration: string[];
  historicallyUsedEquipment28d: string[];
  inferredAvailableEquipment: string[];
  equipmentForNextGeneration: string[];
  confidence: "high" | "medium" | "low";
  notes: string[];
};

export type AiDebugPlanRiskDiagnostics = {
  upcomingFocusRisks: Array<{
    date: string;
    focus: WorkoutFocus | null;
    riskLevel: "low" | "medium" | "high";
    reason: string;
    affectedMuscles: MuscleBudgetGroup[];
    recommendation: string;
  }>;
  notes: string[];
};

export type AiDebugAnalysisAvailability = {
  canEvaluateLatestGeneratedWorkout: boolean;
  canEvaluateFallbackWorkout: boolean;
  canEvaluateExerciseSelection: boolean;
  canEvaluateProgression: boolean;
  canEvaluateLongTermPlan: boolean;
  canEvaluateAdherence: boolean;
  limitations: string[];
};

export type AiDebugAiEvaluationInstructions = {
  description: string;
  analysisPriorities: string[];
  responseTemplate: string[];
};

export type AiDebugExport = {
  meta: AiDebugExportMeta;
  debugPurpose: AiDebugPurpose;
  userContext: AiDebugUserContext;
  effortScaleLegend: AiDebugEffortScaleLegend;
  equipmentContext: AiDebugEquipmentContext;
  dataQuality: AiDebugDataQuality;
  currentPlanSnapshot: AiDebugCurrentPlanSnapshot;
  adherenceDiagnostics: AiDebugAdherenceDiagnostics;
  analysisAvailability: AiDebugAnalysisAvailability;
  muscleBudgetSnapshot: AiDebugMuscleBudgetSnapshotEntry[];
  longTermMuscleTrends: AiDebugLongTermMuscleTrend[];
  recentCompletedWorkouts: AiDebugCompletedWorkout[];
  recentGeneratedWorkouts: AiDebugGeneratedWorkout[];
  latestWorkoutEvaluationContext: AiDebugLatestWorkoutEvaluationContext;
  planRiskDiagnostics: AiDebugPlanRiskDiagnostics;
  progressionDiagnostics: AiDebugProgressionDiagnostic[];
  plannerDiagnostics: AiDebugPlannerDiagnostic | null;
  exerciseSelectionDiagnostics: AiDebugExerciseSelectionDiagnostic[];
  aiEvaluationInstructions: AiDebugAiEvaluationInstructions;
  evaluationQuestions: string[];
  warnings: string[];
};
