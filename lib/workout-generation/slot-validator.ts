import type {
  SlotWorkoutDebug,
  SlotExerciseSelection,
  WorkoutCoachContext,
  WorkoutSlot,
  WorkoutSlotRole,
} from "@/lib/workout-generation/types";

function getRequiredCoverageSummary(params: {
  focus: WorkoutCoachContext["selectedFocus"];
  selectedRoles: WorkoutSlotRole[];
  durationMinutes: number;
}) {
  const reasons: string[] = [];
  const roles = new Set(params.selectedRoles);

  if (params.durationMinutes >= 15 && params.selectedRoles.length < 3) {
    reasons.push("too_few_exercises_for_duration");
  }

  if (params.focus === "upper_body") {
    if (!roles.has("main_push")) reasons.push("missing_main_push");
    if (!roles.has("main_pull")) reasons.push("missing_main_pull");
  } else if (params.focus === "lower_body") {
    if (!(roles.has("main_squat") || roles.has("unilateral_lower"))) {
      reasons.push("missing_lower_base");
    }
    if (!roles.has("main_hinge")) {
      reasons.push("missing_hinge_or_glute");
    }
  } else if (params.focus === "recovery_strength") {
    if (!(roles.has("main_pull") || roles.has("main_push"))) {
      reasons.push("missing_light_pull_or_push");
    }
    if (!(roles.has("recovery_light") || roles.has("main_hinge") || roles.has("main_squat"))) {
      reasons.push("missing_light_glute_or_hinge");
    }
    if (!(roles.has("core") || roles.has("carry") || roles.has("rehab_control"))) {
      reasons.push("missing_light_core_or_control");
    }
  } else {
    if (!(roles.has("main_squat") || roles.has("unilateral_lower"))) {
      reasons.push("missing_full_body_lower");
    }
    if (!roles.has("main_push")) reasons.push("missing_full_body_push");
    if (!roles.has("main_pull")) reasons.push("missing_full_body_pull");
    if (!roles.has("main_hinge")) reasons.push("missing_full_body_hinge");
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
    ...getRequiredCoverageSummary({
      focus: params.coachContext.selectedFocus,
      selectedRoles,
      durationMinutes: params.coachContext.durationMinutes,
    }),
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
