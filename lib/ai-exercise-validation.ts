// lib/ai-exercise-validation.ts

import {
  EXERCISE_CATALOG,
  type EquipmentId,
  type ExerciseCatalogItem,
  type MovementPattern,
  normalizeEquipmentList,
} from "@/lib/exercise-catalog";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { WorkoutFocus } from "@/types/workout";

export type ValidationFocus = WorkoutFocus | "recovery_strength";

export type ValidationFocusContext = {
  plannedFocus?: ValidationFocus | null;
  goal: "strength" | "hypertrophy" | "health" | "body_composition";
  experienceLevel?: string | null;
  durationMinutes: number;
  priorityMuscles?: MuscleBudgetGroup[];
  recoveryLimitedMuscles?: MuscleBudgetGroup[];
  availableEquipment?: string[];
  sportFocus?: string | null;
};

export type ExerciseRole =
  | "primary_press"
  | "secondary_press"
  | "triceps_press"
  | "chest_isolation"
  | "primary_pull"
  | "upper_back_accessory"
  | "biceps_isolation"
  | "primary_squat"
  | "primary_hinge"
  | "secondary_lunge"
  | "glute_accessory"
  | "hamstring_accessory"
  | "calf_accessory"
  | "core"
  | "carry"
  | "mobility_prehab"
  | "advanced_unilateral";

export type AiExerciseCandidate = {
  id?: string;
  name?: string;
  description?: string;
  requiredEquipment?: string[];
  movementPattern?: string;
  primaryMuscles?: string[];
  sets?: number;
  reps?: number | null;
  duration?: number | null;
  rest?: number;
  suggestedWeight?: number | string | null;
};

type NormalizedExercise = {
  id: string;
  name: string;
  description: string;
  sets: number;
  reps?: number;
  duration?: number;
  sidedness?: "none" | "per_side" | "alternating";
  ringSetup?: ExerciseCatalogItem["ringSetup"];
  rest: number;
  suggestedWeight?: number | string | null;
  movementPattern: MovementPattern;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  variantGroup: string;
  riskLevel: ExerciseCatalogItem["riskLevel"];
  sportsRelevance?: ExerciseCatalogItem["sportsRelevance"];
};

type CandidatePoolExercise = NormalizedExercise & {
  source: "ai" | "catalog";
};

type BalanceIssueCode =
  | "movement_pattern_limit"
  | "primary_muscle_limit"
  | "variant_group_limit";

export type ValidationReasonCode =
  | "accepted_exact_match"
  | "invalid_or_missing_id"
  | "duplicate_exercise_id"
  | "recent_variation_preference"
  | "balance_adjustment"
  | "filled_missing_slots"
  | "empty_ai_response"
  | "integrity_repair";

export type ValidationDebugEntry = {
  requestedId: string | null;
  requestedName: string | null;
  requestedMovementPattern: string | null;
  selectedId: string;
  selectedName: string;
  reasonCode: ValidationReasonCode;
  reason: string;
};

export type ValidateAiExercisesResult = {
  exercises: Array<{
    id: string;
    name: string;
    description: string;
    sets: number;
    reps?: number;
    duration?: number;
    sidedness?: "none" | "per_side" | "alternating";
    rest: number;
    suggestedWeight?: number | string | null;
  }>;
  debug: {
    availableCatalogCount: number;
    requestedExerciseCount: number;
    targetExerciseCount: number;
    acceptedDirectly: ValidationDebugEntry[];
    replacements: ValidationDebugEntry[];
    fills: ValidationDebugEntry[];
    warnings: string[];
    finalExerciseIds: string[];
    focusIntegrityScore: number;
    strengthSpecificityScore: number;
    qualityPreservationScore: number;
    goalSpecificityLoss: number;
    sportSpecificityLoss: number;
    catalogResolutionLoss: number;
    mustKeepViolations: string[];
    offFocusWarnings: string[];
    offFocusViolations: string[];
    forbiddenExerciseViolations: string[];
    lostMovementPatterns: string[];
    lostPrimaryRoles: string[];
    lostPriorityMuscles: string[];
    lostUsefulRoles: string[];
    lostPrimaryOrHighValueExercises: string[];
    lostSportRelevantExercises: string[];
    sportRelevantExercisesKept: string[];
    sportRelevantExercisesLost: string[];
    deferredPriorityMuscles: string[];
    removedPrimaryExercises: string[];
    addedOffFocusExercises: string[];
    removedBecauseOffFocus: string[];
    removedBecauseRecovery: string[];
    removedBecauseDuplicateRole: string[];
    fallbackExercisesAdded: string[];
    normalizationWarnings: string[];
    fallbackBiasWarning: string | null;
    durationTrimReason: string | null;
    roleTrimReason: string | null;
    compatibleExercisesRejectedWithReason: Array<{
      exerciseName: string;
      stage: "raw_to_catalog" | "catalog_to_focus_repair" | "focus_repair_to_final";
      reason: string;
    }>;
    priorityMuscleResolutionStatus: Array<{
      muscle: MuscleBudgetGroup;
      status:
        | "addressed"
        | "partially_addressed"
        | "deferred_due_to_focus"
        | "deferred_due_to_recovery"
        | "deferred_due_to_duration"
        | "dropped_by_normalization";
      reason: string;
    }>;
    primaryLiftCount: number;
    loadedProgressionExerciseCount: number;
    bodyweightOnlyCount: number;
    mainLiftMissingWarnings: string[];
    repeatedPatternCount: number;
    repeatedVariantGroups: string[];
    plannedProgressionRepeats: string[];
    fallbackRepeats: string[];
    normalizationLossScore: number;
    aiRawExercises: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: ExerciseRole;
    }>;
    afterCatalogMatch: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: ExerciseRole;
    }>;
    afterFocusRepair: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: ExerciseRole;
    }>;
    finalExercises: Array<{
      exerciseId: string;
      exerciseName: string;
      variantGroup: string;
      movementPattern: string;
      exerciseRole: ExerciseRole;
    }>;
    rawToCatalogDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
    catalogToFocusRepairDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
    focusRepairToFinalDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
    beforeAfterDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
      validationContext: {
        plannedFocus: ValidationFocus | null;
        goal: ValidationFocusContext["goal"];
        experienceLevel: string | null;
        durationMinutes: number;
        priorityMuscles: MuscleBudgetGroup[];
        focusCompatiblePriorities: MuscleBudgetGroup[];
        deferredPriorities: MuscleBudgetGroup[];
        recoveryLimitedMuscles: MuscleBudgetGroup[];
        availableEquipment: string[];
        sportFocus?: string | null;
      };
    };
};

type RecentPreferenceContext = {
  recentExerciseIds: Set<string>;
  recentVariantGroups: Set<string>;
};

type FocusDiagnostics = {
  mustKeepViolations: string[];
  missingMovementPatterns: string[];
  missingPriorityMuscles: MuscleBudgetGroup[];
  forbiddenExerciseViolations: string[];
  addedOffFocusExercises: string[];
  offFocusWarnings: string[];
  offFocusViolations: string[];
  lostPrimaryRoles: string[];
};

type OffFocusIssue = {
  severity: "warning" | "violation";
  reason: string;
};

type FocusPriorityGroups = {
  focusCompatiblePriorities: MuscleBudgetGroup[];
  deferredPriorities: MuscleBudgetGroup[];
};

type StageExerciseDebug = {
  exerciseId: string;
  exerciseName: string;
  variantGroup: string;
  movementPattern: string;
  exerciseRole: ExerciseRole;
  qualityRoles: string[];
};

type RequestedExerciseRejection = {
  exerciseName: string;
  stage: "raw_to_catalog" | "catalog_to_focus_repair" | "focus_repair_to_final";
  reason: string;
};

const EXERCISE_NAME_ALIASES: Record<string, string> = {
  "enarmsrodd med hantel": "one_arm_dumbbell_row",
  "enarms rodd med hantel": "one_arm_dumbbell_row",
  "one arm dumbbell row": "one_arm_dumbbell_row",
  "sidolyft med hantlar": "dumbbell_lateral_raise",
  "lateral raise med hantlar": "dumbbell_lateral_raise",
  "bicepscurl med hantlar": "dumbbell_curl",
  "biceps curl med hantlar": "dumbbell_curl",
  "tricepsextension över huvud med hantel": "overhead_triceps_extension",
  "overhead triceps extension": "overhead_triceps_extension",
  "armhävningar i ringar": "ring_push_up",
  "ringar armhävningar": "ring_push_up",
  "armhävningar i ringar med fötterna högt": "feet_elevated_ring_push_up",
  "ring push ups feet elevated": "feet_elevated_ring_push_up",
  "sidoplanka": "side_plank",
  "bakåtutfall med hantlar": "dumbbell_reverse_lunge",
  "farmer carry med hantlar": "dumbbell_farmer_carry",
  "hip thrust med hantel": "dumbbell_hip_thrust",
  "vadpress med hantlar": "dumbbell_calf_raise",
  "planka med axelklapp": "shoulder_tap_plank",
};

const VALID_MOVEMENT_PATTERNS: MovementPattern[] = [
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "core",
  "carry",
];

const MAX_PER_MOVEMENT_PATTERN = 2;
const MAX_PER_PRIMARY_MUSCLE = 2;
const MAX_PER_VARIANT_GROUP = 1;

const RAW_MUSCLE_TO_BUDGET_GROUP: Record<string, MuscleBudgetGroup | null> = {
  chest: "chest",
  lats: "back",
  upper_back: "back",
  traps: "back",
  external_rotators: "back",
  quads: "quads",
  adductors: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  shoulders: "shoulders",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  biceps: "biceps",
  brachialis: "biceps",
  triceps: "triceps",
  calves: "calves",
  core: "core",
  obliques: "core",
  lower_back: "core",
  hip_flexors: "core",
  forearms: null,
  feet: null,
};

function clampPositiveInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeExperienceLevel(value: string | null | undefined) {
  return value === "beginner" || value === "intermediate" || value === "advanced"
    ? value
    : null;
}

function getEffectiveFocus(
  focusContext?: ValidationFocusContext | null,
): ValidationFocus | null {
  return focusContext?.plannedFocus ?? null;
}

function isShortPass(focusContext?: ValidationFocusContext | null) {
  return (focusContext?.durationMinutes ?? 999) <= 25;
}

function normalizeExerciseName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCatalogAliasId(exerciseName: string) {
  return EXERCISE_NAME_ALIASES[normalizeExerciseName(exerciseName)] ?? null;
}

