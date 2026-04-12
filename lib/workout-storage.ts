// lib/workout-storage.ts
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import type { Workout, WorkoutLike } from "@/types/workout";

const GENERATED_WORKOUT_KEY = "generated_workout";
const ACTIVE_WORKOUT_KEY = "active_workout";

function getStorageKey(baseKey: string, userId: string) {
  return `${baseKey}:${userId}`;
}

// Liten helper så att all lagring går via samma normalisering.
// Då kan vi läsa både nya och gamla workouts utan att UI-lagret behöver gissa.
function parseStoredWorkout(raw: string | null): Workout | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as WorkoutLike;
    return normalizePreviewWorkout(parsed);
  } catch {
    return null;
  }
}

export function saveGeneratedWorkout(userId: string, workout: Workout) {
  if (typeof window === "undefined") return;

  // Spara alltid den normaliserade nya modellen.
  const normalizedWorkout = normalizePreviewWorkout(workout);
  if (!normalizedWorkout) return;

  localStorage.setItem(
    getStorageKey(GENERATED_WORKOUT_KEY, userId),
    JSON.stringify(normalizedWorkout),
  );
}

export function getGeneratedWorkout(userId: string): Workout | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(getStorageKey(GENERATED_WORKOUT_KEY, userId));
  return parseStoredWorkout(raw);
}

export function saveActiveWorkout(userId: string, workout: Workout) {
  if (typeof window === "undefined") return;

  const normalizedWorkout = normalizePreviewWorkout(workout);
  if (!normalizedWorkout) return;

  localStorage.setItem(
    getStorageKey(ACTIVE_WORKOUT_KEY, userId),
    JSON.stringify(normalizedWorkout),
  );
}

export function getActiveWorkout(userId: string): Workout | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(getStorageKey(ACTIVE_WORKOUT_KEY, userId));
  return parseStoredWorkout(raw);
}

export function clearGeneratedWorkout(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getStorageKey(GENERATED_WORKOUT_KEY, userId));
}

export function clearActiveWorkout(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getStorageKey(ACTIVE_WORKOUT_KEY, userId));
}