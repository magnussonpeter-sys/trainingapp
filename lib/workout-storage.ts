// lib/workout-storage.ts
// Hanterar localStorage för workouts (generated + active)
//
// Sprint 1:
// - ALL data normaliseras via normalizePreviewWorkout
// - stöd för gamla workouts med `exercises`
// - alltid returnera blocks-baserad struktur

import { prepareWorkoutForStorage } from "@/lib/workout-flow/workout-storage-payload";
import type { Workout } from "@/types/workout";

// =========================
// KEYS
// =========================

function getGeneratedKey(userId: string) {
  return `generated_workout:${userId}`;
}

function getActiveKey(userId: string) {
  return `active_workout:${userId}`;
}

function getGeneratedSessionKey(userId: string) {
  return `generated_workout_session:${userId}`;
}

function getActiveSessionKey(userId: string) {
  return `active_workout_session_fallback:${userId}`;
}

// =========================
// SAVE
// =========================

export function saveGeneratedWorkout(userId: string, workout: unknown) {
  const prepared = prepareWorkoutForStorage(workout);
  if (!prepared) return;

  try {
    localStorage.setItem(getGeneratedKey(userId), JSON.stringify(prepared));
  } catch (error) {
    try {
      sessionStorage.setItem(getGeneratedSessionKey(userId), JSON.stringify(prepared));
    } catch (sessionError) {
      console.error("Failed to save generated workout", error, sessionError);
    }
  }
}

export function saveActiveWorkout(userId: string, workout: unknown) {
  const prepared = prepareWorkoutForStorage(workout);
  if (!prepared) return;

  try {
    localStorage.setItem(getActiveKey(userId), JSON.stringify(prepared));
  } catch (error) {
    try {
      sessionStorage.setItem(getActiveSessionKey(userId), JSON.stringify(prepared));
    } catch (sessionError) {
      console.error("Failed to save active workout", error, sessionError);
    }
  }
}

// =========================
// LOAD
// =========================

export function getGeneratedWorkout(userId: string): Workout | null {
  try {
    const raw = localStorage.getItem(getGeneratedKey(userId));
    if (raw) {
      return JSON.parse(raw) as Workout;
    }
  } catch (error) {
    console.error("Failed to load generated workout from localStorage", error);
  }

  try {
    const raw = sessionStorage.getItem(getGeneratedSessionKey(userId));
    if (!raw) return null;

    return JSON.parse(raw) as Workout;
  } catch (error) {
    console.error("Failed to load generated workout", error);
    return null;
  }
}

export function getActiveWorkout(userId: string): Workout | null {
  try {
    const raw = localStorage.getItem(getActiveKey(userId));
    if (raw) {
      return JSON.parse(raw) as Workout;
    }
  } catch (error) {
    console.error("Failed to load active workout from localStorage", error);
  }

  try {
    const raw = sessionStorage.getItem(getActiveSessionKey(userId));
    if (!raw) return null;

    return JSON.parse(raw) as Workout;
  } catch (error) {
    console.error("Failed to load active workout", error);
    return null;
  }
}

// =========================
// CLEAR
// =========================

export function clearGeneratedWorkout(userId: string) {
  try {
    localStorage.removeItem(getGeneratedKey(userId));
  } catch (error) {
    console.error("Failed to clear generated workout from localStorage", error);
  }

  try {
    sessionStorage.removeItem(getGeneratedSessionKey(userId));
  } catch (error) {
    console.error("Failed to clear generated workout from sessionStorage", error);
  }
}

export function clearActiveWorkout(userId: string) {
  try {
    localStorage.removeItem(getActiveKey(userId));
  } catch (error) {
    console.error("Failed to clear active workout from localStorage", error);
  }

  try {
    sessionStorage.removeItem(getActiveSessionKey(userId));
  } catch (error) {
    console.error("Failed to clear active workout from sessionStorage", error);
  }
}
