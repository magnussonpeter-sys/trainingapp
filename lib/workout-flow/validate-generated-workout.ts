import {
  validateAndNormalizeAiExercises,
  type ValidationFocusContext,
} from "@/lib/ai-exercise-validation";
import {
  getAvailableExercises,
  getExerciseById,
  type ExerciseCatalogItem,
  type MovementPattern,
} from "@/lib/exercise-catalog";
import type { MuscleBudgetEntry } from "@/lib/planning/muscle-budget";
import type { Workout, WorkoutBlock } from "@/types/workout";

type GoalType = "strength" | "hypertrophy" | "health" | "body_composition";

type AiGeneratedExerciseCandidate = {
  id?: string;
  name?: string;
  sets?: number;
  reps?: number | null;
  duration?: number | null;
  rest?: number;
  movementPattern?: string;
  intensityTag?: "primary" | "secondary" | "accessory" | "finisher";
  role?: string;
  priorityRank?: number;
  canDropIfShort?: boolean;
  rationale?: string;
  reason?: string;
};

type AiGeneratedBlockCandidate = {
  type?: string;
  title?: string;
  purpose?: string;
  coachNote?: string;
  coach_note?: string;
  targetRpe?: number | null;
  target_rpe?: number | null;
  targetRir?: number | null;
  target_rir?: number | null;
  rounds?: number | null;
  restBetweenExercises?: number | null;
  restAfterRound?: number | null;
  exercises?: AiGeneratedExerciseCandidate[];
};

export type AiGeneratedWorkoutCandidate = {
  name?: string;
  duration?: number;
  rationale?: string;
  superset_considered?: boolean;
  superset_reason?: string;
  blocks?: AiGeneratedBlockCandidate[];
  exercises?: AiGeneratedExerciseCandidate[];
  optionalBonusExercises?: AiGeneratedExerciseCandidate[];
};

export type ValidateGeneratedWorkoutResult = {
  workout: Workout;
  debug: {
    availableExerciseCount: number;
    requestedBlockCount: number;
    finalBlockCount: number;
    requestedExerciseCount: number;
    finalExerciseCount: number;
    targetExerciseCount: number;
    requestedRestAdjustments: number;
    qualityScore: number;
    targetMainExerciseCount: number;
    actualMainExerciseCountFromAi: number;
    finalMainExerciseCount: number;
    optionalBonusExerciseCount: number;
    bonusExercisesUsed: number;
    bonusExercisesRejectedReason: string[];
    trimmedBecauseTooManyExercises: boolean;
    trimmedExercises: Array<{
      name: string;
      role: string | null;
      priorityRank: number;
      canDropIfShort: boolean;
      reason: string | null;
      trimReason: string;
    }>;
    keptExerciseRoles: string[];
    lostExerciseRoles: string[];
    fallbackAddedDespiteEnoughAiExercises: boolean;
    durationTrimWarnings: string[];
    warnings: string[];
    validation: ReturnType<typeof validateAndNormalizeAiExercises>["debug"];
  };
};

export type GeneratedWorkoutValidationFocusContext = ValidationFocusContext;

type WeeklyBudgetScoringItem = Pick<
  MuscleBudgetEntry,
  "group" | "remainingSets" | "priority"
> & {
  loadStatus?: MuscleBudgetEntry["loadStatus"];
};

type SupersetPreference = "allowed" | "avoid_all" | "avoid_all_dumbbell";

const RAW_MUSCLE_TO_BUDGET_GROUP = {
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
} as const;

const COMPOUND_PATTERNS = new Set<MovementPattern>([
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
]);

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.round(value), min), max);
}

function getTargetExerciseCount(
  durationMinutes: number,
  goal: GoalType,
  focus: GeneratedWorkoutValidationFocusContext["plannedFocus"] | null | undefined,
) {
  if (focus === "recovery_strength") {
    return durationMinutes <= 15 ? 3 : 4;
  }

  if (goal === "strength") {
    if (durationMinutes <= 15) return 2;
    if (durationMinutes <= 20) return 3;
    if (durationMinutes <= 30) return 4;
    if (durationMinutes <= 40) return 4;
    if (durationMinutes <= 50) return 5;
    return 6;
  }

  if (goal === "hypertrophy") {
    if (durationMinutes <= 20) return 3;
    if (durationMinutes <= 30) return 4;
    if (durationMinutes <= 40) return 5;
    if (durationMinutes <= 50) return 6;
    return 7;
  }

  if (goal === "body_composition") {
    if (durationMinutes <= 20) return 3;
    if (durationMinutes <= 30) return 4;
    if (durationMinutes <= 40) return 5;
    if (durationMinutes <= 50) return 6;
    return 7;
  }

  if (durationMinutes <= 20) return 3;
  if (durationMinutes <= 35) return 4;
  if (durationMinutes <= 50) return 5;
  return 6;
}

function normalizeGoalForTarget(value: GoalType) {
  return value;
}

export function getTargetMainExerciseCount(
  durationMinutes: number,
  goal: GoalType,
  focus: GeneratedWorkoutValidationFocusContext["plannedFocus"] | null | undefined,
) {
  const normalizedGoal = normalizeGoalForTarget(goal);

  if (durationMinutes <= 15) {
    return normalizedGoal === "strength" ? 2 : 3;
  }

  if (durationMinutes <= 20) {
    return normalizedGoal === "strength" ? 3 : 3;
  }

  if (durationMinutes <= 30) {
    if (normalizedGoal === "strength") {
      return 4;
    }
    return 4;
  }

  if (durationMinutes <= 40) {
    return normalizedGoal === "strength" ? 4 : 5;
  }

  if (durationMinutes <= 50) {
    return normalizedGoal === "strength" ? 5 : 6;
  }

  if (focus === "recovery_strength") {
    return 4;
  }

  return normalizedGoal === "strength" ? 6 : normalizedGoal === "hypertrophy" ? 7 : 7;
}

