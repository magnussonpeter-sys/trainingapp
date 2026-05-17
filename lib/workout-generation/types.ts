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

export type SlotContractMode = "full" | "degraded" | "emergency";

export type WorkoutSlot = {
  id: string;
  label: string;
  role: WorkoutSlotRole;
  allowedRoles: WorkoutSlotRole[];
  required: boolean;
  priority: number;
  targetMuscles?: MuscleBudgetGroup[];
  preferredMovementPatterns?: MovementPattern[];
  forbiddenMovementPatterns?: MovementPattern[];
  preferredEquipment?: string[];
  minGoalSpecificity?: number;
  allowRecoveryLight?: boolean;
  allowBodyweightFallback?: boolean;
  minSets?: number;
  maxSets?: number;
  intensityHint?: SlotIntensityHint;
  progressionHint?: SlotProgressionHint;
  reason: string;
};

export type WorkoutSlotContract = {
  templateId: string;
  goalConfigId: string;
  targetSlotCount: number;
  mode?: SlotContractMode;
  slots: WorkoutSlot[];
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
  displayDurationMinutes: number;
  planningDurationBucket: number;
  timeBudgetMinutes: number;
  durationReason: string;
  durationBucketReason: string;
  selectedEquipment: string[];
  sportFocus: SportFocus | null;
  typicalCompletedDuration7d: number | null;
  typicalCompletedDuration14d: number | null;
  typicalCompletedDuration30d: number | null;
  completedSessions7d: number | null;
  plannedSessions7d: number | null;
  completedMinutes7d: number | null;
  plannedMinutes7d: number | null;
  adherenceSessionsRatio: number | null;
  adherenceMinutesRatio: number | null;
  trainingDoseAdherence: number | null;
  trainingGapSummary: string;
  recentExerciseIds: string[];
  recentVariantGroups: string[];
  globalUndertrainedMuscles: MuscleBudgetGroup[];
  focusCompatiblePriorities: MuscleBudgetGroup[];
  deferredPriorities: MuscleBudgetGroup[];
  recoverySummary: RecoverySummary;
  injuryConstraints: TrainingConstraint[];
  hasSpontaneousWorkoutThisWeek: boolean;
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
  source: "catalog" | "history" | "ai";
  slotRole: WorkoutSlotRole;
  matchedRole: WorkoutSlotRole;
  movementPattern: MovementPattern;
  variantGroup: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  requiredEquipment: string[];
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
  slotLabel: string;
  role: WorkoutSlotRole;
  contractRoles: WorkoutSlotRole[];
  exerciseId: string;
  exerciseName: string;
  movementPattern: MovementPattern;
  variantGroup: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  requiredEquipment: string[];
  score: number;
  scoreBreakdown: RankedExerciseCandidate["scoreBreakdown"];
  reason: string;
  selectionSource: "local_rank" | "ai_rank" | "fallback";
  candidates: RankedExerciseCandidate[];
};

export type SlotWorkoutDebug = {
  feasible: boolean;
  infeasibleReasons: string[];
  missingRoles: WorkoutSlotRole[];
  availableRoles: WorkoutSlotRole[];
  equipmentLimitations: string[];
  displayDurationMinutes: number;
  planningDurationBucket: number;
  timeBudgetMinutes: number;
  durationBucketReason: string;
  selectedFallbackStrategy:
    | "full_contract"
    | "degraded_contract"
    | "emergency_contract"
    | "friendly_error";
  contractBeforeFeasibility: WorkoutSlot[];
  contractAfterFeasibility: WorkoutSlot[];
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
  contractSlots: WorkoutSlot[];
  requiredSlots: string[];
  protectedSlots: string[];
  recoveredProtectedSlots: string[];
  slotReasons: Array<{
    slotId: string;
    role: WorkoutSlotRole;
    reason: string;
  }>;
  candidatesPerSlot: Record<string, RankedExerciseCandidate[]>;
  selectedExercisePerSlot: SlotExerciseSelection[];
  selectedScorePerSlot: Record<string, number>;
  selectedScoreBreakdown: Record<string, RankedExerciseCandidate["scoreBreakdown"]>;
  rejectedCandidates: Record<string, RankedExerciseCandidate[]>;
  rejectedCandidatesTopReasons: Record<string, string[]>;
  slotCandidateCounts: Record<string, number>;
  rejectedCandidatesBySlot: Record<string, string[]>;
  contractFailureStage:
    | "candidate_collection"
    | "slot_scoring"
    | "ai_slot_selection"
    | "validation_after_normalization"
    | "restore_first"
    | "role_equivalent_repair"
    | "degraded_contract"
    | "catalog_safe_template"
    | "final_validation"
    | "simulation_fallback"
    | null;
  failedSlots: string[];
  optionalSlots: string[];
  failedRoleFamilies: string[];
  candidatesPerFailedSlot: Record<string, RankedExerciseCandidate[]>;
  rejectedCandidatesPerFailedSlot: Record<string, RankedExerciseCandidate[]>;
  rejectedBecauseEquipment: string[];
  rejectedBecauseRecovery: string[];
  rejectedBecauseRoleMismatch: string[];
  rejectedBecauseRisk: string[];
  slotValidationPassed: boolean;
  missingRequiredSlots: string[];
  invalidSlotExercises: string[];
  contractViolations: string[];
  repairedSlots: string[];
  repairLog: Array<{
    slotId: string;
    repairReason: string;
    repairFromExercise: string | null;
    repairToExercise: string | null;
    originalRole: WorkoutSlotRole | null;
    replacementRole: WorkoutSlotRole | null;
    roleEquivalent: boolean;
    restoreAttempted: boolean;
    restoreSucceeded: boolean;
    restoreRejectedReason: string | null;
  }>;
  slotFailureReasons: string[];
  safeTemplateUsed: boolean;
  safeTemplateReason: string | null;
  safeTemplateAttempted: boolean;
  safeTemplateExercises: string[];
  safeTemplateRejectedReason: string | null;
  degradedContractAttempted: boolean;
  degradedContractSlots: string[];
  degradedContractRejectedReason: string | null;
  acceptedWithDegradedContract: boolean;
  acceptedWithWarnings: boolean;
  warningReasons: string[];
  fallbackMockReason: string | null;
  slotAiRequested: boolean;
  slotAiUsed: boolean;
  slotAiModel: string | null;
  slotAiCoachText: string | null;
  slotAiInvalidChoices: Array<{
    slotId: string;
    exerciseId: string;
    reason: string;
  }>;
  slotAiError: string | null;
  recentVariantGroups: string[];
  sportFocusRelevantRoles: WorkoutSlotRole[];
  sportFocusProtectedRoles: WorkoutSlotRole[];
  slotRecoveryModificationSummary: string[];
  safetyGateReasons: string[];
  fallbackMode:
    | "none"
    | "safe_template"
    | "catalog_safe_template"
    | "catalog_emergency_template";
  contractGateTriggered: boolean;
  contractGateReason: string[];
  retryAttempted: boolean;
  retryReason: string | null;
  finalContractPassed: boolean;
  finalSlotCoverage: string[];
  lostStrengthMainRoles: WorkoutSlotRole[];
  restoredStrengthRoles: WorkoutSlotRole[];
  strengthWeakButValidReasons: string[];
  sportRelevantSlots: string[];
  sportLossReason: string[];
  goalLossReason: string[];
  repeatedVariantGroups: string[];
  variationPenaltyApplied: boolean;
  fallbackBiasWarning: string | null;
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
