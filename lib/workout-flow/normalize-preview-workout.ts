// Säkerställer att workout alltid har rätt struktur
// Skyddar mot AI-fel, manuella inputs, gamla format

export function normalizePreviewWorkout(workout: any) {
  if (!workout) return null;

  return {
    id: workout.id ?? crypto.randomUUID(),
    name: workout.name ?? "Träningspass",
    duration: workout.duration ?? 45,
    exercises: (workout.exercises ?? []).map((ex: any, index: number) => ({
      id: ex.id ?? `${index}-${Date.now()}`,
      name: ex.name ?? "Okänd övning",
      sets: ex.sets ?? 3,
      reps: ex.reps ?? null,
      duration: ex.duration ?? null,
      rest: ex.rest ?? 60,
    })),
  };
}