import type { Workout } from "@/types/workout";

import type { SlotWorkoutDebug, WorkoutGenerationMode } from "@/lib/workout-generation/types";

export function attachWorkoutGenerationDebug(params: {
  workout: Workout;
  generationModeRequested: WorkoutGenerationMode;
  generationEngineUsed: "legacy_ai_chain" | "slot_based_v1";
  generationFallbackUsed: boolean;
  generationFallbackReason: string | null;
  slotValidationPassed: boolean | null;
  legacyValidationPassed: boolean | null;
  finalSafetyGateReasons: string[];
  slotDebug?: SlotWorkoutDebug | null;
}) {
  const existingGenerationContext =
    params.workout.aiDebug?.generationContext &&
    typeof params.workout.aiDebug.generationContext === "object"
      ? (params.workout.aiDebug.generationContext as Record<string, unknown>)
      : {};

  return {
    ...params.workout,
    aiDebug: {
      ...params.workout.aiDebug,
      generationContext: {
        ...existingGenerationContext,
        generationModeRequested: params.generationModeRequested,
        generationEngineUsed: params.generationEngineUsed,
        generationFallbackUsed: params.generationFallbackUsed,
        generationFallbackReason: params.generationFallbackReason,
        slotValidationPassed: params.slotValidationPassed,
        legacyValidationPassed: params.legacyValidationPassed,
        finalSafetyGateReasons: params.finalSafetyGateReasons,
        ...(params.slotDebug
          ? {
              selectedGoalConfig: params.slotDebug.selectedGoalConfig,
              coachDecision: params.slotDebug.coachDecision,
              selectedFocus: params.slotDebug.coachDecision.selectedFocus,
              slotTemplateId: params.slotDebug.slotTemplateId,
              plannedSlots: params.slotDebug.plannedSlots,
              slotReasons: params.slotDebug.slotReasons,
              candidatesPerSlot: params.slotDebug.candidatesPerSlot,
              selectedExercisePerSlot: params.slotDebug.selectedExercisePerSlot,
              rejectedCandidates: params.slotDebug.rejectedCandidates,
              slotCandidateCounts: params.slotDebug.slotCandidateCounts,
              rejectedCandidatesBySlot: params.slotDebug.rejectedCandidatesBySlot,
              slotFailureReasons: params.slotDebug.slotFailureReasons,
              safeTemplateUsed: params.slotDebug.safeTemplateUsed,
              safeTemplateReason: params.slotDebug.safeTemplateReason,
              slotAiRequested: params.slotDebug.slotAiRequested,
              slotAiUsed: params.slotDebug.slotAiUsed,
              slotAiModel: params.slotDebug.slotAiModel,
              slotAiCoachText: params.slotDebug.slotAiCoachText,
              slotAiInvalidChoices: params.slotDebug.slotAiInvalidChoices,
              slotAiError: params.slotDebug.slotAiError,
              recentVariantGroups: params.slotDebug.recentVariantGroups,
              sportFocusRelevantRoles: params.slotDebug.sportFocusRelevantRoles,
              sportFocusProtectedRoles: params.slotDebug.sportFocusProtectedRoles,
              slotRecoveryModificationSummary:
                params.slotDebug.slotRecoveryModificationSummary,
              slotValidationDebug: {
                slotValidationPassed: params.slotDebug.slotValidationPassed,
                missingRequiredSlots: params.slotDebug.missingRequiredSlots,
                invalidSlotExercises: params.slotDebug.invalidSlotExercises,
                safetyGateReasons: params.slotDebug.safetyGateReasons,
                finalSlotCoverage: params.slotDebug.finalSlotCoverage,
                finalWorkoutQualityScore: params.slotDebug.finalWorkoutQualityScore,
              },
            }
          : {}),
      },
    },
  };
}
