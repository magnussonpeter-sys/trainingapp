import type { Workout } from "@/types/workout";

const GENERATED_WORKOUT_KEY = "generated_workout";
const ACTIVE_WORKOUT_KEY = "active_workout";

function getStorageKey(baseKey: string, userId: string) {
  return `${baseKey}:${userId}`;
}

export function saveGeneratedWorkout(userId: string, workout: Workout) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getStorageKey(GENERATED_WORKOUT_KEY, userId), JSON.stringify(workout));
}

export function getGeneratedWorkout(userId: string): Workout | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(getStorageKey(GENERATED_WORKOUT_KEY, userId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Workout;
  } catch {
    return null;
  }
}

export function saveActiveWorkout(userId: string, workout: Workout) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getStorageKey(ACTIVE_WORKOUT_KEY, userId), JSON.stringify(workout));
}

export function getActiveWorkout(userId: string): Workout | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(getStorageKey(ACTIVE_WORKOUT_KEY, userId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Workout;
  } catch {
    return null;
  }
}

export function clearActiveWorkout(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getStorageKey(ACTIVE_WORKOUT_KEY, userId));
}

export function clearGeneratedWorkout(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getStorageKey(GENERATED_WORKOUT_KEY, userId));
}