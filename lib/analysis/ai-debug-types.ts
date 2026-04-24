import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { Workout, WorkoutAiDebug, WorkoutFocus } from "@/types/workout";

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

export type AiDebugUserContext = {
  trainingGoal: string | null;
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  experienceLevel: string | null;
  priorityMuscles: MuscleBudgetGroup[];
  selectedGym: string | null;
  availableEquipment: string[];
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
};

export type AiDebugGeneratedWorkoutExercise = {
  exerciseId: string;
  exerciseName: string;
  movementPattern: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
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
  lastUsedWeight: number | null;
  lastReps: number | null;
  lastDuration: number | null;
  recentHistorySummary: string;
  suggestedWeight: number | string | null;
  suggestedReps: number | null;
  suggestedDuration: number | null;
  progressionRuleUsed: string;
  progressionReason: string | null;
  confidenceFlag: "high" | "medium" | "low" | "very_low";
  progressionSeemsAggressive: boolean;
  progressionSeemsConservative: boolean;
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
};

export type AiDebugExerciseSelectionDiagnostic = {
  exerciseName: string;
  movementPattern: string | null;
  requiredEquipment: string[];
  availableInSelectedGym: boolean;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  whyThisExerciseFitsGoal: string | null;
  whyThisExerciseFitsEquipment: string | null;
  whyThisExerciseFitsCurrentWeeklyNeed: string | null;
  progressionBasis: string | null;
  alternativeCandidatesRejected: string[] | null;
  rejectionReasons: string[] | null;
};

export type AiDebugExport = {
  meta: AiDebugExportMeta;
  userContext: AiDebugUserContext;
  muscleBudgetSnapshot: AiDebugMuscleBudgetSnapshotEntry[];
  recentCompletedWorkouts: AiDebugCompletedWorkout[];
  recentGeneratedWorkouts: AiDebugGeneratedWorkout[];
  progressionDiagnostics: AiDebugProgressionDiagnostic[];
  plannerDiagnostics: AiDebugPlannerDiagnostic | null;
  exerciseSelectionDiagnostics: AiDebugExerciseSelectionDiagnostic[];
  evaluationQuestions: string[];
  warnings: string[];
};
