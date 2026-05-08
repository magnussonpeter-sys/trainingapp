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

function isLoadedStrengthCandidate(exercise: ExerciseCatalogItem) {
  return [
    "bench_press",
    "row",
    "romanian_deadlift",
    "deadlift",
    "squat",
    "lunge",
    "pull_up",
    "lat_pulldown",
    "overhead_press",
  ].includes(exercise.variantGroup);
}

function getSportProtectedRoles(coachContext: WorkoutCoachContext): WorkoutSlotRole[] {
  if (coachContext.sportFocus === "cycling") {
    return [
      "main_squat",
      "main_hinge",
      "unilateral_lower",
      "calves",
      "core",
    ];
  }
  if (coachContext.sportFocus === "alpine_skiing") {
    return [
      "main_squat",
      "main_hinge",
      "unilateral_lower",
      "calves",
      "core",
      "carry",
    ];
  }
  if (coachContext.sportFocus === "surf_sports") {
    return ["main_pull", "core", "carry", "rear_delt_scapula"];
  }

  return [];
}

function isOptionalAccessoryFocusCompatible(params: {
  exercise: ExerciseCatalogItem;
  focus: WorkoutCoachContext["selectedFocus"];
}) {
  const roles = getExerciseRoleCandidates(params.exercise);

  if (params.focus === "lower_body") {
    return (
      roles.includes("main_squat") ||
      roles.includes("main_hinge") ||
      roles.includes("unilateral_lower") ||
      roles.includes("calves") ||
      roles.includes("core") ||
      roles.includes("carry") ||
      roles.includes("rehab_control") ||
      roles.includes("recovery_light")
    );
  }

  if (params.focus === "upper_body") {
    return !(
      roles.includes("main_squat") ||
      roles.includes("main_hinge") ||
      roles.includes("unilateral_lower") ||
      roles.includes("calves")
    );
  }

  return true;
}

function addGoalSpecificScoring(params: {
  exercise: ExerciseCatalogItem;
  slot: WorkoutSlot;
  coachContext: WorkoutCoachContext;
  scoreBreakdown: RankedExerciseCandidate["scoreBreakdown"];
}) {
  let score = 0;
  const isStrength = params.coachContext.goal === "strength";
  const roles = getExerciseRoleCandidates(params.exercise);

  if (isStrength && ["main_push", "main_pull", "main_squat", "main_hinge"].includes(params.slot.role)) {
    const mainLiftBonus = isLoadedStrengthCandidate(params.exercise) ? 26 : 10;
    score += mainLiftBonus;
    params.scoreBreakdown.push({
      code: "strength_main_lift_bonus",
      amount: mainLiftBonus,
      reason: "Styrkemålet prioriterar belastningsbara huvudlyft i huvudslotar.",
    });

    if (params.exercise.requiredEquipment.some((equipment) => equipment !== "bodyweight")) {
      score += 12;
      params.scoreBreakdown.push({
        code: "loadability_bonus",
        amount: 12,
        reason: "Övningen är lätt att progressa med yttre belastning.",
      });
    }

    if (params.exercise.variantGroup === "romanian_deadlift" || params.exercise.variantGroup === "deadlift") {
      score += 10;
      params.scoreBreakdown.push({
        code: "progression_potential_bonus",
        amount: 10,
        reason: "Hinge-övningen har tydlig progression och styrkespecificitet.",
      });
    }
  }

  if (
    isStrength &&
    ["core", "carry", "optional_accessory", "rehab_control"].includes(params.slot.role) &&
    !roles.includes("main_push") &&
    !roles.includes("main_pull") &&
    !roles.includes("main_squat") &&
    !roles.includes("main_hinge")
  ) {
    score -= 10;
    params.scoreBreakdown.push({
      code: "accessory_penalty_for_strength",
      amount: -10,
      reason: "Styrkepass låter accessoarer komma efter huvudlyften när de konkurrerar om plats.",
    });
  }

  if (
    params.coachContext.goal === "hypertrophy" &&
    ["direct_biceps", "direct_triceps", "shoulder_accessory", "rear_delt_scapula", "calves"].includes(
      params.slot.role,
    )
  ) {
    score += 10;
    params.scoreBreakdown.push({
      code: "hypertrophy_accessory_bonus",
      amount: 10,
      reason: "Hypertrofi tillåter fler målspecifika accessoarer när sloten redan finns.",
    });
  }

  return score;
}

