// lib/workout-generator.ts
import type { Workout } from "@/types/workout";

export type GenerateWorkoutDebug = {
  aiInput?: unknown;
  request?: unknown;
  history?: unknown;
  candidateSelection?: unknown;
  prompt?: string;
  rawAiText?: string;
  parsedAiResponse?: unknown;
  validation?: unknown;
  normalizedWorkout?: unknown;
};

export async function generateWorkout(params: {
  userId: string;
  goal: string;
  durationMinutes: number;
  equipment: string[];
  gym?: string | null;
  gymLabel?: string | null;
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
    // Typa workout så att resten av appen får rätt fält direkt.
    workout: data.workout as Workout,
    debug: (data.debug ?? null) as GenerateWorkoutDebug | null,
  };
}