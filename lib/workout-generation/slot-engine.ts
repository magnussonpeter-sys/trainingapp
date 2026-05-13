import OpenAI from "openai";

import {
  getAvailableExercises,
  getExerciseById,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  validateGeneratedWorkout,
  type AiGeneratedWorkoutCandidate,
  type GeneratedWorkoutValidationFocusContext,
} from "@/lib/workout-flow/validate-generated-workout";
import type { WorkoutFocus } from "@/types/workout";

import { buildWorkoutGenerationCoachContext } from "@/lib/workout-generation/coach-context";
import { attachWorkoutGenerationDebug } from "@/lib/workout-generation/debug";
import { getDefaultTrainingConstraints } from "@/lib/workout-generation/injury-constraints";
import { buildWorkoutSlotPlan } from "@/lib/workout-generation/slot-planner";
import {
  getCandidatesForSlot,
  getExerciseRoleCandidates,
  selectExercisesForSlots,
} from "@/lib/workout-generation/exercise-selector";
import { validateSlotWorkout } from "@/lib/workout-generation/slot-validator";
import type {
  SlotExerciseSelection,
  RankedExerciseCandidate,
  SlotWorkoutDebug,
  SlotContractMode,
  WorkoutSlot,
  WorkoutSlotRole,
  WorkoutGenerationMode,
} from "@/lib/workout-generation/types";
import type {
  GenerateWorkoutWithAiCoreInput,
  GenerateWorkoutWithAiCoreResult,
  SupersetPreference,
} from "@/lib/workouts/generate-workout-core";
import type { Exercise, Workout } from "@/types/workout";

const slotClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

const SLOT_SELECTION_MODEL = "gpt-5.4-mini";

type SlotAiSelectionResponse = {
  coachText?: string;
  selections?: Array<{
    slotId?: string;
    exerciseId?: string;
    reason?: string;
  }>;
};

type SlotAiSelectionDebug = {
  requested: boolean;
  used: boolean;
  model: string | null;
  coachText: string | null;
  invalidChoices: Array<{
    slotId: string;
    exerciseId: string;
    reason: string;
  }>;
  error: string | null;
  prompt: string | null;
  rawText: string | null;
  parsedResponse: SlotAiSelectionResponse | null;
};

type FinalContractEvaluation = {
  contractGateTriggered: boolean;
  contractGateReason: string[];
  finalContractPassed: boolean;
  contractFailureStage:
    | "validation_after_normalization"
    | "restore_first"
    | "degraded_contract"
    | "catalog_safe_template"
    | "final_validation"
    | null;
  protectedSlots: string[];
  requiredSlots: string[];
  missingRequiredSlots: string[];
  lostProtectedSlots: string[];
  sportRelevantSlots: string[];
  goalLossReason: string[];
  sportLossReason: string[];
  fallbackBiasWarning: string | null;
};

type RestoreAttemptResult = {
  workout: Workout;
  repairedSlots: string[];
  repairLog: SlotWorkoutDebug["repairLog"];
};

type SlotContractFeasibility = {
  feasible: boolean;
  mode: SlotContractMode;
  infeasibleReasons: string[];
  missingRoles: WorkoutSlotRole[];
  availableRoles: WorkoutSlotRole[];
  equipmentLimitations: string[];
  selectedFallbackStrategy:
    | "full_contract"
    | "degraded_contract"
    | "emergency_contract"
    | "friendly_error";
  contractBeforeFeasibility: WorkoutSlot[];
  contractAfterFeasibility: WorkoutSlot[];
  failedSlots: string[];
  candidatesPerFailedSlot: Record<string, RankedExerciseCandidate[]>;
  rejectedCandidatesPerFailedSlot: Record<string, RankedExerciseCandidate[]>;
};

function getSportProtectedRoles(params: {
  sportFocus: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"]["sportFocus"];
}) {
  if (params.sportFocus === "cycling") {
    return ["main_squat", "main_hinge", "unilateral_lower", "calves", "core"] as WorkoutSlotRole[];
  }
  if (params.sportFocus === "alpine_skiing") {
    return [
      "main_squat",
      "main_hinge",
      "unilateral_lower",
      "calves",
      "core",
      "carry",
    ] as WorkoutSlotRole[];
  }
  if (params.sportFocus === "surf_sports") {
    return ["main_pull", "rear_delt_scapula", "core", "carry"] as WorkoutSlotRole[];
  }

  return [] as WorkoutSlotRole[];
}

function safeParseJSON(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        return null;
      }
    }

    return null;
  }
}

function buildValidationFocusContext(params: {
  input: GenerateWorkoutWithAiCoreInput;
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
}): GeneratedWorkoutValidationFocusContext {
  return {
    plannedFocus: params.coachContext.selectedFocus,
    goal: params.coachContext.goal,
    experienceLevel: params.coachContext.experienceLevel,
    durationMinutes: params.input.durationMinutes,
    priorityMuscles: params.coachContext.focusCompatiblePriorities,
    recoveryLimitedMuscles: params.coachContext.recoverySummary.recoverySeverityByMuscle
      .filter((entry) => entry.severity !== "none")
      .map((entry) => entry.muscle),
    availableEquipment: params.input.equipment,
    sportFocus: params.coachContext.sportFocus,
  };
}

function hasLoadedCandidateForContract(params: {
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
}) {
  if (params.coachContext.goal !== "strength") {
    return true;
  }

  const availableExercises = getAvailableExercises(params.coachContext.selectedEquipment);

  return availableExercises.some((exercise) => {
    const roles = getExerciseRoleCandidates(exercise);
    const matchesRequiredMainSlot = params.slotPlan.slots.some(
      (slot) =>
        slot.required &&
        ["main_push", "main_pull", "main_squat", "main_hinge"].some(
          (role) => slot.allowedRoles.includes(role as WorkoutSlotRole) && roles.includes(role as WorkoutSlotRole),
        ),
    );

    return (
      matchesRequiredMainSlot &&
      exercise.requiredEquipment.some((equipment) => equipment !== "bodyweight")
    );
  });
}

function assessSlotPlanFeasibility(params: {
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  contractBeforeFeasibility: WorkoutSlot[];
  selectedFallbackStrategy: SlotContractFeasibility["selectedFallbackStrategy"];
}): SlotContractFeasibility {
  const availableExercises = getAvailableExercises(params.coachContext.selectedEquipment);
  const availableRoles = Array.from(
    new Set(
      availableExercises.flatMap((exercise) => getExerciseRoleCandidates(exercise)),
    ),
  );
  const failedSlots: string[] = [];
  const missingRoles = new Set<WorkoutSlotRole>();
  const equipmentLimitations = new Set<string>();
  const candidatesPerFailedSlot: Record<string, RankedExerciseCandidate[]> = {};
  const rejectedCandidatesPerFailedSlot: Record<string, RankedExerciseCandidate[]> = {};
  let feasibleSlotCount = 0;

  for (const slot of params.slotPlan.slots) {
    const ranked = getCandidatesForSlot({
      slot,
      coachContext: params.coachContext,
      usedVariantGroups: [],
      usedMovementPatterns: [],
    });
    const accepted = ranked
      .filter((entry) => entry.candidate.score > 0)
      .slice(0, 5)
      .map((entry) => entry.candidate);

    if (accepted.length > 0) {
      feasibleSlotCount += 1;
    }

    if (slot.required && accepted.length === 0) {
      failedSlots.push(slot.id);
      slot.allowedRoles.forEach((role) => missingRoles.add(role));
      candidatesPerFailedSlot[slot.id] = accepted;
      rejectedCandidatesPerFailedSlot[slot.id] = ranked
        .filter((entry) => entry.candidate.score <= 0)
        .slice(0, 5)
        .map((entry) => entry.candidate);
      equipmentLimitations.add(
        `${slot.label}:${slot.allowedRoles.join("|")}`,
      );
    }
  }

  const infeasibleReasons: string[] = [];

  if (failedSlots.length > 0) {
    infeasibleReasons.push(...failedSlots.map((slotId) => `missing_required_slot:${slotId}`));
  }
  if (params.coachContext.durationMinutes >= 15 && feasibleSlotCount < 3) {
    infeasibleReasons.push("too_few_exercises_for_duration");
  }
  if (!hasLoadedCandidateForContract(params)) {
    infeasibleReasons.push("missing_loaded_main_lift_for_strength");
    equipmentLimitations.add("loaded_main_lift");
  }

  return {
    feasible: infeasibleReasons.length === 0,
    mode: params.slotPlan.contractMode ?? "full",
    infeasibleReasons,
    missingRoles: Array.from(missingRoles),
    availableRoles,
    equipmentLimitations: Array.from(equipmentLimitations),
    selectedFallbackStrategy: params.selectedFallbackStrategy,
    contractBeforeFeasibility: params.contractBeforeFeasibility,
    contractAfterFeasibility: params.slotPlan.slots,
    failedSlots,
    candidatesPerFailedSlot,
    rejectedCandidatesPerFailedSlot,
  };
}

