import type { Workout } from "@/types/workout";

import { attachWorkoutGenerationDebug } from "@/lib/workout-generation/debug";
import { runLegacyWorkoutGeneration } from "@/lib/workout-generation/legacy-adapter";
import { generateWorkoutWithSlotBasedV1 } from "@/lib/workout-generation/slot-engine";
import type { WorkoutGenerationMode } from "@/lib/workout-generation/types";
import { normalizeWorkoutGenerationMode } from "@/lib/workout-generation/types";
import type {
  GenerateWorkoutWithAiCoreInput,
  GenerateWorkoutWithAiCoreResult,
} from "@/lib/workouts/generate-workout-core";

type SafetyGateResult = {
  passed: boolean;
  reasons: string[];
};

export type GenerateWorkoutWithModeInput = GenerateWorkoutWithAiCoreInput & {
  generationMode?: WorkoutGenerationMode | null;
};

function getDefaultGenerationMode(): WorkoutGenerationMode {
  return normalizeWorkoutGenerationMode(
    process.env.WORKOUT_GENERATION_MODE,
    "legacy_ai_chain",
  );
}

function getExerciseCount(workout: Workout) {
  return workout.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
}

function getValidationDebug(workout: Workout) {
  const debug =
    workout.aiDebug?.validatedWorkout &&
    typeof workout.aiDebug.validatedWorkout === "object"
      ? (workout.aiDebug.validatedWorkout as Record<string, unknown>)
      : null;

  if (!debug) {
    return null;
  }

  const nested =
    debug.validation && typeof debug.validation === "object"
      ? (debug.validation as Record<string, unknown>)
      : null;

  return nested ?? debug;
}

function evaluateFinalSafetyGate(workout: Workout): SafetyGateResult {
  const reasons: string[] = [];
  const validation = getValidationDebug(workout) as Record<string, unknown> | null;
  const exerciseCount = getExerciseCount(workout);
  const duration = typeof workout.duration === "number" ? workout.duration : 0;
  const focus = workout.plannedFocus ?? null;
  const mustKeepViolations = Array.isArray(validation?.mustKeepViolations)
    ? validation.mustKeepViolations.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];
  const offFocusViolations = Array.isArray(validation?.offFocusViolations)
    ? validation.offFocusViolations.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];
  const focusIntegrityScore =
    typeof validation?.focusIntegrityScore === "number"
      ? validation.focusIntegrityScore
      : null;
  const qualityPreservationScore =
    typeof validation?.qualityPreservationScore === "number"
      ? validation.qualityPreservationScore
      : null;
  const validationContext =
    validation?.validationContext && typeof validation.validationContext === "object"
      ? (validation.validationContext as {
          plannedFocus?: string | null;
        })
      : null;
  const finalExercises = Array.isArray(validation?.finalExercises)
    ? validation.finalExercises.filter(
        (value): value is {
          exerciseRole?: string;
          qualityRoles?: string[];
        } => Boolean(value && typeof value === "object"),
      )
    : [];
  const hasRole = (role: string) =>
    finalExercises.some((exercise) => exercise.exerciseRole === role);
  const hasQualityRole = (role: string) =>
    finalExercises.some(
      (exercise) =>
        Array.isArray(exercise.qualityRoles) && exercise.qualityRoles.includes(role),
    );

  if (exerciseCount === 0) reasons.push("no_exercises");
  if (duration >= 15 && exerciseCount < 3) reasons.push("too_few_exercises_for_duration");
  if (focusIntegrityScore !== null && focusIntegrityScore < 70) {
    reasons.push("focus_integrity_below_threshold");
  }
  if (qualityPreservationScore !== null && qualityPreservationScore < 60) {
    reasons.push("quality_preservation_below_threshold");
  }
  if (mustKeepViolations.length > 0) reasons.push("must_keep_violations");
  if (offFocusViolations.length > 0) reasons.push("off_focus_violations");

  if (focus === "lower_body") {
    if (!(hasRole("primary_squat") || hasRole("secondary_lunge"))) {
      reasons.push("lower_body_missing_knee_dominant");
    }
    if (
      !(hasRole("primary_hinge") || hasRole("glute_accessory") || hasRole("hamstring_accessory"))
    ) {
      reasons.push("lower_body_missing_hinge_or_glute");
    }
  } else if (focus === "upper_body") {
    if (!(hasQualityRole("main_push") || hasRole("primary_press") || hasRole("triceps_press"))) {
      reasons.push("upper_body_missing_press");
    }
    if (!(hasQualityRole("main_pull") || hasRole("primary_pull"))) {
      reasons.push("upper_body_missing_pull");
    }
  } else if (focus === "full_body") {
    if (!(hasQualityRole("main_push") || hasRole("primary_press") || hasRole("triceps_press"))) {
      reasons.push("full_body_missing_press");
    }
    if (!(hasQualityRole("main_pull") || hasRole("primary_pull"))) {
      reasons.push("full_body_missing_pull");
    }
    if (!(hasQualityRole("squat_or_lunge") || hasRole("primary_squat") || hasRole("secondary_lunge"))) {
      reasons.push("full_body_missing_lower_base");
    }
  }

  if (validationContext?.plannedFocus === "recovery_strength") {
    const safeRecoveryRoleCount = [
      hasQualityRole("main_pull"),
      hasQualityRole("main_push") ||
        hasRole("glute_accessory") ||
        hasRole("hamstring_accessory"),
      hasQualityRole("core") || hasRole("core"),
    ].filter(Boolean).length;

    if (duration >= 15 && safeRecoveryRoleCount < 3) {
      reasons.push("recovery_strength_missing_light_roles");
    }
  }

  return { passed: reasons.length === 0, reasons };
}