function getQualityRoles(
  exercise: Pick<
    NormalizedExercise,
    | "id"
    | "variantGroup"
    | "movementPattern"
    | "primaryMuscles"
    | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  const role = getExerciseRole(exercise, focusContext);
  const qualityRoles = new Set<string>();

  if (role === "primary_press" || role === "triceps_press") qualityRoles.add("main_push");
  if (role === "primary_pull") qualityRoles.add("main_pull");
  if (role === "primary_squat" || role === "secondary_lunge") qualityRoles.add("squat_or_lunge");
  if (role === "primary_hinge") qualityRoles.add("hinge");
  if (role === "secondary_lunge" || role === "advanced_unilateral") {
    qualityRoles.add("unilateral_lower");
  }
  if (role === "biceps_isolation") qualityRoles.add("direct_biceps");
  if (role === "triceps_press") qualityRoles.add("direct_triceps");
  if (role === "upper_back_accessory") qualityRoles.add("shoulder_accessory");
  if (role === "core") qualityRoles.add("core");
  if (exercise.id === "side_plank") qualityRoles.add("lateral_core");
  if (role === "carry") qualityRoles.add("carry_grip");
  if (hasBudgetGroup(exercise, "calves")) qualityRoles.add("calves");
  if (role === "glute_accessory") qualityRoles.add("glute_accessory");
  if (hasBudgetGroup(exercise, "hamstrings") || role === "primary_hinge") {
    qualityRoles.add("posterior_chain");
  }

  if (isSportRelevantExercise(exercise, focusContext)) {
    qualityRoles.add("sport_relevant_accessory");
  }

  return Array.from(qualityRoles);
}

function getGoalSpecificityWeight(
  exercise: Pick<
    NormalizedExercise,
    | "id"
    | "variantGroup"
    | "movementPattern"
    | "primaryMuscles"
    | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  const role = getExerciseRole(exercise, focusContext);

  if (focusContext?.goal === "hypertrophy") {
    if (role === "primary_press" || role === "primary_pull" || role === "primary_hinge") {
      return 3;
    }
    if (
      role === "biceps_isolation" ||
      role === "triceps_press" ||
      role === "glute_accessory" ||
      role === "calf_accessory"
    ) {
      return 2;
    }
  }

  if (focusContext?.goal === "strength") {
    return isLoadedProgressionExercise(exercise, focusContext) ? 3 : 1;
  }

  return 1;
}

function isSportRelevantExercise(
  exercise: Pick<NormalizedExercise, "id" | "sportsRelevance" | "movementPattern" | "primaryMuscles" | "secondaryMuscles">,
  focusContext?: ValidationFocusContext | null,
) {
  const sportFocus = focusContext?.sportFocus;
  if (!sportFocus || sportFocus === "none") {
    return false;
  }

  const explicitSportWeight =
    exercise.sportsRelevance?.[
      sportFocus as keyof NonNullable<NormalizedExercise["sportsRelevance"]>
    ];
  if (typeof explicitSportWeight === "number" && explicitSportWeight > 0) {
    return true;
  }

  // Surf gynnas ofta av drag, bål, posterior chain och grepp även om katalogtaggen saknas.
  if (sportFocus === "surf_sports") {
    return (
      exercise.movementPattern === "carry" ||
      exercise.movementPattern === "core" ||
      exercise.movementPattern === "hinge" ||
      hasBudgetGroup(exercise, "back") ||
      hasBudgetGroup(exercise, "core") ||
      hasBudgetGroup(exercise, "glutes")
    );
  }

  return false;
}

function countByMovementPattern(exercises: NormalizedExercise[]) {
  const counts = new Map<MovementPattern, number>();

  for (const exercise of exercises) {
    counts.set(
      exercise.movementPattern,
      (counts.get(exercise.movementPattern) ?? 0) + 1,
    );
  }

  return counts;
}

function countByPrimaryMuscle(exercises: NormalizedExercise[]) {
  const counts = new Map<string, number>();

  for (const exercise of exercises) {
    for (const muscle of exercise.primaryMuscles) {
      counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
    }
  }

  return counts;
}

function countByVariantGroup(exercises: NormalizedExercise[]) {
  const counts = new Map<string, number>();

  for (const exercise of exercises) {
    counts.set(
      exercise.variantGroup,
      (counts.get(exercise.variantGroup) ?? 0) + 1,
    );
  }

  return counts;
}

function getBalanceIssue(
  candidate: Pick<
    NormalizedExercise,
    "movementPattern" | "primaryMuscles" | "variantGroup"
  >,
  acceptedExercises: NormalizedExercise[],
): { code: BalanceIssueCode; message: string } | null {
  const movementCounts = countByMovementPattern(acceptedExercises);
  const muscleCounts = countByPrimaryMuscle(acceptedExercises);
  const variantCounts = countByVariantGroup(acceptedExercises);

  if ((movementCounts.get(candidate.movementPattern) ?? 0) >= MAX_PER_MOVEMENT_PATTERN) {
    return {
      code: "movement_pattern_limit",
      message: `rörelsemönstret ${candidate.movementPattern} var redan fullt`,
    };
  }

  if ((variantCounts.get(candidate.variantGroup) ?? 0) >= MAX_PER_VARIANT_GROUP) {
    return {
      code: "variant_group_limit",
      message: `varianten ${candidate.variantGroup} fanns redan i passet`,
    };
  }

  for (const muscle of candidate.primaryMuscles) {
    if ((muscleCounts.get(muscle) ?? 0) >= MAX_PER_PRIMARY_MUSCLE) {
      return {
        code: "primary_muscle_limit",
        message: `primärmuskeln ${muscle} var redan överrepresenterad`,
      };
    }
  }

  return null;
}

function findCatalogExerciseById(
  exerciseId: string,
  availableCatalog: ExerciseCatalogItem[],
) {
  return availableCatalog.find((item) => item.id === exerciseId) ?? null;
}

function findCatalogExerciseByName(
  exerciseName: string,
  availableCatalog: ExerciseCatalogItem[],
) {
  const normalizedName = normalizeExerciseName(exerciseName);
  const aliasId = getCatalogAliasId(exerciseName);

  if (aliasId) {
    const aliasMatch = availableCatalog.find((item) => item.id === aliasId) ?? null;
    if (aliasMatch) {
      return aliasMatch;
    }
  }

  return (
    availableCatalog.find(
      (item) => normalizeExerciseName(item.name) === normalizedName,
    ) ??
    availableCatalog.find(
      (item) =>
        normalizeExerciseName(item.name).includes(normalizedName) ||
        normalizedName.includes(normalizeExerciseName(item.name)),
    ) ??
    null
  );
}

function hasExerciseId(
  exerciseId: string,
  acceptedExercises: Array<NormalizedExercise | CandidatePoolExercise>,
) {
  return acceptedExercises.some((exercise) => exercise.id === exerciseId);
}

function getBudgetGroupsForExercise(
  exercise: Pick<NormalizedExercise, "primaryMuscles" | "secondaryMuscles">,
) {
  const groups = new Set<MuscleBudgetGroup>();

  for (const rawMuscle of [
    ...(exercise.primaryMuscles ?? []),
    ...(exercise.secondaryMuscles ?? []),
  ]) {
    const group = RAW_MUSCLE_TO_BUDGET_GROUP[rawMuscle] ?? null;
    if (group) {
      groups.add(group);
    }
  }

  return Array.from(groups);
}

function hasBudgetGroup(
  exercise: Pick<NormalizedExercise, "primaryMuscles" | "secondaryMuscles">,
  group: MuscleBudgetGroup,
) {
  return getBudgetGroupsForExercise(exercise).includes(group);
}

function deriveFocusPriorityGroups(params: {
  globalPriorities: MuscleBudgetGroup[];
  plannedFocus: ValidationFocus | null;
}): FocusPriorityGroups {
  const focusCompatibleSet =
    params.plannedFocus === "upper_body"
      ? new Set<MuscleBudgetGroup>([
          "chest",
          "back",
          "shoulders",
          "biceps",
          "triceps",
        ])
      : params.plannedFocus === "lower_body"
        ? new Set<MuscleBudgetGroup>([
            "quads",
            "hamstrings",
            "glutes",
            "calves",
            "core",
          ])
        : params.plannedFocus === "recovery_strength"
          ? new Set<MuscleBudgetGroup>(["back", "chest", "glutes", "core"])
          : new Set<MuscleBudgetGroup>([
              "chest",
              "back",
              "quads",
              "hamstrings",
              "glutes",
              "core",
            ]);

  const focusCompatiblePriorities = params.globalPriorities.filter((group) =>
    focusCompatibleSet.has(group),
  );
  const deferredPriorities = params.globalPriorities.filter(
    (group) => !focusCompatibleSet.has(group),
  );

  return {
    focusCompatiblePriorities:
      params.plannedFocus === "full_body"
        ? focusCompatiblePriorities.slice(0, 3)
        : focusCompatiblePriorities,
    deferredPriorities,
  };
}

function isStrengthGoal(focusContext?: ValidationFocusContext | null) {
  return focusContext?.goal === "strength";
}

function isIntermediateOrAbove(focusContext?: ValidationFocusContext | null) {
  const level = normalizeExperienceLevel(focusContext?.experienceLevel);
  return level === "intermediate" || level === "advanced";
}

function getExerciseRole(
  exercise: Pick<
    NormalizedExercise,
    "id" | "variantGroup" | "movementPattern" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
): ExerciseRole {
  if (exercise.movementPattern === "carry") {
    return "carry";
  }

  if (exercise.movementPattern === "core") {
    return "core";
  }

  if (exercise.id === "assisted_pistol_squat" || exercise.variantGroup === "single_leg_squat") {
    return "advanced_unilateral";
  }

  if (exercise.variantGroup === "chest_fly") {
    return "chest_isolation";
  }

  if (exercise.variantGroup === "rear_delt") {
    return "upper_back_accessory";
  }

  if (
    exercise.variantGroup === "push_up" &&
    isStrengthGoal(focusContext) &&
    isIntermediateOrAbove(focusContext)
  ) {
    return "secondary_press";
  }

  if (exercise.variantGroup === "dip") {
    return exercise.id === "bodyweight_bench_dip" ? "triceps_press" : "primary_press";
  }

  if (
    exercise.movementPattern === "horizontal_push" ||
    exercise.movementPattern === "vertical_push"
  ) {
    return hasBudgetGroup(exercise, "triceps") && !hasBudgetGroup(exercise, "chest")
      ? "triceps_press"
      : "primary_press";
  }

  if (
    exercise.movementPattern === "horizontal_pull" ||
    exercise.movementPattern === "vertical_pull"
  ) {
    return hasBudgetGroup(exercise, "biceps") && !hasBudgetGroup(exercise, "back")
      ? "biceps_isolation"
      : "primary_pull";
  }

  if (exercise.movementPattern === "squat") {
    return "primary_squat";
  }

  if (exercise.movementPattern === "lunge") {
    return "secondary_lunge";
  }

  if (exercise.movementPattern === "hinge") {
    if (exercise.variantGroup === "hamstring_curl") {
      return "hamstring_accessory";
    }

    if (exercise.variantGroup === "hip_bridge" || exercise.variantGroup === "hip_thrust") {
      return "glute_accessory";
    }

    return "primary_hinge";
  }

  if (hasBudgetGroup(exercise, "calves")) {
    return "calf_accessory";
  }

  return "mobility_prehab";
}

function isPrimaryPullRole(role: ExerciseRole) {
  return role === "primary_pull";
}

function isPrimaryPressRole(role: ExerciseRole) {
  return role === "primary_press" || role === "triceps_press";
}

function isLoadedProgressionExercise(
  exercise: Pick<
    NormalizedExercise,
    "id" | "movementPattern" | "variantGroup" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  const role = getExerciseRole(exercise, focusContext);

  if (
    exercise.id === "bodyweight_squat" ||
    exercise.id === "bodyweight_split_squat" ||
    exercise.id === "reverse_lunge_bodyweight" ||
    exercise.id === "step_up_bodyweight"
  ) {
    return false;
  }

  if (role === "upper_back_accessory" || role === "chest_isolation") {
    return false;
  }

  if (
    exercise.variantGroup === "push_up" &&
    isStrengthGoal(focusContext) &&
    isIntermediateOrAbove(focusContext)
  ) {
    return false;
  }

  return (
    role === "primary_press" ||
    role === "primary_pull" ||
    role === "primary_squat" ||
    role === "primary_hinge" ||
    role === "secondary_lunge"
  );
}

