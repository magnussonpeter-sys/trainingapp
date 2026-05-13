import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import type { Workout, WorkoutAiDebug } from "@/types/workout";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactAiDebug(value: WorkoutAiDebug | undefined): WorkoutAiDebug | undefined {
  if (!value) {
    return undefined;
  }

  const generationContext = isRecord(value.generationContext)
    ? value.generationContext
    : null;
  const validation = isRecord(value.validation) ? value.validation : null;
  const request = isRecord(value.request) ? value.request : null;

  // Preview/run behöver bara en liten sammanfattning av AI-debug.
  // Stora kandidatlistor och rå text sparas separat i analyslagret.
  return {
    request: request
      ? {
          goal: request.goal,
          durationMinutes: request.durationMinutes,
          equipment: request.equipment,
          gym: request.gym,
          gymLabel: request.gymLabel,
          nextFocus: request.nextFocus,
          generationMode: request.generationMode,
        }
      : undefined,
    generationContext: generationContext
      ? {
          generationModeRequested: generationContext.generationModeRequested,
          generationEngineUsed: generationContext.generationEngineUsed,
          generationFallbackUsed: generationContext.generationFallbackUsed,
          generationFallbackReason: generationContext.generationFallbackReason,
          selectedFocus: generationContext.selectedFocus,
          slotTemplateId: generationContext.slotTemplateId,
          slotValidationPassed: generationContext.slotValidationPassed,
          legacyValidationPassed: generationContext.legacyValidationPassed,
          finalSafetyGateReasons: generationContext.finalSafetyGateReasons,
          safeTemplateUsed: generationContext.safeTemplateUsed,
          safeTemplateReason: generationContext.safeTemplateReason,
          fallbackMode: generationContext.fallbackMode,
          contractGateTriggered: generationContext.contractGateTriggered,
          contractGateReason: generationContext.contractGateReason,
          finalContractPassed: generationContext.finalContractPassed,
        }
      : undefined,
    validation: validation
      ? {
          focusIntegrityScore: validation.focusIntegrityScore,
          qualityPreservationScore: validation.qualityPreservationScore,
          strengthSpecificityScore: validation.strengthSpecificityScore,
          mustKeepViolations: validation.mustKeepViolations,
          offFocusViolations: validation.offFocusViolations,
          finalExercises: validation.finalExercises,
        }
      : undefined,
    prompt: undefined,
    rawAiText: undefined,
    parsedAiResponse: undefined,
    validatedWorkout: undefined,
    normalizedWorkout: undefined,
  };
}

export function prepareWorkoutForStorage(workout: unknown): Workout | null {
  const normalized = normalizePreviewWorkout(workout);
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    aiDebug: compactAiDebug(normalized.aiDebug),
  };
}