function getEffectiveTargetExerciseCount(params: {
  durationMinutes: number;
  goal: GoalType;
  focus: GeneratedWorkoutValidationFocusContext["plannedFocus"] | null | undefined;
  rawBlocks: AiGeneratedBlockCandidate[];
  supersetPreference?: SupersetPreference;
}) {
  const defaultTargetExerciseCount = getTargetExerciseCount(
    params.durationMinutes,
    params.goal,
    params.focus,
  );

  if (params.supersetPreference === "avoid_all" || params.durationMinutes > 20) {
    return defaultTargetExerciseCount;
  }

  const requestedSupersetExerciseCount = params.rawBlocks
    .filter(
      (block) =>
        block.type === "superset" &&
        Array.isArray(block.exercises) &&
        block.exercises.length >= 2,
    )
    .reduce((sum, block) => sum + (block.exercises?.length ?? 0), 0);

  // A 15-20 min pass can still support four exercises when they are organized
  // into one or two short supersets instead of straight sets.
  if (requestedSupersetExerciseCount >= 4) {
    return 4;
  }

  return defaultTargetExerciseCount;
}

function getMaxBlockCount(durationMinutes: number) {
  if (durationMinutes <= 25) {
    return 1;
  }

  if (durationMinutes <= 50) {
    return 2;
  }

  return 3;
}

function getEffectiveMaxBlockCount(params: {
  durationMinutes: number;
  rawBlocks: AiGeneratedBlockCandidate[];
  supersetPreference?: SupersetPreference;
}) {
  const defaultMaxBlockCount = getMaxBlockCount(params.durationMinutes);

  if (defaultMaxBlockCount !== 1 || params.supersetPreference === "avoid_all") {
    return defaultMaxBlockCount;
  }

  const hasRequestedSuperset = params.rawBlocks.some(
    (block) =>
      block.type === "superset" &&
      Array.isArray(block.exercises) &&
      block.exercises.length >= 2,
  );

  // Short passes may still need a main block plus one superset block.
  if (hasRequestedSuperset) {
    return 2;
  }

  return defaultMaxBlockCount;
}

function getRawBlocks(candidate: AiGeneratedWorkoutCandidate) {
  if (Array.isArray(candidate.blocks) && candidate.blocks.length > 0) {
    return candidate.blocks;
  }

  if (Array.isArray(candidate.exercises) && candidate.exercises.length > 0) {
    return [
      {
        type: "straight_sets",
        title: "Huvuddel",
        purpose: "AI genererade ett pass utan blocks och valideringen mappade om det.",
        exercises: candidate.exercises,
      },
    ];
  }

  return [];
}

function getRawBonusExercises(candidate: AiGeneratedWorkoutCandidate) {
  return Array.isArray(candidate.optionalBonusExercises)
    ? candidate.optionalBonusExercises
    : [];
}

function normalizeRequestedRole(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().toLowerCase()
    : null;
}

function getRoleBucket(value: string | null) {
  if (!value) return "unknown";
  if (value.includes("push")) return "push";
  if (value.includes("pull")) return "pull";
  if (value.includes("triceps")) return "triceps";
  if (value.includes("biceps")) return "biceps";
  if (value.includes("shoulder")) return "shoulder";
  if (value.includes("squat") || value.includes("lunge")) return "lower_base";
  if (value.includes("hinge")) return "hinge";
  if (value.includes("core")) return "core";
  if (value.includes("carry")) return "carry";
  if (value.includes("calves")) return "calves";
  return value;
}

function buildMinimumRoleBuckets(params: {
  durationMinutes: number;
  goal: GoalType;
  focusContext?: GeneratedWorkoutValidationFocusContext | null;
}) {
  const focus = params.focusContext?.plannedFocus ?? null;
  const duration = params.durationMinutes;
  const surf = params.focusContext?.sportFocus === "surf_sports";

  if (focus === "upper_body") {
    if (duration <= 20) {
      return surf ? ["push", "pull", "arm_or_shoulder"] : ["push", "pull", "arm_or_shoulder"];
    }

    if (duration <= 30) {
      return surf
        ? ["push", "pull", "arm_or_shoulder", "core_or_carry"]
        : ["push", "pull", "arm_or_shoulder"];
    }

    return ["push", "pull", "secondary_upper", "arm_or_shoulder"];
  }

  if (focus === "lower_body") {
    if (duration <= 25) {
      return ["lower_base", "hinge", "lower_support"];
    }

    return ["lower_base", "hinge", "lower_support", "core_or_calves"];
  }

  if (focus === "full_body") {
    if (duration <= 30) {
      return ["lower_base", "push", "pull", surf ? "hinge_or_core" : "hinge_or_core"];
    }
    return ["lower_base", "push", "pull", "hinge_or_core"];
  }

  if (focus === "recovery_strength") {
    return ["safe_drag", "safe_press_or_glute", "safe_core_or_glute"];
  }

  return [];
}