async function runLegacyEngine(
  input: GenerateWorkoutWithModeInput,
): Promise<{
  result: GenerateWorkoutWithAiCoreResult;
  safety: SafetyGateResult | null;
}> {
  const result = await runLegacyWorkoutGeneration(input);
  if (!result.ok) return { result, safety: null };

  const safety = evaluateFinalSafetyGate(result.workout);
  return {
    result: {
      ok: true,
      workout: attachWorkoutGenerationDebug({
        workout: result.workout,
        generationModeRequested:
          normalizeWorkoutGenerationMode(input.generationMode),
        generationEngineUsed: "legacy_ai_chain",
        generationFallbackUsed: false,
        generationFallbackReason: null,
        slotValidationPassed: null,
        legacyValidationPassed: safety.passed,
        finalSafetyGateReasons: safety.reasons,
        slotDebug: null,
      }),
    },
    safety,
  };
}

async function runSlotEngine(
  input: GenerateWorkoutWithModeInput,
): Promise<{
  result: GenerateWorkoutWithAiCoreResult;
  safety: SafetyGateResult | null;
}> {
  const result = await generateWorkoutWithSlotBasedV1(input);
  if (!result.ok) return { result, safety: null };

  const safety = evaluateFinalSafetyGate(result.workout);
  return {
    result: {
      ok: true,
      workout: attachWorkoutGenerationDebug({
        workout: result.workout,
        generationModeRequested:
          normalizeWorkoutGenerationMode(input.generationMode),
        generationEngineUsed: "slot_based_v1",
        generationFallbackUsed: false,
        generationFallbackReason: null,
        slotValidationPassed: safety.passed,
        legacyValidationPassed: null,
        finalSafetyGateReasons: safety.reasons,
        slotDebug: null,
      }),
    },
    safety,
  };
}

export async function generateWorkoutWithMode(
  input: GenerateWorkoutWithModeInput,
): Promise<GenerateWorkoutWithAiCoreResult> {
  const requestedMode = normalizeWorkoutGenerationMode(
    input.generationMode,
    getDefaultGenerationMode(),
  );

  if (requestedMode === "legacy_ai_chain") {
    const { result } = await runLegacyEngine(input);
    return result;
  }

  if (requestedMode === "slot_based_v1") {
    const { result } = await runSlotEngine(input);
    return result;
  }

  const slotRun = await runSlotEngine(input);
  if (slotRun.result.ok && slotRun.safety?.passed) {
    return {
      ok: true,
      workout: attachWorkoutGenerationDebug({
        workout: slotRun.result.workout,
        generationModeRequested: requestedMode,
        generationEngineUsed: "slot_based_v1",
        generationFallbackUsed: false,
        generationFallbackReason: null,
        slotValidationPassed: true,
        legacyValidationPassed: null,
        finalSafetyGateReasons: slotRun.safety.reasons,
        slotDebug: null,
      }),
    };
  }

  const fallbackReason = slotRun.result.ok
    ? slotRun.safety?.reasons.join(", ") || "slot_safety_gate_failed"
    : slotRun.result.error;
  const legacyRun = await runLegacyEngine({
    ...input,
    generationMode: "legacy_ai_chain",
  });
  if (!legacyRun.result.ok) {
    return legacyRun.result;
  }

  return {
    ok: true,
    workout: attachWorkoutGenerationDebug({
      workout: legacyRun.result.workout,
      generationModeRequested: requestedMode,
      generationEngineUsed: "legacy_ai_chain",
      generationFallbackUsed: true,
      generationFallbackReason: fallbackReason,
      slotValidationPassed: slotRun.safety?.passed ?? false,
      legacyValidationPassed: legacyRun.safety?.passed ?? null,
      finalSafetyGateReasons: legacyRun.safety?.reasons ?? [],
      slotDebug: null,
    }),
  };
}

export async function generateWorkoutForSpecificEngine(params: {
  engine: "legacy_ai_chain" | "slot_based_v1";
  input: GenerateWorkoutWithModeInput;
}) {
  return params.engine === "legacy_ai_chain"
    ? runLegacyEngine({
        ...params.input,
        generationMode: "legacy_ai_chain",
      })
    : runSlotEngine({
        ...params.input,
        generationMode: "slot_based_v1",
      });
}