function addSportSpecificScoring(params: {
  exercise: ExerciseCatalogItem;
  slot: WorkoutSlot;
  coachContext: WorkoutCoachContext;
  scoreBreakdown: RankedExerciseCandidate["scoreBreakdown"];
}) {
  let score = 0;
  const sportRelevance = getSportRelevanceHint(
    params.exercise,
    params.coachContext.sportFocus,
  );

  if (sportRelevance > 0) {
    const bonus = sportRelevance * 7;
    score += bonus;
    params.scoreBreakdown.push({
      code: "sport_focus_score_bonus",
      amount: bonus,
      reason: "Övningen stödjer valt sportfokus utan att ta över huvudmålet.",
    });
  }

  const protectedRoles = getSportProtectedRoles(params.coachContext);
  if (protectedRoles.includes(params.slot.role)) {
    score += 6;
    params.scoreBreakdown.push({
      code: "sport_protected_role_bonus",
      amount: 6,
      reason: `Rollen ${params.slot.role} är extra relevant för sportfokuset.`,
    });
  }

  if (
    params.coachContext.sportFocus === "cycling" &&
    params.exercise.variantGroup === "mountain_climber"
  ) {
    score -= 16;
    params.scoreBreakdown.push({
      code: "conditioning_penalty",
      amount: -16,
      reason: "Mountain climbers prioriteras ned när bättre cykelrelevant bål/ben-arbete finns.",
    });
  }

  return score;
}

function addVariationScoring(params: {
  exercise: ExerciseCatalogItem;
  coachContext: WorkoutCoachContext;
  usedVariantGroups: string[];
  scoreBreakdown: RankedExerciseCandidate["scoreBreakdown"];
}) {
  let score = 0;

  if (params.usedVariantGroups.includes(params.exercise.variantGroup)) {
    score -= 18;
    params.scoreBreakdown.push({
      code: "variant_repeat_penalty",
      amount: -18,
      reason: "Variantgruppen har redan använts i passet.",
    });
  } else {
    score += 8;
    params.scoreBreakdown.push({
      code: "fresh_variant_bonus",
      amount: 8,
      reason: "Ny variantgrupp ger bättre variation inom passet.",
    });
  }

  if (params.coachContext.recentVariantGroups.includes(params.exercise.variantGroup)) {
    score -= 14;
    params.scoreBreakdown.push({
      code: "variant_cooldown_penalty",
      amount: -14,
      reason: "Variantgruppen har använts nyligen och får en mild cooldown när alternativ finns.",
    });
  }

  if (params.coachContext.recentExerciseIds.includes(params.exercise.id)) {
    score -= 8;
    params.scoreBreakdown.push({
      code: "recent_exercise_penalty",
      amount: -8,
      reason: "Exakt samma övning har använts nyligen och kan roteras bort om annat är likvärdigt.",
    });
  }

  return score;
}

