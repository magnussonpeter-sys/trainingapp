import type { Workout } from "@/types/workout";

export type GenerateWorkoutDebug = {
  aiInput?: unknown;
  prompt?: string;
  rawAiText?: string;
  parsedAiResponse?: unknown;
  normalizedWorkout?: unknown;
};

export async function generateWorkout(params: {
  userId: string;
  goal: string;
  durationMinutes: number;
  equipment: string[];
}) {
  const res = await fetch("/api/workouts/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data?.error || "Failed to generate workout");
  }

  return {
    // Typa workout → då vet TS att aiComment finns
    workout: data.workout as Workout,
    debug: (data.debug ?? null) as GenerateWorkoutDebug | null,
  };
}