function chooseFeasibleSlotPlan(params: {
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  requestedMode?: SlotContractMode;
}) {
  const requestedMode = params.requestedMode ?? "full";
  const modeSequence: SlotContractMode[] =
    requestedMode === "full"
      ? ["full", "degraded", "emergency"]
      : requestedMode === "degraded"
        ? ["degraded", "emergency"]
        : ["emergency"];
  const basePlan = buildWorkoutSlotPlan({
    coachContext: params.coachContext,
    mode: "full",
  });
  let lastAssessment: SlotContractFeasibility | null = null;
  let selectedPlan = buildWorkoutSlotPlan({
    coachContext: params.coachContext,
    mode: requestedMode,
  });

  for (const mode of modeSequence) {
    const slotPlan = buildWorkoutSlotPlan({
      coachContext: params.coachContext,
      mode,
    });
    const assessment = assessSlotPlanFeasibility({
      slotPlan,
      coachContext: params.coachContext,
      contractBeforeFeasibility: basePlan.slots,
      selectedFallbackStrategy:
        mode === "full"
          ? "full_contract"
          : mode === "degraded"
            ? "degraded_contract"
            : "emergency_contract",
    });

    selectedPlan = slotPlan;
    lastAssessment = assessment;

    if (assessment.feasible) {
      return {
        slotPlan,
        feasibility: assessment,
      };
    }
  }

  return {
    slotPlan: selectedPlan,
    feasibility: lastAssessment ?? {
      feasible: false,
      mode: selectedPlan.contractMode ?? requestedMode,
      infeasibleReasons: ["unknown_feasibility_failure"],
      missingRoles: [],
      availableRoles: [],
      equipmentLimitations: [],
      selectedFallbackStrategy: "friendly_error",
      contractBeforeFeasibility: basePlan.slots,
      contractAfterFeasibility: selectedPlan.slots,
      failedSlots: [],
      candidatesPerFailedSlot: {},
      rejectedCandidatesPerFailedSlot: {},
    },
  };
}

function buildSlotCandidate(params: {
  selectedFocus: WorkoutFocus | "recovery_strength";
  durationMinutes: number;
  selections: ReturnType<typeof selectExercisesForSlots>["selections"];
  coachText?: string | null;
}) {
  const exercises = params.selections.map((selection, index) => ({
    id: selection.exerciseId,
    name: selection.exerciseName,
    role: selection.role,
    priorityRank: index + 1,
    canDropIfShort: index >= Math.max(2, params.selections.length - 2),
    reason: selection.reason,
  }));

  return {
    name:
      params.selectedFocus === "lower_body"
        ? "Underkroppspass"
        : params.selectedFocus === "upper_body"
          ? "Överkroppspass"
          : params.selectedFocus === "recovery_strength"
            ? "Lätt återhämtningspass"
            : "Helkroppspass",
    duration: params.durationMinutes,
    rationale:
      params.coachText?.trim() ||
      "Slot-baserad generator skapade passet från required slots, målconfig och träningshistorik.",
    blocks: [
      {
        type: "straight_sets",
        title: "Huvuddel",
        exercises,
      },
    ],
  } satisfies AiGeneratedWorkoutCandidate;
}

function buildWorkoutExerciseFromCatalog(
  exerciseId: string,
): Exercise | null {
  const catalogExercise = getExerciseById(exerciseId);

  if (!catalogExercise) {
    return null;
  }

  const isTimeBased =
    typeof catalogExercise.defaultDuration === "number" &&
    catalogExercise.defaultDuration > 0 &&
    typeof catalogExercise.defaultReps !== "number";

  return {
    id: catalogExercise.id,
    name: catalogExercise.name,
    description: catalogExercise.description,
    sets: catalogExercise.defaultSets,
    reps: isTimeBased ? null : catalogExercise.defaultReps ?? 10,
    duration: isTimeBased ? catalogExercise.defaultDuration ?? 30 : null,
    sidedness: catalogExercise.sidedness,
    ringSetup: catalogExercise.ringSetup,
    rest: catalogExercise.defaultRest,
  };
}

function getProtectedSlotIds(params: {
  slots: WorkoutSlot[];
  selections: SlotExerciseSelection[];
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
}) {
  const sportProtectedRoles = new Set(getSportProtectedRoles({
    sportFocus: params.coachContext.sportFocus,
  }));

  return params.slots
    .filter((slot) => {
      if (slot.required) {
        return true;
      }

      const selection = params.selections.find((item) => item.slotId === slot.id);
      if (!selection) {
        return false;
      }

      if (sportProtectedRoles.has(selection.role)) {
        return true;
      }

      if (params.coachContext.goal === "strength") {
        return ["main_push", "main_pull", "main_squat", "main_hinge"].includes(
          selection.role,
        );
      }

      if (
        params.coachContext.goal === "hypertrophy" &&
        params.coachContext.durationMinutes >= 35
      ) {
        return [
          "direct_biceps",
          "direct_triceps",
          "shoulder_accessory",
          "rear_delt_scapula",
          "calves",
          "core",
          "carry",
        ].includes(selection.role);
      }

      return false;
    })
    .map((slot) => slot.id);
}

function getProtectedRoleTargets(params: {
  slots: WorkoutSlot[];
  selections: SlotExerciseSelection[];
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
}) {
  const protectedSlotIds = new Set(getProtectedSlotIds(params));

  return new Map(
    params.slots
      .filter((slot) => protectedSlotIds.has(slot.id))
      .map((slot) => {
        const selection = params.selections.find((item) => item.slotId === slot.id);
        const shouldLockSelectedRole =
          Boolean(selection) &&
          (
            params.coachContext.goal === "strength" ||
            getSportProtectedRoles({
              sportFocus: params.coachContext.sportFocus,
            }).includes(selection?.role ?? slot.role) ||
            (params.coachContext.goal === "hypertrophy" &&
              [
                "direct_biceps",
                "direct_triceps",
                "shoulder_accessory",
                "rear_delt_scapula",
                "calves",
                "core",
                "carry",
              ].includes(selection?.role ?? slot.role))
          );

        return [
          slot.id,
          shouldLockSelectedRole && selection ? [selection.role] : slot.allowedRoles,
        ] as const;
      }),
  );
}

function getSlotPlanMode(slotPlan: ReturnType<typeof buildWorkoutSlotPlan>) {
  return (slotPlan.contractMode ?? "full") as SlotContractMode;
}

function mapRejectedCandidatesByReason(params: {
  rejectedCandidates: Record<string, ReturnType<typeof selectExercisesForSlots>["rejectedCandidates"][string]>;
}) {
  const rejectedBecauseEquipment = new Set<string>();
  const rejectedBecauseRecovery = new Set<string>();
  const rejectedBecauseRoleMismatch = new Set<string>();
  const rejectedBecauseRisk = new Set<string>();

  for (const candidates of Object.values(params.rejectedCandidates)) {
    for (const candidate of candidates ?? []) {
      if (candidate.rejectedReasons.includes("role_mismatch")) {
        rejectedBecauseRoleMismatch.add(candidate.exerciseName);
      }
      if (candidate.rejectedReasons.includes("recovery_hard_block")) {
        rejectedBecauseRecovery.add(candidate.exerciseName);
      }
      if (candidate.rejectedReasons.includes("risk_too_high_for_beginner")) {
        rejectedBecauseRisk.add(candidate.exerciseName);
      }
      if (
        candidate.rejectedReasons.includes("constraint_blocked") ||
        candidate.rejectedReasons.includes("forbidden_movement_pattern")
      ) {
        rejectedBecauseEquipment.add(candidate.exerciseName);
      }
    }
  }

  return {
    rejectedBecauseEquipment: Array.from(rejectedBecauseEquipment),
    rejectedBecauseRecovery: Array.from(rejectedBecauseRecovery),
    rejectedBecauseRoleMismatch: Array.from(rejectedBecauseRoleMismatch),
    rejectedBecauseRisk: Array.from(rejectedBecauseRisk),
  };
}

function getWorkoutExerciseSnapshots(workout: Workout) {
  const snapshots: Array<{
    blockIndex: number;
    exerciseIndex: number;
    exercise: Exercise;
    catalog: ExerciseCatalogItem | null;
    roles: WorkoutSlotRole[];
  }> = [];

  for (const [blockIndex, block] of (workout.blocks ?? []).entries()) {
    for (const [exerciseIndex, exercise] of block.exercises.entries()) {
      const catalog = getExerciseById(exercise.id);
      snapshots.push({
        blockIndex,
        exerciseIndex,
        exercise,
        catalog,
        roles: catalog ? getExerciseRoleCandidates(catalog) : [],
      });
    }
  }

  return snapshots;
}

function slotCoveredByWorkout(params: {
  slot: WorkoutSlot;
  workout: Workout;
}) {
  return getWorkoutExerciseSnapshots(params.workout).some((snapshot) =>
    snapshot.roles.some((role) => params.slot.allowedRoles.includes(role)),
  );
}

