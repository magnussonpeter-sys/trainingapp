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
import { selectExercisesForSlots } from "@/lib/workout-generation/exercise-selector";
import { validateSlotWorkout } from "@/lib/workout-generation/slot-validator";
import type { SlotWorkoutDebug, WorkoutGenerationMode } from "@/lib/workout-generation/types";
import type {
  GenerateWorkoutWithAiCoreInput,
  GenerateWorkoutWithAiCoreResult,
  SupersetPreference,
} from "@/lib/workouts/generate-workout-core";

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

function buildSlotCandidate(params: {
  selectedFocus: WorkoutFocus | "recovery_strength";
  durationMinutes: number;
    selections: ReturnType<typeof selectExercisesForSlots>["selections"];
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

function buildSlotDebug(params: {
  goalConfigId: string;
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selection: ReturnType<typeof selectExercisesForSlots>;
  slotValidation: ReturnType<typeof validateSlotWorkout>;
}) {
  return {
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
    slotReasons: params.slotPlan.slots.map((slot) => ({
      slotId: slot.id,
      role: slot.role,
      reason: slot.reason,
    })),
    candidatesPerSlot: params.selection.candidatesPerSlot,
    selectedExercisePerSlot: params.selection.selections,
    rejectedCandidates: params.selection.rejectedCandidates,
    slotValidationPassed: params.slotValidation.slotValidationPassed,
    missingRequiredSlots: params.slotValidation.missingRequiredSlots,
    invalidSlotExercises: params.slotValidation.invalidSlotExercises,
    safetyGateReasons: params.slotValidation.safetyGateReasons,
    finalSlotCoverage: params.slotValidation.finalSlotCoverage,
    finalWorkoutQualityScore: params.slotValidation.finalWorkoutQualityScore,
  } satisfies SlotWorkoutDebug;
}

export async function generateWorkoutWithSlotBasedV1(
  input: GenerateWorkoutWithAiCoreInput & {
    generationMode?: WorkoutGenerationMode | null;
  },
): Promise<GenerateWorkoutWithAiCoreResult> {
  const constraints = getDefaultTrainingConstraints();
  const { coachContext } = buildWorkoutGenerationCoachContext({
    input,
    constraints,
  });
  const slotPlan = buildWorkoutSlotPlan({ coachContext });
  const selection = selectExercisesForSlots({
    slots: slotPlan.slots,
    coachContext,
  });
  const slotValidation = validateSlotWorkout({
    slots: slotPlan.slots,
    selections: selection.selections,
    coachContext,
  });
  const slotDebug = buildSlotDebug({
    goalConfigId: slotPlan.goalConfig.id,
    coachContext,
    slotPlan,
    selection,
    slotValidation,
  });

  if (!slotValidation.slotValidationPassed) {
    return {
      ok: false,
      status: 500,
      error: `slot_based_v1 kunde inte fylla required slots: ${slotValidation.safetyGateReasons.join(", ")}`,
    };
  }

  const candidate = buildSlotCandidate({
    selectedFocus: coachContext.selectedFocus,
    durationMinutes: input.durationMinutes,
    selections: selection.selections,
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
    recentExerciseIds: [],
    recentVariantGroups: [],
    weeklyBudget: input.weeklyBudget,
    lessOftenExerciseIds: input.lessOftenExerciseIds,
    avoidSupersets: input.avoidSupersets,
    supersetPreference:
      input.supersetPreference ??
      (input.avoidSupersets ? "avoid_all" : ("allowed" satisfies SupersetPreference)),
  });

  const parsedWithContext = {
    ...validated.workout,
    goal: input.goal,
    duration: validated.workout.duration ?? input.durationMinutes,
    gym: input.gym,
    gymLabel: input.gymLabel,
    plannedFocus:
      input.selectedPlanMode === "recovery" ? "full_body" : input.nextFocus,
    availableEquipment: input.equipment,
    aiDebug: {
      request: {
        goal: input.goal,
        durationMinutes: input.durationMinutes,
        nextFocus: input.nextFocus,
        selectedPlanMode: input.selectedPlanMode,
        focusIntent: input.focusIntent,
      },
      generationContext: {
        generationModeRequested: input.generationMode ?? "slot_based_v1",
        selectedGoalConfig: slotDebug.selectedGoalConfig,
        coachDecision: slotDebug.coachDecision,
        selectedFocus: slotDebug.coachDecision.selectedFocus,
        slotTemplateId: slotDebug.slotTemplateId,
        plannedSlots: slotDebug.plannedSlots,
        slotReasons: slotDebug.slotReasons,
        candidatesPerSlot: slotDebug.candidatesPerSlot,
        selectedExercisePerSlot: slotDebug.selectedExercisePerSlot,
        rejectedCandidates: slotDebug.rejectedCandidates,
        slotValidationDebug: {
          slotValidationPassed: slotDebug.slotValidationPassed,
          missingRequiredSlots: slotDebug.missingRequiredSlots,
          invalidSlotExercises: slotDebug.invalidSlotExercises,
          safetyGateReasons: slotDebug.safetyGateReasons,
          finalSlotCoverage: slotDebug.finalSlotCoverage,
          finalWorkoutQualityScore: slotDebug.finalWorkoutQualityScore,
        },
      },
      prompt: "slot_based_v1 generated locally from goal config, coach context and slots.",
      rawAiText: JSON.stringify(candidate, null, 2),
      parsedAiResponse: candidate,
      validatedWorkout: validated.debug,
    },
  };
  const normalizedWorkout = normalizePreviewWorkout(parsedWithContext);

  if (!normalizedWorkout) {
    return {
      ok: false,
      status: 500,
      error: "Kunde inte normalisera slot-baserat träningspass",
    };
  }

  return {
    ok: true,
    workout: attachWorkoutGenerationDebug({
      workout: {
        ...normalizedWorkout,
        aiDebug: {
          ...normalizedWorkout.aiDebug,
          normalizedWorkout,
        },
      },
      generationModeRequested: input.generationMode ?? "slot_based_v1",
      generationEngineUsed: "slot_based_v1",
      generationFallbackUsed: false,
      generationFallbackReason: null,
      slotValidationPassed: slotValidation.slotValidationPassed,
      legacyValidationPassed: null,
      finalSafetyGateReasons: slotValidation.safetyGateReasons,
      slotDebug,
    }),
  };
}
