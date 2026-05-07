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
};

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
    mustKeepViolations: string[];
    forbiddenExerciseViolations: string[];
    lostMovementPatterns: string[];
    lostPriorityMuscles: string[];
    removedPrimaryExercises: string[];
    addedOffFocusExercises: string[];
    normalizationLossScore: number;
    beforeAfterDiff: Array<{
      type: "removed" | "added";
      exerciseId: string;
      exerciseName: string;
      reason: string;
    }>;
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

  return (
    availableCatalog.find(
      (item) => normalizeExerciseName(item.name) === normalizedName,
    ) ?? null
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

function isBasePressExercise(
  exercise: Pick<NormalizedExercise, "movementPattern" | "variantGroup">,
) {
  return (
    (exercise.movementPattern === "horizontal_push" ||
      exercise.movementPattern === "vertical_push") &&
    exercise.variantGroup !== "chest_fly"
  );
}

function isDragExercise(
  exercise: Pick<NormalizedExercise, "movementPattern">,
) {
  return (
    exercise.movementPattern === "horizontal_pull" ||
    exercise.movementPattern === "vertical_pull"
  );
}

function isLowerBaseExercise(
  exercise: Pick<NormalizedExercise, "movementPattern">,
) {
  return (
    exercise.movementPattern === "squat" || exercise.movementPattern === "lunge"
  );
}

function isHingeExercise(
  exercise: Pick<NormalizedExercise, "movementPattern">,
) {
  return exercise.movementPattern === "hinge";
}

function isCoreOrCalfExercise(
  exercise: Pick<NormalizedExercise, "primaryMuscles" | "secondaryMuscles">,
) {
  return hasBudgetGroup(exercise, "core") || hasBudgetGroup(exercise, "calves");
}

function isUpperBodyExercise(
  exercise: Pick<
    NormalizedExercise,
    "movementPattern" | "variantGroup" | "primaryMuscles" | "secondaryMuscles"
  >,
) {
  return (
    isBasePressExercise(exercise) ||
    isDragExercise(exercise) ||
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
    "movementPattern" | "primaryMuscles" | "secondaryMuscles"
  >,
) {
  return (
    isLowerBaseExercise(exercise) ||
    isHingeExercise(exercise) ||
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
    isBasePressExercise(exercise),
  );

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
    (focus === "upper_body" || focus === "recovery_strength" || shortPass) &&
    isBeginner
  ) {
    return true;
  }

  if (
    params.exercise.variantGroup === "chest_fly" &&
    !hasBasePressAlready &&
    !isBasePressExercise(params.exercise)
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
      hitsRecoveryLimited)
  ) {
    return true;
  }

  if (
    focus === "lower_body" &&
    params.exercise.id === "bodyweight_bench_dip" &&
    (params.focusContext?.durationMinutes ?? 0) < 40
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

  if (focus === "lower_body") {
    return ["lower_base", "hinge", "calf_or_core"];
  }

  if (focus === "upper_body") {
    const slots = ["press", "drag"];
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
    if (duration <= 25) {
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
    "movementPattern" | "variantGroup" | "primaryMuscles" | "secondaryMuscles"
  >,
  slot: string,
) {
  if (slot === "lower_base") {
    return isLowerBaseExercise(exercise);
  }
  if (slot === "hinge") {
    return isHingeExercise(exercise);
  }
  if (slot === "press") {
    return isBasePressExercise(exercise);
  }
  if (slot === "drag" || slot === "safe_drag") {
    return isDragExercise(exercise);
  }
  if (slot === "calf_or_core") {
    return isCoreOrCalfExercise(exercise);
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
    return isHingeExercise(exercise) || hasBudgetGroup(exercise, "core");
  }
  if (slot === "safe_press_or_glute") {
    return isBasePressExercise(exercise) || hasBudgetGroup(exercise, "glutes");
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
  if (slot === "upper_accessory") return "arm-/axelaccessoar";
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
  const mustKeepViolations = slots
    .filter((slot) => !params.exercises.some((exercise) => matchesTemplateSlot(exercise, slot)))
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
  const focus = getEffectiveFocus(params.focusContext);
  const addedOffFocusExercises = params.exercises
    .filter((exercise) => {
      if (focus === "lower_body") {
        return isUpperBodyExercise(exercise) && !isCoreOrCalfExercise(exercise);
      }
      if (focus === "upper_body") {
        return isLowerBodyExercise(exercise) && !isCoreOrCalfExercise(exercise);
      }
      return false;
    })
    .map((exercise) => exercise.name);
  const missingPriorityMuscles = (params.focusContext?.priorityMuscles ?? []).filter(
    (group) =>
      !params.exercises.some((exercise) => hasBudgetGroup(exercise, group)) &&
      !(params.focusContext?.recoveryLimitedMuscles ?? []).includes(group),
  );

  return {
    mustKeepViolations,
    missingMovementPatterns: slots
      .filter((slot) => !params.exercises.some((exercise) => matchesTemplateSlot(exercise, slot)))
      .map((slot) => getSlotLabel(slot)),
    missingPriorityMuscles,
    forbiddenExerciseViolations,
    addedOffFocusExercises,
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

  if (params.requiredSlot && matchesTemplateSlot(params.candidate, params.requiredSlot)) {
    score += 7;
  }

  if (
    (params.focusContext?.priorityMuscles ?? []).some((group) =>
      hasBudgetGroup(params.candidate, group),
    )
  ) {
    score += 3;
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
    params.requestedMovementPattern === "horizontal_push" &&
    params.candidate.variantGroup === "chest_fly" &&
    !params.acceptedExercises.some((exercise) => isBasePressExercise(exercise))
  ) {
    score -= 14;
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
        matchesTemplateSlot(candidate, params.slot),
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
        mustKeepViolations: ["Ingen tillgänglig katalog återstod efter utrustningsfiltrering."],
        forbiddenExerciseViolations: [],
        lostMovementPatterns: [],
        lostPriorityMuscles: [],
        removedPrimaryExercises: [],
        addedOffFocusExercises: [],
        normalizationLossScore: 100,
        beforeAfterDiff: [],
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
      } else if (forbidden) {
        warnings.push(
          `${matchedExercise.name} togs bort eftersom den inte passade planerat fokus och ingen säker ersättare hittades direkt.`,
        );
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
  const removedPrimaryExercises = preTemplateExercises
    .filter((exercise) => !normalizedExercises.some((item) => item.id === exercise.id))
    .map((exercise) => exercise.name);
  const focusIntegrityScore = Math.max(
    0,
    100 -
      diagnostics.mustKeepViolations.length * 18 -
      diagnostics.forbiddenExerciseViolations.length * 20 -
      diagnostics.addedOffFocusExercises.length * 10 -
      diagnostics.missingPriorityMuscles.length * 12,
  );
  const normalizationLossScore = Math.max(
    0,
    templateResult.beforeAfterDiff.filter((entry) => entry.type === "removed").length * 10 +
      diagnostics.mustKeepViolations.length * 15 +
      diagnostics.forbiddenExerciseViolations.length * 20,
  );

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
      mustKeepViolations: diagnostics.mustKeepViolations,
      forbiddenExerciseViolations: diagnostics.forbiddenExerciseViolations,
      lostMovementPatterns: diagnostics.missingMovementPatterns,
      lostPriorityMuscles: diagnostics.missingPriorityMuscles,
      removedPrimaryExercises,
      addedOffFocusExercises: diagnostics.addedOffFocusExercises,
      normalizationLossScore,
      beforeAfterDiff: templateResult.beforeAfterDiff,
    },
  };
}
