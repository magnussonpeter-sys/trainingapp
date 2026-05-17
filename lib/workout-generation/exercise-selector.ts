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

export function getExerciseRoleCandidates(
  exercise: ExerciseCatalogItem,
): WorkoutSlotRole[] {
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

function getBestSlotRoleMatch(params: {
  slot: WorkoutSlot;
  exercise: ExerciseCatalogItem;
}) {
  const candidateRoles = getExerciseRoleCandidates(params.exercise);
  const matchedRole = params.slot.allowedRoles.find((role) =>
    candidateRoles.includes(role),
  );

  return {
    matchedRole: matchedRole ?? null,
    candidateRoles,
  };
}

function getGoalSpecificity(exercise: ExerciseCatalogItem, goal: WorkoutCoachContext["goal"]) {
  const tags = (exercise.primaryGoalTags ?? []).map((tag) => tag.toLowerCase());

  if (goal === "strength") {
    return tags.includes("styrka") ? 2 : tags.includes("hypertrofi") ? 1 : 0;
  }
  if (goal === "hypertrophy") {
    return tags.includes("hypertrofi") ? 2 : tags.includes("styrka") ? 1 : 0;
  }
  if (goal === "body_composition") {
    return tags.includes("hypertrofi") || tags.includes("allmän hälsa") ? 1 : 0;
  }

  return 0;
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
  return (
    exercise.requiredEquipment.some((equipment) => equipment !== "bodyweight") &&
    [
      "bench_press",
      "row",
      "romanian_deadlift",
      "deadlift",
      "squat",
      "lunge",
      "step_up",
      "pull_up",
      "lat_pulldown",
      "overhead_press",
    ].includes(exercise.variantGroup)
  );
}

function isWeightedCompoundStrengthExercise(exercise: ExerciseCatalogItem) {
  return (
    exercise.requiredEquipment.some((equipment) => equipment !== "bodyweight") &&
    getExerciseRoleCandidates(exercise).some((role) =>
      ["main_push", "main_pull", "main_squat", "main_hinge", "unilateral_lower"].includes(role),
    )
  );
}

function isProgressionCompatibleStrengthExercise(exercise: ExerciseCatalogItem) {
  return isLoadedStrengthCandidate(exercise) && exercise.riskLevel !== "high";
}

function isSupportStyleStrengthFallback(exercise: ExerciseCatalogItem) {
  return exercise.variantGroup === "ring_support";
}

function isBodyweightOnlyLowerFallback(exercise: ExerciseCatalogItem) {
  return (
    exercise.requiredEquipment.every((equipment) => equipment === "bodyweight") &&
    ["squat", "lunge"].includes(exercise.movementPattern)
  );
}

function isBridgeStyleHingeFallback(exercise: ExerciseCatalogItem) {
  return exercise.variantGroup === "hip_bridge";
}

function isAccessoryPressFallback(exercise: ExerciseCatalogItem) {
  return (
    exercise.variantGroup === "dip" ||
    exercise.id === "close_grip_push_up" ||
    exercise.variantGroup === "push_up"
  );
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
    return ["main_pull", "rear_delt_scapula", "core", "carry"];
  }

  return [];
}

function addScore(
  scoreBreakdown: RankedExerciseCandidate["scoreBreakdown"],
  code: string,
  amount: number,
  reason: string,
) {
  scoreBreakdown.push({ code, amount, reason });
  return amount;
}