function isBasePressExercise(
  exercise: Pick<
    NormalizedExercise,
    "id" | "variantGroup" | "movementPattern" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  return isPrimaryPressRole(getExerciseRole(exercise, focusContext));
}

function isDragExercise(
  exercise: Pick<
    NormalizedExercise,
    "id" | "variantGroup" | "movementPattern" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  return isPrimaryPullRole(getExerciseRole(exercise, focusContext));
}

function isLowerBaseExercise(
  exercise: Pick<
    NormalizedExercise,
    "id" | "variantGroup" | "movementPattern" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  const role = getExerciseRole(exercise, focusContext);

  if (
    isStrengthGoal(focusContext) &&
    isIntermediateOrAbove(focusContext) &&
    exercise.id === "bodyweight_squat"
  ) {
    return false;
  }

  return role === "primary_squat" || role === "secondary_lunge";
}

function isHingeExercise(
  exercise: Pick<
    NormalizedExercise,
    "id" | "variantGroup" | "movementPattern" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  return getExerciseRole(exercise, focusContext) === "primary_hinge";
}

function isCoreOrCalfExercise(
  exercise: Pick<NormalizedExercise, "primaryMuscles" | "secondaryMuscles">,
) {
  return hasBudgetGroup(exercise, "core") || hasBudgetGroup(exercise, "calves");
}

function isUpperBodyExercise(
  exercise: Pick<
    NormalizedExercise,
    "id" | "movementPattern" | "variantGroup" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  return (
    isBasePressExercise(exercise, focusContext) ||
    isDragExercise(exercise, focusContext) ||
    hasBudgetGroup(exercise, "shoulders") ||
    hasBudgetGroup(exercise, "biceps") ||
    hasBudgetGroup(exercise, "triceps") ||
    hasBudgetGroup(exercise, "chest") ||
    hasBudgetGroup(exercise, "back")
  );
}

function isLowerBodyExercise(
  exercise: Pick<
    NormalizedExercise,
    "id" | "movementPattern" | "variantGroup" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
) {
  return (
    isLowerBaseExercise(exercise, focusContext) ||
    isHingeExercise(exercise, focusContext) ||
    hasBudgetGroup(exercise, "quads") ||
    hasBudgetGroup(exercise, "hamstrings") ||
    hasBudgetGroup(exercise, "glutes") ||
    hasBudgetGroup(exercise, "calves")
  );
}

function supportsTriceps(
  exercise: Pick<NormalizedExercise, "primaryMuscles" | "secondaryMuscles">,
) {
  return hasBudgetGroup(exercise, "triceps") || exercise.primaryMuscles.includes("triceps");
}

function getOffFocusIssue(
  exercise: Pick<
    NormalizedExercise,
    "id" | "name" | "variantGroup" | "movementPattern" | "primaryMuscles" | "secondaryMuscles"
  >,
  focusContext?: ValidationFocusContext | null,
): OffFocusIssue | null {
  const focus = getEffectiveFocus(focusContext);
  if (!focus || focus === "full_body" || focus === "core") {
    return null;
  }

  const role = getExerciseRole(exercise, focusContext);
  const lowerBodyExercise = isLowerBodyExercise(exercise);
  const upperBodyExercise = isUpperBodyExercise(exercise);

  if (focus === "upper_body" && lowerBodyExercise && !isCoreOrCalfExercise(exercise)) {
    return {
      severity: "violation",
      reason: `${exercise.name} hör till underkropp och passar inte i ett upper_body-pass.`,
    };
  }

  if (focus === "lower_body" && upperBodyExercise && !isCoreOrCalfExercise(exercise)) {
    return {
      severity:
        role === "upper_back_accessory" || role === "secondary_press"
          ? "warning"
          : "violation",
      reason: `${exercise.name} hör till överkropp och ska normalt inte bära ett lower_body-pass.`,
    };
  }

  return null;
}

function isSafeForRecovery(
  exercise: Pick<NormalizedExercise, "riskLevel" | "movementPattern" | "variantGroup">,
  focusContext?: ValidationFocusContext | null,
) {
  const normalizedExperience = normalizeExperienceLevel(
    focusContext?.experienceLevel,
  );

  if (exercise.riskLevel === "high") {
    return false;
  }

  if (
    normalizedExperience === "beginner" &&
    exercise.riskLevel === "medium" &&
    (exercise.movementPattern === "vertical_push" ||
      exercise.variantGroup === "single_leg_squat")
  ) {
    return false;
  }

  return true;
}

function isForbiddenForFocus(params: {
  exercise: Pick<
    NormalizedExercise,
    | "id"
    | "name"
    | "movementPattern"
    | "variantGroup"
    | "primaryMuscles"
    | "secondaryMuscles"
    | "riskLevel"
  >;
  focusContext?: ValidationFocusContext | null;
  acceptedExercises: Array<
    Pick<
      NormalizedExercise,
      | "id"
      | "name"
      | "movementPattern"
      | "variantGroup"
      | "primaryMuscles"
      | "secondaryMuscles"
      | "riskLevel"
    >
  >;
}) {
  const focus = getEffectiveFocus(params.focusContext);
  if (!focus) {
    return false;
  }

  const isBeginner =
    normalizeExperienceLevel(params.focusContext?.experienceLevel) === "beginner";
  const shortPass = isShortPass(params.focusContext);
  const recoveryLimitedMuscles = new Set(
    params.focusContext?.recoveryLimitedMuscles ?? [],
  );
  const hitsRecoveryLimited = getBudgetGroupsForExercise(params.exercise).some((group) =>
    recoveryLimitedMuscles.has(group),
  );
  const hasBasePressAlready = params.acceptedExercises.some((exercise) =>
    isBasePressExercise(exercise, params.focusContext),
  );
  const role = getExerciseRole(params.exercise, params.focusContext);

  if (
    params.exercise.id === "pike_push_up" &&
    (focus === "lower_body" || focus === "recovery_strength")
  ) {
    return true;
  }

  if (
    params.exercise.id === "pike_push_up" &&
    hitsRecoveryLimited &&
    (focus === "upper_body" || focus === "full_body")
  ) {
    return true;
  }

  if (
    params.exercise.id === "assisted_pistol_squat" &&
    (focus === "upper_body" ||
      focus === "recovery_strength" ||
      shortPass ||
      isBeginner)
  ) {
    return true;
  }

  if (
    focus === "upper_body" &&
    (params.exercise.id === "step_up_bodyweight" ||
      params.exercise.id === "dumbbell_step_up" ||
      params.exercise.id === "bodyweight_split_squat" ||
      params.exercise.id === "reverse_lunge_bodyweight" ||
      params.exercise.id === "bodyweight_squat")
  ) {
    return true;
  }

  if (
    params.exercise.variantGroup === "chest_fly" &&
    !hasBasePressAlready &&
    !isBasePressExercise(params.exercise, params.focusContext)
  ) {
    return true;
  }

  if (
    focus === "lower_body" &&
    shortPass &&
    isUpperBodyExercise(params.exercise) &&
    !isCoreOrCalfExercise(params.exercise)
  ) {
    return true;
  }

  if (
    focus === "upper_body" &&
    isLowerBodyExercise(params.exercise) &&
    !isCoreOrCalfExercise(params.exercise)
  ) {
    return true;
  }

  if (
    focus === "recovery_strength" &&
    (!isSafeForRecovery(params.exercise, params.focusContext) ||
      params.exercise.id === "bodyweight_bench_dip" ||
      hitsRecoveryLimited ||
      role === "advanced_unilateral")
  ) {
    return true;
  }

  if (
    focus === "lower_body" &&
    (params.exercise.id === "bodyweight_bench_dip" ||
      params.exercise.id === "pike_push_up" ||
      params.exercise.id === "decline_push_up") &&
    (params.focusContext?.durationMinutes ?? 0) < 45
  ) {
    return true;
  }

  return false;
}

function countRecentOverlap(
  acceptedExercises: NormalizedExercise[],
  recentPreferences: RecentPreferenceContext,
) {
  return acceptedExercises.filter(
    (exercise) =>
      recentPreferences.recentExerciseIds.has(exercise.id) ||
      recentPreferences.recentVariantGroups.has(exercise.variantGroup),
  ).length;
}

function createNormalizedExercise(
  catalogExercise: ExerciseCatalogItem,
  aiExercise?: AiExerciseCandidate,
): NormalizedExercise {
  const isTimeBased =
    typeof catalogExercise.defaultDuration === "number" &&
    catalogExercise.defaultDuration > 0 &&
    typeof catalogExercise.defaultReps !== "number";

  return {
    id: catalogExercise.id,
    name: catalogExercise.name,
    description: catalogExercise.description,
    sets: clampPositiveInt(aiExercise?.sets, catalogExercise.defaultSets, 1, 8),
    reps: isTimeBased
      ? undefined
      : clampPositiveInt(
          aiExercise?.reps,
          catalogExercise.defaultReps ?? 10,
          1,
          30,
        ),
    duration: isTimeBased
      ? clampPositiveInt(
          aiExercise?.duration,
          catalogExercise.defaultDuration ?? 30,
          10,
          180,
        )
      : undefined,
    sidedness: catalogExercise.sidedness,
    ringSetup: catalogExercise.ringSetup,
    rest: clampPositiveInt(aiExercise?.rest, catalogExercise.defaultRest, 0, 240),
    suggestedWeight:
      typeof aiExercise?.suggestedWeight === "number" &&
      Number.isFinite(aiExercise.suggestedWeight)
        ? aiExercise.suggestedWeight
        : typeof aiExercise?.suggestedWeight === "string" &&
            aiExercise.suggestedWeight.trim()
          ? aiExercise.suggestedWeight.trim()
          : null,
    movementPattern: catalogExercise.movementPattern,
    primaryMuscles: catalogExercise.primaryMuscles,
    secondaryMuscles: catalogExercise.secondaryMuscles,
    variantGroup: catalogExercise.variantGroup,
    riskLevel: catalogExercise.riskLevel,
    sportsRelevance: catalogExercise.sportsRelevance,
  };
}

function pickPreferredCatalogExercise(
  candidates: ExerciseCatalogItem[],
  recentPreferences?: RecentPreferenceContext,
) {
  if (candidates.length === 0) {
    return null;
  }

  if (!recentPreferences) {
    return candidates[0] ?? null;
  }

  const notRecentlyUsed = candidates.filter(
    (exercise) => !recentPreferences.recentExerciseIds.has(exercise.id),
  );

  if (notRecentlyUsed.length > 0) {
    const notRecentVariant = notRecentlyUsed.filter(
      (exercise) =>
        !recentPreferences.recentVariantGroups.has(exercise.variantGroup),
    );

    return notRecentVariant[0] ?? notRecentlyUsed[0] ?? null;
  }

  const notRecentVariant = candidates.filter(
    (exercise) =>
      !recentPreferences.recentVariantGroups.has(exercise.variantGroup),
  );

  return notRecentVariant[0] ?? candidates[0] ?? null;
}

