import type {
  SlotWorkoutDebug,
  SlotExerciseSelection,
  WorkoutCoachContext,
  WorkoutSlot,
} from "@/lib/workout-generation/types";

function getContractCoverageSummary(params: {
  durationMinutes: number;
}) {
  const reasons: string[] = [];

  // Slot-kontraktet avgör vilka roller som krävs. Här lägger vi bara på
  // generella minimikrav som gäller oavsett fokus eller kontraktsläge.
  if (params.durationMinutes >= 15) {
    reasons.push("too_few_exercises_for_duration");
  }

  return reasons;
}

function hasLoadedMainLift(selections: SlotExerciseSelection[]) {
  return selections.some(
    (selection) =>
      ["main_push", "main_pull", "main_squat", "main_hinge"].includes(selection.role) &&
      selection.requiredEquipment.some((equipment) => equipment !== "bodyweight"),
  );
}

export function validateSlotWorkout(params: {
  slots: WorkoutSlot[];
  selections: SlotExerciseSelection[];
  coachContext: WorkoutCoachContext;
}) {
  const missingRequiredSlots = params.slots
    .filter(
      (slot) =>
        slot.required &&
        !params.selections.some((selection) => selection.slotId === slot.id),
    )
    .map((slot) => slot.id);

  const invalidSlotExercises = params.selections
    .filter((selection) => {
      const slot = params.slots.find((candidateSlot) => candidateSlot.id === selection.slotId);

      return (
        !slot ||
        !slot.allowedRoles.includes(selection.role) ||
        (selection.candidates.length > 0 &&
          !selection.candidates.some(
            (candidate) =>
              candidate.exerciseId === selection.exerciseId &&
              candidate.matchedRole === selection.role,
          ))
      );
    })
    .map((selection) => selection.exerciseName);

  const selectedRoles = params.selections.map((selection) => selection.role);
  const contractViolations = [
    ...missingRequiredSlots.map((slotId) => `missing_required_slot:${slotId}`),
    ...invalidSlotExercises.map((name) => `invalid_slot_exercise:${name}`),
  ];

  if (
    params.coachContext.goal === "strength" &&
    !hasLoadedMainLift(params.selections)
  ) {
    contractViolations.push("missing_loaded_main_lift_for_strength");
  }

  const safetyGateReasons = [
    ...contractViolations,
    ...(params.selections.length < 3
      ? getContractCoverageSummary({
          durationMinutes: params.coachContext.durationMinutes,
        })
      : []),
  ];

  const slotValidationPassed = safetyGateReasons.length === 0;

  return {
    slotValidationPassed,
    missingRequiredSlots,
    invalidSlotExercises,
    contractViolations,
    safetyGateReasons,
    finalSlotCoverage: selectedRoles,
    finalContractPassed: contractViolations.length === 0,
    finalWorkoutQualityScore: Math.max(
      0,
      100 -
        missingRequiredSlots.length * 25 -
        invalidSlotExercises.length * 20 -
        contractViolations.filter((reason) => reason.includes("loaded_main_lift")).length * 15 -
        Math.max(0, 5 - params.selections.length) * 6,
    ),
  } satisfies Pick<
    SlotWorkoutDebug,
    | "slotValidationPassed"
    | "missingRequiredSlots"
    | "invalidSlotExercises"
    | "contractViolations"
    | "safetyGateReasons"
    | "finalSlotCoverage"
    | "finalContractPassed"
    | "finalWorkoutQualityScore"
  >;
}