function evaluateFinalContract(params: {
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selections: SlotExerciseSelection[];
  workout: Workout;
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  validationDebug: ReturnType<typeof validateGeneratedWorkout>["debug"]["validation"];
}) {
  const contractMode = getSlotPlanMode(params.slotPlan);
  const requiredSlots = params.slotPlan.slots
    .filter((slot) => slot.required)
    .map((slot) => slot.id);
  const protectedSlots = getProtectedSlotIds({
    slots: params.slotPlan.slots,
    selections: params.selections,
    coachContext: params.coachContext,
  });
  const protectedRoleTargets = getProtectedRoleTargets({
    slots: params.slotPlan.slots,
    selections: params.selections,
    coachContext: params.coachContext,
  });
  const missingRequiredSlots = requiredSlots.filter((slotId) => {
    const slot = params.slotPlan.slots.find((candidate) => candidate.id === slotId);
    return slot ? !slotCoveredByWorkout({ slot, workout: params.workout }) : true;
  });
  const lostProtectedSlots = protectedSlots.filter((slotId) => {
    const targetRoles = protectedRoleTargets.get(slotId) ?? [];
    return !getWorkoutExerciseSnapshots(params.workout).some((snapshot) =>
      snapshot.roles.some((role) => targetRoles.includes(role)),
    );
  });
  const qualityThreshold =
    params.coachContext.selectedFocus === "recovery_strength"
      ? 70
      : contractMode === "full"
        ? 80
        : 65;
  const focusThreshold =
    params.coachContext.selectedFocus === "recovery_strength"
      ? 70
      : contractMode === "full"
        ? 85
        : 70;
  const reasons: string[] = [];
  const goalLossReason: string[] = [];
  const sportLossReason: string[] = [];

  if (params.validationDebug.qualityPreservationScore < qualityThreshold) {
    reasons.push(`quality_below_threshold:${params.validationDebug.qualityPreservationScore}`);
  }
  if (params.validationDebug.focusIntegrityScore < focusThreshold) {
    reasons.push(`focus_integrity_below_threshold:${params.validationDebug.focusIntegrityScore}`);
  }
  if (missingRequiredSlots.length > 0) {
    reasons.push(...missingRequiredSlots.map((slotId) => `missing_required_slot_after_normalization:${slotId}`));
  }
  if (lostProtectedSlots.length > 0) {
    reasons.push(...lostProtectedSlots.map((slotId) => `protected_slot_lost:${slotId}`));
  }
  if (
    params.coachContext.goal === "strength" &&
    params.validationDebug.loadedProgressionExerciseCount < 1
  ) {
    reasons.push("missing_loaded_main_lift_after_normalization");
    goalLossReason.push("Loaded huvudlyft saknas trots styrkemål och kompatibel utrustning.");
  }
  if (
    params.coachContext.goal === "strength" &&
    params.coachContext.selectedFocus === "full_body" &&
    params.coachContext.durationMinutes >= 30 &&
    !params.validationDebug.finalExercises.some((exercise) =>
      ["primary_hinge", "glute_accessory", "hamstring_accessory"].includes(
        exercise.exerciseRole,
      ),
    )
  ) {
    reasons.push("full_body_strength_missing_hinge_after_normalization");
    goalLossReason.push("Full body strength tappade hinge/posterior chain i slutpasset.");
  }
  if (
    params.coachContext.goal === "hypertrophy" &&
    params.coachContext.durationMinutes >= 35 &&
    params.validationDebug.lostUsefulRoles.length > 0
  ) {
    reasons.push("hypertrophy_useful_roles_lost");
    goalLossReason.push("Målrelevanta accessoar- eller volymroller tappades i hypertrofipasset.");
  }
  if (
    params.coachContext.sportFocus &&
    (params.validationDebug.sportSpecificityLoss >= 20 ||
      params.validationDebug.lostSportRelevantExercises.length > 0)
  ) {
    reasons.push("sport_relevant_role_loss");
    sportLossReason.push(
      "Sportrelevanta roller eller övningar tappades trots att de var skyddade i kontraktet.",
    );
  }
  if (
    params.validationDebug.roleMismatchReplacements.length > 0 &&
    (missingRequiredSlots.length > 0 || lostProtectedSlots.length > 0)
  ) {
    reasons.push("role_mismatch_replacement_in_required_or_protected_slot");
  }
  if (
    params.validationDebug.genericFallbacksAdded.length > 0 &&
    params.validationDebug.lostPrimaryOrHighValueExercises.length > 0
  ) {
    reasons.push("generic_fallback_replaced_high_value_exercise");
  }

  const fallbackBiasWarning =
    params.validationDebug.fallbackBiasWarning ??
    (params.validationDebug.repeatedVariantGroups.length > 0 &&
    params.validationDebug.fallbackRepeats.length > 0
      ? "Fallback-varianten återkom samtidigt som mer specifika roller tappades."
      : null);

  const hardReasons = reasons.filter((reason) => {
    if (
      params.coachContext.selectedFocus !== "recovery_strength" &&
      contractMode === "full"
    ) {
      if (
        reason.startsWith("quality_below_threshold") ||
        reason.startsWith("focus_integrity_below_threshold")
      ) {
        return true;
      }
    }

    return (
      reason.includes("missing_required_slot") ||
      reason.includes("protected_slot_lost") ||
      reason.includes("missing_loaded_main_lift") ||
      reason.includes("missing_hinge") ||
      reason.includes("role_mismatch_replacement")
    );
  });

  return {
    contractGateTriggered: reasons.length > 0,
    contractGateReason: reasons,
    finalContractPassed: hardReasons.length === 0,
    contractFailureStage:
      reasons.length === 0
        ? null
        : contractMode === "full"
          ? "validation_after_normalization"
          : contractMode === "degraded"
            ? "degraded_contract"
            : "catalog_safe_template",
    protectedSlots,
    requiredSlots,
    missingRequiredSlots,
    lostProtectedSlots,
    sportRelevantSlots: protectedSlots.filter((slotId) => {
      const slot = params.slotPlan.slots.find((candidate) => candidate.id === slotId);
      return slot
        ? slot.allowedRoles.some((role) =>
            getSportProtectedRoles({ sportFocus: params.coachContext.sportFocus }).includes(role),
          )
        : false;
    }),
    goalLossReason,
    sportLossReason,
    fallbackBiasWarning,
  } satisfies FinalContractEvaluation;
}

function attemptRestoreProtectedSlots(params: {
  workout: Workout;
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selections: SlotExerciseSelection[];
  missingSlotIds: string[];
}) {
  const repairLog: RestoreAttemptResult["repairLog"] = [];
  const repairedSlots: string[] = [];
  const workoutCopy: Workout = {
    ...params.workout,
    blocks: (params.workout.blocks ?? []).map((block) => ({
      ...block,
      exercises: [...block.exercises],
    })),
  };

  for (const slotId of params.missingSlotIds) {
    const selection = params.selections.find((item) => item.slotId === slotId);
    const slot = params.slotPlan.slots.find((item) => item.id === slotId);
    const restoreExercise = selection
      ? buildWorkoutExerciseFromCatalog(selection.exerciseId)
      : null;

    if (!selection || !slot || !restoreExercise) {
      repairLog.push({
        slotId,
        repairReason: "restore_missing_selection_or_catalog",
        repairFromExercise: selection?.exerciseName ?? null,
        repairToExercise: null,
        originalRole: selection?.role ?? null,
        replacementRole: null,
        roleEquivalent: false,
        restoreAttempted: true,
        restoreSucceeded: false,
        restoreRejectedReason: "missing_slot_selection_or_catalog_entry",
      });
      continue;
    }

    const snapshots = getWorkoutExerciseSnapshots(workoutCopy);
    const replaceable = snapshots.find((snapshot) => {
      const coveredSlots = params.slotPlan.slots.filter((candidateSlot) =>
        snapshot.roles.some((role) => candidateSlot.allowedRoles.includes(role)),
      );
      const coversRequiredOrProtected = coveredSlots.some(
        (candidateSlot) =>
          candidateSlot.required || params.missingSlotIds.includes(candidateSlot.id),
      );

      return !coversRequiredOrProtected;
    });

    if (!replaceable) {
      repairLog.push({
        slotId,
        repairReason: "restore_no_replaceable_exercise",
        repairFromExercise: selection.exerciseName,
        repairToExercise: null,
        originalRole: selection.role,
        replacementRole: null,
        roleEquivalent: false,
        restoreAttempted: true,
        restoreSucceeded: false,
        restoreRejectedReason: "all_remaining_exercises_cover_required_or_missing_slots",
      });
      continue;
    }

    workoutCopy.blocks?.[replaceable.blockIndex]?.exercises.splice(
      replaceable.exerciseIndex,
      1,
      restoreExercise,
    );
    repairedSlots.push(slotId);
    repairLog.push({
      slotId,
      repairReason: "restore_selected_slot_exercise",
      repairFromExercise: replaceable.exercise.name,
      repairToExercise: selection.exerciseName,
      originalRole: replaceable.roles[0] ?? null,
      replacementRole: selection.role,
      roleEquivalent: slot.allowedRoles.includes(selection.role),
      restoreAttempted: true,
      restoreSucceeded: true,
      restoreRejectedReason: null,
    });
  }

  return {
    workout: workoutCopy,
    repairedSlots,
    repairLog,
  } satisfies RestoreAttemptResult;
}

