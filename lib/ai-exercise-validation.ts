import {
  EXERCISE_CATALOG,
  type EquipmentId,
  type ExerciseCatalogItem,
  type MovementPattern,
  normalizeEquipmentList,
} from "@/lib/exercise-catalog";

export type AiExerciseCandidate = {
  id?: string;
  name?: string;
  description?: string;
  requiredEquipment?: string[];
  movementPattern?: string;
  primaryMuscles?: string[];
  sets?: number;
  reps?: number;
  duration?: number;
  rest?: number;
};

type NormalizedExercise = {
  id: string;
  name: string;
  description: string;
  sets: number;
  reps?: number;
  duration?: number;
  rest: number;
  movementPattern: MovementPattern;
  primaryMuscles: string[];
  variantGroup: string;
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

function clampPositiveInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function countByMovementPattern(exercises: NormalizedExercise[]) {
  const counts = new Map<MovementPattern, number>();

  for (const exercise of exercises) {
    counts.set(
      exercise.movementPattern,
      (counts.get(exercise.movementPattern) ?? 0) + 1
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
      (counts.get(exercise.variantGroup) ?? 0) + 1
    );
  }

  return counts;
}

function wouldBreakBalance(
  candidate: Pick<
    NormalizedExercise,
    "movementPattern" | "primaryMuscles" | "variantGroup"
  >,
  acceptedExercises: NormalizedExercise[]
) {
  const movementCounts = countByMovementPattern(acceptedExercises);
  const muscleCounts = countByPrimaryMuscle(acceptedExercises);
  const variantCounts = countByVariantGroup(acceptedExercises);

  const currentMovementCount =
    movementCounts.get(candidate.movementPattern) ?? 0;

  if (currentMovementCount >= MAX_PER_MOVEMENT_PATTERN) {
    return true;
  }

  const currentVariantCount = variantCounts.get(candidate.variantGroup) ?? 0;

  if (currentVariantCount >= MAX_PER_VARIANT_GROUP) {
    return true;
  }

  for (const muscle of candidate.primaryMuscles) {
    const currentMuscleCount = muscleCounts.get(muscle) ?? 0;

    if (currentMuscleCount >= MAX_PER_PRIMARY_MUSCLE) {
      return true;
    }
  }

  return false;
}

function findCatalogExerciseById(
  exerciseId: string,
  availableCatalog: ExerciseCatalogItem[]
) {
  return availableCatalog.find((item) => item.id === exerciseId) ?? null;
}

function hasExerciseId(
  exerciseId: string,
  acceptedExercises: NormalizedExercise[]
) {
  return acceptedExercises.some((exercise) => exercise.id === exerciseId);
}

function findFallbackExercise(params: {
  requestedMovementPattern?: string;
  availableCatalog: ExerciseCatalogItem[];
  acceptedExercises: NormalizedExercise[];
}) {
  const requestedMovementPattern =
    typeof params.requestedMovementPattern === "string" &&
    VALID_MOVEMENT_PATTERNS.includes(
      params.requestedMovementPattern as MovementPattern
    )
      ? (params.requestedMovementPattern as MovementPattern)
      : undefined;

  const notAlreadyUsed = params.availableCatalog.filter(
    (exercise) => !hasExerciseId(exercise.id, params.acceptedExercises)
  );

  const samePattern = requestedMovementPattern
    ? notAlreadyUsed.filter(
        (exercise) => exercise.movementPattern === requestedMovementPattern
      )
    : [];

  const balancedSamePattern = samePattern.filter(
    (exercise) =>
      !wouldBreakBalance(
        {
          movementPattern: exercise.movementPattern,
          primaryMuscles: exercise.primaryMuscles,
          variantGroup: exercise.variantGroup,
        },
        params.acceptedExercises
      )
  );

  if (balancedSamePattern.length > 0) {
    return balancedSamePattern[0];
  }

  if (samePattern.length > 0) {
    return samePattern[0];
  }

  const balancedAny = notAlreadyUsed.filter(
    (exercise) =>
      !wouldBreakBalance(
        {
          movementPattern: exercise.movementPattern,
          primaryMuscles: exercise.primaryMuscles,
          variantGroup: exercise.variantGroup,
        },
        params.acceptedExercises
      )
  );

  if (balancedAny.length > 0) {
    return balancedAny[0];
  }

  return notAlreadyUsed[0] ?? null;
}

function createNormalizedExercise(
  catalogExercise: ExerciseCatalogItem,
  aiExercise?: AiExerciseCandidate
): NormalizedExercise {
  const isTimeBased =
    typeof catalogExercise.defaultDuration === "number" &&
    catalogExercise.defaultDuration > 0 &&
    typeof catalogExercise.defaultReps !== "number";

  return {
    id: catalogExercise.id,
    name: catalogExercise.name,
    description: catalogExercise.description,
    sets: clampPositiveInt(
      aiExercise?.sets,
      catalogExercise.defaultSets,
      1,
      8
    ),
    reps: isTimeBased
      ? undefined
      : clampPositiveInt(
          aiExercise?.reps,
          catalogExercise.defaultReps ?? 10,
          1,
          30
        ),
    duration: isTimeBased
      ? clampPositiveInt(
          aiExercise?.duration,
          catalogExercise.defaultDuration ?? 30,
          10,
          180
        )
      : undefined,
    rest: clampPositiveInt(
      aiExercise?.rest,
      catalogExercise.defaultRest,
      0,
      240
    ),
    movementPattern: catalogExercise.movementPattern,
    primaryMuscles: catalogExercise.primaryMuscles,
    variantGroup: catalogExercise.variantGroup,
  };
}

function pickStarterExercises(
  availableCatalog: ExerciseCatalogItem[],
  acceptedExercises: NormalizedExercise[],
  count: number
) {
  const preferredPatterns: MovementPattern[] = [
    "squat",
    "hinge",
    "horizontal_push",
    "horizontal_pull",
    "vertical_pull",
    "vertical_push",
    "core",
    "carry",
  ];

  for (const pattern of preferredPatterns) {
    if (acceptedExercises.length >= count) break;

    const candidate = availableCatalog.find(
      (exercise) =>
        exercise.movementPattern === pattern &&
        !hasExerciseId(exercise.id, acceptedExercises) &&
        !wouldBreakBalance(
          {
            movementPattern: exercise.movementPattern,
            primaryMuscles: exercise.primaryMuscles,
            variantGroup: exercise.variantGroup,
          },
          acceptedExercises
        )
    );

    if (candidate) {
      acceptedExercises.push(createNormalizedExercise(candidate));
    }
  }
}

export function validateAndNormalizeAiExercises(params: {
  aiExercises: AiExerciseCandidate[];
  availableEquipment: string[];
  targetExerciseCount?: number;
}) {
  const normalizedEquipment = new Set<EquipmentId>(
    normalizeEquipmentList(params.availableEquipment)
  );

  const availableCatalog = EXERCISE_CATALOG.filter((exercise) =>
    exercise.requiredEquipment.every((item) => normalizedEquipment.has(item))
  );

  if (availableCatalog.length === 0) {
    return [];
  }

  const targetExerciseCount = clampPositiveInt(
    params.targetExerciseCount,
    6,
    3,
    10
  );

  const normalizedExercises: NormalizedExercise[] = [];

  for (const aiExercise of params.aiExercises) {
    if (normalizedExercises.length >= targetExerciseCount) {
      break;
    }

    if (typeof aiExercise.id === "string") {
      const exactMatch = findCatalogExerciseById(aiExercise.id, availableCatalog);

      if (
        exactMatch &&
        !hasExerciseId(exactMatch.id, normalizedExercises) &&
        !wouldBreakBalance(
          {
            movementPattern: exactMatch.movementPattern,
            primaryMuscles: exactMatch.primaryMuscles,
            variantGroup: exactMatch.variantGroup,
          },
          normalizedExercises
        )
      ) {
        normalizedExercises.push(createNormalizedExercise(exactMatch, aiExercise));
        continue;
      }
    }

    const fallback = findFallbackExercise({
      requestedMovementPattern:
        typeof aiExercise.movementPattern === "string"
          ? aiExercise.movementPattern
          : undefined,
      availableCatalog,
      acceptedExercises: normalizedExercises,
    });

    if (fallback) {
      normalizedExercises.push(createNormalizedExercise(fallback, aiExercise));
    }
  }

  if (normalizedExercises.length < Math.min(3, targetExerciseCount)) {
    pickStarterExercises(
      availableCatalog,
      normalizedExercises,
      Math.min(targetExerciseCount, 6)
    );
  }

  if (normalizedExercises.length < targetExerciseCount) {
    for (const exercise of availableCatalog) {
      if (normalizedExercises.length >= targetExerciseCount) {
        break;
      }

      if (hasExerciseId(exercise.id, normalizedExercises)) {
        continue;
      }

      if (
        wouldBreakBalance(
          {
            movementPattern: exercise.movementPattern,
            primaryMuscles: exercise.primaryMuscles,
            variantGroup: exercise.variantGroup,
          },
          normalizedExercises
        )
      ) {
        continue;
      }

      normalizedExercises.push(createNormalizedExercise(exercise));
    }
  }

  if (normalizedExercises.length < targetExerciseCount) {
    for (const exercise of availableCatalog) {
      if (normalizedExercises.length >= targetExerciseCount) {
        break;
      }

      if (hasExerciseId(exercise.id, normalizedExercises)) {
        continue;
      }

      normalizedExercises.push(createNormalizedExercise(exercise));
    }
  }

  return normalizedExercises.map(
    ({
      movementPattern: _movementPattern,
      primaryMuscles: _primaryMuscles,
      variantGroup: _variantGroup,
      ...exercise
    }) => exercise
  );
}