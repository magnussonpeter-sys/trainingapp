// lib/workout-storage.ts
// Hanterar localStorage för workouts (generated + active)
//
// Sprint 1:
// - ALL data normaliseras via normalizePreviewWorkout
// - stöd för gamla workouts med `exercises`
// - alltid returnera blocks-baserad struktur

import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
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

// =========================
// SAVE
// =========================

export function saveGeneratedWorkout(userId: string, workout: any) {
  try {
    const normalized = normalizePreviewWorkout(workout);
    if (!normalized) return;

    localStorage.setItem(getGeneratedKey(userId), JSON.stringify(normalized));
  } catch (error) {
    console.error("Failed to save generated workout", error);
  }
}

export function saveActiveWorkout(userId: string, workout: any) {
  try {
    const normalized = normalizePreviewWorkout(workout);
    if (!normalized) return;

    localStorage.setItem(getActiveKey(userId), JSON.stringify(normalized));
  } catch (error) {
    console.error("Failed to save active workout", error);
  }
}

// =========================
// LOAD
// =========================

export function getGeneratedWorkout(userId: string): Workout | null {
  try {
    const raw = localStorage.getItem(getGeneratedKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return normalizePreviewWorkout(parsed);
  } catch (error) {
    console.error("Failed to load generated workout", error);
    return null;
  }
}

export function getActiveWorkout(userId: string): Workout | null {
  try {
    const raw = localStorage.getItem(getActiveKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return normalizePreviewWorkout(parsed);
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
    console.error("Failed to clear generated workout", error);
  }
}

export function clearActiveWorkout(userId: string) {
  try {
    localStorage.removeItem(getActiveKey(userId));
  } catch (error) {
    console.error("Failed to clear active workout", error);
  }
}