function buildSlotDebug(params: {
  goalConfigId: string;
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  feasibility: SlotContractFeasibility;
  selection: ReturnType<typeof selectExercisesForSlots>;
  slotValidation: ReturnType<typeof validateSlotWorkout>;
  safeTemplateUsed?: boolean;
  safeTemplateReason?: string | null;
  slotFailureReasons?: string[];
  aiSelectionDebug: SlotAiSelectionDebug;
  contractEvaluation?: FinalContractEvaluation;
  restoreResult?: RestoreAttemptResult | null;
  retryAttempted?: boolean;
  retryReason?: string | null;
  failureStage?: SlotWorkoutDebug["contractFailureStage"];
  degradedContractAttempted?: boolean;
  degradedContractRejectedReason?: string | null;
  acceptedWithDegradedContract?: boolean;
  warningReasons?: string[];
  fallbackMockReason?: string | null;
}) {
  const repeatedVariantGroups = params.selection.selections
    .map((selection) => selection.variantGroup)
    .filter((variantGroup, index, values) => values.indexOf(variantGroup) !== index);

  const rejectedReasonGroups = mapRejectedCandidatesByReason({
    rejectedCandidates: params.selection.rejectedCandidates,
  });

  return {
    feasible: params.feasibility.feasible,
    infeasibleReasons: params.feasibility.infeasibleReasons,
    missingRoles: params.feasibility.missingRoles,
    availableRoles: params.feasibility.availableRoles,
    equipmentLimitations: params.feasibility.equipmentLimitations,
    selectedFallbackStrategy: params.feasibility.selectedFallbackStrategy,
    contractBeforeFeasibility: params.feasibility.contractBeforeFeasibility,
    contractAfterFeasibility: params.feasibility.contractAfterFeasibility,
    selectedGoalConfig: params.goalConfigId,
    coachDecision: {
      reason: params.coachContext.coachDecisionReason,
      selectedFocus: params.coachContext.selectedFocus,
      selectedFocusReason: params.coachContext.selectedFocusReason,
      durationReason: params.coachContext.durationReason,
      trainingGapSummary: params.coachContext.trainingGapSummary,
      focusCompatiblePriorities: params.coachContext.focusCompatiblePriorities,
      deferredPriorities: params.coachContext.deferredPriorities,
      recoverySummary: params.coachContext.recoverySummary,
    },
    slotTemplateId: params.slotPlan.templateId,
    plannedSlots: params.slotPlan.slots,
    contractSlots: params.slotPlan.slots,
    requiredSlots: params.slotPlan.slots.filter((slot) => slot.required).map((slot) => slot.id),
    protectedSlots: params.contractEvaluation?.protectedSlots ?? [],
    slotReasons: params.slotPlan.slots.map((slot) => ({
      slotId: slot.id,
      role: slot.role,
      reason: slot.reason,
    })),
    candidatesPerSlot: params.selection.candidatesPerSlot,
    selectedExercisePerSlot: params.selection.selections,
    selectedScorePerSlot: Object.fromEntries(
      params.selection.selections.map((selection) => [selection.slotId, selection.score]),
    ),
    selectedScoreBreakdown: Object.fromEntries(
      params.selection.selections.map((selection) => [
        selection.slotId,
        selection.scoreBreakdown,
      ]),
    ),
    rejectedCandidates: params.selection.rejectedCandidates,
    rejectedCandidatesTopReasons: Object.fromEntries(
      Object.entries(params.selection.rejectedCandidates).map(([slotId, candidates]) => [
        slotId,
        candidates
          .flatMap((candidate) => candidate.rejectedReasons)
          .filter((reason, index, values) => values.indexOf(reason) === index)
          .slice(0, 5),
      ]),
    ),
    slotCandidateCounts: Object.fromEntries(
      Object.entries(params.selection.candidatesPerSlot).map(([slotId, candidates]) => [
        slotId,
        candidates.length,
      ]),
    ),
    rejectedCandidatesBySlot: Object.fromEntries(
      Object.entries(params.selection.rejectedCandidates).map(([slotId, candidates]) => [
        slotId,
        candidates
          .flatMap((candidate) => candidate.rejectedReasons)
          .filter((reason, index, values) => values.indexOf(reason) === index),
      ]),
    ),
    contractFailureStage:
      params.failureStage ??
      params.contractEvaluation?.contractFailureStage ??
      null,
    failedSlots: Array.from(
      new Set([
        ...params.feasibility.failedSlots,
        ...params.slotValidation.missingRequiredSlots,
      ]),
    ),
    optionalSlots: params.slotPlan.slots
      .filter((slot) => !slot.required)
      .map((slot) => slot.id),
    failedRoleFamilies: params.slotValidation.missingRequiredSlots
      .map((slotId) => params.slotPlan.slots.find((slot) => slot.id === slotId))
      .filter((slot): slot is WorkoutSlot => Boolean(slot))
      .flatMap((slot) => slot.allowedRoles)
      .filter((role, index, values) => values.indexOf(role) === index),
    candidatesPerFailedSlot: {
      ...params.feasibility.candidatesPerFailedSlot,
      ...Object.fromEntries(
        params.slotValidation.missingRequiredSlots.map((slotId) => [
          slotId,
          params.selection.candidatesPerSlot[slotId] ?? [],
        ]),
      ),
    },
    rejectedCandidatesPerFailedSlot: {
      ...params.feasibility.rejectedCandidatesPerFailedSlot,
      ...Object.fromEntries(
        params.slotValidation.missingRequiredSlots.map((slotId) => [
          slotId,
          params.selection.rejectedCandidates[slotId] ?? [],
        ]),
      ),
    },
    rejectedBecauseEquipment: rejectedReasonGroups.rejectedBecauseEquipment,
    rejectedBecauseRecovery: rejectedReasonGroups.rejectedBecauseRecovery,
    rejectedBecauseRoleMismatch: rejectedReasonGroups.rejectedBecauseRoleMismatch,
    rejectedBecauseRisk: rejectedReasonGroups.rejectedBecauseRisk,
    slotValidationPassed: params.slotValidation.slotValidationPassed,
    missingRequiredSlots: params.slotValidation.missingRequiredSlots,
    invalidSlotExercises: params.slotValidation.invalidSlotExercises,
    contractViolations: params.slotValidation.contractViolations,
    repairedSlots: params.restoreResult?.repairedSlots ?? [],
    repairLog: params.restoreResult?.repairLog ?? [],
    slotFailureReasons: params.slotFailureReasons ?? params.slotValidation.safetyGateReasons,
    safeTemplateUsed: params.safeTemplateUsed ?? false,
    safeTemplateReason: params.safeTemplateReason ?? null,
    safeTemplateAttempted:
      params.safeTemplateUsed || params.degradedContractAttempted === true,
    safeTemplateExercises: params.selection.selections.map(
      (selection) => selection.exerciseName,
    ),
    safeTemplateRejectedReason:
      params.safeTemplateUsed && !params.slotValidation.slotValidationPassed
        ? (params.slotFailureReasons ?? params.slotValidation.safetyGateReasons).join(", ")
        : null,
    degradedContractAttempted: params.degradedContractAttempted ?? false,
    degradedContractSlots:
      getSlotPlanMode(params.slotPlan) === "full"
        ? []
        : params.slotPlan.slots.map((slot) => slot.id),
    degradedContractRejectedReason: params.degradedContractRejectedReason ?? null,
    acceptedWithDegradedContract: params.acceptedWithDegradedContract ?? false,
    acceptedWithWarnings:
      Boolean(params.warningReasons && params.warningReasons.length > 0) ||
      Boolean(params.acceptedWithDegradedContract),
    warningReasons: params.warningReasons ?? [],
    fallbackMockReason: params.fallbackMockReason ?? null,
    slotAiRequested: params.aiSelectionDebug.requested,
    slotAiUsed: params.aiSelectionDebug.used,
    slotAiModel: params.aiSelectionDebug.model,
    slotAiCoachText: params.aiSelectionDebug.coachText,
    slotAiInvalidChoices: params.aiSelectionDebug.invalidChoices,
    slotAiError: params.aiSelectionDebug.error,
    recentVariantGroups: params.coachContext.recentVariantGroups,
    sportFocusRelevantRoles: getSportProtectedRoles({
      sportFocus: params.coachContext.sportFocus,
    }),
    sportFocusProtectedRoles: getSportProtectedRoles({
      sportFocus: params.coachContext.sportFocus,
    }),
    slotRecoveryModificationSummary:
      params.coachContext.recoverySummary.recoverySeverityByMuscle
        .filter((entry) => entry.severity !== "none")
        .map((entry) => `${entry.muscle}: ${entry.severity} (${entry.reason})`),
    safetyGateReasons: params.slotValidation.safetyGateReasons,
    fallbackMode:
      params.safeTemplateUsed && params.slotValidation.slotValidationPassed
        ? getSlotPlanMode(params.slotPlan) === "emergency"
          ? "catalog_emergency_template"
          : "catalog_safe_template"
        : "none",
    contractGateTriggered: params.contractEvaluation?.contractGateTriggered ?? false,
    contractGateReason: params.contractEvaluation?.contractGateReason ?? [],
    retryAttempted: params.retryAttempted ?? false,
    retryReason: params.retryReason ?? null,
    finalContractPassed:
      params.contractEvaluation?.finalContractPassed ?? params.slotValidation.finalContractPassed,
    finalSlotCoverage: params.slotValidation.finalSlotCoverage,
    sportRelevantSlots: params.contractEvaluation?.sportRelevantSlots ?? [],
    sportLossReason: params.contractEvaluation?.sportLossReason ?? [],
    goalLossReason: params.contractEvaluation?.goalLossReason ?? [],
    repeatedVariantGroups,
    variationPenaltyApplied: params.selection.selections.some((selection) =>
      selection.scoreBreakdown.some((entry) =>
        ["variant_repeat_penalty", "variant_cooldown_penalty", "recent_exercise_penalty"].includes(
          entry.code,
        ),
      ),
    ),
    fallbackBiasWarning: params.contractEvaluation?.fallbackBiasWarning ?? null,
    finalWorkoutQualityScore: params.slotValidation.finalWorkoutQualityScore,
  } satisfies SlotWorkoutDebug;
}

