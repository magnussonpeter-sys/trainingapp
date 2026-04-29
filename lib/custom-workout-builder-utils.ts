import {
  getAvailableExercises,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import { extractEquipmentIdsFromRecords } from "@/lib/equipment";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { Gym } from "@/lib/gyms";
import type { Exercise, Workout, WorkoutBlock, WorkoutFocus } from "@/types/workout";

export const BODYWEIGHT_GYM_ID = "bodyweight";
export type BuilderFocusMuscle = MuscleBudgetGroup;

export const BUILDER_FOCUS_MUSCLE_OPTIONS: Array<{
  value: BuilderFocusMuscle;
  label: string;
}> = [
  { value: "chest", label: "Bröst" },
  { value: "back", label: "Rygg" },
  { value: "quads", label: "Framsida lår" },
  { value: "hamstrings", label: "Baksida lår" },
  { value: "glutes", label: "Säte" },
  { value: "shoulders", label: "Axlar" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "calves", label: "Vader" },
  { value: "core", label: "Bål" },
];

export type ExerciseInputMode = "reps" | "time";

export type CustomExerciseDraft = {
  name: string;
  description: string;
  mode: ExerciseInputMode;
  sets: string;
  reps: string;
  duration: string;
  rest: string;
};

export type SupersetDraft = {
  firstExerciseId: string;
  secondExerciseId: string;
  rounds: string;
  restBetweenExercises: string;
  restAfterRound: string;
};

export function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

export function toPositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.round(parsed);
}

export function cloneBlocks(blocks: WorkoutBlock[]) {
  // Blocken är serialiserbara, så en enkel JSON-klon räcker för buildern.
  return JSON.parse(JSON.stringify(blocks)) as WorkoutBlock[];
}

export function getDefaultCustomExerciseDraft(): CustomExerciseDraft {
  return {
    name: "",
    description: "",
    mode: "reps",
    sets: "3",
    reps: "10",
    duration: "30",
    rest: "45",
  };
}

export function getDefaultSupersetDraft(): SupersetDraft {
  return {
    firstExerciseId: "",
    secondExerciseId: "",
    rounds: "3",
    restBetweenExercises: "15",
    restAfterRound: "45",
  };
}

function estimateWorkSeconds(exercise: Exercise) {
  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    return exercise.duration;
  }

  const reps = typeof exercise.reps === "number" && exercise.reps > 0 ? exercise.reps : 10;
  return reps * 4;
}

export function estimateBlockDurationMinutes(block: WorkoutBlock) {
  if (block.type === "superset" || block.type === "circuit") {
    const rounds = Math.max(1, block.rounds ?? 1);
    const exerciseWork = block.exercises.reduce((sum, exercise) => {
      return sum + estimateWorkSeconds(exercise);
    }, 0);
    const betweenExerciseRest = Math.max(
      0,
      (block.restBetweenExercises ?? 0) * Math.max(0, block.exercises.length - 1),
    );
    const roundRest = Math.max(0, block.restAfterRound ?? 0);

    return Math.max(
      1,
      Math.round((rounds * (exerciseWork + betweenExerciseRest + roundRest)) / 60),
    );
  }

  const seconds = block.exercises.reduce((sum, exercise) => {
    return sum + exercise.sets * (estimateWorkSeconds(exercise) + Math.max(0, exercise.rest));
  }, 0);

  return Math.max(1, Math.round(seconds / 60));
}

export function buildWorkoutSummary(
  blocks: WorkoutBlock[],
  targetDurationMinutes: number | null,
) {
  const blockCount = blocks.length;
  const exerciseCount = blocks.reduce((sum, block) => sum + block.exercises.length, 0);
  const supersetCount = blocks.filter((block) => block.type === "superset").length;
  const estimatedMinutes = blocks.reduce(
    (sum, block) => sum + estimateBlockDurationMinutes(block),
    0,
  );

  return {
    blockCount,
    exerciseCount,
    supersetCount,
    estimatedMinutes: targetDurationMinutes ?? estimatedMinutes,
  };
}

export function createExerciseFromCatalogItem(item: ExerciseCatalogItem): Exercise {
  return {
    id: item.id,
    name: item.name,
    sets: item.defaultSets,
    reps: item.defaultReps ?? undefined,
    duration: item.defaultDuration ?? undefined,
    sidedness: item.sidedness,
    ringSetup: item.ringSetup,
    rest: item.defaultRest,
    description: item.description,
    isCustom: false,
  };
}

export function createExerciseFromCustomDraft(draft: CustomExerciseDraft): Exercise {
  return {
    id: `custom-${createId()}`,
    name: draft.name.trim(),
    sets: toPositiveInteger(draft.sets, 3),
    reps: draft.mode === "reps" ? toPositiveInteger(draft.reps, 10) : undefined,
    duration: draft.mode === "time" ? toPositiveInteger(draft.duration, 30) : undefined,
    rest: Math.max(0, toPositiveInteger(draft.rest, 45)),
    description: draft.description.trim() || undefined,
    isCustom: true,
    isNewExercise: true,
  };
}