export function scoreExerciseForSlot(params: {
  exercise: ExerciseCatalogItem;
  slot: WorkoutSlot;
  coachContext: WorkoutCoachContext;
  usedVariantGroups: string[];
  usedMovementPatterns: ExerciseCatalogItem["movementPattern"][];
}) {
  const scoreBreakdown: RankedExerciseCandidate["scoreBreakdown"] = [];
  const rejectedReasons: string[] = [];
  const { matchedRole } = getBestSlotRoleMatch({
    slot: params.slot,
    exercise: params.exercise,
  });

  if (!matchedRole) {
    rejectedReasons.push("role_mismatch");
    return {
      score: -10_000,
      matchedRole: params.slot.role,
      matchedSlotRole: false,
      scoreBreakdown,
      rejectedReasons,
    };
  }

  let score = 0;
  score += addScore(
    scoreBreakdown,
    "slot_role_match",
    matchedRole === params.slot.role ? 100 : 88,
    matchedRole === params.slot.role
      ? `Övningen matchar slotens primära roll ${params.slot.role}.`
      : `Övningen matchar en tillåten slot-roll (${matchedRole}) inom kontraktet.`,
  );

  if (
    params.slot.preferredMovementPatterns?.includes(params.exercise.movementPattern)
  ) {
    score += addScore(
      scoreBreakdown,
      "movement_pattern_match",
      22,
      "Övningens rörelsemönster passar slotens önskade mönster.",
    );
  } else if (
    params.slot.preferredMovementPatterns &&
    params.slot.preferredMovementPatterns.length > 0
  ) {
    score += addScore(
      scoreBreakdown,
      "movement_pattern_partial",
      6,
      "Övningen är rollrätt men träffar inte slotens förstahandsmönster exakt.",
    );
  }

  if (
    params.slot.forbiddenMovementPatterns?.includes(params.exercise.movementPattern)
  ) {
    rejectedReasons.push("forbidden_movement_pattern");
    score += addScore(
      scoreBreakdown,
      "forbidden_movement_pattern_penalty",
      -4_000,
      "Övningen bryter mot slotens förbjudna rörelsemönster.",
    );
  }

  const goalSpecificity = getGoalSpecificity(
    params.exercise,
    params.coachContext.goal,
  );
  if (goalSpecificity >= (params.slot.minGoalSpecificity ?? 0)) {
    score += addScore(
      scoreBreakdown,
      "goal_specificity",
      goalSpecificity * 12,
      "Övningen stödjer huvudmålet för sloten.",
    );
  } else if ((params.slot.minGoalSpecificity ?? 0) > 0) {
    score += addScore(
      scoreBreakdown,
      "goal_specificity_penalty",
      -((params.slot.minGoalSpecificity ?? 0) - goalSpecificity) * 12,
      "Övningen är mindre målspecifik än slotkontraktet önskar.",
    );
  }

  if (params.coachContext.goal === "strength") {
    if (
      ["main_push", "main_pull", "main_squat", "main_hinge"].includes(matchedRole)
    ) {
      if (isWeightedCompoundStrengthExercise(params.exercise)) {
        score += addScore(
          scoreBreakdown,
          "strength_weighted_compound_bonus",
          12,
          "Belastningsbar compound-övning prioriteras i styrkepass.",
        );
      }
      if (isLoadedStrengthCandidate(params.exercise)) {
        score += addScore(
          scoreBreakdown,
          "strength_main_lift_bonus",
          28,
          "Strength prioriterar belastningsbara huvudlyft i required slots.",
        );
        score += addScore(
          scoreBreakdown,
          "strength_role_equivalent_bonus",
          8,
          "Övningen täcker slotens huvudroll med en progressionstålig variant.",
        );
      }
      if (isProgressionCompatibleStrengthExercise(params.exercise)) {
        score += addScore(
          scoreBreakdown,
          "strength_progression_compatible_bonus",
          14,
          "Övningen har tydlig progression via vikt och reps.",
        );
      } else if (
        params.exercise.requiredEquipment.every((equipment) => equipment === "bodyweight")
      ) {
        score += addScore(
          scoreBreakdown,
          "strength_bodyweight_fallback_penalty",
          -(params.slot.allowBodyweightFallback ? 10 : 22),
          "Kroppsviktsvariant rankas ned när strength-pass har bättre belastningsbara alternativ.",
        );
      }

      if (isSupportStyleStrengthFallback(params.exercise)) {
        score += addScore(
          scoreBreakdown,
          "strength_support_not_main_lift_penalty",
          -26,
          "Support hold får inte ersätta en riktig press- eller dragövning i styrkepass.",
        );
      }
    } else if (
      ["core", "carry", "optional_accessory", "rehab_control"].includes(matchedRole)
    ) {
      score += addScore(
        scoreBreakdown,
        "accessory_penalty_for_strength",
        -8,
        "Små accessoarer kommer efter huvudlyften i styrkepass.",
      );
    }
  } else if (
    params.coachContext.goal === "hypertrophy" &&
    ["direct_biceps", "direct_triceps", "shoulder_accessory", "calves"].includes(
      matchedRole,
    )
  ) {
    score += addScore(
      scoreBreakdown,
      "hypertrophy_accessory_bonus",
      10,
      "Hypertrofi gynnas av målspecifika accessoarer när kontraktet redan bär basen.",
    );
  }

  const priorityMatches = params.coachContext.focusCompatiblePriorities.filter(
    (muscle) =>
      params.exercise.primaryMuscles.includes(muscle) ||
      params.exercise.secondaryMuscles?.includes(muscle),
  ).length;
  if (priorityMatches > 0) {
    score += addScore(
      scoreBreakdown,
      "priority_muscle_match",
      priorityMatches * 10,
      "Övningen träffar fokuskompatibla prioriterade muskler.",
    );
  }

  const sportRelevance = getSportRelevanceHint(
    params.exercise,
    params.coachContext.sportFocus,
  );
  if (sportRelevance > 0) {
    score += addScore(
      scoreBreakdown,
      "sport_relevance_bonus",
      Math.round(sportRelevance * 7),
      "Övningen stödjer sportfokus som bonus utan att ta över huvudmålet.",
    );
  }
  if (getSportProtectedRoles(params.coachContext).includes(matchedRole)) {
    score += addScore(
      scoreBreakdown,
      "sport_protected_role_bonus",
      5,
      `Rollen ${matchedRole} är extra relevant för valt sportfokus.`,
    );
  }

  const recoverySeverity = getRecoverySeverityForExercise({
    exercise: params.exercise,
    coachContext: params.coachContext,
  });
  if (recoverySeverity === "hard_blocked") {
    rejectedReasons.push("recovery_hard_block");
    score += addScore(
      scoreBreakdown,
      "recovery_hard_block_penalty",
      -5_000,
      "Övningen är hårt blockerad av återhämtningsregler.",
    );
  } else if (recoverySeverity === "avoid_heavy_loading") {
    if (params.slot.intensityHint === "hard") {
      score += addScore(
        scoreBreakdown,
        "recovery_penalty",
        -24,
        "Återhämtningen talar för lättare eller mindre belastande alternativ.",
      );
    } else {
      score += addScore(
        scoreBreakdown,
        "recovery_light_fit",
        8,
        "Övningen fungerar som lättare variant trots recovery-begränsning.",
      );
    }
  } else if (
    recoverySeverity === "allow_light_recovery" &&
    (params.slot.allowRecoveryLight || params.slot.intensityHint === "light")
  ) {
    score += addScore(
      scoreBreakdown,
      "recovery_safe_bonus",
      10,
      "Övningen passar som lätt återhämtningsvariant i sloten.",
    );
  }

  if (
    violatesConstraint({
      exercise: params.exercise,
      constraints: params.coachContext.injuryConstraints,
    })
  ) {
    rejectedReasons.push("constraint_blocked");
    score += addScore(
      scoreBreakdown,
      "constraint_penalty",
      -5_000,
      "Övningen bryter mot aktiv constraint/skadebegränsning.",
    );
  }

  if (params.usedVariantGroups.includes(params.exercise.variantGroup)) {
    score += addScore(
      scoreBreakdown,
      "recent_variant_penalty",
      -18,
      "Variantgruppen används redan i passet och roteras ned.",
    );
  } else {
    score += addScore(
      scoreBreakdown,
      "fresh_variant_bonus",
      6,
      "Ny variantgrupp förbättrar variationen inom passet.",
    );
  }

  if (params.coachContext.recentVariantGroups.includes(params.exercise.variantGroup)) {
    score += addScore(
      scoreBreakdown,
      "variant_cooldown_penalty",
      -12,
      "Variantgruppen har använts nyligen och får mild cooldown.",
    );
  }

  if (params.usedMovementPatterns.includes(params.exercise.movementPattern)) {
    score += addScore(
      scoreBreakdown,
      "duplicate_pattern_penalty",
      -10,
      "Passet innehåller redan samma rörelsemönster och får därför mild variationsstraff.",
    );
  }

  if (params.coachContext.recentExerciseIds.includes(params.exercise.id)) {
    score += addScore(
      scoreBreakdown,
      "recent_exercise_penalty",
      -8,
      "Exakt samma övning gjordes nyligen och roteras ned om annat är likvärdigt.",
    );
  }

  if (
    params.slot.role === "optional_accessory" &&
    !isOptionalAccessoryFocusCompatible({
      exercise: params.exercise,
      focus: params.coachContext.selectedFocus,
    })
  ) {
    rejectedReasons.push("off_focus_optional_accessory");
    score += addScore(
      scoreBreakdown,
      "off_focus_penalty",
      -4_000,
      "Optional accessory måste vara fokuskompatibel i den här modellen.",
    );
  }

  if (
    params.coachContext.selectedFocus === "lower_body" &&
    ["main_push", "direct_triceps"].includes(matchedRole) &&
    !["carry", "core", "rehab_control"].includes(matchedRole)
  ) {
    rejectedReasons.push("off_focus_lower_body");
    score += addScore(
      scoreBreakdown,
      "off_focus_penalty",
      -3_000,
      "Lower body får inte repareras med överkroppspress när lower-roller saknas.",
    );
  }

  if (
    params.coachContext.selectedFocus === "upper_body" &&
    matchedRole === "calves"
  ) {
    rejectedReasons.push("off_focus_upper_body");
    score += addScore(
      scoreBreakdown,
      "off_focus_penalty",
      -2_500,
      "Upper body får inte fyllas med calves när press/drag ska skyddas.",
    );
  }

  if (
    params.coachContext.goal === "strength" &&
    params.coachContext.selectedEquipment.includes("dumbbells") &&
    ["main_squat", "unilateral_lower"].includes(matchedRole) &&
    isBodyweightOnlyLowerFallback(params.exercise)
  ) {
    score += addScore(
      scoreBreakdown,
      "strength_bodyweight_fallback_penalty",
      -20,
      "Kroppsvikts-lower rankas ned när hantelbelastad unilateral eller squat kan användas.",
    );
  }

  if (
    params.coachContext.goal === "strength" &&
    params.coachContext.selectedFocus === "full_body" &&
    matchedRole === "main_hinge" &&
    isBridgeStyleHingeFallback(params.exercise)
  ) {
    score += addScore(
      scoreBreakdown,
      "strength_bodyweight_fallback_penalty",
      -24,
      "Glute bridge är för lätt som hinge-ersättning när full body strength kan bära RDL eller marklyft.",
    );
  }

  if (
    params.coachContext.goal === "strength" &&
    matchedRole === "main_push" &&
    params.coachContext.selectedEquipment.includes("dumbbells") &&
    isAccessoryPressFallback(params.exercise)
  ) {
    score += addScore(
      scoreBreakdown,
      "strength_support_not_main_lift_penalty",
      -18,
      "Smal press- eller dipvariant ska inte slå hantelpress när belastningsbar press finns.",
    );
  }

  if (
    params.exercise.requiredEquipment.every((equipment) => equipment === "bodyweight") &&
    params.coachContext.selectedEquipment.some((equipment) => equipment !== "bodyweight") &&
    !params.slot.allowBodyweightFallback &&
    ["main_push", "main_pull", "main_squat", "main_hinge", "unilateral_lower"].includes(
      matchedRole,
    )
  ) {
    score += addScore(
      scoreBreakdown,
      "strength_bodyweight_fallback_penalty",
      -18,
      "Sloten föredrar belastningsbar utrustning framför kroppsviktsfallback när sådan finns.",
    );
  }

  if (params.exercise.riskLevel === "low") {
    score += addScore(
      scoreBreakdown,
      "risk_safe_bonus",
      6,
      "Låg risk gör övningen lättare att använda robust inom slotkontraktet.",
    );
  } else if (
    params.coachContext.experienceLevel === "beginner" &&
    params.exercise.riskLevel === "high"
  ) {
    rejectedReasons.push("risk_too_high_for_beginner");
    score += addScore(
      scoreBreakdown,
      "risk_penalty",
      -2_500,
      "Övningen är för riskabel för nybörjarnivån.",
    );
  } else if (params.exercise.riskLevel === "medium") {
    score += addScore(
      scoreBreakdown,
      "risk_penalty",
      -4,
      "Medelhög risk ger ett litet säkerhetsavdrag jämfört med enklare alternativ.",
    );
  }

  if (
    params.exercise.id === "pike_push_up" &&
    params.coachContext.experienceLevel === "beginner"
  ) {
    score += addScore(
      scoreBreakdown,
      "complexity_penalty",
      -20,
      "Pike push-ups får tydligt komplexitetsavdrag för nybörjare.",
    );
  }

  if (
    params.exercise.variantGroup === "mountain_climber" &&
    ["strength", "hypertrophy"].includes(params.coachContext.goal)
  ) {
    score += addScore(
      scoreBreakdown,
      "conditioning_penalty",
      -18,
      "Conditioning-liknande core prioriteras ned när bättre bålalternativ finns.",
    );
  }

  return {
    score,
    matchedRole,
    matchedSlotRole: true,
    scoreBreakdown,
    rejectedReasons,
  };
}