function buildSlotAiPrompt(params: {
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selection: ReturnType<typeof selectExercisesForSlots>;
}) {
  const payload = {
    goal: params.coachContext.goal,
    focus: params.coachContext.selectedFocus,
    durationMinutes: params.coachContext.durationMinutes,
    experienceLevel: params.coachContext.experienceLevel,
    sportFocus: params.coachContext.sportFocus,
    trainingGapSummary: params.coachContext.trainingGapSummary,
    adherenceSessionsRatio: params.coachContext.adherenceSessionsRatio,
    adherenceMinutesRatio: params.coachContext.adherenceMinutesRatio,
    completedSessions7d: params.coachContext.completedSessions7d,
    plannedSessions7d: params.coachContext.plannedSessions7d,
    hasSpontaneousWorkoutThisWeek: params.coachContext.hasSpontaneousWorkoutThisWeek,
    slotTemplateId: params.slotPlan.templateId,
    rules: [
      "Returnera endast strikt JSON.",
      "Välj bara exerciseId som redan finns i candidates för varje slot.",
      "Välj exakt en exerciseId per required slot.",
      "Hoppa över optional slots endast om ingen kandidat tillför något tydligt.",
      "Ändra inte passets struktur. Slots är redan låsta av regelmotorn.",
      "Prioritera återhämtningskompatibla varianter när recovery verkar begränsad.",
      "CoachText ska vara kort, konkret och anpassad till mål, adherence och eventuell extra träning.",
    ],
    slots: params.slotPlan.slots.map((slot) => ({
      slotId: slot.id,
      role: slot.role,
      label: slot.label,
      allowedRoles: slot.allowedRoles,
      required: slot.required,
      priority: slot.priority,
      reason: slot.reason,
      intensityHint: slot.intensityHint ?? null,
      candidates: (params.selection.candidatesPerSlot[slot.id] ?? []).slice(0, 5).map(
        (candidate) => ({
          exerciseId: candidate.exerciseId,
          exerciseName: candidate.exerciseName,
          score: candidate.score,
          scoreBreakdown: candidate.scoreBreakdown.slice(0, 3),
        }),
      ),
    })),
  };

  return [
    "Du väljer övningar inom redan säkra tränings-slots.",
    "Svara med JSON i formatet:",
    '{"coachText":"kort svensk coachtext","selections":[{"slotId":"...","exerciseId":"...","reason":"kort motivering"}]}',
    "Välj aldrig en övning som inte finns bland slotens candidates.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

async function requestAiSlotSelections(params: {
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selection: ReturnType<typeof selectExercisesForSlots>;
}): Promise<SlotAiSelectionDebug> {
  if (!slotClient) {
    return {
      requested: false,
      used: false,
      model: null,
      coachText: null,
      invalidChoices: [],
      error: "openai_api_key_missing",
      prompt: null,
      rawText: null,
      parsedResponse: null,
    };
  }

  const prompt = buildSlotAiPrompt(params);

  try {
    const response = await slotClient.chat.completions.create({
      model: SLOT_SELECTION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Du är en erfaren personlig tränare. Du väljer endast mellan redan godkända kandidater och svarar med strikt JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const rawText = response.choices?.[0]?.message?.content ?? "";
    const parsedResponse = safeParseJSON(rawText) as SlotAiSelectionResponse | null;

    if (!parsedResponse || !Array.isArray(parsedResponse.selections)) {
      return {
        requested: true,
        used: false,
        model: SLOT_SELECTION_MODEL,
        coachText: null,
        invalidChoices: [],
        error: "slot_ai_response_unparseable",
        prompt,
        rawText,
        parsedResponse,
      };
    }

    return {
      requested: true,
      used: true,
      model: SLOT_SELECTION_MODEL,
      coachText:
        typeof parsedResponse.coachText === "string"
          ? parsedResponse.coachText.trim() || null
          : null,
      invalidChoices: [],
      error: null,
      prompt,
      rawText,
      parsedResponse,
    };
  } catch (error) {
    return {
      requested: true,
      used: false,
      model: SLOT_SELECTION_MODEL,
      coachText: null,
      invalidChoices: [],
      error: error instanceof Error ? error.message : "slot_ai_request_failed",
      prompt,
      rawText: null,
      parsedResponse: null,
    };
  }
}

function mergeAiSelections(params: {
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selection: ReturnType<typeof selectExercisesForSlots>;
  aiSelectionDebug: SlotAiSelectionDebug;
}) {
  const localSelectionBySlot = new Map(
    params.selection.selections.map((selection) => [selection.slotId, selection]),
  );
  const usedExerciseIds = new Set<string>();
  const invalidChoices = [...params.aiSelectionDebug.invalidChoices];
  const aiSelections = Array.isArray(params.aiSelectionDebug.parsedResponse?.selections)
    ? params.aiSelectionDebug.parsedResponse.selections
    : [];
  const aiSelectionBySlot = new Map(
    aiSelections
      .filter(
        (selection): selection is { slotId: string; exerciseId: string; reason?: string } =>
          typeof selection?.slotId === "string" && typeof selection?.exerciseId === "string",
      )
      .map((selection) => [selection.slotId, selection]),
  );

  const mergedSelections: SlotExerciseSelection[] = [];

  for (const slot of params.slotPlan.slots) {
    const localSelection = localSelectionBySlot.get(slot.id);
    const aiSelection = aiSelectionBySlot.get(slot.id);
    const validCandidate = aiSelection
      ? (params.selection.candidatesPerSlot[slot.id] ?? []).find(
          (candidate) => candidate.exerciseId === aiSelection.exerciseId,
        )
      : null;

    if (aiSelection && validCandidate && !usedExerciseIds.has(validCandidate.exerciseId)) {
      usedExerciseIds.add(validCandidate.exerciseId);
      mergedSelections.push({
        slotId: slot.id,
        slotLabel: slot.label,
        role: validCandidate.matchedRole,
        contractRoles: slot.allowedRoles,
        exerciseId: validCandidate.exerciseId,
        exerciseName: validCandidate.exerciseName,
        movementPattern: validCandidate.movementPattern,
        variantGroup: validCandidate.variantGroup,
        primaryMuscles: validCandidate.primaryMuscles,
        secondaryMuscles: validCandidate.secondaryMuscles,
        requiredEquipment: validCandidate.requiredEquipment,
        score: validCandidate.score,
        scoreBreakdown: validCandidate.scoreBreakdown,
        reason:
          aiSelection.reason?.trim() ||
          localSelection?.reason ||
          "AI valde denna kandidat inom den fördefinierade sloten.",
        selectionSource: "ai_rank",
        candidates: params.selection.candidatesPerSlot[slot.id] ?? [],
      });
      continue;
    }

    if (aiSelection && !validCandidate) {
      invalidChoices.push({
        slotId: slot.id,
        exerciseId: aiSelection.exerciseId,
        reason: "exercise_not_in_allowed_slot_candidates",
      });
    } else if (aiSelection && validCandidate && usedExerciseIds.has(validCandidate.exerciseId)) {
      invalidChoices.push({
        slotId: slot.id,
        exerciseId: aiSelection.exerciseId,
        reason: "duplicate_exercise_choice",
      });
    }

    if (!localSelection || usedExerciseIds.has(localSelection.exerciseId)) {
      continue;
    }

    usedExerciseIds.add(localSelection.exerciseId);
    mergedSelections.push(localSelection);
  }

  return {
    selection: {
      ...params.selection,
      selections: mergedSelections,
    },
    aiSelectionDebug: {
      ...params.aiSelectionDebug,
      invalidChoices,
      used:
        params.aiSelectionDebug.used &&
        mergedSelections.some((selection) => selection.selectionSource === "ai_rank"),
    },
  };
}

async function runSlotPlanningPass(params: {
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  safeTemplateMode?: boolean;
  contractMode?: SlotContractMode;
  skipAiSelection?: boolean;
}) {
  const { slotPlan, feasibility } = chooseFeasibleSlotPlan({
    coachContext: params.coachContext,
    requestedMode: params.contractMode,
  });
  const localSelection = selectExercisesForSlots({
    slots: slotPlan.slots,
    coachContext: params.coachContext,
    allowSafeTemplateFallback: params.safeTemplateMode,
  });
  const aiSelectionDebug = params.skipAiSelection
    ? ({
        requested: false,
        used: false,
        model: null,
        coachText: null,
        invalidChoices: [],
        error: "slot_ai_skipped_for_catalog_template",
        prompt: null,
        rawText: null,
        parsedResponse: null,
      } satisfies SlotAiSelectionDebug)
    : await requestAiSlotSelections({
        coachContext: params.coachContext,
        slotPlan,
        selection: localSelection,
      });
  const { selection, aiSelectionDebug: mergedAiSelectionDebug } = params.skipAiSelection
    ? {
        selection: localSelection,
        aiSelectionDebug,
      }
    : mergeAiSelections({
        slotPlan,
        selection: localSelection,
        aiSelectionDebug,
      });
  const slotValidation = validateSlotWorkout({
    slots: slotPlan.slots,
    selections: selection.selections,
    coachContext: params.coachContext,
  });

  return {
    slotPlan,
    feasibility,
    selection,
    aiSelectionDebug: mergedAiSelectionDebug,
    slotValidation,
  };
}

function buildParsedWorkoutWithContext(params: {
  input: GenerateWorkoutWithAiCoreInput & {
    generationMode?: WorkoutGenerationMode | null;
  };
  workout: Workout;
  validatedWorkout: ReturnType<typeof validateGeneratedWorkout>;
  slotDebug: SlotWorkoutDebug;
  activePass: Awaited<ReturnType<typeof runSlotPlanningPass>>;
  trainingHistoryContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["trainingHistoryContext"];
  candidate: AiGeneratedWorkoutCandidate;
}) {
  return {
    ...params.workout,
    goal: params.input.goal,
    duration: params.workout.duration ?? params.input.durationMinutes,
    gym: params.input.gym,
    gymLabel: params.input.gymLabel,
    plannedFocus:
      params.input.selectedPlanMode === "recovery"
        ? "full_body"
        : params.input.nextFocus,
    availableEquipment: params.input.equipment,
    aiDebug: {
      request: {
        goal: params.input.goal,
        durationMinutes: params.input.durationMinutes,
        nextFocus: params.input.nextFocus,
        selectedPlanMode: params.input.selectedPlanMode,
        focusIntent: params.input.focusIntent,
      },
      generationContext: {
        generationModeRequested: params.input.generationMode ?? "slot_based_v1",
        selectedGoalConfig: params.slotDebug.selectedGoalConfig,
        coachDecision: params.slotDebug.coachDecision,
        selectedFocus: params.slotDebug.coachDecision.selectedFocus,
        slotTemplateId: params.slotDebug.slotTemplateId,
        plannedSlots: params.slotDebug.plannedSlots,
        contractSlots: params.slotDebug.contractSlots,
        requiredSlots: params.slotDebug.requiredSlots,
        protectedSlots: params.slotDebug.protectedSlots,
        slotReasons: params.slotDebug.slotReasons,
        candidatesPerSlot: params.slotDebug.candidatesPerSlot,
        selectedExercisePerSlot: params.slotDebug.selectedExercisePerSlot,
        selectedScorePerSlot: params.slotDebug.selectedScorePerSlot,
        selectedScoreBreakdown: params.slotDebug.selectedScoreBreakdown,
        rejectedCandidates: params.slotDebug.rejectedCandidates,
        rejectedCandidatesTopReasons: params.slotDebug.rejectedCandidatesTopReasons,
        contractViolations: params.slotDebug.contractViolations,
        contractGateTriggered: params.slotDebug.contractGateTriggered,
        contractGateReason: params.slotDebug.contractGateReason,
        fallbackMode: params.slotDebug.fallbackMode,
        finalContractPassed: params.slotDebug.finalContractPassed,
        repairedSlots: params.slotDebug.repairedSlots,
        repairLog: params.slotDebug.repairLog,
        slotValidationDebug: {
          slotValidationPassed: params.slotDebug.slotValidationPassed,
          missingRequiredSlots: params.slotDebug.missingRequiredSlots,
          invalidSlotExercises: params.slotDebug.invalidSlotExercises,
          contractViolations: params.slotDebug.contractViolations,
          safetyGateReasons: params.slotDebug.safetyGateReasons,
          finalSlotCoverage: params.slotDebug.finalSlotCoverage,
          finalContractPassed: params.slotDebug.finalContractPassed,
          finalWorkoutQualityScore: params.slotDebug.finalWorkoutQualityScore,
        },
        slotAiRequested: params.slotDebug.slotAiRequested,
        slotAiUsed: params.slotDebug.slotAiUsed,
        slotAiModel: params.slotDebug.slotAiModel,
        slotAiCoachText: params.slotDebug.slotAiCoachText,
        slotAiInvalidChoices: params.slotDebug.slotAiInvalidChoices,
        slotAiError: params.slotDebug.slotAiError,
        recentVariantGroups: params.slotDebug.recentVariantGroups,
        sportFocusRelevantRoles: params.slotDebug.sportFocusRelevantRoles,
        sportFocusProtectedRoles: params.slotDebug.sportFocusProtectedRoles,
        sportRelevantSlots: params.slotDebug.sportRelevantSlots,
        sportLossReason: params.slotDebug.sportLossReason,
        goalLossReason: params.slotDebug.goalLossReason,
        repeatedVariantGroups: params.slotDebug.repeatedVariantGroups,
        variationPenaltyApplied: params.slotDebug.variationPenaltyApplied,
        retryAttempted: params.slotDebug.retryAttempted,
        retryReason: params.slotDebug.retryReason,
        recentWorkoutsSummary: params.trainingHistoryContext.recentWorkouts,
      },
      prompt:
        params.activePass.aiSelectionDebug.prompt ??
        "slot_based_v1 generated locally from goal config, coach context and slots.",
      rawAiText:
        params.activePass.aiSelectionDebug.rawText ?? JSON.stringify(params.candidate, null, 2),
      parsedAiResponse: params.activePass.aiSelectionDebug.parsedResponse ?? params.candidate,
      validatedWorkout: params.validatedWorkout.debug,
    },
  };
}

function finalizeSlotWorkout(params: {
  workout: Workout;
  input: GenerateWorkoutWithAiCoreInput & {
    generationMode?: WorkoutGenerationMode | null;
  };
  slotDebug: SlotWorkoutDebug;
  activePass: Awaited<ReturnType<typeof runSlotPlanningPass>>;
  trainingHistoryContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["trainingHistoryContext"];
  candidate: AiGeneratedWorkoutCandidate;
  validatedWorkout: ReturnType<typeof validateGeneratedWorkout>;
}) {
  const parsedWithContext = buildParsedWorkoutWithContext(params);
  const normalizedWorkout = normalizePreviewWorkout(parsedWithContext);

  if (!normalizedWorkout) {
    return null;
  }

  return attachWorkoutGenerationDebug({
    workout: {
      ...normalizedWorkout,
      aiDebug: {
        ...normalizedWorkout.aiDebug,
        normalizedWorkout,
      },
    },
    generationModeRequested: params.input.generationMode ?? "slot_based_v1",
    generationEngineUsed: "slot_based_v1",
    generationFallbackUsed: false,
    generationFallbackReason: null,
    slotValidationPassed: params.activePass.slotValidation.slotValidationPassed,
    legacyValidationPassed: null,
    finalSafetyGateReasons: params.activePass.slotValidation.safetyGateReasons,
    slotDebug: params.slotDebug,
  });
}

export async function generateWorkoutWithSlotBasedV1(
  input: GenerateWorkoutWithAiCoreInput & {
    generationMode?: WorkoutGenerationMode | null;
  },
): Promise<GenerateWorkoutWithAiCoreResult> {
  const constraints = getDefaultTrainingConstraints();
  const { coachContext, trainingHistoryContext } = buildWorkoutGenerationCoachContext({
    input,
    constraints,
  });
  const initialPass = await runSlotPlanningPass({
    coachContext,
    contractMode: "full",
  });

  async function createValidatedSlotResult(params: {
    pass: Awaited<ReturnType<typeof runSlotPlanningPass>>;
    safeTemplateUsed: boolean;
    safeTemplateReason: string | null;
    retryAttempted?: boolean;
    retryReason?: string | null;
    degradedContractAttempted?: boolean;
    degradedContractRejectedReason?: string | null;
    acceptedWithDegradedContract?: boolean;
    failureStage?: SlotWorkoutDebug["contractFailureStage"];
    warningReasons?: string[];
  }) {
    const candidate = buildSlotCandidate({
      selectedFocus: coachContext.selectedFocus,
      durationMinutes: input.durationMinutes,
      selections: params.pass.selection.selections,
      coachText: params.pass.aiSelectionDebug.coachText,
    });
    const focusContext = buildValidationFocusContext({
      input,
      coachContext,
    });
    const validated = validateGeneratedWorkout({
      focusContext,
      availableEquipment: input.equipment,
      candidate,
      durationMinutes: input.durationMinutes,
      goal: coachContext.goal,
      gym: input.gym,
      gymLabel: input.gymLabel,
      recentExerciseIds: coachContext.recentExerciseIds,
      recentVariantGroups: coachContext.recentVariantGroups,
      weeklyBudget: input.weeklyBudget,
      lessOftenExerciseIds: input.lessOftenExerciseIds,
      avoidSupersets: input.avoidSupersets,
      supersetPreference:
        input.supersetPreference ??
        (input.avoidSupersets ? "avoid_all" : ("allowed" satisfies SupersetPreference)),
    });

    const initialContractEvaluation = evaluateFinalContract({
      slotPlan: params.pass.slotPlan,
      selections: params.pass.selection.selections,
      workout: validated.workout,
      coachContext,
      validationDebug: validated.debug.validation,
    });

    const missingProtectedSlots = initialContractEvaluation.lostProtectedSlots;
    const restoreResult =
      missingProtectedSlots.length > 0
        ? attemptRestoreProtectedSlots({
            workout: validated.workout,
            slotPlan: params.pass.slotPlan,
            selections: params.pass.selection.selections,
            missingSlotIds: missingProtectedSlots,
          })
        : null;

    const restoredContractEvaluation = restoreResult
      ? evaluateFinalContract({
          slotPlan: params.pass.slotPlan,
          selections: params.pass.selection.selections,
          workout: restoreResult.workout,
          coachContext,
          validationDebug: validated.debug.validation,
        })
      : initialContractEvaluation;

    const finalWorkout =
      restoreResult && restoredContractEvaluation.finalContractPassed
        ? restoreResult.workout
        : validated.workout;
    const finalContractEvaluation =
      restoreResult && restoredContractEvaluation.finalContractPassed
        ? restoredContractEvaluation
        : initialContractEvaluation;

    const slotDebug = buildSlotDebug({
      goalConfigId: params.pass.slotPlan.goalConfig.id,
      coachContext,
      slotPlan: params.pass.slotPlan,
      feasibility: params.pass.feasibility,
      selection: params.pass.selection,
      slotValidation: params.pass.slotValidation,
      safeTemplateUsed: params.safeTemplateUsed,
      safeTemplateReason: params.safeTemplateReason,
      slotFailureReasons: params.pass.slotValidation.safetyGateReasons,
      aiSelectionDebug: params.pass.aiSelectionDebug,
      contractEvaluation: finalContractEvaluation,
      restoreResult,
      retryAttempted: params.retryAttempted,
      retryReason: params.retryReason,
      failureStage: params.failureStage,
      degradedContractAttempted: params.degradedContractAttempted,
      degradedContractRejectedReason: params.degradedContractRejectedReason,
      acceptedWithDegradedContract: params.acceptedWithDegradedContract,
      warningReasons: params.warningReasons,
    });

    const workout = finalizeSlotWorkout({
      workout: finalWorkout,
      input,
      slotDebug,
      activePass: params.pass,
      trainingHistoryContext,
      candidate,
      validatedWorkout: validated,
    });

    return {
      workout,
      slotDebug,
      contractEvaluation: finalContractEvaluation,
      validated,
    };
  }

  const initialResult = await createValidatedSlotResult({
    pass: initialPass,
    safeTemplateUsed: false,
    safeTemplateReason: null,
    acceptedWithDegradedContract:
      initialPass.feasibility.selectedFallbackStrategy !== "full_contract",
    warningReasons:
      initialPass.feasibility.selectedFallbackStrategy !== "full_contract"
        ? initialPass.feasibility.infeasibleReasons
        : undefined,
    failureStage: initialPass.slotValidation.slotValidationPassed
      ? "validation_after_normalization"
      : "slot_scoring",
  });

  if (!initialPass.feasibility.feasible) {
    const feasibilityReasons = initialPass.feasibility.infeasibleReasons.join(", ");
    return {
      ok: false,
      status: 500,
      error: `slot_based_v1 kunde inte uppfylla ett genomförbart kontrakt för vald utrustning: ${feasibilityReasons}`,
    };
  }

  if (
    initialPass.slotValidation.slotValidationPassed &&
    initialResult.workout &&
    initialResult.contractEvaluation.finalContractPassed &&
    !initialResult.contractEvaluation.contractGateTriggered
  ) {
    return {
      ok: true,
      workout: initialResult.workout,
    };
  }

  const degradedPass = await runSlotPlanningPass({
    coachContext,
    contractMode: "degraded",
  });
  const degradedResult = await createValidatedSlotResult({
    pass: degradedPass as typeof initialPass,
    safeTemplateUsed: false,
    safeTemplateReason: null,
    retryAttempted: true,
    retryReason:
      initialResult.contractEvaluation.contractGateReason.join(", ") ||
      initialPass.slotValidation.safetyGateReasons.join(", ") ||
      null,
    degradedContractAttempted: true,
    acceptedWithDegradedContract: true,
    failureStage: "degraded_contract",
    warningReasons: initialResult.contractEvaluation.contractGateReason,
  });

  if (
    degradedPass.slotValidation.slotValidationPassed &&
    degradedResult.workout &&
    degradedResult.contractEvaluation.finalContractPassed
  ) {
    return {
      ok: true,
      workout: degradedResult.workout,
    };
  }

  const safeTemplatePass = await runSlotPlanningPass({
    coachContext,
    contractMode: "degraded",
    safeTemplateMode: true,
    skipAiSelection: true,
  });
  const safeTemplateResult = await createValidatedSlotResult({
    pass: safeTemplatePass as typeof initialPass,
    safeTemplateUsed: true,
    safeTemplateReason:
      degradedResult.contractEvaluation.contractGateReason.join(", ") ||
      degradedPass.slotValidation.safetyGateReasons.join(", ") ||
      "degraded_contract_failed",
    retryAttempted: true,
    retryReason:
      degradedResult.contractEvaluation.contractGateReason.join(", ") ||
      degradedPass.slotValidation.safetyGateReasons.join(", "),
    degradedContractAttempted: true,
    acceptedWithDegradedContract: true,
    failureStage: "catalog_safe_template",
    warningReasons: degradedResult.contractEvaluation.contractGateReason,
  });

  if (
    safeTemplatePass.slotValidation.slotValidationPassed &&
    safeTemplateResult.workout &&
    safeTemplateResult.contractEvaluation.finalContractPassed
  ) {
    return {
      ok: true,
      workout: safeTemplateResult.workout,
    };
  }

  const emergencyPass = await runSlotPlanningPass({
    coachContext,
    contractMode: "emergency",
    safeTemplateMode: true,
    skipAiSelection: true,
  });
  const emergencyResult = await createValidatedSlotResult({
    pass: emergencyPass as typeof initialPass,
    safeTemplateUsed: true,
    safeTemplateReason:
      safeTemplateResult.contractEvaluation.contractGateReason.join(", ") ||
      safeTemplatePass.slotValidation.safetyGateReasons.join(", ") ||
      "catalog_safe_template_failed",
    retryAttempted: true,
    retryReason:
      safeTemplateResult.contractEvaluation.contractGateReason.join(", ") ||
      safeTemplatePass.slotValidation.safetyGateReasons.join(", "),
    degradedContractAttempted: true,
    acceptedWithDegradedContract: true,
    failureStage: "catalog_safe_template",
    warningReasons: safeTemplateResult.contractEvaluation.contractGateReason,
  });

  if (
    emergencyPass.slotValidation.slotValidationPassed &&
    emergencyResult.workout &&
    emergencyResult.contractEvaluation.finalContractPassed
  ) {
    return {
      ok: true,
      workout: emergencyResult.workout,
    };
  }

  const failureReasons = [
    ...initialPass.feasibility.infeasibleReasons,
    ...initialPass.slotValidation.safetyGateReasons,
    ...initialResult.contractEvaluation.contractGateReason,
    ...degradedPass.feasibility.infeasibleReasons,
    ...degradedPass.slotValidation.safetyGateReasons,
    ...degradedResult.contractEvaluation.contractGateReason,
    ...safeTemplatePass.feasibility.infeasibleReasons,
    ...safeTemplatePass.slotValidation.safetyGateReasons,
    ...safeTemplateResult.contractEvaluation.contractGateReason,
    ...emergencyPass.feasibility.infeasibleReasons,
    ...emergencyPass.slotValidation.safetyGateReasons,
    ...emergencyResult.contractEvaluation.contractGateReason,
  ].filter((reason, index, values) => values.indexOf(reason) === index);

  return {
    ok: false,
    status: 500,
    error: `slot_based_v1 kunde inte uppfylla slot-kontraktet efter restore-first, degraded contract och catalog safe template: ${failureReasons.join(", ")}`,
  };
}

export async function generateSafeSlotTemplateWorkout(
  input: GenerateWorkoutWithAiCoreInput & {
    generationMode?: WorkoutGenerationMode | null;
  },
): Promise<GenerateWorkoutWithAiCoreResult> {
  const constraints = getDefaultTrainingConstraints();
  const { coachContext, trainingHistoryContext } = buildWorkoutGenerationCoachContext({
    input,
    constraints,
  });
  const safeTemplatePass = await runSlotPlanningPass({
    coachContext,
    contractMode: "degraded",
    safeTemplateMode: true,
    skipAiSelection: true,
  });

  if (!safeTemplatePass.feasibility.feasible) {
    const emergencyPass = await runSlotPlanningPass({
      coachContext,
      contractMode: "emergency",
      safeTemplateMode: true,
      skipAiSelection: true,
    });

    if (!emergencyPass.feasibility.feasible || !emergencyPass.slotValidation.slotValidationPassed) {
      return {
        ok: false,
        status: 500,
        error: `catalog_safe_template kunde inte fylla minimum-kontraktet: ${[
          ...safeTemplatePass.feasibility.infeasibleReasons,
          ...safeTemplatePass.slotValidation.safetyGateReasons,
          ...emergencyPass.feasibility.infeasibleReasons,
          ...emergencyPass.slotValidation.safetyGateReasons,
        ]
          .filter((reason, index, values) => values.indexOf(reason) === index)
          .join(", ")}`,
      };
    }

    const emergencyCandidate = buildSlotCandidate({
      selectedFocus: coachContext.selectedFocus,
      durationMinutes: input.durationMinutes,
      selections: emergencyPass.selection.selections,
      coachText: null,
    });
    const emergencyValidated = validateGeneratedWorkout({
      focusContext: buildValidationFocusContext({ input, coachContext }),
      availableEquipment: input.equipment,
      candidate: emergencyCandidate,
      durationMinutes: input.durationMinutes,
      goal: coachContext.goal,
      gym: input.gym,
      gymLabel: input.gymLabel,
      recentExerciseIds: coachContext.recentExerciseIds,
      recentVariantGroups: coachContext.recentVariantGroups,
      weeklyBudget: input.weeklyBudget,
      lessOftenExerciseIds: input.lessOftenExerciseIds,
      avoidSupersets: input.avoidSupersets,
      supersetPreference:
        input.supersetPreference ??
        (input.avoidSupersets ? "avoid_all" : ("allowed" satisfies SupersetPreference)),
    });
    const emergencyContract = evaluateFinalContract({
      slotPlan: emergencyPass.slotPlan,
      selections: emergencyPass.selection.selections,
      workout: emergencyValidated.workout,
      coachContext,
      validationDebug: emergencyValidated.debug.validation,
    });
    const emergencyDebug = buildSlotDebug({
      goalConfigId: emergencyPass.slotPlan.goalConfig.id,
      coachContext,
      slotPlan: emergencyPass.slotPlan,
      feasibility: emergencyPass.feasibility,
      selection: emergencyPass.selection,
      slotValidation: emergencyPass.slotValidation,
      safeTemplateUsed: true,
      safeTemplateReason: "catalog_emergency_template",
      slotFailureReasons: emergencyPass.slotValidation.safetyGateReasons,
      aiSelectionDebug: emergencyPass.aiSelectionDebug,
      contractEvaluation: emergencyContract,
      failureStage: "catalog_safe_template",
      degradedContractAttempted: true,
      acceptedWithDegradedContract: true,
      warningReasons: [
        ...safeTemplatePass.feasibility.infeasibleReasons,
        ...emergencyContract.contractGateReason,
      ],
    });
    const emergencyWorkout = finalizeSlotWorkout({
      workout: emergencyValidated.workout,
      input,
      slotDebug: emergencyDebug,
      activePass: emergencyPass,
      trainingHistoryContext,
      candidate: emergencyCandidate,
      validatedWorkout: emergencyValidated,
    });

    return emergencyWorkout
      ? {
          ok: true,
          workout: emergencyWorkout,
        }
      : {
          ok: false,
          status: 500,
          error: "catalog_safe_template kunde inte normaliseras till ett giltigt workout-objekt.",
        };
  }

  if (!safeTemplatePass.slotValidation.slotValidationPassed) {
    const emergencyPass = await runSlotPlanningPass({
      coachContext,
      contractMode: "emergency",
      safeTemplateMode: true,
      skipAiSelection: true,
    });

    if (!emergencyPass.slotValidation.slotValidationPassed) {
      return {
        ok: false,
        status: 500,
        error: `catalog_safe_template kunde inte fylla minimum-kontraktet: ${[
          ...safeTemplatePass.slotValidation.safetyGateReasons,
          ...emergencyPass.slotValidation.safetyGateReasons,
        ]
          .filter((reason, index, values) => values.indexOf(reason) === index)
          .join(", ")}`,
      };
    }

    const emergencyCandidate = buildSlotCandidate({
      selectedFocus: coachContext.selectedFocus,
      durationMinutes: input.durationMinutes,
      selections: emergencyPass.selection.selections,
      coachText: null,
    });
    const emergencyValidated = validateGeneratedWorkout({
      focusContext: buildValidationFocusContext({ input, coachContext }),
      availableEquipment: input.equipment,
      candidate: emergencyCandidate,
      durationMinutes: input.durationMinutes,
      goal: coachContext.goal,
      gym: input.gym,
      gymLabel: input.gymLabel,
      recentExerciseIds: coachContext.recentExerciseIds,
      recentVariantGroups: coachContext.recentVariantGroups,
      weeklyBudget: input.weeklyBudget,
      lessOftenExerciseIds: input.lessOftenExerciseIds,
      avoidSupersets: input.avoidSupersets,
      supersetPreference:
        input.supersetPreference ??
        (input.avoidSupersets ? "avoid_all" : ("allowed" satisfies SupersetPreference)),
    });
    const emergencyContract = evaluateFinalContract({
      slotPlan: emergencyPass.slotPlan,
      selections: emergencyPass.selection.selections,
      workout: emergencyValidated.workout,
      coachContext,
      validationDebug: emergencyValidated.debug.validation,
    });
    const emergencyDebug = buildSlotDebug({
      goalConfigId: emergencyPass.slotPlan.goalConfig.id,
      coachContext,
      slotPlan: emergencyPass.slotPlan,
      feasibility: emergencyPass.feasibility,
      selection: emergencyPass.selection,
      slotValidation: emergencyPass.slotValidation,
      safeTemplateUsed: true,
      safeTemplateReason: "catalog_emergency_template",
      slotFailureReasons: emergencyPass.slotValidation.safetyGateReasons,
      aiSelectionDebug: emergencyPass.aiSelectionDebug,
      contractEvaluation: emergencyContract,
      failureStage: "catalog_safe_template",
      degradedContractAttempted: true,
      acceptedWithDegradedContract: true,
      warningReasons: emergencyContract.contractGateReason,
    });
    const emergencyWorkout = finalizeSlotWorkout({
      workout: emergencyValidated.workout,
      input,
      slotDebug: emergencyDebug,
      activePass: emergencyPass,
      trainingHistoryContext,
      candidate: emergencyCandidate,
      validatedWorkout: emergencyValidated,
    });

    return emergencyWorkout
      ? {
          ok: true,
          workout: emergencyWorkout,
        }
      : {
          ok: false,
          status: 500,
          error: "catalog_safe_template kunde inte normaliseras till ett giltigt workout-objekt.",
        };
  }

  const candidate = buildSlotCandidate({
    selectedFocus: coachContext.selectedFocus,
    durationMinutes: input.durationMinutes,
    selections: safeTemplatePass.selection.selections,
    coachText: null,
  });
  const validated = validateGeneratedWorkout({
    focusContext: buildValidationFocusContext({ input, coachContext }),
    availableEquipment: input.equipment,
    candidate,
    durationMinutes: input.durationMinutes,
    goal: coachContext.goal,
    gym: input.gym,
    gymLabel: input.gymLabel,
    recentExerciseIds: coachContext.recentExerciseIds,
    recentVariantGroups: coachContext.recentVariantGroups,
    weeklyBudget: input.weeklyBudget,
    lessOftenExerciseIds: input.lessOftenExerciseIds,
    avoidSupersets: input.avoidSupersets,
    supersetPreference:
      input.supersetPreference ??
      (input.avoidSupersets ? "avoid_all" : ("allowed" satisfies SupersetPreference)),
  });
  const contractEvaluation = evaluateFinalContract({
    slotPlan: safeTemplatePass.slotPlan,
    selections: safeTemplatePass.selection.selections,
    workout: validated.workout,
    coachContext,
    validationDebug: validated.debug.validation,
  });
  const slotDebug = buildSlotDebug({
    goalConfigId: safeTemplatePass.slotPlan.goalConfig.id,
    coachContext,
    slotPlan: safeTemplatePass.slotPlan,
    feasibility: safeTemplatePass.feasibility,
    selection: safeTemplatePass.selection,
    slotValidation: safeTemplatePass.slotValidation,
    safeTemplateUsed: true,
    safeTemplateReason: "catalog_safe_template",
    slotFailureReasons: safeTemplatePass.slotValidation.safetyGateReasons,
    aiSelectionDebug: safeTemplatePass.aiSelectionDebug,
    contractEvaluation,
    failureStage: "catalog_safe_template",
    degradedContractAttempted: true,
    acceptedWithDegradedContract: true,
    warningReasons: contractEvaluation.contractGateReason,
  });
  const workout = finalizeSlotWorkout({
    workout: validated.workout,
    input,
    slotDebug,
    activePass: safeTemplatePass,
    trainingHistoryContext,
    candidate,
    validatedWorkout: validated,
  });

  return workout
    ? {
        ok: true,
        workout,
      }
    : {
        ok: false,
        status: 500,
        error: "catalog_safe_template kunde inte normaliseras till ett giltigt workout-objekt.",
      };
}
