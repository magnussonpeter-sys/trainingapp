import {
  getAvailableExercises,
  getSportRelevanceHint,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type {
  RankedExerciseCandidate,
  RecoverySeverity,
  SlotExerciseSelection,
  TrainingConstraint,
  WorkoutCoachContext,
  WorkoutSlot,
  WorkoutSlotRole,
} from "@/lib/workout-generation/types";

function getExerciseRoleCandidates(exercise: ExerciseCatalogItem): WorkoutSlotRole[] {
  const roles = new Set<WorkoutSlotRole>();

  if (
    exercise.movementPattern === "horizontal_push" ||
    exercise.movementPattern === "vertical_push"
  ) {
    roles.add("main_push");
  }
  if (
    exercise.movementPattern === "horizontal_pull" ||
    exercise.movementPattern === "vertical_pull"
  ) {
    roles.add("main_pull");
  }
  if (exercise.movementPattern === "squat") {
    roles.add("main_squat");
  }
  if (exercise.movementPattern === "hinge") {
    roles.add("main_hinge");
  }
  if (exercise.movementPattern === "lunge" && exercise.sidedness === "per_side") {
    roles.add("unilateral_lower");
  }
  if (exercise.primaryMuscles.includes("biceps")) {
    roles.add("direct_biceps");
  }
  if (exercise.primaryMuscles.includes("triceps")) {
    roles.add("direct_triceps");
  }
  if (
    exercise.primaryMuscles.includes("shoulders") ||
    exercise.primaryMuscles.includes("rear_delts") ||
    exercise.id.includes("face_pull")
  ) {
    roles.add("shoulder_accessory");
    roles.add("rear_delt_scapula");
  }
  if (exercise.primaryMuscles.includes("calves")) {
    roles.add("calves");
  }
  if (exercise.movementPattern === "core") {
    roles.add("core");
    roles.add("rehab_control");
    roles.add("recovery_light");
  }
  if (exercise.movementPattern === "carry") {
    roles.add("carry");
  }
  if (exercise.riskLevel !== "high") {
    roles.add("optional_accessory");
    roles.add("recovery_light");
  }

  return Array.from(roles);
}

function getRecoverySeverityForExercise(params: {
  exercise: ExerciseCatalogItem;
  coachContext: WorkoutCoachContext;
}) {
  const severityByMuscle = new Map(
    params.coachContext.recoverySummary.recoverySeverityByMuscle.map((entry) => [
      entry.muscle,
      entry.severity,
    ]),
  );

  const severities = [
    ...params.exercise.primaryMuscles,
    ...(params.exercise.secondaryMuscles ?? []),
  ]
    .map((muscle) => severityByMuscle.get(muscle as MuscleBudgetGroup) ?? "none")
    .filter(Boolean) as RecoverySeverity[];

  if (severities.includes("hard_blocked")) return "hard_blocked" as RecoverySeverity;
  if (severities.includes("avoid_heavy_loading")) {
    return "avoid_heavy_loading" as RecoverySeverity;
  }
  if (severities.includes("allow_light_recovery")) {
    return "allow_light_recovery" as RecoverySeverity;
  }

  return "none" as RecoverySeverity;
}

function violatesConstraint(params: {
  exercise: ExerciseCatalogItem;
  constraints: TrainingConstraint[];
}) {
  return params.constraints.some(
    (constraint) =>
      constraint.blockedExerciseIds?.includes(params.exercise.id) ||
      constraint.avoidTags?.some(
        (tag) =>
          params.exercise.id.includes(tag) ||
          params.exercise.name.toLowerCase().includes(tag.replace(/_/g, " ")),
      ),
  );
}

function scoreExerciseForSlot(params: {
  exercise: ExerciseCatalogItem;
  slot: WorkoutSlot;
  coachContext: WorkoutCoachContext;
  usedVariantGroups: string[];
}) {
  const scoreBreakdown: RankedExerciseCandidate["scoreBreakdown"] = [];
  const rejectedReasons: string[] = [];
  const roles = getExerciseRoleCandidates(params.exercise);
  const matchedSlotRole = roles.includes(params.slot.role);
  let score = 0;

  if (!matchedSlotRole) {
    rejectedReasons.push("role_mismatch");
    return {
      score: -10_000,
      matchedSlotRole,
      scoreBreakdown,
      rejectedReasons,
    };
  }

  score += 100;
  scoreBreakdown.push({
    code: "role_match",
    amount: 100,
    reason: `Övningen matchar slotrollen ${params.slot.role}.`,
  });

  if (
    params.slot.allowedMovementPatterns &&
    !params.slot.allowedMovementPatterns.includes(params.exercise.movementPattern)
  ) {
    rejectedReasons.push("movement_pattern_not_allowed");
    score -= 1000;
  }

  if (
    params.slot.blockedMovementPatterns?.includes(params.exercise.movementPattern)
  ) {
    rejectedReasons.push("movement_pattern_blocked");
    score -= 1000;
  }

  const recoverySeverity = getRecoverySeverityForExercise({
    exercise: params.exercise,
    coachContext: params.coachContext,
  });
  if (recoverySeverity === "hard_blocked") {
    rejectedReasons.push("recovery_hard_block");
    score -= 5_000;
  } else if (
    recoverySeverity === "avoid_heavy_loading" &&
    params.slot.intensityHint === "hard"
  ) {
    score -= 30;
    scoreBreakdown.push({
      code: "recovery_penalty",
      amount: -30,
      reason: "Muskeln är recovery-limited och tung belastning bör undvikas.",
    });
  } else if (
    recoverySeverity === "allow_light_recovery" &&
    params.slot.intensityHint === "light"
  ) {
    score += 10;
    scoreBreakdown.push({
      code: "light_recovery_match",
      amount: 10,
      reason: "Övningen passar som lätt återhämtningsvariant.",
    });
  }

  if (violatesConstraint({ exercise: params.exercise, constraints: params.coachContext.injuryConstraints })) {
    rejectedReasons.push("constraint_blocked");
    score -= 5_000;
  }

  const focusPriorityMatches = params.coachContext.focusCompatiblePriorities.filter(
    (muscle) =>
      params.exercise.primaryMuscles.includes(muscle) ||
      params.exercise.secondaryMuscles?.includes(muscle),
  ).length;
  if (focusPriorityMatches > 0) {
    const bonus = focusPriorityMatches * 12;
    score += bonus;
    scoreBreakdown.push({
      code: "focus_priority_match",
      amount: bonus,
      reason: "Övningen träffar fokuskompatibla prioriteringar.",
    });
  }

  const sportRelevance = getSportRelevanceHint(
    params.exercise,
    params.coachContext.sportFocus,
  );
  if (sportRelevance > 0) {
    const bonus = sportRelevance * 5;
    score += bonus;
    scoreBreakdown.push({
      code: "sport_relevance",
      amount: bonus,
      reason: "Övningen har relevant sportkoppling.",
    });
  }

  if (params.usedVariantGroups.includes(params.exercise.variantGroup)) {
    score -= 18;
    scoreBreakdown.push({
      code: "variant_repeat_penalty",
      amount: -18,
      reason: "Variantgruppen har redan använts i passet.",
    });
  } else {
    score += 8;
    scoreBreakdown.push({
      code: "fresh_variant_bonus",
      amount: 8,
      reason: "Ny variantgrupp ger bättre variation inom slotmodellen.",
    });
  }

  if (params.exercise.riskLevel === "low") {
    score += 8;
  } else if (
    params.coachContext.experienceLevel === "beginner" &&
    params.exercise.riskLevel === "high"
  ) {
    rejectedReasons.push("risk_too_high_for_beginner");
    score -= 2_000;
  }

  return {
    score,
    matchedSlotRole,
    scoreBreakdown,
    rejectedReasons,
  };
}

export function getCandidatesForSlot(params: {
  slot: WorkoutSlot;
  coachContext: WorkoutCoachContext;
  usedVariantGroups: string[];
}) {
  const exercises = getAvailableExercises(params.coachContext.selectedEquipment);

  return exercises
    .map((exercise) => {
      const scoring = scoreExerciseForSlot({
        exercise,
        slot: params.slot,
        coachContext: params.coachContext,
        usedVariantGroups: params.usedVariantGroups,
      });

      return {
        exercise,
        candidate: {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          slotRole: params.slot.role,
          score: scoring.score,
          scoreBreakdown: scoring.scoreBreakdown,
          rejectedReasons: scoring.rejectedReasons,
        } satisfies RankedExerciseCandidate,
      };
    })
    .sort((left, right) => right.candidate.score - left.candidate.score);
}

export function selectExercisesForSlots(params: {
  slots: WorkoutSlot[];
  coachContext: WorkoutCoachContext;
}) {
  const usedVariantGroups: string[] = [];
  const selections: SlotExerciseSelection[] = [];
  const candidatesPerSlot: Record<string, RankedExerciseCandidate[]> = {};
  const rejectedCandidates: Record<string, RankedExerciseCandidate[]> = {};

  for (const slot of params.slots) {
    const ranked = getCandidatesForSlot({
      slot,
      coachContext: params.coachContext,
      usedVariantGroups,
    });
    const accepted = ranked
      .filter((entry) => entry.candidate.score > 0)
      .slice(0, 8);
    const rejected = ranked
      .filter((entry) => entry.candidate.score <= 0)
      .slice(0, 8);

    candidatesPerSlot[slot.id] = accepted.map((entry) => entry.candidate);
    rejectedCandidates[slot.id] = rejected.map((entry) => entry.candidate);

    const selected = accepted[0];
    if (!selected) {
      continue;
    }

    usedVariantGroups.push(selected.exercise.variantGroup);
    selections.push({
      slotId: slot.id,
      role: slot.role,
      exerciseId: selected.exercise.id,
      exerciseName: selected.exercise.name,
      reason:
        selected.candidate.scoreBreakdown[0]?.reason ??
        "Valdes som högst rankad kandidat inom sloten.",
      selectionSource: "local_rank",
      candidates: accepted.map((entry) => entry.candidate),
    });
  }

  return {
    selections,
    candidatesPerSlot,
    rejectedCandidates,
  };
}
