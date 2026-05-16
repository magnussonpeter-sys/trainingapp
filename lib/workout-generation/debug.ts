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
  const existingValidation =
    params.workout.aiDebug?.validation &&
    typeof params.workout.aiDebug.validation === "object"
      ? (params.workout.aiDebug.validation as Record<string, unknown>)
      : {};

  return {
    ...params.workout,
    aiDebug: {
      ...params.workout.aiDebug,
      validation: {
        ...existingValidation,
        ...(params.slotDebug
          ? {
              slotModel: {
                feasible: params.slotDebug.feasible,
                infeasibleReasons: params.slotDebug.infeasibleReasons,
                missingRoles: params.slotDebug.missingRoles,
                availableRoles: params.slotDebug.availableRoles,
                equipmentLimitations: params.slotDebug.equipmentLimitations,
                displayDurationMinutes: params.slotDebug.displayDurationMinutes,
                planningDurationBucket: params.slotDebug.planningDurationBucket,
                timeBudgetMinutes: params.slotDebug.timeBudgetMinutes,
                durationBucketReason: params.slotDebug.durationBucketReason,
                selectedFallbackStrategy:
                  params.slotDebug.selectedFallbackStrategy,
                contractBeforeFeasibility:
                  params.slotDebug.contractBeforeFeasibility,
                contractAfterFeasibility:
                  params.slotDebug.contractAfterFeasibility,
                contractSlots: params.slotDebug.contractSlots,
                requiredSlots: params.slotDebug.requiredSlots,
                protectedSlots: params.slotDebug.protectedSlots,
                recoveredProtectedSlots: params.slotDebug.recoveredProtectedSlots,
                optionalSlots: params.slotDebug.optionalSlots,
                candidatesPerSlot: params.slotDebug.candidatesPerSlot,
                selectedPerSlot: params.slotDebug.selectedExercisePerSlot,
                selectedBeforeNormalization:
                  params.slotDebug.selectedExercisePerSlot,
                selectedScorePerSlot: params.slotDebug.selectedScorePerSlot,
                selectedScoreBreakdown: params.slotDebug.selectedScoreBreakdown,
                candidateExercisesBySlot: params.slotDebug.candidatesPerSlot,
                rejectedCandidatesWithReason:
                  params.slotDebug.rejectedCandidates,
                rejectedCandidatesTopReasons:
                  params.slotDebug.rejectedCandidatesTopReasons,
                contractViolations: params.slotDebug.contractViolations,
                contractFailureStage: params.slotDebug.contractFailureStage,
                failedSlots: params.slotDebug.failedSlots,
                missingSlot: params.slotDebug.missingRequiredSlots[0] ?? null,
                failedRoleFamilies: params.slotDebug.failedRoleFamilies,
                candidatesPerFailedSlot: params.slotDebug.candidatesPerFailedSlot,
                rejectedCandidatesPerFailedSlot:
                  params.slotDebug.rejectedCandidatesPerFailedSlot,
                rejectedBecauseEquipment:
                  params.slotDebug.rejectedBecauseEquipment,
                rejectedBecauseRecovery: params.slotDebug.rejectedBecauseRecovery,
                rejectedBecauseRoleMismatch:
                  params.slotDebug.rejectedBecauseRoleMismatch,
                rejectedBecauseRisk: params.slotDebug.rejectedBecauseRisk,
                repairedSlots: params.slotDebug.repairedSlots,
                repairLog: params.slotDebug.repairLog,
                fallbackMode:
                  params.slotDebug.fallbackMode ??
                  (params.slotDebug.safeTemplateUsed ? "safe_template" : "none"),
                safeTemplateAttempted: params.slotDebug.safeTemplateAttempted,
                safeTemplateExercises: params.slotDebug.safeTemplateExercises,
                safeTemplateRejectedReason:
                  params.slotDebug.safeTemplateRejectedReason,
                degradedContractAttempted:
                  params.slotDebug.degradedContractAttempted,
                degradedContractSlots: params.slotDebug.degradedContractSlots,
                degradedContractRejectedReason:
                  params.slotDebug.degradedContractRejectedReason,
                acceptedWithDegradedContract:
                  params.slotDebug.acceptedWithDegradedContract,
                acceptedWithWarnings: params.slotDebug.acceptedWithWarnings,
                warningReasons: params.slotDebug.warningReasons,
                fallbackMockReason: params.slotDebug.fallbackMockReason,
                contractGateTriggered: params.slotDebug.contractGateTriggered,
                contractGateReason: params.slotDebug.contractGateReason,
                finalContractPassed: params.slotDebug.finalContractPassed,
                sportRelevantSlots: params.slotDebug.sportRelevantSlots,
                sportLossReason: params.slotDebug.sportLossReason,
                goalLossReason: params.slotDebug.goalLossReason,
                repeatedVariantGroups: params.slotDebug.repeatedVariantGroups,
                variationPenaltyApplied:
                  params.slotDebug.variationPenaltyApplied,
                normalizationRemovedExercisesWithReason:
                  params.slotDebug.slotFailureReasons,
              },
            }
          : {}),
      },
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
              feasible: params.slotDebug.feasible,
              infeasibleReasons: params.slotDebug.infeasibleReasons,
              missingRoles: params.slotDebug.missingRoles,
              availableRoles: params.slotDebug.availableRoles,
              equipmentLimitations: params.slotDebug.equipmentLimitations,
              displayDurationMinutes: params.slotDebug.displayDurationMinutes,
              planningDurationBucket: params.slotDebug.planningDurationBucket,
              timeBudgetMinutes: params.slotDebug.timeBudgetMinutes,
              durationBucketReason: params.slotDebug.durationBucketReason,
              selectedFallbackStrategy:
                params.slotDebug.selectedFallbackStrategy,
              contractBeforeFeasibility:
                params.slotDebug.contractBeforeFeasibility,
              contractAfterFeasibility:
                params.slotDebug.contractAfterFeasibility,
              coachDecision: params.slotDebug.coachDecision,
              selectedFocus: params.slotDebug.coachDecision.selectedFocus,
              slotTemplateId: params.slotDebug.slotTemplateId,
              plannedSlots: params.slotDebug.plannedSlots,
              contractSlots: params.slotDebug.contractSlots,
              requiredSlots: params.slotDebug.requiredSlots,
              protectedSlots: params.slotDebug.protectedSlots,
              recoveredProtectedSlots: params.slotDebug.recoveredProtectedSlots,
              slotReasons: params.slotDebug.slotReasons,
              candidatesPerSlot: params.slotDebug.candidatesPerSlot,
              selectedExercisePerSlot: params.slotDebug.selectedExercisePerSlot,
              selectedScorePerSlot: params.slotDebug.selectedScorePerSlot,
              selectedScoreBreakdown: params.slotDebug.selectedScoreBreakdown,
              rejectedCandidates: params.slotDebug.rejectedCandidates,
              rejectedCandidatesTopReasons:
                params.slotDebug.rejectedCandidatesTopReasons,
              slotCandidateCounts: params.slotDebug.slotCandidateCounts,
              rejectedCandidatesBySlot: params.slotDebug.rejectedCandidatesBySlot,
              contractFailureStage: params.slotDebug.contractFailureStage,
              failedSlots: params.slotDebug.failedSlots,
              optionalSlots: params.slotDebug.optionalSlots,
              failedRoleFamilies: params.slotDebug.failedRoleFamilies,
              candidatesPerFailedSlot: params.slotDebug.candidatesPerFailedSlot,
              rejectedCandidatesPerFailedSlot:
                params.slotDebug.rejectedCandidatesPerFailedSlot,
              rejectedBecauseEquipment:
                params.slotDebug.rejectedBecauseEquipment,
              rejectedBecauseRecovery: params.slotDebug.rejectedBecauseRecovery,
              rejectedBecauseRoleMismatch:
                params.slotDebug.rejectedBecauseRoleMismatch,
              rejectedBecauseRisk: params.slotDebug.rejectedBecauseRisk,
              contractViolations: params.slotDebug.contractViolations,
              repairedSlots: params.slotDebug.repairedSlots,
              repairLog: params.slotDebug.repairLog,
              slotFailureReasons: params.slotDebug.slotFailureReasons,
              fallbackMode: params.slotDebug.fallbackMode,
              safeTemplateAttempted: params.slotDebug.safeTemplateAttempted,
              safeTemplateExercises: params.slotDebug.safeTemplateExercises,
              safeTemplateRejectedReason:
                params.slotDebug.safeTemplateRejectedReason,
              degradedContractAttempted:
                params.slotDebug.degradedContractAttempted,
              degradedContractSlots: params.slotDebug.degradedContractSlots,
              degradedContractRejectedReason:
                params.slotDebug.degradedContractRejectedReason,
              acceptedWithDegradedContract:
                params.slotDebug.acceptedWithDegradedContract,
              acceptedWithWarnings: params.slotDebug.acceptedWithWarnings,
              warningReasons: params.slotDebug.warningReasons,
              fallbackMockReason: params.slotDebug.fallbackMockReason,
              contractGateTriggered: params.slotDebug.contractGateTriggered,
              contractGateReason: params.slotDebug.contractGateReason,
              retryAttempted: params.slotDebug.retryAttempted,
              retryReason: params.slotDebug.retryReason,
              finalContractPassed: params.slotDebug.finalContractPassed,
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
              sportRelevantSlots: params.slotDebug.sportRelevantSlots,
              sportLossReason: params.slotDebug.sportLossReason,
              goalLossReason: params.slotDebug.goalLossReason,
              repeatedVariantGroups: params.slotDebug.repeatedVariantGroups,
              variationPenaltyApplied:
                params.slotDebug.variationPenaltyApplied,
              fallbackBiasWarning: params.slotDebug.fallbackBiasWarning,
              slotRecoveryModificationSummary:
                params.slotDebug.slotRecoveryModificationSummary,
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
            }
          : {}),
      },
    },
  };
}