function getRequiredTemplateSlots(
  focusContext?: ValidationFocusContext | null,
) {
  const focus = getEffectiveFocus(focusContext);
  const duration = focusContext?.durationMinutes ?? 45;
  const strengthIntermediate =
    isStrengthGoal(focusContext) && isIntermediateOrAbove(focusContext);
  const shortHypertrophy = focusContext?.goal === "hypertrophy" && duration <= 25;
  const mediumHypertrophy =
    focusContext?.goal === "hypertrophy" && duration > 25 && duration <= 35;
  const surfBias = focusContext?.sportFocus === "surf_sports";

  if (focus === "lower_body") {
    if (strengthIntermediate && duration >= 35) {
      return ["lower_base", "hinge", "lower_secondary", "calf_or_core"];
    }

    if (shortHypertrophy) {
      return ["lower_base", "hinge", "lower_secondary", "calf_or_core"];
    }

    if (mediumHypertrophy) {
      return ["lower_base", "hinge", "lower_secondary", "glute_or_posterior", "core_or_calf"];
    }

    return ["lower_base", "hinge", "calf_or_core"];
  }

  if (focus === "upper_body") {
    const slots = ["press", "drag"];
    if (strengthIntermediate && duration >= 35) {
      slots.push("secondary_press_or_drag", "upper_accessory");
      return slots;
    }

    if (shortHypertrophy) {
      slots.push("upper_accessory");
      if (surfBias) {
        slots.push("core_or_carry");
      }
      return slots;
    }

    if (mediumHypertrophy) {
      slots.push("secondary_press_or_drag", "direct_arm_support");
      if (surfBias) {
        slots.push("core_or_carry");
      }
      return slots;
    }

    if (duration >= 25) {
      slots.push(
        (focusContext?.priorityMuscles ?? []).includes("triceps")
          ? "triceps_support"
          : "upper_accessory",
      );
    }
    return slots;
  }

  if (focus === "recovery_strength") {
    return ["safe_drag", "safe_press_or_glute", "safe_core_or_glute"];
  }

  if (focus === "full_body") {
    if (strengthIntermediate && duration >= 35) {
      return ["lower_primary_or_hinge", "press", "drag", "secondary_lower_or_core"];
    }

    if (duration <= 30) {
      return ["lower_base", "press", "drag", "hinge_or_core"];
    }

    return ["lower_base", "hinge", "press", "drag"];
  }

  if (focus === "core") {
    return ["safe_core_or_glute", "safe_drag"];
  }

  return [];
}

function matchesTemplateSlot(
  exercise: Pick<
    NormalizedExercise,
    "id" | "variantGroup" | "movementPattern" | "primaryMuscles" | "secondaryMuscles"
  >,
  slot: string,
  focusContext?: ValidationFocusContext | null,
) {
  const role = getExerciseRole(exercise, focusContext);

  if (slot === "lower_base") {
    return isLowerBaseExercise(exercise, focusContext);
  }
  if (slot === "lower_secondary") {
    return role === "secondary_lunge" || role === "glute_accessory" || role === "hamstring_accessory";
  }
  if (slot === "lower_primary_or_hinge") {
    return isLowerBaseExercise(exercise, focusContext) || isHingeExercise(exercise, focusContext);
  }
  if (slot === "secondary_lower_or_core") {
    return role === "secondary_lunge" || role === "glute_accessory" || role === "hamstring_accessory" || role === "core" || role === "carry";
  }
  if (slot === "hinge") {
    return isHingeExercise(exercise, focusContext);
  }
  if (slot === "press") {
    return isBasePressExercise(exercise, focusContext);
  }
  if (slot === "secondary_press_or_drag") {
    return role === "secondary_press" || role === "upper_back_accessory" || role === "primary_pull";
  }
  if (slot === "direct_arm_support") {
    return role === "biceps_isolation" || role === "triceps_press" || hasBudgetGroup(exercise, "shoulders");
  }
  if (slot === "drag" || slot === "safe_drag") {
    return isDragExercise(exercise, focusContext);
  }
  if (slot === "calf_or_core") {
    return isCoreOrCalfExercise(exercise);
  }
  if (slot === "core_or_carry") {
    return hasBudgetGroup(exercise, "core") || exercise.movementPattern === "carry";
  }
  if (slot === "core_or_calf") {
    return hasBudgetGroup(exercise, "core") || hasBudgetGroup(exercise, "calves");
  }
  if (slot === "glute_or_posterior") {
    return role === "glute_accessory" || role === "hamstring_accessory" || isHingeExercise(exercise, focusContext);
  }
  if (slot === "upper_accessory") {
    return (
      hasBudgetGroup(exercise, "shoulders") ||
      hasBudgetGroup(exercise, "biceps") ||
      hasBudgetGroup(exercise, "triceps")
    );
  }
  if (slot === "triceps_support") {
    return supportsTriceps(exercise);
  }
  if (slot === "hinge_or_core") {
    return isHingeExercise(exercise, focusContext) || hasBudgetGroup(exercise, "core");
  }
  if (slot === "safe_press_or_glute") {
    return isBasePressExercise(exercise, focusContext) || hasBudgetGroup(exercise, "glutes");
  }
  if (slot === "safe_core_or_glute") {
    return hasBudgetGroup(exercise, "core") || hasBudgetGroup(exercise, "glutes");
  }
  return false;
}

function getSlotLabel(slot: string) {
  if (slot === "lower_base") return "knädominant benövning";
  if (slot === "hinge") return "hinge/hamstring/glute";
  if (slot === "press") return "press";
  if (slot === "drag" || slot === "safe_drag") return "drag";
  if (slot === "calf_or_core") return "vad- eller bålinslag";
  if (slot === "core_or_carry") return "bål eller carry";
  if (slot === "core_or_calf") return "bål eller vader";
  if (slot === "glute_or_posterior") return "sätes- eller posterior-chain-inslag";
  if (slot === "upper_accessory") return "arm-/axelaccessoar";
  if (slot === "direct_arm_support") return "direkt arm- eller axelstöd";
  if (slot === "triceps_support") return "tricepsstöd";
  if (slot === "hinge_or_core") return "hinge eller bål";
  if (slot === "safe_press_or_glute") return "lätt press eller sätesövning";
  if (slot === "safe_core_or_glute") return "lätt bål- eller sätesövning";
  return slot;
}

function collectFocusDiagnostics(params: {
  exercises: Array<Pick<
    NormalizedExercise,
    | "id"
    | "name"
    | "movementPattern"
    | "variantGroup"
    | "primaryMuscles"
    | "secondaryMuscles"
    | "riskLevel"
  >>;
  focusContext?: ValidationFocusContext | null;
}) {
  const slots = getRequiredTemplateSlots(params.focusContext);
  const priorityGroups = deriveFocusPriorityGroups({
    globalPriorities: params.focusContext?.priorityMuscles ?? [],
    plannedFocus: getEffectiveFocus(params.focusContext),
  });
  const mustKeepViolations = slots
    .filter((slot) =>
      !params.exercises.some((exercise) =>
        matchesTemplateSlot(exercise, slot, params.focusContext),
      ),
    )
    .map((slot) => `Saknar ${getSlotLabel(slot)}.`);
  const forbiddenExerciseViolations = params.exercises
    .filter((exercise) =>
      isForbiddenForFocus({
        exercise,
        focusContext: params.focusContext,
        acceptedExercises: params.exercises,
      }),
    )
    .map((exercise) => `${exercise.name} bryter mot fokusreglerna.`);
  const offFocusIssues = params.exercises
    .map((exercise) => ({
      exercise,
      issue: getOffFocusIssue(exercise, params.focusContext),
    }))
    .filter(
      (
        value,
      ): value is {
        exercise: (typeof params.exercises)[number];
        issue: OffFocusIssue;
      } => Boolean(value.issue),
    );
  const focus = getEffectiveFocus(params.focusContext);
  const addedOffFocusExercises = offFocusIssues.map(({ exercise }) => exercise.name);
  const missingPriorityMuscles = priorityGroups.focusCompatiblePriorities.filter(
    (group) =>
      !params.exercises.some((exercise) => hasBudgetGroup(exercise, group)) &&
      !(params.focusContext?.recoveryLimitedMuscles ?? []).includes(group),
  );

  const hasPrimaryPull = params.exercises.some((exercise) =>
    getExerciseRole(exercise, params.focusContext) === "primary_pull",
  );
  const lostPrimaryRoles: string[] = [];

  if (
    focus === "full_body" &&
    !hasPrimaryPull &&
    params.exercises.some((exercise) => exercise.variantGroup === "rear_delt")
  ) {
    lostPrimaryRoles.push("Saknar primary_pull; face pull räknas som accessory.");
  }

  return {
    mustKeepViolations,
    missingMovementPatterns: slots
      .filter((slot) =>
        !params.exercises.some((exercise) =>
          matchesTemplateSlot(exercise, slot, params.focusContext),
        ),
      )
      .map((slot) => getSlotLabel(slot)),
    missingPriorityMuscles,
    forbiddenExerciseViolations,
    addedOffFocusExercises,
    offFocusWarnings: offFocusIssues
      .filter(({ issue }) => issue.severity === "warning")
      .map(({ issue }) => issue.reason),
    offFocusViolations: offFocusIssues
      .filter(({ issue }) => issue.severity === "violation")
      .map(({ issue }) => issue.reason),
    lostPrimaryRoles,
  } satisfies FocusDiagnostics;
}

function buildCandidatePool(params: {
  currentExercises: NormalizedExercise[];
  availableCatalog: ExerciseCatalogItem[];
}) {
  const pool: CandidatePoolExercise[] = [];
  const seenIds = new Set<string>();

  for (const exercise of params.currentExercises) {
    if (seenIds.has(exercise.id)) {
      continue;
    }
    seenIds.add(exercise.id);
    pool.push({ ...exercise, source: "ai" });
  }

  for (const exercise of params.availableCatalog) {
    if (seenIds.has(exercise.id)) {
      continue;
    }
    seenIds.add(exercise.id);
    pool.push({ ...createNormalizedExercise(exercise), source: "catalog" });
  }

  return pool;
}