function exerciseMatchesMinimumBucket(
  exercise: AiGeneratedExerciseCandidate,
  bucket: string,
) {
  const role = normalizeRequestedRole(exercise.role);
  const pattern = typeof exercise.movementPattern === "string" ? exercise.movementPattern : "";

  if (bucket === "push") {
    return role?.includes("push") || pattern.includes("push");
  }
  if (bucket === "pull") {
    return role?.includes("pull") || pattern.includes("pull");
  }
  if (bucket === "arm_or_shoulder") {
    return Boolean(
      role &&
        (role.includes("biceps") ||
          role.includes("triceps") ||
          role.includes("shoulder")),
    );
  }
  if (bucket === "secondary_upper") {
    return Boolean(
      role &&
        (role.includes("push") ||
          role.includes("pull") ||
          role.includes("shoulder")),
    );
  }
  if (bucket === "lower_base") {
    return Boolean(
      role &&
        (role.includes("squat") || role.includes("lunge") || role.includes("unilateral_lower")),
    ) || pattern === "squat" || pattern === "lunge";
  }
  if (bucket === "hinge") {
    return role?.includes("hinge") || pattern === "hinge";
  }
  if (bucket === "lower_support") {
    return Boolean(
      role &&
        (role.includes("glute") ||
          role.includes("posterior") ||
          role.includes("unilateral_lower") ||
          role.includes("calves")),
    ) || pattern === "lunge";
  }
  if (bucket === "core_or_calves") {
    return Boolean(role && (role.includes("core") || role.includes("calves")));
  }
  if (bucket === "core_or_carry") {
    return Boolean(role && (role.includes("core") || role.includes("carry")));
  }
  if (bucket === "hinge_or_core") {
    return Boolean(role && (role.includes("hinge") || role.includes("core")));
  }
  if (bucket === "push_or_pull") {
    return Boolean(role && (role.includes("push") || role.includes("pull")));
  }

  return false;
}

function scoreExerciseForTrimming(params: {
  exercise: AiGeneratedExerciseCandidate;
  index: number;
  goal: GoalType;
  focusContext?: GeneratedWorkoutValidationFocusContext | null;
  alreadyKept: AiGeneratedExerciseCandidate[];
}) {
  const role = normalizeRequestedRole(params.exercise.role);
  const pattern = typeof params.exercise.movementPattern === "string"
    ? params.exercise.movementPattern
    : null;
  let score = 0;

  score += Math.max(0, 12 - params.index);
  score += Math.max(0, 12 - ((typeof params.exercise.priorityRank === "number" ? params.exercise.priorityRank : params.index + 1) - 1) * 2);

  if (role?.includes("main_")) score += 12;
  if (role?.includes("push") || role?.includes("pull")) score += 8;
  if (role?.includes("hinge") || role?.includes("squat") || role?.includes("lunge")) score += 8;
  if (role?.includes("triceps") || role?.includes("biceps") || role?.includes("shoulder")) score += 5;
  if (role?.includes("carry") || role?.includes("core")) score += 4;

  if (
    params.goal === "strength" &&
    (pattern === "horizontal_push" ||
      pattern === "horizontal_pull" ||
      pattern === "vertical_pull" ||
      pattern === "squat" ||
      pattern === "hinge" ||
      pattern === "lunge")
  ) {
    score += 6;
  }

  if (params.focusContext?.sportFocus === "surf_sports" && role) {
    if (
      role.includes("pull") ||
      role.includes("carry") ||
      role.includes("core") ||
      role.includes("posterior")
    ) {
      score += 4;
    }
  }

  if (params.exercise.canDropIfShort === true) {
    score -= 6;
  }

  const roleBucket = getRoleBucket(role);
  if (
    roleBucket !== "unknown" &&
    params.alreadyKept.some(
      (kept) => getRoleBucket(normalizeRequestedRole(kept.role)) === roleBucket,
    )
  ) {
    score -= 4;
  }

  return score;
}

