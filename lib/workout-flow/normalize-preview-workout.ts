import { resolveExerciseDescription } from "@/lib/workout-flow/exercise-description";

// Säkerställer att workout alltid har rätt struktur.
// Skyddar mot AI-fel, manuella inputs och äldre format.
// Fyller också på katalogbeskrivning för vanliga övningar.

export function normalizePreviewWorkout(workout: any) {
  if (!workout) return null;

  return {
    id: workout.id ?? crypto.randomUUID(),
    name: workout.name ?? "Träningspass",
    duration: workout.duration ?? 45,
    gym: workout.gym ?? workout.gymLabel ?? null,
    gymLabel: workout.gymLabel ?? workout.gym ?? null,
    exercises: (workout.exercises ?? []).map((exercise: any, index: number) => ({
      id: exercise.id ?? `${index}-${Date.now()}`,
      name: exercise.name ?? "Okänd övning",
      description: resolveExerciseDescription(exercise),
      isCustom: exercise.isCustom ?? false,
      isNewExercise: exercise.isNewExercise ?? false,
      sets: exercise.sets ?? 3,
      reps: exercise.reps ?? null,
      duration: exercise.duration ?? null,
      rest: exercise.rest ?? 60,
      suggestedWeight:
        exercise.suggestedWeight ??
        exercise.suggestedWeightKg ??
        exercise.targetWeight ??
        exercise.targetWeightKg ??
        exercise.plannedWeight ??
        exercise.plannedWeightKg ??
        exercise.weight ??
        exercise.weightKg ??
        null,
    })),
  };
}