function scoreExerciseReplacement(params: {
  candidate: CandidatePoolExercise;
  requestedMovementPattern?: MovementPattern;
  requestedBudgetGroups: MuscleBudgetGroup[];
  focusContext?: ValidationFocusContext | null;
  acceptedExercises: NormalizedExercise[];
  requiredSlot?: string | null;
  recentPreferences?: RecentPreferenceContext;
}) {
  if (
    isForbiddenForFocus({
      exercise: params.candidate,
      focusContext: params.focusContext,
      acceptedExercises: params.acceptedExercises,
    })
  ) {
    return -100;
  }

  const priorityGroups = deriveFocusPriorityGroups({
    globalPriorities: params.focusContext?.priorityMuscles ?? [],
    plannedFocus: getEffectiveFocus(params.focusContext),
  });
  const candidateRole = getExerciseRole(params.candidate, params.focusContext);
  let score = params.candidate.source === "ai" ? 6 : 0;

  if (
    params.requestedMovementPattern &&
    params.candidate.movementPattern === params.requestedMovementPattern
  ) {
    score += 8;
  }

  const overlappingGroups = params.requestedBudgetGroups.filter((group) =>
    hasBudgetGroup(params.candidate, group),
  );
  score += overlappingGroups.length * 4;

  if (
    params.requiredSlot &&
    matchesTemplateSlot(params.candidate, params.requiredSlot, params.focusContext)
  ) {
    score += 7;
  }

  if (
    priorityGroups.focusCompatiblePriorities.some((group) =>
      hasBudgetGroup(params.candidate, group),
    )
  ) {
    score += 4;
  }

  if (isSportRelevantExercise(params.candidate, params.focusContext)) {
    score += 1.5;
  }

  if (
    params.focusContext?.plannedFocus === "recovery_strength" ||
    normalizeExperienceLevel(params.focusContext?.experienceLevel) === "beginner" ||
    isShortPass(params.focusContext)
  ) {
    score +=
      params.candidate.riskLevel === "low"
        ? 3
        : params.candidate.riskLevel === "medium"
          ? 0
          : -8;
  }

  if (
    params.requiredSlot === "drag" &&
    candidateRole === "upper_back_accessory"
  ) {
    score -= 16;
  }

  if (
    params.requiredSlot === "press" &&
    candidateRole === "chest_isolation"
  ) {
    score -= 18;
  }

  if (
    isStrengthGoal(params.focusContext) &&
    isIntermediateOrAbove(params.focusContext)
  ) {
    if (
      (params.requiredSlot === "press" ||
        params.requiredSlot === "drag" ||
        params.requiredSlot === "lower_base" ||
        params.requiredSlot === "hinge") &&
      !isLoadedProgressionExercise(params.candidate, params.focusContext)
    ) {
      score -= 12;
    }

    if (
      params.candidate.id === "bodyweight_squat" ||
      params.candidate.id === "step_up_bodyweight" ||
      params.candidate.id === "push_up" ||
      params.candidate.id === "decline_push_up"
    ) {
      score -= 7;
    }
  }

  if (
    params.requestedMovementPattern === "horizontal_push" &&
    params.candidate.variantGroup === "chest_fly" &&
    !params.acceptedExercises.some((exercise) =>
      isBasePressExercise(exercise, params.focusContext),
    )
  ) {
    score -= 14;
  }

  if (
    params.requestedMovementPattern === "horizontal_pull" &&
    candidateRole === "upper_back_accessory"
  ) {
    score -= 10;
  }

  if (
    params.recentPreferences?.recentExerciseIds.has(params.candidate.id) ||
    params.recentPreferences?.recentVariantGroups.has(params.candidate.variantGroup)
  ) {
    score -= 2;
  }

  const focus = getEffectiveFocus(params.focusContext);
  if (
    focus === "lower_body" &&
    isUpperBodyExercise(params.candidate) &&
    !isCoreOrCalfExercise(params.candidate)
  ) {
    score -= 18;
  }
  if (
    focus === "upper_body" &&
    isLowerBodyExercise(params.candidate) &&
    !isCoreOrCalfExercise(params.candidate)
  ) {
    score -= 18;
  }

  if (
    focus === "lower_body" &&
    (candidateRole === "secondary_lunge" || candidateRole === "primary_squat") &&
    params.acceptedExercises.filter((exercise) => {
      const role = getExerciseRole(exercise, params.focusContext);
      return role === "secondary_lunge" || role === "primary_squat";
    }).length >= 2
  ) {
    score -= 10;
  }

  return score;
}

function findFallbackExercise(params: {
  requestedMovementPattern?: string;
  requestedCatalogExercise?: ExerciseCatalogItem | null;
  availableCatalog: ExerciseCatalogItem[];
  acceptedExercises: NormalizedExercise[];
  focusContext?: ValidationFocusContext | null;
  recentPreferences?: RecentPreferenceContext;
}) {
  const requestedMovementPattern =
    typeof params.requestedMovementPattern === "string" &&
    VALID_MOVEMENT_PATTERNS.includes(
      params.requestedMovementPattern as MovementPattern,
    )
      ? (params.requestedMovementPattern as MovementPattern)
      : undefined;
  const requestedBudgetGroups = params.requestedCatalogExercise
    ? getBudgetGroupsForExercise({
        primaryMuscles: params.requestedCatalogExercise.primaryMuscles,
        secondaryMuscles: params.requestedCatalogExercise.secondaryMuscles,
      })
    : [];

  const ranked = params.availableCatalog
    .filter((exercise) => !hasExerciseId(exercise.id, params.acceptedExercises))
    .map((exercise) => {
      const normalizedCandidate = {
        ...createNormalizedExercise(exercise),
        source: "catalog" as const,
      };

      return {
        exercise,
        score: scoreExerciseReplacement({
          candidate: normalizedCandidate,
          requestedMovementPattern,
          requestedBudgetGroups,
          focusContext: params.focusContext,
          acceptedExercises: params.acceptedExercises,
          recentPreferences: params.recentPreferences,
        }),
        balanceIssue: getBalanceIssue(
          {
            movementPattern: exercise.movementPattern,
            primaryMuscles: exercise.primaryMuscles,
            variantGroup: exercise.variantGroup,
          },
          params.acceptedExercises,
        ),
      };
    })
    .filter(({ score }) => score > -20)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.balanceIssue && !right.balanceIssue) {
        return 1;
      }

      if (!left.balanceIssue && right.balanceIssue) {
        return -1;
      }

      return 0;
    });

  return ranked[0]?.exercise ?? null;
}

function pickStarterExercises(params: {
  availableCatalog: ExerciseCatalogItem[];
  acceptedExercises: NormalizedExercise[];
  count: number;
  fills: ValidationDebugEntry[];
  recentPreferences?: RecentPreferenceContext;
  focusContext?: ValidationFocusContext | null;
}) {
  const focus = getEffectiveFocus(params.focusContext);
  const preferredPatterns: MovementPattern[] =
    focus === "lower_body"
      ? ["squat", "hinge", "lunge", "core", "carry"]
      : focus === "upper_body"
        ? ["horizontal_push", "horizontal_pull", "vertical_pull", "vertical_push", "core"]
        : focus === "recovery_strength"
          ? ["horizontal_pull", "horizontal_push", "hinge", "core", "carry"]
          : ["squat", "horizontal_push", "horizontal_pull", "hinge", "core", "vertical_pull"];

  for (const pattern of preferredPatterns) {
    if (params.acceptedExercises.length >= params.count) {
      break;
    }

    const candidates = params.availableCatalog.filter(
      (exercise) =>
        exercise.movementPattern === pattern &&
        !hasExerciseId(exercise.id, params.acceptedExercises) &&
        !isForbiddenForFocus({
          exercise: createNormalizedExercise(exercise),
          focusContext: params.focusContext,
          acceptedExercises: params.acceptedExercises,
        }) &&
        !getBalanceIssue(
          {
            movementPattern: exercise.movementPattern,
            primaryMuscles: exercise.primaryMuscles,
            variantGroup: exercise.variantGroup,
          },
          params.acceptedExercises,
        ),
    );

    const candidate = pickPreferredCatalogExercise(candidates, params.recentPreferences);

    if (!candidate) {
      continue;
    }

    params.acceptedExercises.push(createNormalizedExercise(candidate));
    params.fills.push({
      requestedId: null,
      requestedName: null,
      requestedMovementPattern: pattern,
      selectedId: candidate.id,
      selectedName: candidate.name,
      reasonCode: "filled_missing_slots",
      reason: "AI lämnade tom plats och valideringen fyllde på med fokusnära standardövning.",
    });
  }
}

function chooseBestExerciseForSlot(params: {
  slot: string;
  pool: CandidatePoolExercise[];
  selected: NormalizedExercise[];
  focusContext?: ValidationFocusContext | null;
  recentPreferences?: RecentPreferenceContext;
}) {
  const ranked = params.pool
    .filter(
      (candidate) =>
        !hasExerciseId(candidate.id, params.selected) &&
        matchesTemplateSlot(candidate, params.slot, params.focusContext),
    )
    .map((candidate) => ({
      candidate,
      score: scoreExerciseReplacement({
        candidate,
        requestedBudgetGroups: [],
        focusContext: params.focusContext,
        acceptedExercises: params.selected,
        requiredSlot: params.slot,
        recentPreferences: params.recentPreferences,
      }),
    }))
    .filter(({ score }) => score > -20)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.candidate ?? null;
}

function enforceFocusTemplate(params: {
  exercises: NormalizedExercise[];
  availableCatalog: ExerciseCatalogItem[];
  focusContext?: ValidationFocusContext | null;
  targetExerciseCount: number;
  recentPreferences?: RecentPreferenceContext;
}) {
  if (!params.focusContext?.plannedFocus) {
    return {
      exercises: params.exercises,
      warnings: [] as string[],
      diagnostics: collectFocusDiagnostics({
        exercises: params.exercises,
        focusContext: params.focusContext,
      }),
      beforeAfterDiff: [] as ValidateAiExercisesResult["debug"]["beforeAfterDiff"],
    };
  }

  const pool = buildCandidatePool({
    currentExercises: params.exercises,
    availableCatalog: params.availableCatalog,
  });
  const selected: NormalizedExercise[] = [];
  const warnings: string[] = [];
  const slots = getRequiredTemplateSlots(params.focusContext);

  for (const slot of slots) {
    if (selected.length >= params.targetExerciseCount) {
      break;
    }

    const candidate = chooseBestExerciseForSlot({
      slot,
      pool,
      selected,
      focusContext: params.focusContext,
      recentPreferences: params.recentPreferences,
    });

    if (!candidate) {
      warnings.push(`Valideringen hittade ingen säker ersättare för ${getSlotLabel(slot)}.`);
      continue;
    }

    selected.push(candidate);
  }

  const rankedFills = pool
    .filter((candidate) => !hasExerciseId(candidate.id, selected))
    .map((candidate) => ({
      candidate,
      score: scoreExerciseReplacement({
        candidate,
        requestedBudgetGroups: [],
        focusContext: params.focusContext,
        acceptedExercises: selected,
        recentPreferences: params.recentPreferences,
      }),
    }))
    .filter(({ score }) => score > -10)
    .sort((left, right) => right.score - left.score);

  for (const { candidate } of rankedFills) {
    if (selected.length >= params.targetExerciseCount) {
      break;
    }
    selected.push(candidate);
  }

  if (selected.length === 0) {
    selected.push(...params.exercises.slice(0, params.targetExerciseCount));
  }

  const diagnostics = collectFocusDiagnostics({
    exercises: selected,
    focusContext: params.focusContext,
  });
  const beforeIds = new Set(params.exercises.map((exercise) => exercise.id));
  const afterIds = new Set(selected.map((exercise) => exercise.id));
  const beforeAfterDiff: ValidateAiExercisesResult["debug"]["beforeAfterDiff"] = [
    ...params.exercises
      .filter((exercise) => !afterIds.has(exercise.id))
      .map((exercise) => ({
        type: "removed" as const,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        reason: "Togs bort för att bevara fokus, must-keeps eller återhämtningssäkerhet.",
      })),
    ...selected
      .filter((exercise) => !beforeIds.has(exercise.id))
      .map((exercise) => ({
        type: "added" as const,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        reason: "Lades till för att täcka fokusets must-have-mönster eller säkrare fallback.",
      })),
  ];

  return {
    exercises: selected.slice(0, params.targetExerciseCount),
    warnings,
    diagnostics,
    beforeAfterDiff,
  };
}

