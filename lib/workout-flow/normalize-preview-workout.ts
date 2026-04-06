import type { Exercise, Workout } from "@/types/workout";

// Skapar stabilt id för pass och övningar.
function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

type NormalizePreviewWorkoutParams = {
  workout: Workout;
  duration: number;
  gymLabel: string;
};

// Säkerställer att workout alltid har format som preview/run klarar.
export function normalizePreviewWorkout({
  workout,
  duration,
  gymLabel,
}: NormalizePreviewWorkoutParams): Workout {
  return {
    id: workout.id ?? createId(),
    name: workout.name?.trim() || "AI-genererat pass",
    duration,
    goal: workout.goal,
    gym: gymLabel,
    aiComment:
      typeof workout.aiComment === "string" && workout.aiComment.trim()
        ? workout.aiComment.trim()
        : undefined,
    createdAt: workout.createdAt ?? new Date().toISOString(),
    exercises: Array.isArray(workout.exercises)
      ? workout.exercises.map((exercise, index) => {
          const hasDuration =
            typeof exercise.duration === "number" && exercise.duration > 0;

          const hasReps =
            typeof exercise.reps === "number" && exercise.reps > 0;

          return {
            id:
              typeof exercise.id === "string" && exercise.id.trim()
                ? exercise.id
                : `exercise-${index + 1}-${createId()}`,
            name:
              typeof exercise.name === "string" && exercise.name.trim()
                ? exercise.name.trim()
                : `Övning ${index + 1}`,
            sets:
              typeof exercise.sets === "number" && exercise.sets > 0
                ? exercise.sets
                : 3,
            reps: hasDuration ? undefined : hasReps ? exercise.reps : 10,
            duration: hasDuration ? exercise.duration : undefined,
            rest:
              typeof exercise.rest === "number" && exercise.rest >= 0
                ? exercise.rest
                : 60,
            description:
              typeof exercise.description === "string" &&
              exercise.description.trim()
                ? exercise.description.trim()
                : undefined,
          } satisfies Exercise;
        })
      : [],
  };
}