import { validateAndNormalizeAiExercises } from "@/lib/ai-exercise-validation";
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
  rationale?: string;
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
    warnings: string[];
    validation: ReturnType<typeof validateAndNormalizeAiExercises>["debug"];
  };
};

type ScientificGuardrailContext = {
  availableCatalog: ExerciseCatalogItem[];
  availableEquipment: string[];
  durationMinutes: number;
  goal: GoalType;
};

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

function getTargetExerciseCount(durationMinutes: number) {
  if (durationMinutes <= 20) {
    return 3;
  }

  if (durationMinutes <= 35) {
    return 4;
  }

  if (durationMinutes <= 50) {
    return 5;
  }

  return 6;
}

function getEffectiveTargetExerciseCount(params: {
  durationMinutes: number;
  rawBlocks: AiGeneratedBlockCandidate[];
  supersetPreference?: SupersetPreference;
}) {
  const defaultTargetExerciseCount = getTargetExerciseCount(params.durationMinutes);

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
  const targetExerciseCount = getEffectiveTargetExerciseCount({
    durationMinutes: params.durationMinutes,
    rawBlocks: selectedBlocks,
    supersetPreference: effectiveSupersetPreference,
  });

  // Validera alla AI-val globalt först för att undvika dubletter mellan block.
  const validated = validateAndNormalizeAiExercises({
    aiExercises: flatAiExercises,
    availableEquipment: params.availableEquipment,
    recentExerciseIds: params.recentExerciseIds,
    recentVariantGroups: params.recentVariantGroups,
    targetExerciseCount,
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
      requestedRestAdjustments,
      qualityScore,
      warnings: [
        ...validated.debug.warnings,
        ...scientificWarnings,
        ...structuredBlockWarnings,
      ],
      validation: validated.debug,
    },
  };
}
