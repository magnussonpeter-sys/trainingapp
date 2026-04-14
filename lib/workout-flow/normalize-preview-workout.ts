// lib/workout-flow/normalize-preview-workout.ts
// Normaliserar workout-data till appens nya blocks-modell.
// Viktigt i denna version:
// - gamla workouts med toppnivå `exercises` ska fortfarande fungera
// - nya workouts ska alltid lämna denna funktion med `blocks`
// - equipment-fält bevaras så preview/debug kan läsa dem vidare
// - om `blocks` finns men är tomma ska vi kunna falla tillbaka till legacy `exercises`

import { resolveExerciseDescription } from "@/lib/workout-flow/exercise-description";
import type {
  Exercise,
  Workout,
  WorkoutAiDebug,
  WorkoutBlock,
  WorkoutFocus,
  WorkoutWarmupGuide,
  WorkoutLike,
  WorkoutPreparationFeedback,
} from "@/types/workout";

type WorkoutWithMetadata = Workout & {
  availableEquipment?: string[];
  equipment?: string[];
  equipmentList?: string[];
  gymEquipment?: string[];
};

function normalizePreparationLevel(value: unknown) {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined;
}

function normalizePreparationFeedback(
  value: unknown,
): WorkoutPreparationFeedback | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const energy = normalizePreparationLevel(record.energy);
  const focus = normalizePreparationLevel(record.focus);
  const note = normalizeOptionalString(record.note);
  const updatedAt = normalizeOptionalString(record.updatedAt);

  if (!energy && !focus && !note) {
    return undefined;
  }

  return {
    energy,
    focus,
    note,
    updatedAt,
  };
}

function normalizeAiDebug(value: unknown): WorkoutAiDebug | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  return {
    request: record.request,
    generationContext: record.generationContext,
    prompt: typeof record.prompt === "string" ? record.prompt : undefined,
    rawAiText: typeof record.rawAiText === "string" ? record.rawAiText : undefined,
    parsedAiResponse: record.parsedAiResponse,
    validatedWorkout: record.validatedWorkout,
    normalizedWorkout: record.normalizedWorkout,
  };
}

function normalizeWorkoutFocus(value: unknown): WorkoutFocus | undefined {
  return value === "full_body" ||
    value === "upper_body" ||
    value === "lower_body" ||
    value === "core"
    ? value
    : undefined;
}

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

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeOptionalPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
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
    suggestedWeightLabel: normalizeOptionalString(exercise?.suggestedWeightLabel),
    availableWeightsKg:
      Array.isArray(exercise?.availableWeightsKg)
        ? exercise.availableWeightsKg.filter(
            (item: unknown): item is number =>
              typeof item === "number" && Number.isFinite(item) && item > 0,
          )
        : undefined,
    weightUnitLabel: normalizeOptionalString(exercise?.weightUnitLabel),
    weightSelectionMode:
      exercise?.weightSelectionMode === "per_hand" ||
      exercise?.weightSelectionMode === "single_implement" ||
      exercise?.weightSelectionMode === "total"
        ? exercise.weightSelectionMode
        : undefined,
    lastPerformedWeight: normalizeOptionalNumber(exercise?.lastPerformedWeight),
    lastPerformedDuration: normalizeOptionalNumber(exercise?.lastPerformedDuration),
    progressionNote: normalizeOptionalString(exercise?.progressionNote),
  };
}

function normalizeWarmupGuide(value: unknown): WorkoutWarmupGuide | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const recommended = Boolean(record.recommended);
  const instruction = normalizeOptionalString(record.instruction);

  if (!recommended && !instruction) {
    return undefined;
  }

  return {
    recommended,
    instruction,
  };
}

function normalizeBlock(block: any, blockIndex: number): WorkoutBlock {
  const rawExercises = Array.isArray(block?.exercises) ? block.exercises : [];
  const normalizedType =
    block?.type === "superset" || block?.type === "circuit"
      ? block.type
      : "straight_sets";

  return {
    type: normalizedType,
    title:
      typeof block?.title === "string" && block.title.trim()
        ? block.title.trim()
        : blockIndex === 0
          ? "Huvuddel"
          : `Block ${blockIndex + 1}`,
    purpose: normalizeOptionalString(block?.purpose),
    coachNote: normalizeOptionalString(
      block?.coachNote ?? block?.coach_note,
    ),
    targetRpe: normalizeOptionalScore(
      block?.targetRpe ?? block?.target_rpe,
    ),
    targetRir: normalizeOptionalScore(
      block?.targetRir ?? block?.target_rir,
    ),
    warmup: normalizeWarmupGuide(block?.warmup),
    rounds: normalizeOptionalPositiveNumber(block?.rounds),
    restBetweenExercises: normalizeOptionalPositiveNumber(
      block?.restBetweenExercises ?? block?.rest_between_exercises,
    ),
    restAfterRound: normalizeOptionalPositiveNumber(
      block?.restAfterRound ?? block?.rest_after_round,
    ),
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
    // Behåll debug- och preppdata på workout-nivå så de följer med mellan preview och run.
    aiDebug: normalizeAiDebug(workout.aiDebug),
    preparationFeedback: normalizePreparationFeedback(
      workout.preparationFeedback,
    ),
    plannedFocus: normalizeWorkoutFocus(workout.plannedFocus),
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