function addExerciseSpecificPenalties(params: {
  exercise: ExerciseCatalogItem;
  slot: WorkoutSlot;
  coachContext: WorkoutCoachContext;
  scoreBreakdown: RankedExerciseCandidate["scoreBreakdown"];
}) {
  let score = 0;

  if (
    params.exercise.id === "pike_push_up" &&
    params.coachContext.experienceLevel === "beginner"
  ) {
    score -= 24;
    params.scoreBreakdown.push({
      code: "complexity_penalty",
      amount: -24,
      reason: "Pike push-ups får tydlig komplexitetsstraff för nybörjare.",
    });
  }

  if (
    params.exercise.variantGroup === "mountain_climber" &&
    ["strength", "hypertrophy"].includes(params.coachContext.goal)
  ) {
    score -= 18;
    params.scoreBreakdown.push({
      code: "conditioning_penalty",
      amount: -18,
      reason: "Mountain climbers prioriteras ned i styrke- och hypertrofipass.",
    });
  }

  if (
    params.slot.role === "optional_accessory" &&
    !isOptionalAccessoryFocusCompatible({
      exercise: params.exercise,
      focus: params.coachContext.selectedFocus,
    })
  ) {
    score -= 4_000;
    params.scoreBreakdown.push({
      code: "off_focus_accessory_penalty",
      amount: -4000,
      reason: "Optional accessory måste vara fokuskompatibel och får inte fylla fel kroppsdel.",
    });
  }

  if (
    params.coachContext.selectedFocus === "lower_body" &&
    ["close_grip_push_up", "push_up", "bodyweight_bench_dip"].includes(params.exercise.id)
  ) {
    score -= 3_000;
    params.scoreBreakdown.push({
      code: "replacement_focus_mismatch_penalty",
      amount: -3000,
      reason: "Lower body ska inte fyllas med överkroppspress som accessoar när benroller saknas.",
    });
  }

  return score;
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

  if (params.slot.blockedMovementPatterns?.includes(params.exercise.movementPattern)) {
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

  if (
    violatesConstraint({
      exercise: params.exercise,
      constraints: params.coachContext.injuryConstraints,
    })
  ) {
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

  score += addGoalSpecificScoring({
    exercise: params.exercise,
    slot: params.slot,
    coachContext: params.coachContext,
    scoreBreakdown,
  });
  score += addSportSpecificScoring({
    exercise: params.exercise,
    slot: params.slot,
    coachContext: params.coachContext,
    scoreBreakdown,
  });
  score += addVariationScoring({
    exercise: params.exercise,
    coachContext: params.coachContext,
    usedVariantGroups: params.usedVariantGroups,
    scoreBreakdown,
  });
  score += addExerciseSpecificPenalties({
    exercise: params.exercise,
    slot: params.slot,
    coachContext: params.coachContext,
    scoreBreakdown,
  });

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
  allowSafeTemplateFallback?: boolean;
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
    const accepted = ranked.filter((entry) => entry.candidate.score > 0).slice(0, 8);
    const rejected = ranked.filter((entry) => entry.candidate.score <= 0).slice(0, 8);

    candidatesPerSlot[slot.id] = accepted.map((entry) => entry.candidate);
    rejectedCandidates[slot.id] = rejected.map((entry) => entry.candidate);

    const safeFallback =
      params.allowSafeTemplateFallback && slot.required
        ? ranked.find(
            (entry) =>
              !entry.candidate.rejectedReasons.includes("role_mismatch") &&
              !entry.candidate.rejectedReasons.includes("movement_pattern_not_allowed") &&
              !entry.candidate.rejectedReasons.includes("movement_pattern_blocked") &&
              !entry.candidate.rejectedReasons.includes("constraint_blocked") &&
              !entry.candidate.rejectedReasons.includes("recovery_hard_block") &&
              !entry.candidate.rejectedReasons.includes("risk_too_high_for_beginner"),
          )
        : undefined;
    const selected = accepted[0] ?? safeFallback;
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
        (accepted[0]
          ? "Valdes som högst rankad kandidat inom sloten."
          : "Valdes som säker mallkandidat när ordinarie sloturval inte räckte."),
      selectionSource: accepted[0] ? "local_rank" : "fallback",
      candidates: accepted.map((entry) => entry.candidate),
    });
  }

  return {
    selections,
    candidatesPerSlot,
    rejectedCandidates,
  };
}
