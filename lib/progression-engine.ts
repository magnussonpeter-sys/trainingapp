// lib/progression-engine.ts
// Enkel men effektiv progression

import { getExerciseProgression } from "./progression-store";

export function getSuggestedWeight(params: {
  userId: string;
  exerciseId: string;
  fallbackWeight?: number | null;
}) {
  const { userId, exerciseId, fallbackWeight } = params;

  const progression = getExerciseProgression(userId, exerciseId);

  if (!progression || progression.lastWeight == null) {
    return fallbackWeight ?? null;
  }

  let weight = progression.lastWeight;

  // =========================
  // REPS-BASERAD PROGRESSION
  // =========================

  if (progression.lastExtraReps != null) {
    if (progression.lastExtraReps >= 4) {
      weight += 2.5; // lätt → öka
    } else if (progression.lastExtraReps === 2) {
      weight += 1; // lagom → liten ökning
    } else if (progression.lastExtraReps === 0) {
      weight -= 1; // tungt → sänk
    }
  }

  // =========================
  // TIMED PROGRESSION
  // =========================

  if (progression.lastTimedEffort) {
    if (progression.lastTimedEffort === "easy") {
      weight += 2;
    } else if (progression.lastTimedEffort === "hard") {
      weight -= 1;
    }
  }

  return Math.max(0, Math.round(weight * 10) / 10);
}