function buildStageExerciseDebug(
  exercises: Array<
    Pick<
      NormalizedExercise,
      "id" | "name" | "variantGroup" | "movementPattern" | "primaryMuscles" | "secondaryMuscles"
    >
  >,
  focusContext?: ValidationFocusContext | null,
) {
  return exercises.map(
    (exercise) =>
      ({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        variantGroup: exercise.variantGroup,
        movementPattern: exercise.movementPattern,
        exerciseRole: getExerciseRole(exercise, focusContext),
        qualityRoles: getQualityRoles(exercise, focusContext),
      }) satisfies StageExerciseDebug,
  );
}

function buildRawStageExerciseDebug(params: {
  aiExercises: AiExerciseCandidate[];
  availableCatalog: ExerciseCatalogItem[];
  focusContext?: ValidationFocusContext | null;
}) {
  return params.aiExercises
    .map((exercise) => {
      const matchedById =
        typeof exercise.id === "string"
          ? findCatalogExerciseById(exercise.id, params.availableCatalog)
          : null;
      const matchedByName =
        typeof exercise.name === "string"
          ? findCatalogExerciseByName(exercise.name, params.availableCatalog)
          : null;
      const matched = matchedById ?? matchedByName;

      if (matched) {
        return createNormalizedExercise(matched, exercise);
      }

      const fallbackName =
        typeof exercise.name === "string" && exercise.name.trim()
          ? exercise.name.trim()
          : exercise.id?.trim() || "Okänd AI-övning";
      const movementPattern =
        typeof exercise.movementPattern === "string" &&
        VALID_MOVEMENT_PATTERNS.includes(exercise.movementPattern as MovementPattern)
          ? (exercise.movementPattern as MovementPattern)
          : "core";

      return {
        id: exercise.id?.trim() || `raw:${normalizeExerciseName(fallbackName)}`,
        name: fallbackName,
        description: "",
        sets: clampPositiveInt(exercise.sets, 3, 1, 8),
        reps: typeof exercise.reps === "number" ? exercise.reps : 10,
        duration: typeof exercise.duration === "number" ? exercise.duration : undefined,
        rest: clampPositiveInt(exercise.rest, 45, 0, 240),
        movementPattern,
        primaryMuscles: [],
        secondaryMuscles: [],
        variantGroup: "raw_request",
        riskLevel: "low" as const,
        sportsRelevance: undefined,
      } satisfies NormalizedExercise;
    })
    .map(
      (exercise) =>
        ({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          variantGroup: exercise.variantGroup,
          movementPattern: exercise.movementPattern,
          exerciseRole: getExerciseRole(exercise, params.focusContext),
          qualityRoles: getQualityRoles(exercise, params.focusContext),
        }) satisfies StageExerciseDebug,
    );
}

function diffExerciseStages(params: {
  before: StageExerciseDebug[];
  after: StageExerciseDebug[];
  removedReason: string;
  addedReason: string;
}) {
  const beforeIds = new Set(params.before.map((exercise) => exercise.exerciseId));
  const afterIds = new Set(params.after.map((exercise) => exercise.exerciseId));

  return [
    ...params.before
      .filter((exercise) => !afterIds.has(exercise.exerciseId))
      .map((exercise) => ({
        type: "removed" as const,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        reason: params.removedReason,
      })),
    ...params.after
      .filter((exercise) => !beforeIds.has(exercise.exerciseId))
      .map((exercise) => ({
        type: "added" as const,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        reason: params.addedReason,
      })),
  ];
}