export function getCandidatesForSlot(params: {
  slot: WorkoutSlot;
  coachContext: WorkoutCoachContext;
  usedVariantGroups: string[];
  usedMovementPatterns: ExerciseCatalogItem["movementPattern"][];
}) {
  const exercises = getAvailableExercises(params.coachContext.selectedEquipment);

  return exercises
    .map((exercise) => {
      const scoring = scoreExerciseForSlot({
        exercise,
        slot: params.slot,
        coachContext: params.coachContext,
        usedVariantGroups: params.usedVariantGroups,
        usedMovementPatterns: params.usedMovementPatterns,
      });

      return {
        exercise,
        candidate: {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          source: params.coachContext.recentExerciseIds.includes(exercise.id)
            ? "history"
            : "catalog",
          slotRole: params.slot.role,
          matchedRole: scoring.matchedRole,
          movementPattern: exercise.movementPattern,
          variantGroup: exercise.variantGroup,
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
          requiredEquipment: exercise.requiredEquipment,
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
  const usedMovementPatterns: ExerciseCatalogItem["movementPattern"][] = [];
  const selections: SlotExerciseSelection[] = [];
  const candidatesPerSlot: Record<string, RankedExerciseCandidate[]> = {};
  const rejectedCandidates: Record<string, RankedExerciseCandidate[]> = {};

  for (const slot of params.slots) {
    const ranked = getCandidatesForSlot({
      slot,
      coachContext: params.coachContext,
      usedVariantGroups,
      usedMovementPatterns,
    });
    const accepted = ranked.filter((entry) => entry.candidate.score > 0).slice(0, 8);
    const rejected = ranked.filter((entry) => entry.candidate.score <= 0).slice(0, 8);

    candidatesPerSlot[slot.id] = accepted.map((entry) => entry.candidate);
    rejectedCandidates[slot.id] = rejected.map((entry) => entry.candidate);

    // Safe-template mode still respects the same slot contract. It just lowers the
    // acceptance threshold so required slots can be filled with the safest matching role.
    const safeFallback =
      params.allowSafeTemplateFallback && slot.required
        ? ranked.find(
            (entry) =>
              entry.candidate.matchedRole &&
              !entry.candidate.rejectedReasons.includes("role_mismatch") &&
              !entry.candidate.rejectedReasons.includes("forbidden_movement_pattern") &&
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
    usedMovementPatterns.push(selected.exercise.movementPattern);
    selections.push({
      slotId: slot.id,
      slotLabel: slot.label,
      role: selected.candidate.matchedRole,
      contractRoles: slot.allowedRoles,
      exerciseId: selected.exercise.id,
      exerciseName: selected.exercise.name,
      movementPattern: selected.exercise.movementPattern,
      variantGroup: selected.exercise.variantGroup,
      primaryMuscles: selected.exercise.primaryMuscles,
      secondaryMuscles: selected.exercise.secondaryMuscles,
      requiredEquipment: selected.exercise.requiredEquipment,
      score: selected.candidate.score,
      scoreBreakdown: selected.candidate.scoreBreakdown,
      reason:
        selected.candidate.scoreBreakdown[0]?.reason ??
        (accepted[0]
          ? "Valdes som högst rankad kandidat inom slotkontraktet."
          : "Valdes som säkraste kontraktsmatch när ordinarie rankning inte räckte."),
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
