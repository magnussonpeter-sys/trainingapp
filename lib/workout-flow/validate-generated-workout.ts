import { validateAndNormalizeAiExercises } from "@/lib/ai-exercise-validation";
import {
  getAvailableExercises,
  getExerciseById,
  type ExerciseCatalogItem,
  type MovementPattern,
} from "@/lib/exercise-catalog";
import type { Workout } from "@/types/workout";

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
  exercises?: AiGeneratedExerciseCandidate[];
};

export type AiGeneratedWorkoutCandidate = {
  name?: string;
  duration?: number;
  rationale?: string;
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

function getMaxBlockCount(durationMinutes: number) {
  if (durationMinutes <= 25) {
    return 1;
  }

  if (durationMinutes <= 50) {
    return 2;
  }

  return 3;
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

  const sizes: number[] = [];
  let remainingExercises = params.totalExercises;

  for (let index = 0; index < params.blockCount; index += 1) {
    const remainingBlocks = params.blockCount - index;

    if (remainingBlocks === 1) {
      sizes.push(remainingExercises);
      break;
    }

    const requestedSize = requestedSizes[index] ?? 1;
    const minimumReservedForFollowing = remainingBlocks - 1;
    const nextSize = Math.min(
      Math.max(1, requestedSize),
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

  if (params.workout.duration >= 25 && !hasLowerBody) {
    warnings.push("Passet saknar tydligt underkroppsmoment.");
  }

  if (params.workout.duration >= 25 && (!hasPush || !hasPull)) {
    warnings.push("Passet saknar tydlig balans mellan press och drag.");
  }

  return warnings;
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
}): ValidateGeneratedWorkoutResult {
  const availableCatalog = getAvailableExercises(params.availableEquipment);
  const rawBlocks = getRawBlocks(params.candidate);
  const maxBlockCount = getMaxBlockCount(params.durationMinutes);
  const selectedBlocks =
    rawBlocks.length > 0 ? rawBlocks.slice(0, maxBlockCount) : [{ title: "Huvuddel", exercises: [] }];
  const flatAiExercises = selectedBlocks.flatMap((block) =>
    Array.isArray(block.exercises) ? block.exercises : [],
  );
  const targetExerciseCount = getTargetExerciseCount(params.durationMinutes);

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

  const blocks = selectedBlocks.map((block, index) => {
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

    return {
      type: "straight_sets" as const,
      title:
        typeof block.title === "string" && block.title.trim()
          ? block.title.trim()
          : index === 0
            ? "Huvuddel"
            : `Block ${index + 1}`,
      exercises: blockExercises,
    };
  });

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
      warnings: [...validated.debug.warnings, ...scientificWarnings],
      validation: validated.debug,
    },
  };
}
