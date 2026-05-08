import type { MovementPattern } from "@/lib/exercise-catalog";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { SportFocus } from "@/types/training-profile";
import type { WorkoutFocus } from "@/types/workout";

export type WorkoutGenerationMode =
  | "legacy_ai_chain"
  | "slot_based_v1"
  | "hybrid";

export type SimulationWorkoutGenerationMode =
  | WorkoutGenerationMode
  | "compare_legacy_vs_slot";

export type RecoverySeverity =
  | "none"
  | "allow_light_recovery"
  | "avoid_heavy_loading"
  | "hard_blocked";

export type WorkoutSlotRole =
  | "main_push"
  | "main_pull"
  | "main_squat"
  | "main_hinge"
  | "unilateral_lower"
  | "direct_biceps"
  | "direct_triceps"
  | "shoulder_accessory"
  | "rear_delt_scapula"
  | "calves"
  | "core"
  | "carry"
  | "conditioning"
  | "mobility"
  | "rehab_control"
  | "recovery_light"
  | "optional_accessory";

export type SlotIntensityHint = "light" | "moderate" | "hard";

export type SlotProgressionHint =
  | "load"
  | "reps"
  | "volume"
  | "technique"
  | "density"
  | "maintenance"
  | "rehab";

export type WorkoutSlot = {
  id: string;
  role: WorkoutSlotRole;
  required: boolean;
  priority: number;
  targetMuscles?: MuscleBudgetGroup[];
  allowedMovementPatterns?: MovementPattern[];
  blockedMovementPatterns?: MovementPattern[];
  preferredEquipment?: string[];
  minSets?: number;
  maxSets?: number;
  intensityHint?: SlotIntensityHint;
  progressionHint?: SlotProgressionHint;
  reason: string;
};

export type TrainingGoalConfig = {
  id: "strength" | "hypertrophy" | "body_composition" | string;
  label: string;
  description: string;
  weeklyTargets: {
    minSessions: number;
    targetSessions: number;
    minMinutes: number;
    targetMinutes: number;
  };
  focusDistribution: Partial<
    Record<WorkoutFocus | "recovery_strength" | "conditioning", number>
  >;
  slotWeights: Partial<Record<WorkoutSlotRole, number>>;
  defaultRepRange?: {
    min: number;
    max: number;
  };
  defaultSetRange?: {
    min: number;
    max: number;
  };
  progressionStyle:
    | "volume"
    | "load"
    | "density"
    | "technique"
    | "maintenance"
    | "rehab";
  aiCoachingStyleHints?: string[];
};

export type TrainingConstraint = {
  id: string;
  type:
    | "injury"
    | "pain"
    | "medical"
    | "preference"
    | "equipment"
    | "time"
    | "fatigue";
  affectedAreas?: string[];
  avoidTags?: string[];
  preferTags?: string[];
  blockedExerciseIds?: string[];
  preferredExerciseIds?: string[];
  severity: "mild" | "moderate" | "high";
  painRule?: string;
  userFacingNote?: string;
};

export type RecoverySummary = {
  recoverySeverityByMuscle: Array<{
    muscle: MuscleBudgetGroup;
    severity: RecoverySeverity;
    reason: string;
  }>;
};

export type WorkoutCoachContext = {
  goal: "strength" | "hypertrophy" | "health" | "body_composition";
  experienceLevel: string | null;
  selectedFocus: WorkoutFocus | "recovery_strength";
  selectedFocusReason: string;
  durationMinutes: number;
  durationReason: string;
  selectedEquipment: string[];
  sportFocus: SportFocus | null;
  typicalCompletedDuration7d: number | null;
  typicalCompletedDuration14d: number | null;
  typicalCompletedDuration30d: number | null;
  completedSessions7d: number | null;
  plannedSessions7d: number | null;
  completedMinutes7d: number | null;
  plannedMinutes7d: number | null;
  trainingDoseAdherence: number | null;
  trainingGapSummary: string;
  globalUndertrainedMuscles: MuscleBudgetGroup[];
  focusCompatiblePriorities: MuscleBudgetGroup[];
  deferredPriorities: MuscleBudgetGroup[];
  recoverySummary: RecoverySummary;
  injuryConstraints: TrainingConstraint[];
  coachDecisionReason: string;
};

export type ExerciseCandidateScore = {
  score: number;
  matchedSlotRole: boolean;
  scoreBreakdown: Array<{
    code: string;
    amount: number;
    reason: string;
  }>;
  rejectedReasons: string[];
};

export type RankedExerciseCandidate = {
  exerciseId: string;
  exerciseName: string;
  slotRole: WorkoutSlotRole;
  score: number;
  scoreBreakdown: Array<{
    code: string;
    amount: number;
    reason: string;
  }>;
  rejectedReasons: string[];
};

export type SlotExerciseSelection = {
  slotId: string;
  role: WorkoutSlotRole;
  exerciseId: string;
  exerciseName: string;
  reason: string;
  selectionSource: "local_rank" | "ai_rank" | "fallback";
  candidates: RankedExerciseCandidate[];
};

export type SlotWorkoutDebug = {
  selectedGoalConfig: string;
  coachDecision: {
    reason: string;
    selectedFocus: WorkoutFocus | "recovery_strength";
    selectedFocusReason: string;
    durationReason: string;
    trainingGapSummary: string;
    focusCompatiblePriorities: MuscleBudgetGroup[];
    deferredPriorities: MuscleBudgetGroup[];
    recoverySummary: RecoverySummary;
  };
  slotTemplateId: string;
  plannedSlots: WorkoutSlot[];
  slotReasons: Array<{
    slotId: string;
    role: WorkoutSlotRole;
    reason: string;
  }>;
  candidatesPerSlot: Record<string, RankedExerciseCandidate[]>;
  selectedExercisePerSlot: SlotExerciseSelection[];
  rejectedCandidates: Record<string, RankedExerciseCandidate[]>;
  slotValidationPassed: boolean;
  missingRequiredSlots: string[];
  invalidSlotExercises: string[];
  safetyGateReasons: string[];
  finalSlotCoverage: string[];
  finalWorkoutQualityScore: number;
};

export function normalizeWorkoutGenerationMode(
  value: unknown,
  fallback: WorkoutGenerationMode = "legacy_ai_chain",
): WorkoutGenerationMode {
  return value === "legacy_ai_chain" ||
    value === "slot_based_v1" ||
    value === "hybrid"
    ? value
    : fallback;
}

export function normalizeSimulationWorkoutGenerationMode(
  value: unknown,
  fallback: SimulationWorkoutGenerationMode = "legacy_ai_chain",
): SimulationWorkoutGenerationMode {
  return value === "legacy_ai_chain" ||
    value === "slot_based_v1" ||
    value === "hybrid" ||
    value === "compare_legacy_vs_slot"
    ? value
    : fallback;
}
