// lib/workout-flow/normalize-preview-workout.ts
// Normaliserar workout-data till appens nya blocks-modell.
// Viktigt i denna version:
// - gamla workouts med toppnivå `exercises` ska fortfarande fungera
// - nya workouts ska alltid lämna denna funktion med `blocks`
// - equipment-fält bevaras så preview/debug kan läsa dem vidare
// - om `blocks` finns men är tomma ska vi kunna falla tillbaka till legacy `exercises`

import { resolveExerciseDescription } from "@/lib/workout-flow/exercise-description";
import type { Exercise, Workout, WorkoutBlock, WorkoutLike } from "@/types/workout";

type WorkoutWithMetadata = Workout & {
  availableEquipment?: string[];
  equipment?: string[];
  equipmentList?: string[];
  gymEquipment?: string[];
};

function createSafeId(prefix: string, index: number) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${index}-${Date.now()}`;
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSuggestedWeight(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

function getBlockExerciseCount(blocks: unknown) {
  if (!Array.isArray(blocks)) {
    return 0;
  }

  return blocks.reduce((sum, block) => {
    const blockObject = block as { exercises?: unknown };
    const exercises = Array.isArray(blockObject.exercises)
      ? blockObject.exercises
      : [];

    return sum + exercises.length;
  }, 0);
}

function normalizeExercise(exercise: any, index: number): Exercise {
  return {
    id: exercise?.id ?? createSafeId("exercise", index),
    name: exercise?.name ?? "Okänd övning",
    description: resolveExerciseDescription(exercise),
    isCustom: Boolean(exercise?.isCustom),
    isNewExercise: Boolean(exercise?.isNewExercise),
    sets:
      typeof exercise?.sets === "number" && exercise.sets > 0
        ? exercise.sets
        : 3,
    reps: normalizeOptionalNumber(exercise?.reps),
    duration: normalizeOptionalNumber(exercise?.duration),
    rest:
      typeof exercise?.rest === "number" && Number.isFinite(exercise.rest)
        ? exercise.rest
        : 60,
    // Vi accepterar flera möjliga fältnamn för framtida progression/AI-förslag.
    suggestedWeight: normalizeSuggestedWeight(
      exercise?.suggestedWeight ??
        exercise?.plannedWeight ??
        exercise?.weightSuggestion,
    ),
  };
}

function normalizeBlock(block: any, blockIndex: number): WorkoutBlock {
  const rawExercises = Array.isArray(block?.exercises) ? block.exercises : [];

  return {
    type: "straight_sets",
    title:
      typeof block?.title === "string" && block.title.trim()
        ? block.title.trim()
        : blockIndex === 0
          ? "Huvuddel"
          : `Block ${blockIndex + 1}`,
    exercises: rawExercises.map(normalizeExercise),
  };
}

function getRawBlocks(workout: any): any[] {
  const rawBlocks = Array.isArray(workout?.blocks) ? workout.blocks : [];
  const legacyExercises = Array.isArray(workout?.exercises)
    ? workout.exercises
    : [];

  const blockExerciseCount = getBlockExerciseCount(rawBlocks);

  // Om blocks faktiskt innehåller övningar litar vi på nya modellen.
  if (blockExerciseCount > 0) {
    return rawBlocks;
  }

  // Om blocks finns men i praktiken är tomma, fall tillbaka till legacy exercises.
  if (legacyExercises.length > 0) {
    return [
      {
        type: "straight_sets",
        title: "Huvuddel",
        exercises: legacyExercises,
      },
    ];
  }

  // Finns blocks men utan övningar, behåll ändå strukturen som sista fallback.
  if (rawBlocks.length > 0) {
    return rawBlocks;
  }

  return [];
}

function copyEquipmentMetadata(source: any, target: WorkoutWithMetadata) {
  const availableEquipment = normalizeStringArray(source?.availableEquipment);
  const equipment = normalizeStringArray(source?.equipment);
  const equipmentList = normalizeStringArray(source?.equipmentList);
  const gymEquipment = normalizeStringArray(source?.gymEquipment);

  if (availableEquipment) {
    target.availableEquipment = availableEquipment;
  }

  if (equipment) {
    target.equipment = equipment;
  }

  if (equipmentList) {
    target.equipmentList = equipmentList;
  }

  if (gymEquipment) {
    target.gymEquipment = gymEquipment;
  }
}

export function normalizePreviewWorkout(workout: WorkoutLike | any): Workout | null {
  if (!workout) {
    return null;
  }

  const rawBlocks = getRawBlocks(workout);

  const normalized: WorkoutWithMetadata = {
    id: workout.id ?? createSafeId("workout", 0),
    name: workout.name ?? "Träningspass",
    duration:
      typeof workout.duration === "number" && Number.isFinite(workout.duration)
        ? workout.duration
        : 45,
    goal:
      typeof workout.goal === "string" && workout.goal.trim()
        ? workout.goal.trim()
        : undefined,
    gym: workout.gym ?? workout.gymLabel ?? null,
    gymLabel: workout.gymLabel ?? workout.gym ?? null,
    aiComment:
      typeof workout.aiComment === "string" && workout.aiComment.trim()
        ? workout.aiComment.trim()
        : undefined,
    blocks: rawBlocks.map(normalizeBlock),
    createdAt:
      typeof workout.createdAt === "string" && workout.createdAt.trim()
        ? workout.createdAt
        : undefined,
  };

  // Behåll equipment-info så preview/debug och katalogfiltrering får samma data.
  copyEquipmentMetadata(workout, normalized);

  return normalized;
}