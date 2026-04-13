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

export function getSuggestedTimedDuration(params: {
  userId: string;
  exerciseId: string;
  fallbackDuration?: number | null;
  goal?: "strength" | "hypertrophy" | "health" | "body_composition";
}) {
  const { userId, exerciseId, fallbackDuration, goal = "health" } = params;
  const progression = getExerciseProgression(userId, exerciseId);
  const baseDuration =
    progression?.lastDuration ?? fallbackDuration ?? null;

  if (baseDuration == null || !Number.isFinite(baseDuration) || baseDuration <= 0) {
    return fallbackDuration ?? null;
  }

  let nextDuration = baseDuration;
  const increaseStep =
    goal === "body_composition" ? 10 : goal === "health" ? 5 : 5;
  const decreaseStep =
    goal === "strength" ? 5 : 10;

  if (progression?.lastTimedEffort === "easy") {
    nextDuration += increaseStep;
  } else if (progression?.lastTimedEffort === "hard") {
    nextDuration -= decreaseStep;
  }

  return Math.max(10, Math.min(180, Math.round(nextDuration)));
}