function trimAiExercisesToDuration(params: {
  exercises: AiGeneratedExerciseCandidate[];
  targetMainExerciseCount: number;
  focusContext?: GeneratedWorkoutValidationFocusContext | null;
  goal: GoalType;
}) {
  if (params.exercises.length <= params.targetMainExerciseCount) {
    return {
      keptExercises: params.exercises,
      trimmedExercises: [] as Array<{
        exercise: AiGeneratedExerciseCandidate;
        trimReason: string;
      }>,
      lostRoles: [] as string[],
      warnings: [] as string[],
    };
  }

  const minimumBuckets = buildMinimumRoleBuckets({
    durationMinutes: params.focusContext?.durationMinutes ?? 0,
    goal: params.goal,
    focusContext: params.focusContext,
  });

  const keptExercises: AiGeneratedExerciseCandidate[] = [];
  const usedBuckets = new Set<string>();

  // Preserve one exercise per minimum role bucket first so trimningen inte gör om passet.
  for (const bucket of minimumBuckets) {
    const candidate = params.exercises.find(
      (exercise) =>
        !keptExercises.includes(exercise) &&
        exerciseMatchesMinimumBucket(exercise, bucket),
    );
    if (candidate) {
      keptExercises.push(candidate);
      usedBuckets.add(bucket);
    }
  }

  const remainingCandidates = params.exercises
    .filter((exercise) => !keptExercises.includes(exercise))
    .map((exercise, index) => ({
      exercise,
      score: scoreExerciseForTrimming({
        exercise,
        index,
        goal: params.goal,
        focusContext: params.focusContext,
        alreadyKept: keptExercises,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  for (const { exercise } of remainingCandidates) {
    if (keptExercises.length >= params.targetMainExerciseCount) {
      break;
    }
    keptExercises.push(exercise);
  }

  const keptSet = new Set(keptExercises);
  const trimmedExercises = params.exercises
    .filter((exercise) => !keptSet.has(exercise))
    .map((exercise) => ({
      exercise,
      trimReason:
        exercise.canDropIfShort === true
          ? "duration_limit_bonus_role"
          : "duration_limit_lower_priority",
    }));

  const lostRoles = trimmedExercises
    .map(({ exercise }) => normalizeRequestedRole(exercise.role))
    .filter((role): role is string => Boolean(role));

  const warnings =
    trimmedExercises.length > 0
      ? [
          `AI föreslog ${params.exercises.length} huvudövningar för ett pass som siktar på ${params.targetMainExerciseCount}. Valideringen trimmade därför enligt AI-prioritet och minimiroller.`,
        ]
      : [];

  return {
    keptExercises: keptExercises.slice(0, params.targetMainExerciseCount),
    trimmedExercises,
    lostRoles,
    warnings,
  };
}

function getRestRange(
  goal: GoalType,
  movementPattern: MovementPattern | undefined,
) {
  const compound = movementPattern ? COMPOUND_PATTERNS.has(movementPattern) : false;

  if (goal === "strength") {
    return compound ? { min: 90, max: 240 } : { min: 45, max: 120 };
  }

  if (goal === "hypertrophy") {
    return compound ? { min: 60, max: 120 } : { min: 30, max: 90 };
  }

  if (goal === "body_composition") {
    return compound ? { min: 45, max: 90 } : { min: 20, max: 60 };
  }

  return compound ? { min: 45, max: 90 } : { min: 20, max: 60 };
}

function isPushPattern(pattern: MovementPattern | undefined) {
  return pattern === "horizontal_push" || pattern === "vertical_push";
}

function isPullPattern(pattern: MovementPattern | undefined) {
  return pattern === "horizontal_pull" || pattern === "vertical_pull";
}

function isLowerBodyPattern(pattern: MovementPattern | undefined) {
  return pattern === "squat" || pattern === "hinge" || pattern === "lunge";
}

function isCoreOrCarryPattern(pattern: MovementPattern | undefined) {
  return pattern === "core" || pattern === "carry";
}

function adjustRestByGoal(
  exerciseId: string,
  rest: number,
  goal: GoalType,
) {
  const catalogExercise = getExerciseById(exerciseId);
  const movementPattern = catalogExercise?.movementPattern;
  const range = getRestRange(goal, movementPattern);

  return clampInteger(rest, range.min, range.max);
}

function normalizeStructuredRest(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? clampInteger(value, min, max)
    : fallback;
}

function getBudgetGroupsForExercise(catalogExercise: ExerciseCatalogItem) {
  const groups = new Set<WeeklyBudgetScoringItem["group"]>();

  for (const rawMuscle of [
    ...catalogExercise.primaryMuscles,
    ...(catalogExercise.secondaryMuscles ?? []),
  ]) {
    const group =
      RAW_MUSCLE_TO_BUDGET_GROUP[
        rawMuscle as keyof typeof RAW_MUSCLE_TO_BUDGET_GROUP
      ] ?? null;

    if (group) {
      groups.add(group);
    }
  }

  return Array.from(groups);
}

function getExerciseFatigueCost(catalogExercise: ExerciseCatalogItem) {
  let cost = catalogExercise.riskLevel === "medium" ? 2 : 1;

  if (
    catalogExercise.movementPattern === "squat" ||
    catalogExercise.movementPattern === "hinge" ||
    catalogExercise.movementPattern === "lunge"
  ) {
    cost += 1;
  }

  if (
    catalogExercise.movementPattern === "horizontal_push" ||
    catalogExercise.movementPattern === "horizontal_pull" ||
    catalogExercise.movementPattern === "vertical_push" ||
    catalogExercise.movementPattern === "vertical_pull"
  ) {
    cost += 0.5;
  }

  return cost;
}

function getSupersetSuitability(params: {
  blockExercises: Array<{ id: string }>;
  durationMinutes: number;
  goal?: GoalType;
  weeklyBudget?: WeeklyBudgetScoringItem[];
  lessOftenExerciseIds?: string[];
  supersetPreference?: SupersetPreference;
}) {
  if (params.durationMinutes > 40) {
    return { allowed: false, score: Number.NEGATIVE_INFINITY };
  }

  if (params.blockExercises.length < 2 || params.blockExercises.length > 3) {
    return { allowed: false, score: Number.NEGATIVE_INFINITY };
  }

  if (params.durationMinutes <= 20 && params.blockExercises.length > 2) {
    return { allowed: false, score: Number.NEGATIVE_INFINITY };
  }

  const catalogExercises = params.blockExercises
    .map((exercise) => getExerciseById(exercise.id))
    .filter((item): item is ExerciseCatalogItem => item !== null);

  if (catalogExercises.length !== params.blockExercises.length) {
    return { allowed: false, score: Number.NEGATIVE_INFINITY };
  }

  if (params.supersetPreference === "avoid_all") {
    return { allowed: false, score: Number.NEGATIVE_INFINITY };
  }

  if (
    params.supersetPreference === "avoid_all_dumbbell" &&
    catalogExercises.filter((exercise) =>
      exercise.requiredEquipment.includes("dumbbells"),
    ).length > 1
  ) {
    return { allowed: false, score: Number.NEGATIVE_INFINITY };
  }

  if (catalogExercises.some((exercise) => exercise.riskLevel === "high")) {
    return { allowed: false, score: Number.NEGATIVE_INFINITY };
  }

  const lowerBodyCompoundCount = catalogExercises.filter((exercise) =>
    isLowerBodyPattern(exercise.movementPattern),
  ).length;

  if (lowerBodyCompoundCount > 1) {
    return { allowed: false, score: Number.NEGATIVE_INFINITY };
  }

  const patterns = catalogExercises.map((exercise) => exercise.movementPattern);
  const hasPush = patterns.some((pattern) => isPushPattern(pattern));
  const hasPull = patterns.some((pattern) => isPullPattern(pattern));
  const hasLowerBody = patterns.some((pattern) => isLowerBodyPattern(pattern));
  const hasCoreOrCarry = patterns.some((pattern) => isCoreOrCarryPattern(pattern));
  const isHealthDensityGoal =
    params.goal === "health" || params.goal === "body_composition";
  const lessOftenExerciseIds = new Set(params.lessOftenExerciseIds ?? []);
  const weeklyBudgetMap = new Map(
    (params.weeklyBudget ?? []).map((entry) => [entry.group, entry]),
  );
  let score = 0;

  if (hasPush && hasPull) {
    score += 6;
  }

  if (hasLowerBody && hasCoreOrCarry) {
    score += 5;
  }

  // In very short health-oriented passes, a simple lower-body + push pairing
  // can be a safe and efficient density strategy when loads are moderate.
  if (
    params.durationMinutes <= 20 &&
    isHealthDensityGoal &&
    hasLowerBody &&
    hasPush &&
    !hasPull &&
    !hasCoreOrCarry
  ) {
    score += 4;
  }

  if (
    params.durationMinutes <= 20 &&
    isHealthDensityGoal &&
    hasLowerBody &&
    hasPull &&
    !hasPush &&
    !hasCoreOrCarry
  ) {
    score += 3;
  }

  if (
    params.durationMinutes <= 20 &&
    isHealthDensityGoal &&
    hasPush &&
    hasCoreOrCarry &&
    !hasPull &&
    !hasLowerBody
  ) {
    score += 2;
  }

  const averageRestSeconds =
    params.blockExercises.reduce((sum, exercise) => {
      const catalogExercise = getExerciseById(exercise.id);
      return sum + (catalogExercise?.defaultRest ?? 60);
    }, 0) / params.blockExercises.length;

  if (averageRestSeconds <= 60) {
    score += 1;
  }

  if (params.blockExercises.length === 2) {
    score += 1;
  }

  const uniqueBudgetGroups = new Set<WeeklyBudgetScoringItem["group"]>();
  let fatigueCost = 0;

  for (const catalogExercise of catalogExercises) {
    for (const group of getBudgetGroupsForExercise(catalogExercise)) {
      uniqueBudgetGroups.add(group);
    }

    fatigueCost += getExerciseFatigueCost(catalogExercise);

    if (lessOftenExerciseIds.has(catalogExercise.id)) {
      score -= 2;
    }
  }

  for (const group of uniqueBudgetGroups) {
    const budgetEntry = weeklyBudgetMap.get(group);

    if (!budgetEntry) {
      continue;
    }

    if (budgetEntry.remainingSets >= 3) {
      score += 1.5;
      continue;
    }

    if (budgetEntry.remainingSets > 0) {
      score += 0.75;
      continue;
    }

    if (budgetEntry.loadStatus === "over" || budgetEntry.loadStatus === "high_risk") {
      score -= 0.75;
    }
  }

  if (fatigueCost >= 6) {
    score -= 2;
  } else if (fatigueCost >= 4.5) {
    score -= 1;
  }

  return {
    allowed: score >= 4,
    score,
  };
}

function splitStraightSetsIntoTimeEfficientBlocks(params: {
  block: Extract<WorkoutBlock, { type: "straight_sets" }>;
  durationMinutes: number;
  goal: GoalType;
  weeklyBudget?: WeeklyBudgetScoringItem[];
  lessOftenExerciseIds?: string[];
  supersetPreference?: SupersetPreference;
}) {
  const nextBlocks: WorkoutBlock[] = [];
  let pendingStraightExercises: typeof params.block.exercises = [];
  let supersetCount = 0;

  function flushPendingStraightExercises() {
    if (pendingStraightExercises.length === 0) {
      return;
    }

    nextBlocks.push({
      ...params.block,
      title:
        nextBlocks.length === 0
          ? params.block.title
          : `${params.block.title ?? "Block"} - fortsättning`,
      warmup: nextBlocks.length === 0 ? params.block.warmup : undefined,
      exercises: pendingStraightExercises,
    });
    pendingStraightExercises = [];
  }

  for (let index = 0; index < params.block.exercises.length; ) {
    const seedExercise = params.block.exercises[index];
    let bestPartnerIndex = -1;
    let bestPartnerScore = Number.NEGATIVE_INFINITY;

    for (
      let candidateIndex = index + 1;
      candidateIndex < params.block.exercises.length;
      candidateIndex += 1
    ) {
      const candidatePair = [seedExercise, params.block.exercises[candidateIndex]];
      const suitability = getSupersetSuitability({
        blockExercises: candidatePair,
        durationMinutes: params.durationMinutes,
        goal: params.goal,
        weeklyBudget: params.weeklyBudget,
        lessOftenExerciseIds: params.lessOftenExerciseIds,
        supersetPreference: params.supersetPreference,
      });

      if (suitability.allowed && suitability.score > bestPartnerScore) {
        bestPartnerIndex = candidateIndex;
        bestPartnerScore = suitability.score;
      }
    }

    if (bestPartnerIndex >= 0) {
      const pair = [seedExercise, params.block.exercises[bestPartnerIndex]];
      flushPendingStraightExercises();

      const rounds = Math.max(1, ...pair.map((exercise) => exercise.sets));
      supersetCount += 1;
      nextBlocks.push({
        type: "superset",
        title:
          supersetCount === 1
            ? `${params.block.title ?? "Block"} - superset`
            : `${params.block.title ?? "Block"} - superset ${supersetCount}`,
        purpose: params.block.purpose,
        coachNote:
          params.block.coachNote ??
          "Växla mellan övningarna för tätare kvalitet på kort tid.",
        targetRpe: params.block.targetRpe,
        targetRir: params.block.targetRir,
        warmup: nextBlocks.length === 0 ? params.block.warmup : undefined,
        rounds,
        restBetweenExercises: 15,
        restAfterRound: 60,
        exercises: pair.map((exercise) => ({
          ...exercise,
          sets: rounds,
        })),
      });
      params.block.exercises.splice(bestPartnerIndex, 1);
      index += 1;
      continue;
    }

    pendingStraightExercises.push(seedExercise);
    index += 1;
  }

  flushPendingStraightExercises();

  return {
    blocks: nextBlocks,
    supersetCount,
  };
}

function distributeExercisesAcrossBlocks(params: {
  blockCount: number;
  rawBlocks: AiGeneratedBlockCandidate[];
  totalExercises: number;
}) {
  const requestedSizes = params.rawBlocks.map((block) =>
    Array.isArray(block.exercises) && block.exercises.length > 0
      ? block.exercises.length
      : 1,
  );
  const reservedSizes = Array.from({ length: params.blockCount }, () => 1);
  let extraSlotsAvailable = Math.max(0, params.totalExercises - params.blockCount);

  for (let index = 0; index < params.blockCount; index += 1) {
    const block = params.rawBlocks[index];
    const requestedExerciseCount = requestedSizes[index] ?? 1;
    const isRequestedSuperset =
      block?.type === "superset" && requestedExerciseCount >= 2;

    if (!isRequestedSuperset || extraSlotsAvailable < 1) {
      continue;
    }

    // Preserve AI-proposed supersets as a pair when the validated pass is trimmed.
    reservedSizes[index] = 2;
    extraSlotsAvailable -= 1;
  }

  const sizes: number[] = [];
  let remainingExercises = params.totalExercises;

  for (let index = 0; index < params.blockCount; index += 1) {
    const remainingBlocks = params.blockCount - index;

    if (remainingBlocks === 1) {
      sizes.push(remainingExercises);
      break;
    }

    const requestedSize = requestedSizes[index] ?? 1;
    const minimumSizeForBlock = reservedSizes[index] ?? 1;
    const minimumReservedForFollowing = reservedSizes
      .slice(index + 1, params.blockCount)
      .reduce((sum, size) => sum + size, 0);
    const nextSize = Math.min(
      Math.max(minimumSizeForBlock, requestedSize),
      remainingExercises - minimumReservedForFollowing,
    );

    sizes.push(nextSize);
    remainingExercises -= nextSize;
  }

  return sizes;
}

function summarizeWarnings(params: {
  availableEquipment: string[];
  goal: GoalType;
  workout: Workout;
}) {
  const warnings: string[] = [];
  const exercises = params.workout.blocks.flatMap((block) => block.exercises);
  const catalogExercises = exercises
    .map((exercise) => getExerciseById(exercise.id))
    .filter((item): item is ExerciseCatalogItem => item !== null);

  const firstTwoPatterns = catalogExercises
    .slice(0, 2)
    .map((exercise) => exercise.movementPattern);

  if (
    (params.goal === "strength" || params.goal === "hypertrophy") &&
    catalogExercises.some((exercise) => COMPOUND_PATTERNS.has(exercise.movementPattern)) &&
    firstTwoPatterns.every((pattern) => pattern === "core" || pattern === "carry")
  ) {
    warnings.push(
      "Passet startade relativt lätt trots att större rörelsemönster fanns tillgängliga längre ned.",
    );
  }

  const hasEquipmentBeyondBodyweight = params.availableEquipment.some(
    (item) => item !== "bodyweight",
  );

  if (hasEquipmentBeyondBodyweight) {
    const bodyweightHeavyCount = catalogExercises.filter((exercise) => {
      return (
        exercise.requiredEquipment.length === 1 &&
        exercise.requiredEquipment[0] === "bodyweight"
      );
    }).length;

    if (bodyweightHeavyCount > Math.ceil(catalogExercises.length / 2)) {
      warnings.push(
        "Passet använder mycket kroppsvikt trots att mer utrustning finns tillgänglig.",
      );
    }
  }

  const hasLowerBody = catalogExercises.some((exercise) =>
    ["squat", "hinge", "lunge"].includes(exercise.movementPattern),
  );
  const hasPush = catalogExercises.some((exercise) =>
    ["horizontal_push", "vertical_push"].includes(exercise.movementPattern),
  );
  const hasPull = catalogExercises.some((exercise) =>
    ["horizontal_pull", "vertical_pull"].includes(exercise.movementPattern),
  );
  const pushCount = catalogExercises.filter((exercise) =>
    ["horizontal_push", "vertical_push"].includes(exercise.movementPattern),
  ).length;
  const pullCount = catalogExercises.filter((exercise) =>
    ["horizontal_pull", "vertical_pull"].includes(exercise.movementPattern),
  ).length;

  if (params.workout.duration >= 25 && !hasLowerBody) {
    warnings.push("Passet saknar tydligt underkroppsmoment.");
  }

  if (params.workout.duration >= 25 && (!hasPush || !hasPull)) {
    warnings.push("Passet saknar tydlig balans mellan press och drag.");
  }

  if (
    params.workout.duration >= 20 &&
    pushCount > 0 &&
    pullCount > 0 &&
    pushCount > pullCount
  ) {
    warnings.push(
      "Passet innehåller mer press än drag, vilket kan ge sämre strukturell balans.",
    );
  }

  return warnings;
}

function normalizeBlockCoachNote(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : undefined;
}

function normalizeTargetScore(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? clampInteger(value, min, max)
    : null;
}

function buildWarmupGuide(params: {
  blockExercises: Array<{ id: string; rest: number }>;
  goal: GoalType;
}) {
  const firstExercise = params.blockExercises[0];
  const firstCatalogExercise = firstExercise
    ? getExerciseById(firstExercise.id)
    : null;

  if (!firstCatalogExercise) {
    return undefined;
  }

  const isCompound = COMPOUND_PATTERNS.has(firstCatalogExercise.movementPattern);
  const needsWarmup =
    firstCatalogExercise.riskLevel === "high" ||
    ((params.goal === "strength" || params.goal === "hypertrophy") &&
      isCompound &&
      firstExercise.rest >= 75);

  if (!needsWarmup) {
    return undefined;
  }

  return {
    recommended: true,
    instruction:
      "Gör 1-2 lätta uppvärmningsset med lugn kontroll innan första arbetssetet. De räknas inte mot veckobudgeten.",
  };
}

function getQualityScore(params: {
  requestedRestAdjustments: number;
  validationWarnings: string[];
  scientificWarnings: string[];
}) {
  let score = 100;

  score -= params.requestedRestAdjustments * 3;
  score -= params.validationWarnings.length * 8;
  score -= params.scientificWarnings.length * 10;

  return Math.max(0, score);
}

export function validateGeneratedWorkout(params: {
  availableEquipment: string[];
  candidate: AiGeneratedWorkoutCandidate;
  durationMinutes: number;
  goal: GoalType;
  focusContext?: GeneratedWorkoutValidationFocusContext | null;
  gym: string | null;
  gymLabel: string | null;
  recentExerciseIds?: string[];
  recentVariantGroups?: string[];
  weeklyBudget?: WeeklyBudgetScoringItem[];
  lessOftenExerciseIds?: string[];
  avoidSupersets?: boolean;
  supersetPreference?: SupersetPreference;
}): ValidateGeneratedWorkoutResult {
  // Keep legacy boolean support while letting newer preference rules be more granular.
  const effectiveSupersetPreference: SupersetPreference =
    params.supersetPreference ??
    (params.avoidSupersets ? "avoid_all" : "allowed");
  const availableCatalog = getAvailableExercises(params.availableEquipment);
  const rawBlocks = getRawBlocks(params.candidate);
  const rawBonusExercises = getRawBonusExercises(params.candidate);
  const maxBlockCount = getEffectiveMaxBlockCount({
    durationMinutes: params.durationMinutes,
    rawBlocks,
    supersetPreference: effectiveSupersetPreference,
  });
  const selectedBlocks =
    rawBlocks.length > 0 ? rawBlocks.slice(0, maxBlockCount) : [{ title: "Huvuddel", exercises: [] }];
  const flatAiExercises = selectedBlocks.flatMap((block) =>
    Array.isArray(block.exercises) ? block.exercises : [],
  );
  const targetMainExerciseCount = getTargetMainExerciseCount(
    params.durationMinutes,
    params.goal,
    params.focusContext?.plannedFocus,
  );
  const targetExerciseCount = Math.min(
    getEffectiveTargetExerciseCount({
      durationMinutes: params.durationMinutes,
      goal: params.goal,
      focus: params.focusContext?.plannedFocus,
      rawBlocks: selectedBlocks,
      supersetPreference: effectiveSupersetPreference,
    }),
    targetMainExerciseCount,
  );
  const trimmedMainExercises = trimAiExercisesToDuration({
    exercises: flatAiExercises,
    targetMainExerciseCount: targetExerciseCount,
    focusContext: params.focusContext,
    goal: params.goal,
  });

  // Validera alla AI-val globalt först för att undvika dubletter mellan block.
  const validated = validateAndNormalizeAiExercises({
    aiExercises: trimmedMainExercises.keptExercises,
    availableEquipment: params.availableEquipment,
    recentExerciseIds: params.recentExerciseIds,
    recentVariantGroups: params.recentVariantGroups,
    targetExerciseCount,
    focusContext: params.focusContext,
  });

  const requestedSizes = distributeExercisesAcrossBlocks({
    blockCount: selectedBlocks.length,
    rawBlocks: selectedBlocks,
    totalExercises: validated.exercises.length,
  });

  let offset = 0;
  let requestedRestAdjustments = 0;
  let supersetBlocksUsed = 0;
  const structuredBlockWarnings: string[] = [];

  let blocks: WorkoutBlock[] = selectedBlocks.map((block, index) => {
    const blockExerciseCount = requestedSizes[index] ?? 0;
    const blockExercises = validated.exercises
      .slice(offset, offset + blockExerciseCount)
      .map((exercise) => {
        const adjustedRest = adjustRestByGoal(
          exercise.id,
          exercise.rest,
          params.goal,
        );

        if (adjustedRest !== exercise.rest) {
          requestedRestAdjustments += 1;
        }

        return {
          ...exercise,
          rest: adjustedRest,
        };
      });

    offset += blockExerciseCount;

    const requestedBlockType =
      block.type === "superset" ? "superset" : "straight_sets";
    const canAddAnotherSuperset =
      params.durationMinutes <= 30 || supersetBlocksUsed === 0;
    const shouldUseSuperset =
      effectiveSupersetPreference !== "avoid_all" &&
      requestedBlockType === "superset" &&
      canAddAnotherSuperset &&
      getSupersetSuitability({
        blockExercises,
        durationMinutes: params.durationMinutes,
        goal: params.goal,
        weeklyBudget: params.weeklyBudget,
        lessOftenExerciseIds: params.lessOftenExerciseIds,
        supersetPreference: effectiveSupersetPreference,
      }).allowed;

    if (requestedBlockType === "superset" && !shouldUseSuperset) {
      structuredBlockWarnings.push(
        `Ett önskat superset-block i ${index === 0 ? "första blocket" : `block ${index + 1}`} normaliserades till straight sets.`,
      );
    }

    if (shouldUseSuperset) {
      supersetBlocksUsed += 1;
    }

    const normalizedType = shouldUseSuperset ? "superset" : "straight_sets";
    const normalizedRounds = shouldUseSuperset
      ? clampInteger(
          typeof block.rounds === "number" ? block.rounds : blockExercises[0]?.sets ?? 3,
          1,
          6,
        )
      : null;
    const normalizedExercises = shouldUseSuperset
      ? blockExercises.map((exercise) => ({
          ...exercise,
          sets: normalizedRounds ?? exercise.sets,
        }))
      : blockExercises;

    const baseBlock = {
      title:
        typeof block.title === "string" && block.title.trim()
          ? block.title.trim()
          : index === 0
            ? "Huvuddel"
            : `Block ${index + 1}`,
      purpose:
        typeof block.purpose === "string" && block.purpose.trim()
          ? block.purpose.trim()
          : undefined,
      coachNote: normalizeBlockCoachNote(
        block.coachNote ?? block.coach_note,
      ),
      targetRpe: normalizeTargetScore(
        block.targetRpe ?? block.target_rpe,
        1,
        10,
      ),
      targetRir: normalizeTargetScore(
        block.targetRir ?? block.target_rir,
        0,
        6,
      ),
      warmup: buildWarmupGuide({
        blockExercises: normalizedExercises,
        goal: params.goal,
      }),
      exercises: normalizedExercises,
    };

    if (normalizedType === "superset") {
      return {
        ...baseBlock,
        type: "superset" as const,
        rounds: normalizedRounds,
        restBetweenExercises: normalizeStructuredRest(
          block.restBetweenExercises,
          15,
          0,
          90,
        ),
        restAfterRound: normalizeStructuredRest(
          block.restAfterRound,
          60,
          15,
          180,
        ),
      };
    }

    return {
      ...baseBlock,
      type: "straight_sets" as const,
    };
  });

  if (
    params.durationMinutes <= 30 &&
    effectiveSupersetPreference !== "avoid_all"
  ) {
    let createdSupersetCount = 0;

    blocks = blocks.flatMap((block) => {
      if (block.type !== "straight_sets" || block.exercises.length < 2) {
        return [block];
      }

      const splitResult = splitStraightSetsIntoTimeEfficientBlocks({
        block,
        durationMinutes: params.durationMinutes,
        goal: params.goal,
        weeklyBudget: params.weeklyBudget,
        lessOftenExerciseIds: params.lessOftenExerciseIds,
        supersetPreference: effectiveSupersetPreference,
      });

      createdSupersetCount += splitResult.supersetCount;
      return splitResult.blocks;
    });

    if (createdSupersetCount > supersetBlocksUsed) {
      structuredBlockWarnings.push(
        `Valideringen skapade ${createdSupersetCount - supersetBlocksUsed} supersetblock för att göra ett kort pass mer tidseffektivt.`,
      );
      supersetBlocksUsed = createdSupersetCount;
    }
  }

  const workout: Workout = {
    id: undefined,
    name:
      typeof params.candidate.name === "string" && params.candidate.name.trim()
        ? params.candidate.name.trim()
        : "AI-pass",
    duration: clampInteger(params.durationMinutes, 5, 180),
    goal: params.goal,
    gym: params.gym,
    gymLabel: params.gymLabel,
    aiComment:
      typeof params.candidate.rationale === "string" &&
      params.candidate.rationale.trim()
        ? params.candidate.rationale.trim()
        : undefined,
    blocks,
  };

  const scientificWarnings = summarizeWarnings({
    availableEquipment: params.availableEquipment,
    goal: params.goal,
    workout,
  });
  const qualityScore = getQualityScore({
    requestedRestAdjustments,
    validationWarnings: validated.debug.warnings,
    scientificWarnings,
  });

  return {
    workout,
    debug: {
      availableExerciseCount: availableCatalog.length,
      requestedBlockCount: rawBlocks.length,
      finalBlockCount: blocks.length,
      requestedExerciseCount: flatAiExercises.length,
      finalExerciseCount: validated.exercises.length,
      targetExerciseCount,
      targetMainExerciseCount,
      actualMainExerciseCountFromAi: flatAiExercises.length,
      finalMainExerciseCount: validated.exercises.length,
      optionalBonusExerciseCount: rawBonusExercises.length,
      bonusExercisesUsed: 0,
      bonusExercisesRejectedReason: rawBonusExercises.map((exercise) => {
        const role = normalizeRequestedRole(exercise.role);
        if (!exercise.name && !exercise.id) {
          return "Bonusövning saknade identifierbart namn eller id och ignorerades.";
        }
        return role
          ? `${exercise.name ?? exercise.id}: bonus behölls utanför huvudpasset för att skydda durationen.`
          : `${exercise.name ?? exercise.id}: bonusövning användes inte eftersom huvudpasset redan skulle vara komplett.`;
      }),
      trimmedBecauseTooManyExercises: trimmedMainExercises.trimmedExercises.length > 0,
      trimmedExercises: trimmedMainExercises.trimmedExercises.map(({ exercise, trimReason }) => ({
        name: exercise.name ?? exercise.id ?? "Okänd övning",
        role: normalizeRequestedRole(exercise.role),
        priorityRank:
          typeof exercise.priorityRank === "number" ? exercise.priorityRank : 999,
        canDropIfShort: exercise.canDropIfShort === true,
        reason: exercise.reason ?? exercise.rationale ?? null,
        trimReason,
      })),
      keptExerciseRoles: Array.from(
        new Set(
          trimmedMainExercises.keptExercises
            .map((exercise) => normalizeRequestedRole(exercise.role))
            .filter((role): role is string => Boolean(role)),
        ),
      ),
      lostExerciseRoles: Array.from(new Set(trimmedMainExercises.lostRoles)),
      fallbackAddedDespiteEnoughAiExercises:
        trimmedMainExercises.keptExercises.length >= targetExerciseCount &&
        validated.debug.fills.length > 0,
      durationTrimWarnings: trimmedMainExercises.warnings,
      requestedRestAdjustments,
      qualityScore,
      warnings: [
        ...trimmedMainExercises.warnings,
        ...validated.debug.warnings,
        ...scientificWarnings,
        ...structuredBlockWarnings,
      ],
      validation: validated.debug,
    },
  };
}
