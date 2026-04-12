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
}): Promise<{
  workout: Workout;
  debug?: GenerateWorkoutDebug;
}> {
  const res = await fetch("/api/workouts/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const data = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        workout?: Workout;
        debug?: GenerateWorkoutDebug;
        error?: string;
      }
    | null;

  if (!res.ok || !data?.ok || !data.workout) {
    throw new Error(data?.error ?? "Kunde inte generera träningspass.");
  }

  return {
    workout: data.workout,
    debug: data.debug,
  };
}