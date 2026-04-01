// lib/ai-exercise-validation.ts

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

type BalanceIssueCode =
  | "movement_pattern_limit"
  | "primary_muscle_limit"
  | "variant_group_limit";

export type ValidationReasonCode =
  | "accepted_exact_match"
  | "invalid_or_missing_id"
  | "duplicate_exercise_id"
  | "balance_adjustment"
  | "filled_missing_slots"
  | "empty_ai_response";

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
    rest: number;
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
  };
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

function getBalanceIssue(
  candidate: Pick<
    NormalizedExercise,
    "movementPattern" | "primaryMuscles" | "variantGroup"
  >,
  acceptedExercises: NormalizedExercise[]
): { code: BalanceIssueCode; message: string } | null {
  const movementCounts = countByMovementPattern(acceptedExercises);
  const muscleCounts = countByPrimaryMuscle(acceptedExercises);
  const variantCounts = countByVariantGroup(acceptedExercises);

  const currentMovementCount =
    movementCounts.get(candidate.movementPattern) ?? 0;

  if (currentMovementCount >= MAX_PER_MOVEMENT_PATTERN) {
    return {
      code: "movement_pattern_limit",
      message: `rörelsemönstret ${candidate.movementPattern} var redan fullt`,
    };
  }

  const currentVariantCount = variantCounts.get(candidate.variantGroup) ?? 0;

  if (currentVariantCount >= MAX_PER_VARIANT_GROUP) {
    return {
      code: "variant_group_limit",
      message: `varianten ${candidate.variantGroup} fanns redan i passet`,
    };
  }

  for (const muscle of candidate.primaryMuscles) {
    const currentMuscleCount = muscleCounts.get(muscle) ?? 0;

    if (currentMuscleCount >= MAX_PER_PRIMARY_MUSCLE) {
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
      !getBalanceIssue(
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
      !getBalanceIssue(
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
  count: number,
  fills: ValidationDebugEntry[]
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
        !getBalanceIssue(
          {
            movementPattern: exercise.movementPattern,
            primaryMuscles: exercise.primaryMuscles,
            variantGroup: exercise.variantGroup,
          },
          acceptedExercises
        )
    );

    if (!candidate) {
      continue;
    }

    acceptedExercises.push(createNormalizedExercise(candidate));

    fills.push({
      requestedId: null,
      requestedName: null,
      requestedMovementPattern: pattern,
      selectedId: candidate.id,
      selectedName: candidate.name,
      reasonCode: "filled_missing_slots",
      reason: "AI lämnade tom plats och valideringen fyllde på med balanserad standardövning",
    });
  }
}

export function validateAndNormalizeAiExercises(params: {
  aiExercises: AiExerciseCandidate[];
  availableEquipment: string[];
  targetExerciseCount?: number;
}): ValidateAiExercisesResult {
  const normalizedEquipment = new Set<EquipmentId>(
    normalizeEquipmentList(params.availableEquipment)
  );

  const availableCatalog = EXERCISE_CATALOG.filter((exercise) =>
    exercise.requiredEquipment.every((item) => normalizedEquipment.has(item))
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
      },
    };
  }

  const targetExerciseCount = clampPositiveInt(
    params.targetExerciseCount,
    6,
    3,
    10
  );

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

    if (requestedId) {
      const exactMatch = findCatalogExerciseById(requestedId, availableCatalog);

      if (exactMatch) {
        const duplicate = hasExerciseId(exactMatch.id, normalizedExercises);
        const balanceIssue = getBalanceIssue(
          {
            movementPattern: exactMatch.movementPattern,
            primaryMuscles: exactMatch.primaryMuscles,
            variantGroup: exactMatch.variantGroup,
          },
          normalizedExercises
        );

        if (!duplicate && !balanceIssue) {
          normalizedExercises.push(
            createNormalizedExercise(exactMatch, aiExercise)
          );

          acceptedDirectly.push({
            requestedId,
            requestedName,
            requestedMovementPattern,
            selectedId: exactMatch.id,
            selectedName: exactMatch.name,
            reasonCode: "accepted_exact_match",
            reason: "AI-valet accepterades direkt.",
          });

          continue;
        }

        const fallback = findFallbackExercise({
          requestedMovementPattern: requestedMovementPattern ?? undefined,
          availableCatalog,
          acceptedExercises: normalizedExercises,
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
              : "balance_adjustment",
            reason: duplicate
              ? "AI försökte använda samma övning flera gånger."
              : `AI-valet ersattes eftersom ${balanceIssue?.message ?? "balansen i passet blev svag"}.`,
          });
        }

        continue;
      }
    }

    const fallback = findFallbackExercise({
      requestedMovementPattern: requestedMovementPattern ?? undefined,
      availableCatalog,
      acceptedExercises: normalizedExercises,
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
    pickStarterExercises(
      availableCatalog,
      normalizedExercises,
      Math.min(targetExerciseCount, 6),
      fills
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
        getBalanceIssue(
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
      fills.push({
        requestedId: null,
        requestedName: null,
        requestedMovementPattern: exercise.movementPattern,
        selectedId: exercise.id,
        selectedName: exercise.name,
        reasonCode: "filled_missing_slots",
        reason: "Valideringen fyllde på med balanserad reservövning.",
      });
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
      fills.push({
        requestedId: null,
        requestedName: null,
        requestedMovementPattern: exercise.movementPattern,
        selectedId: exercise.id,
        selectedName: exercise.name,
        reasonCode: "filled_missing_slots",
        reason: "Valideringen fyllde sista platserna med tillgänglig reservövning.",
      });
    }
  }

  if (replacements.length > 0) {
    warnings.push(
      `Valideringen ersatte ${replacements.length} AI-val för att förbättra balans eller rätta ogiltiga id:n.`
    );
  }

  if (fills.length > 0) {
    warnings.push(
      `Valideringen fyllde ${fills.length} platser eftersom AI inte gav tillräckligt många användbara övningar.`
    );
  }

  return {
    exercises: normalizedExercises.map(
      ({
        movementPattern: _movementPattern,
        primaryMuscles: _primaryMuscles,
        variantGroup: _variantGroup,
        ...exercise
      }) => exercise
    ),
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
    },
  };
}