export function createSingleBlock(item: ExerciseCatalogItem): WorkoutBlock {
  return {
    type: "straight_sets",
    title: item.name,
    exercises: [createExerciseFromCatalogItem(item)],
  };
}

export function createCustomSingleBlock(draft: CustomExerciseDraft): WorkoutBlock {
  const exercise = createExerciseFromCustomDraft(draft);

  return {
    type: "straight_sets",
    title: exercise.name,
    exercises: [exercise],
  };
}

export function createSupersetBlock(
  firstExercise: ExerciseCatalogItem,
  secondExercise: ExerciseCatalogItem,
  draft: SupersetDraft,
  supersetIndex: number,
): WorkoutBlock {
  const rounds = toPositiveInteger(draft.rounds, 3);
  const restBetweenExercises = Math.max(0, toPositiveInteger(draft.restBetweenExercises, 15));
  const restAfterRound = Math.max(0, toPositiveInteger(draft.restAfterRound, 45));

  const first = createExerciseFromCatalogItem(firstExercise);
  const second = createExerciseFromCatalogItem(secondExercise);

  first.sets = rounds;
  second.sets = rounds;
  first.rest = restAfterRound;
  second.rest = restAfterRound;

  return {
    type: "superset",
    title: `Superset ${String.fromCharCode(65 + supersetIndex)}`,
    rounds,
    restBetweenExercises,
    restAfterRound,
    exercises: [first, second],
  };
}

export function buildWorkoutFromBuilder(params: {
  name: string;
  targetDurationMinutes: number | null;
  selectedGym: Gym | null;
  blocks: WorkoutBlock[];
}) {
  const { name, targetDurationMinutes, selectedGym, blocks } = params;
  const summary = buildWorkoutSummary(blocks, targetDurationMinutes);
  const availableEquipment = extractEquipmentIdsFromRecords(selectedGym?.equipment ?? [], {
    includeBodyweightFallback: true,
  });
  const isBodyweightGym = selectedGym?.id === BODYWEIGHT_GYM_ID;

  return {
    id: createId(),
    name: name.trim() || "Eget pass",
    duration: summary.estimatedMinutes,
    gym: isBodyweightGym ? null : selectedGym?.id ?? null,
    gymLabel:
      selectedGym?.id === BODYWEIGHT_GYM_ID
        ? "Kroppsvikt / utan gym"
        : selectedGym?.name ?? null,
    availableEquipment,
    createdAt: new Date().toISOString(),
    blocks,
  } satisfies Workout & { availableEquipment: string[] };
}

export function getAvailableCatalogExercisesForGym(selectedGym: Gym | null) {
  const availableEquipment = extractEquipmentIdsFromRecords(selectedGym?.equipment ?? [], {
    includeBodyweightFallback: true,
  });
  return getAvailableExercises(availableEquipment);
}

export function getEquipmentIdsForGym(selectedGym: Gym | null) {
  return extractEquipmentIdsFromRecords(selectedGym?.equipment ?? [], {
    includeBodyweightFallback: true,
  });
}

export function buildGymEquipmentPromptDetails(selectedGym: Gym | null) {
  const equipmentItems = Array.isArray(selectedGym?.equipment) ? selectedGym.equipment : [];

  // Behåll bara fält som generate-endpointen faktiskt läser.
  return equipmentItems.map((item) => ({
    equipment_type: item.equipment_type,
    label: item.label ?? null,
    weights_kg: item.weights_kg ?? null,
    quantity: item.quantity ?? null,
  }));
}

export function inferFocusFromMuscles(
  muscles: BuilderFocusMuscle[],
): WorkoutFocus | null {
  if (muscles.length === 0) {
    return null;
  }

  const upperMuscles = new Set<BuilderFocusMuscle>([
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
  ]);
  const lowerMuscles = new Set<BuilderFocusMuscle>([
    "quads",
    "hamstrings",
    "glutes",
    "calves",
  ]);
  const coreMuscles = new Set<BuilderFocusMuscle>(["core"]);

  const upperCount = muscles.filter((muscle) => upperMuscles.has(muscle)).length;
  const lowerCount = muscles.filter((muscle) => lowerMuscles.has(muscle)).length;
  const coreCount = muscles.filter((muscle) => coreMuscles.has(muscle)).length;

  if (coreCount > 0 && upperCount === 0 && lowerCount === 0) {
    return "core";
  }

  if (upperCount > 0 && lowerCount === 0 && coreCount === 0) {
    return "upper_body";
  }

  if (lowerCount > 0 && upperCount === 0 && coreCount <= 1) {
    return "lower_body";
  }

  return "full_body";
}
