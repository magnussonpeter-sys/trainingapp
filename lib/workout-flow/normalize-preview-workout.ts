// lib/workout-flow/normalize-preview-workout.ts
import { resolveExerciseDescription } from "@/lib/workout-flow/exercise-description";
import type { Exercise, Workout, WorkoutBlock, WorkoutLike } from "@/types/workout";

// Säkerställer att workout alltid har rätt struktur.
// Skyddar mot AI-fel, manuella inputs och äldre format.
// Fyller också på katalogbeskrivning för vanliga övningar.
// Viktigt i sprint 1: äldre workouts med `exercises` mappas till `blocks`.

function createSafeId(prefix: string, index: number) {
  // Liten helper så vi inte kraschar om crypto saknas i någon miljö.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${index}-${Date.now()}`;
}

function normalizeExercise(exercise: any, index: number): Exercise {
  return {
    id: exercise?.id ?? createSafeId("exercise", index),
    name: exercise?.name ?? "Okänd övning",
    description: resolveExerciseDescription(exercise),
    isCustom: exercise?.isCustom ?? false,
    isNewExercise: exercise?.isNewExercise ?? false,
    sets: typeof exercise?.sets === "number" && exercise.sets > 0 ? exercise.sets : 3,
    reps:
      typeof exercise?.reps === "number" && Number.isFinite(exercise.reps)
        ? exercise.reps
        : null,
    duration:
      typeof exercise?.duration === "number" && Number.isFinite(exercise.duration)
        ? exercise.duration
        : null,
    rest:
      typeof exercise?.rest === "number" && Number.isFinite(exercise.rest)
        ? exercise.rest
        : 60,
    suggestedWeight:
      exercise?.suggestedWeight ??
      exercise?.plannedWeight ??
      exercise?.weightSuggestion ??
      null,
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
  // Ny modell: använd blocks om de finns.
  if (Array.isArray(workout?.blocks) && workout.blocks.length > 0) {
    return workout.blocks;
  }

  // Gammal modell: konvertera exercises till ett straight_sets-block.
  if (Array.isArray(workout?.exercises)) {
    return [
      {
        type: "straight_sets",
        title: "Huvuddel",
        exercises: workout.exercises,
      },
    ];
  }

  return [];
}

export function normalizePreviewWorkout(workout: WorkoutLike | any): Workout | null {
  if (!workout) return null;

  const rawBlocks = getRawBlocks(workout);

  return {
    id: workout.id ?? createSafeId("workout", 0),
    name: workout.name ?? "Träningspass",
    duration:
      typeof workout.duration === "number" && Number.isFinite(workout.duration)
        ? workout.duration
        : 45,
    goal:
      typeof workout.goal === "string" && workout.goal.trim() ? workout.goal.trim() : undefined,
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
}