export function validateAndNormalizeAiExercises(params: {
  aiExercises: AiExerciseCandidate[];
  availableEquipment: string[];
  recentExerciseIds?: string[];
  recentVariantGroups?: string[];
  targetExerciseCount?: number;
  focusContext?: ValidationFocusContext | null;
}): ValidateAiExercisesResult {
  const normalizedEquipment = new Set<EquipmentId>(
    normalizeEquipmentList(params.availableEquipment),
  );

  const availableCatalog = EXERCISE_CATALOG.filter((exercise) =>
    exercise.requiredEquipment.every((item) => normalizedEquipment.has(item)),
  );
  const warnings: string[] = [];

  if (availableCatalog.length === 0) {
    return {
      exercises: [],
      debug: {
        availableCatalogCount: 0,
        requestedExerciseCount: Array.isArray(params.aiExercises)
          ? params.aiExercises.length
          : 0,
        targetExerciseCount: 0,
        acceptedDirectly: [],
        replacements: [],
        fills: [],
        warnings: ["Ingen tillgänglig katalog återstod efter utrustningsfiltrering."],
        finalExerciseIds: [],
        focusIntegrityScore: 0,
        strengthSpecificityScore: 0,
        qualityPreservationScore: 0,
        goalSpecificityLoss: 100,
        sportSpecificityLoss: 100,
        catalogResolutionLoss: 100,
        mustKeepViolations: ["Ingen tillgänglig katalog återstod efter utrustningsfiltrering."],
        offFocusWarnings: [],
        offFocusViolations: [],
        forbiddenExerciseViolations: [],
        lostMovementPatterns: [],
        lostPrimaryRoles: [],
        lostPriorityMuscles: [],
        lostUsefulRoles: [],
        lostPrimaryOrHighValueExercises: [],
        lostSportRelevantExercises: [],
        sportRelevantExercisesKept: [],
        sportRelevantExercisesLost: [],
        deferredPriorityMuscles: [],
        removedPrimaryExercises: [],
        addedOffFocusExercises: [],
        removedBecauseOffFocus: [],
        removedBecauseRecovery: [],
        removedBecauseDuplicateRole: [],
        fallbackExercisesAdded: [],
        normalizationWarnings: ["Ingen tillgänglig katalog återstod efter utrustningsfiltrering."],
        fallbackBiasWarning: null,
        durationTrimReason: null,
        roleTrimReason: null,
        compatibleExercisesRejectedWithReason: [],
        priorityMuscleResolutionStatus: [],
        primaryLiftCount: 0,
        loadedProgressionExerciseCount: 0,
        bodyweightOnlyCount: 0,
        mainLiftMissingWarnings: [],
        repeatedPatternCount: 0,
        repeatedVariantGroups: [],
        plannedProgressionRepeats: [],
        fallbackRepeats: [],
        normalizationLossScore: 100,
        aiRawExercises: [],
        afterCatalogMatch: [],
        afterFocusRepair: [],
        finalExercises: [],
        rawToCatalogDiff: [],
        catalogToFocusRepairDiff: [],
        focusRepairToFinalDiff: [],
        beforeAfterDiff: [],
        validationContext: {
          plannedFocus: getEffectiveFocus(params.focusContext),
          goal: params.focusContext?.goal ?? "health",
          experienceLevel: normalizeExperienceLevel(
            params.focusContext?.experienceLevel,
          ),
          durationMinutes: params.focusContext?.durationMinutes ?? 0,
          priorityMuscles: params.focusContext?.priorityMuscles ?? [],
          focusCompatiblePriorities: deriveFocusPriorityGroups({
            globalPriorities: params.focusContext?.priorityMuscles ?? [],
            plannedFocus: getEffectiveFocus(params.focusContext),
          }).focusCompatiblePriorities,
          deferredPriorities: deriveFocusPriorityGroups({
            globalPriorities: params.focusContext?.priorityMuscles ?? [],
            plannedFocus: getEffectiveFocus(params.focusContext),
          }).deferredPriorities,
          recoveryLimitedMuscles: params.focusContext?.recoveryLimitedMuscles ?? [],
          availableEquipment: params.focusContext?.availableEquipment ?? [],
          sportFocus: params.focusContext?.sportFocus ?? null,
        },
      },
    };
  }

  const targetExerciseCount = clampPositiveInt(
    params.targetExerciseCount,
    6,
    3,
    10,
  );
  const recentPreferences: RecentPreferenceContext = {
    recentExerciseIds: new Set(
      Array.isArray(params.recentExerciseIds)
        ? params.recentExerciseIds.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
        : [],
    ),
    recentVariantGroups: new Set(
      Array.isArray(params.recentVariantGroups)
        ? params.recentVariantGroups.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
        : [],
    ),
  };

  const normalizedExercises: NormalizedExercise[] = [];
  const acceptedDirectly: ValidationDebugEntry[] = [];
  const replacements: ValidationDebugEntry[] = [];
  const fills: ValidationDebugEntry[] = [];
  const compatibleExercisesRejectedWithReason: RequestedExerciseRejection[] = [];

  if (!Array.isArray(params.aiExercises) || params.aiExercises.length === 0) {
    warnings.push("AI returnerade inga övningar. Valideringen fyllde hela passet.");
  }

  for (const aiExercise of params.aiExercises) {
    if (normalizedExercises.length >= targetExerciseCount) {
      break;
    }

    const requestedId =
      typeof aiExercise.id === "string" && aiExercise.id.trim()
        ? aiExercise.id.trim()
        : null;
    const requestedName =
      typeof aiExercise.name === "string" && aiExercise.name.trim()
        ? aiExercise.name.trim()
        : null;
    const requestedMovementPattern =
      typeof aiExercise.movementPattern === "string" &&
      aiExercise.movementPattern.trim()
        ? aiExercise.movementPattern.trim()
        : null;
    const requestedCatalogExercise = requestedId
      ? findCatalogExerciseById(requestedId, availableCatalog)
      : requestedName
        ? findCatalogExerciseByName(requestedName, availableCatalog)
        : null;

    const matchedExercise = requestedCatalogExercise;
    if (matchedExercise) {
      const duplicate = hasExerciseId(matchedExercise.id, normalizedExercises);
      const balanceIssue = getBalanceIssue(
        {
          movementPattern: matchedExercise.movementPattern,
          primaryMuscles: matchedExercise.primaryMuscles,
          variantGroup: matchedExercise.variantGroup,
        },
        normalizedExercises,
      );
      const repeatedRecently =
        recentPreferences.recentExerciseIds.has(matchedExercise.id) ||
        recentPreferences.recentVariantGroups.has(matchedExercise.variantGroup);
      const shouldPreferVariation =
        repeatedRecently &&
        countRecentOverlap(normalizedExercises, recentPreferences) >= 1;
      const forbidden = isForbiddenForFocus({
        exercise: createNormalizedExercise(matchedExercise, aiExercise),
        focusContext: params.focusContext,
        acceptedExercises: normalizedExercises,
      });

      if (!duplicate && !balanceIssue && !forbidden && shouldPreferVariation) {
        const variationFallback = findFallbackExercise({
          requestedMovementPattern:
            requestedMovementPattern ?? matchedExercise.movementPattern,
          requestedCatalogExercise: matchedExercise,
          availableCatalog,
          acceptedExercises: normalizedExercises,
          focusContext: params.focusContext,
          recentPreferences,
        });

        if (variationFallback && variationFallback.id !== matchedExercise.id) {
          normalizedExercises.push(
            createNormalizedExercise(variationFallback, aiExercise),
          );
          replacements.push({
            requestedId,
            requestedName,
            requestedMovementPattern,
            selectedId: variationFallback.id,
            selectedName: variationFallback.name,
            reasonCode: "recent_variation_preference",
            reason:
              "AI-valet ersattes för att ge bättre variation jämfört med de senaste passen.",
          });
          continue;
        }
      }

      if (!duplicate && !balanceIssue && !forbidden) {
        normalizedExercises.push(createNormalizedExercise(matchedExercise, aiExercise));
        acceptedDirectly.push({
          requestedId,
          requestedName,
          requestedMovementPattern,
          selectedId: matchedExercise.id,
          selectedName: matchedExercise.name,
          reasonCode: "accepted_exact_match",
          reason: "AI-valet accepterades direkt.",
        });
        continue;
      }

      const fallback = findFallbackExercise({
        requestedMovementPattern: requestedMovementPattern ?? undefined,
        requestedCatalogExercise: matchedExercise,
        availableCatalog,
        acceptedExercises: normalizedExercises,
        focusContext: params.focusContext,
        recentPreferences,
      });

      if (fallback) {
        normalizedExercises.push(createNormalizedExercise(fallback, aiExercise));
        replacements.push({
          requestedId,
          requestedName,
          requestedMovementPattern,
          selectedId: fallback.id,
          selectedName: fallback.name,
          reasonCode: duplicate
            ? "duplicate_exercise_id"
            : forbidden
              ? "integrity_repair"
              : "balance_adjustment",
          reason: duplicate
            ? "AI försökte använda samma övning flera gånger."
            : forbidden
              ? "AI-valet ersattes eftersom övningen bröt mot planerat fokus eller återhämtningsregler."
              : `AI-valet ersattes eftersom ${balanceIssue?.message ?? "balansen i passet blev svag"}.`,
        });
        compatibleExercisesRejectedWithReason.push({
          exerciseName: matchedExercise.name,
          stage: "catalog_to_focus_repair",
          reason: duplicate
            ? "Ersattes eftersom samma övning redan fanns i passet."
            : forbidden
              ? "Ersattes eftersom övningen bröt mot fokus-, recovery- eller säkerhetsregler."
              : `Ersattes eftersom ${balanceIssue?.message ?? "rollen var överrepresenterad"}.`,
        });
      } else if (forbidden) {
        warnings.push(
          `${matchedExercise.name} togs bort eftersom den inte passade planerat fokus och ingen säker ersättare hittades direkt.`,
        );
        compatibleExercisesRejectedWithReason.push({
          exerciseName: matchedExercise.name,
          stage: "catalog_to_focus_repair",
          reason:
            "Togs bort eftersom den bröt mot fokus- eller återhämtningsregler och ingen säker ersättare hittades.",
        });
      }

      continue;
    }

    const fallback = findFallbackExercise({
      requestedMovementPattern: requestedMovementPattern ?? undefined,
      requestedCatalogExercise: null,
      availableCatalog,
      acceptedExercises: normalizedExercises,
      focusContext: params.focusContext,
      recentPreferences,
    });
    const fullCatalogMatch =
      requestedId
        ? findCatalogExerciseById(requestedId, EXERCISE_CATALOG)
        : requestedName
          ? findCatalogExerciseByName(requestedName, EXERCISE_CATALOG)
          : null;
    const unresolvedReason = fullCatalogMatch
      ? "Övningen finns i katalogen men matchade inte den tillgängliga utrustningen eller tidiga säkerhetsregler."
      : "Övningen kunde inte matchas säkert mot katalogen.";

    if (fallback) {
      normalizedExercises.push(createNormalizedExercise(fallback, aiExercise));
      replacements.push({
        requestedId,
        requestedName,
        requestedMovementPattern,
        selectedId: fallback.id,
        selectedName: fallback.name,
        reasonCode:
          requestedId || requestedName
            ? "invalid_or_missing_id"
            : "empty_ai_response",
        reason:
          requestedId || requestedName
            ? "AI-valet saknade giltigt id i katalogen och ersattes."
            : "AI lämnade tomt eller ofullständigt val och ersattes.",
      });
      if (requestedName || requestedId) {
        compatibleExercisesRejectedWithReason.push({
          exerciseName: requestedName ?? requestedId ?? "Okänd AI-övning",
          stage: "raw_to_catalog",
          reason: `${unresolvedReason} Den ersattes därför med en fokuskompatibel fallback.`,
        });
      }
    } else if (requestedName || requestedId) {
      compatibleExercisesRejectedWithReason.push({
        exerciseName: requestedName ?? requestedId ?? "Okänd AI-övning",
        stage: "raw_to_catalog",
        reason: `${unresolvedReason} Ingen fokuskompatibel fallback hittades.`,
      });
    }
  }

  if (normalizedExercises.length < Math.min(3, targetExerciseCount)) {
    pickStarterExercises({
      availableCatalog,
      acceptedExercises: normalizedExercises,
      count: Math.min(targetExerciseCount, 6),
      fills,
      recentPreferences,
      focusContext: params.focusContext,
    });
  }

  if (normalizedExercises.length < targetExerciseCount) {
    const orderedCatalog = [...availableCatalog].sort((left, right) => {
      const leftRecentScore =
        (recentPreferences.recentExerciseIds.has(left.id) ? 1 : 0) +
        (recentPreferences.recentVariantGroups.has(left.variantGroup) ? 1 : 0);
      const rightRecentScore =
        (recentPreferences.recentExerciseIds.has(right.id) ? 1 : 0) +
        (recentPreferences.recentVariantGroups.has(right.variantGroup) ? 1 : 0);

      return leftRecentScore - rightRecentScore;
    });

    for (const exercise of orderedCatalog) {
      if (normalizedExercises.length >= targetExerciseCount) {
        break;
      }

      if (
        hasExerciseId(exercise.id, normalizedExercises) ||
        isForbiddenForFocus({
          exercise: createNormalizedExercise(exercise),
          focusContext: params.focusContext,
          acceptedExercises: normalizedExercises,
        })
      ) {
        continue;
      }

      if (
        getBalanceIssue(
          {
            movementPattern: exercise.movementPattern,
            primaryMuscles: exercise.primaryMuscles,
            variantGroup: exercise.variantGroup,
          },
          normalizedExercises,
        )
      ) {
        continue;
      }

      normalizedExercises.push(createNormalizedExercise(exercise));
      fills.push({
        requestedId: null,
        requestedName: null,
        requestedMovementPattern: exercise.movementPattern,
        selectedId: exercise.id,
        selectedName: exercise.name,
        reasonCode: "filled_missing_slots",
        reason: "Valideringen fyllde på med fokusnära reservövning.",
      });
    }
  }

  const preTemplateExercises = [...normalizedExercises];
  const templateResult = enforceFocusTemplate({
    exercises: normalizedExercises,
    availableCatalog,
    focusContext: params.focusContext,
    targetExerciseCount,
    recentPreferences,
  });

  normalizedExercises.splice(0, normalizedExercises.length, ...templateResult.exercises);
  warnings.push(...templateResult.warnings);

  if (replacements.length > 0) {
    warnings.push(
      `Valideringen ersatte ${replacements.length} AI-val för att förbättra balans eller rätta ogiltiga id:n.`,
    );
  }

  if (fills.length > 0) {
    warnings.push(
      `Valideringen fyllde ${fills.length} platser eftersom AI inte gav tillräckligt många användbara övningar.`,
    );
  }

  const diagnostics = templateResult.diagnostics;
  const priorityGroups = deriveFocusPriorityGroups({
    globalPriorities: params.focusContext?.priorityMuscles ?? [],
    plannedFocus: getEffectiveFocus(params.focusContext),
  });
  const removedPrimaryExercises = preTemplateExercises
    .filter((exercise) => !normalizedExercises.some((item) => item.id === exercise.id))
    .map((exercise) => exercise.name);
  const aiRawExercises = buildRawStageExerciseDebug({
    aiExercises: params.aiExercises,
    availableCatalog,
    focusContext: params.focusContext,
  });
  const afterCatalogMatch = buildStageExerciseDebug(
    preTemplateExercises,
    params.focusContext,
  );
  const afterFocusRepair = buildStageExerciseDebug(
    normalizedExercises,
    params.focusContext,
  );
  const finalExercises = buildStageExerciseDebug(
    normalizedExercises,
    params.focusContext,
  );
  const rawToCatalogDiff = diffExerciseStages({
    before: aiRawExercises,
    after: afterCatalogMatch,
    removedReason: "Togs bort vid katalogmatchning eller första säkerhetsfiltrering.",
    addedReason: "Lades till som katalogmatchad eller säker ersättning.",
  }).map((entry) => {
    const explicitReason = compatibleExercisesRejectedWithReason.find(
      (item) => item.stage === "raw_to_catalog" && item.exerciseName === entry.exerciseName,
    );
    return explicitReason ? { ...entry, reason: explicitReason.reason } : entry;
  });
  const catalogToFocusRepairDiff = diffExerciseStages({
    before: afterCatalogMatch,
    after: afterFocusRepair,
    removedReason: "Togs bort för att reparera fokus, roller eller must-keeps.",
    addedReason: "Lades till för att uppfylla fokusets must-keeps eller säkrare fallback.",
  }).map((entry) => {
    const explicitReason = compatibleExercisesRejectedWithReason.find(
      (item) =>
        item.stage === "catalog_to_focus_repair" &&
        item.exerciseName === entry.exerciseName,
    );
    return explicitReason ? { ...entry, reason: explicitReason.reason } : entry;
  });
  const focusRepairToFinalDiff = diffExerciseStages({
    before: afterFocusRepair,
    after: finalExercises,
    removedReason: "Togs bort i sista trimningen.",
    addedReason: "Lades till i sista trimningen.",
  }).map((entry) => {
    const explicitReason = compatibleExercisesRejectedWithReason.find(
      (item) =>
        item.stage === "focus_repair_to_final" &&
        item.exerciseName === entry.exerciseName,
    );
    return explicitReason ? { ...entry, reason: explicitReason.reason } : entry;
  });
  const rawRoleSet = new Set(aiRawExercises.flatMap((exercise) => exercise.qualityRoles));
  const finalRoleSet = new Set(finalExercises.flatMap((exercise) => exercise.qualityRoles));
  const lostUsefulRoles = [...rawRoleSet].filter((role) => !finalRoleSet.has(role));
  const lostPrimaryOrHighValueExercises = aiRawExercises
    .filter((exercise) =>
      ["main_push", "main_pull", "hinge", "squat_or_lunge", "direct_biceps", "direct_triceps", "carry_grip"].some(
        (role) => exercise.qualityRoles.includes(role),
      ),
    )
    .filter(
      (exercise) =>
        !finalExercises.some((finalExercise) => finalExercise.exerciseId === exercise.exerciseId),
    )
    .map((exercise) => exercise.exerciseName);
  const sportRelevantExercisesKept = finalExercises
    .filter((exercise) => exercise.qualityRoles.includes("sport_relevant_accessory"))
    .map((exercise) => exercise.exerciseName);
  const lostSportRelevantExercises = aiRawExercises
    .filter((exercise) => exercise.qualityRoles.includes("sport_relevant_accessory"))
    .filter(
      (exercise) =>
        !finalExercises.some((finalExercise) => finalExercise.exerciseId === exercise.exerciseId),
    )
    .map((exercise) => exercise.exerciseName);
  const fallbackExercisesAdded = finalExercises
    .filter(
      (exercise) =>
        !aiRawExercises.some((rawExercise) => rawExercise.exerciseId === exercise.exerciseId),
    )
    .map((exercise) => exercise.exerciseName);
  const catalogResolutionLoss = Math.min(
    100,
    rawToCatalogDiff.filter((entry) => entry.type === "removed").length * 18,
  );
  const goalSpecificityLoss = Math.min(
    100,
    aiRawExercises.reduce((sum, exercise) => {
      if (finalExercises.some((finalExercise) => finalExercise.exerciseId === exercise.exerciseId)) {
        return sum;
      }
      const normalized = preTemplateExercises.find((item) => item.id === exercise.exerciseId);
      return sum + (normalized ? getGoalSpecificityWeight(normalized, params.focusContext) * 8 : 8);
    }, 0),
  );
  const sportSpecificityLoss = Math.min(
    100,
    lostSportRelevantExercises.length * 18 +
      lostUsefulRoles.filter((role) => role === "carry_grip" || role === "lateral_core").length * 10,
  );
  const qualityPreservationScore = Math.max(
    0,
    100 -
      catalogResolutionLoss * 0.4 -
      goalSpecificityLoss * 0.35 -
      sportSpecificityLoss * 0.25 -
      diagnostics.mustKeepViolations.length * 8 -
      diagnostics.offFocusViolations.length * 10,
  );
  const normalizationWarnings = Array.from(
    new Set([
      ...warnings,
      ...compatibleExercisesRejectedWithReason.map((entry) => `${entry.exerciseName}: ${entry.reason}`),
    ]),
  );
  const durationTrimReason =
    focusRepairToFinalDiff.some((entry) => entry.type === "removed")
      ? "Sluttrimningen kortade passet för att hålla duration och fokus genomförbart."
      : null;
  const roleTrimReason =
    lostUsefulRoles.length > 0
      ? `Följande roller tappades under normalisering: ${lostUsefulRoles.join(", ")}.`
      : null;
  const primaryLiftCount = normalizedExercises.filter((exercise) =>
    ["primary_press", "primary_pull", "primary_squat", "primary_hinge"].includes(
      getExerciseRole(exercise, params.focusContext),
    ),
  ).length;
  const loadedProgressionExerciseCount = normalizedExercises.filter((exercise) =>
    isLoadedProgressionExercise(exercise, params.focusContext),
  ).length;
  const bodyweightOnlyCount = normalizedExercises.filter((exercise) =>
    !isLoadedProgressionExercise(exercise, params.focusContext),
  ).length;
  const mainLiftMissingWarnings =
    isStrengthGoal(params.focusContext) && isIntermediateOrAbove(params.focusContext)
      ? diagnostics.mustKeepViolations.filter(
          (violation) =>
            violation.includes("press") ||
            violation.includes("drag") ||
            violation.includes("knädominant") ||
            violation.includes("hinge"),
        )
      : [];
  const repeatedVariantGroups = Array.from(
    new Set(
      normalizedExercises
        .map((exercise) => exercise.variantGroup)
        .filter((group) => recentPreferences.recentVariantGroups.has(group)),
    ),
  );
  const repeatedPatternCount = normalizedExercises.filter((exercise) =>
    recentPreferences.recentVariantGroups.has(exercise.variantGroup),
  ).length;
  const plannedProgressionRepeats =
    isStrengthGoal(params.focusContext) && isIntermediateOrAbove(params.focusContext)
      ? repeatedVariantGroups.filter((group) =>
          normalizedExercises.some((exercise) =>
            isLoadedProgressionExercise(exercise, params.focusContext) &&
            exercise.variantGroup === group,
          ),
        )
      : [];
  const fallbackRepeats = repeatedVariantGroups.filter(
    (group) => !plannedProgressionRepeats.includes(group),
  );
  const fallbackBiasWarning =
    fallbackRepeats.length >= 2
      ? `Samma fallback-/variantgrupper återkom flera gånger: ${fallbackRepeats.join(", ")}.`
      : null;
  const strengthSpecificityScore = Math.max(
    0,
    100 -
      mainLiftMissingWarnings.length * 22 -
      bodyweightOnlyCount * (isStrengthGoal(params.focusContext) ? 8 : 2) -
      diagnostics.offFocusViolations.length * 18 -
      diagnostics.lostPrimaryRoles.length * 16,
  );
  const removedBecauseOffFocus = preTemplateExercises
    .filter(
      (exercise) =>
        !normalizedExercises.some((item) => item.id === exercise.id) &&
        Boolean(getOffFocusIssue(exercise, params.focusContext)),
    )
    .map((exercise) => exercise.name);
  const removedBecauseRecovery = preTemplateExercises
    .filter(
      (exercise) =>
        !normalizedExercises.some((item) => item.id === exercise.id) &&
        (params.focusContext?.recoveryLimitedMuscles ?? []).some((group) =>
          hasBudgetGroup(exercise, group),
        ),
    )
    .map((exercise) => exercise.name);
  const removedBecauseDuplicateRole = preTemplateExercises
    .filter((exercise) => !normalizedExercises.some((item) => item.id === exercise.id))
    .filter((exercise) => {
      const role = getExerciseRole(exercise, params.focusContext);
      return normalizedExercises.some(
        (item) => getExerciseRole(item, params.focusContext) === role,
      );
    })
    .map((exercise) => exercise.name);
  const focusIntegrityScore = Math.max(
    0,
    100 -
      diagnostics.mustKeepViolations.length * 18 -
      diagnostics.forbiddenExerciseViolations.length * 20 -
      diagnostics.offFocusViolations.length * 22 -
      diagnostics.offFocusWarnings.length * 10 -
      diagnostics.missingPriorityMuscles.length * 12 -
      diagnostics.lostPrimaryRoles.length * 14,
  );
  const normalizationLossScore = Math.max(
    0,
    catalogToFocusRepairDiff.filter((entry) => entry.type === "removed").length * 10 +
      diagnostics.mustKeepViolations.length * 15 +
      diagnostics.forbiddenExerciseViolations.length * 20 +
      diagnostics.offFocusViolations.length * 16,
  );
  const priorityMuscleResolutionStatus = (params.focusContext?.priorityMuscles ?? []).map((group) => {
    const hasPrimaryHit = normalizedExercises.some((exercise) => exercise.primaryMuscles.includes(group));
    const hasSecondaryHit = normalizedExercises.some(
      (exercise) => exercise.secondaryMuscles?.includes(group),
    );

    if (hasPrimaryHit) {
      return { muscle: group, status: "addressed" as const, reason: "Tränas direkt i slutpasset." };
    }
    if (hasSecondaryHit) {
      return {
        muscle: group,
        status: "partially_addressed" as const,
        reason: "Får viss stimulans via sekundär muskelroll i slutpasset.",
      };
    }
    if ((params.focusContext?.recoveryLimitedMuscles ?? []).includes(group)) {
      return {
        muscle: group,
        status: "deferred_due_to_recovery" as const,
        reason: "Skjuts upp eftersom muskeln är återhämtningsbegränsad just nu.",
      };
    }
    if (priorityGroups.deferredPriorities.includes(group)) {
      return {
        muscle: group,
        status: "deferred_due_to_focus" as const,
        reason: "Skjuts till ett mer fokuskompatibelt pass.",
      };
    }
    if ((params.focusContext?.durationMinutes ?? 0) <= 25) {
      return {
        muscle: group,
        status: "deferred_due_to_duration" as const,
        reason: "Kort pass prioriterade basroller före extra prioriteringsmuskler.",
      };
    }
    return {
      muscle: group,
      status: "dropped_by_normalization" as const,
      reason: "Fanns i tidigare steg men överlevde inte slutlig normalisering.",
    };
  });

  return {
    exercises: normalizedExercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      description: exercise.description,
      sets: exercise.sets,
      reps: exercise.reps,
      duration: exercise.duration,
      sidedness: exercise.sidedness,
      rest: exercise.rest,
      suggestedWeight: exercise.suggestedWeight,
    })),
    debug: {
      availableCatalogCount: availableCatalog.length,
      requestedExerciseCount: Array.isArray(params.aiExercises)
        ? params.aiExercises.length
        : 0,
      targetExerciseCount,
      acceptedDirectly,
      replacements,
      fills,
      warnings,
      finalExerciseIds: normalizedExercises.map((exercise) => exercise.id),
      focusIntegrityScore,
      strengthSpecificityScore,
      qualityPreservationScore,
      goalSpecificityLoss,
      sportSpecificityLoss,
      catalogResolutionLoss,
      mustKeepViolations: diagnostics.mustKeepViolations,
      offFocusWarnings: diagnostics.offFocusWarnings,
      offFocusViolations: diagnostics.offFocusViolations,
      forbiddenExerciseViolations: diagnostics.forbiddenExerciseViolations,
      lostMovementPatterns: diagnostics.missingMovementPatterns,
      lostPrimaryRoles: diagnostics.lostPrimaryRoles,
      lostPriorityMuscles: diagnostics.missingPriorityMuscles,
      lostUsefulRoles,
      lostPrimaryOrHighValueExercises,
      lostSportRelevantExercises,
      sportRelevantExercisesKept,
      sportRelevantExercisesLost: lostSportRelevantExercises,
      deferredPriorityMuscles: priorityGroups.deferredPriorities,
      removedPrimaryExercises,
      addedOffFocusExercises: diagnostics.addedOffFocusExercises,
      removedBecauseOffFocus,
      removedBecauseRecovery,
      removedBecauseDuplicateRole,
      fallbackExercisesAdded,
      normalizationWarnings,
      fallbackBiasWarning,
      durationTrimReason,
      roleTrimReason,
      compatibleExercisesRejectedWithReason,
      priorityMuscleResolutionStatus,
      primaryLiftCount,
      loadedProgressionExerciseCount,
      bodyweightOnlyCount,
      mainLiftMissingWarnings,
      repeatedPatternCount,
      repeatedVariantGroups,
      plannedProgressionRepeats,
      fallbackRepeats,
      normalizationLossScore,
      aiRawExercises,
      afterCatalogMatch,
      afterFocusRepair,
      finalExercises,
      rawToCatalogDiff,
      catalogToFocusRepairDiff,
      focusRepairToFinalDiff,
      beforeAfterDiff: diffExerciseStages({
        before: aiRawExercises,
        after: finalExercises,
        removedReason: "Försvann någon gång mellan råförslag och slutpass.",
        addedReason: "Tillkom någon gång mellan råförslag och slutpass.",
      }),
      validationContext: {
        plannedFocus: getEffectiveFocus(params.focusContext),
        goal: params.focusContext?.goal ?? "health",
        experienceLevel: normalizeExperienceLevel(
          params.focusContext?.experienceLevel,
        ),
        durationMinutes: params.focusContext?.durationMinutes ?? 0,
        priorityMuscles: params.focusContext?.priorityMuscles ?? [],
        focusCompatiblePriorities: priorityGroups.focusCompatiblePriorities,
        deferredPriorities: priorityGroups.deferredPriorities,
        recoveryLimitedMuscles: params.focusContext?.recoveryLimitedMuscles ?? [],
        availableEquipment: params.focusContext?.availableEquipment ?? [],
        sportFocus: params.focusContext?.sportFocus ?? null,
      },
    },
  };
}
