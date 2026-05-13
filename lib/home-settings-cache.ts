"use client";

import {
  isSportFocus,
  type SportFocus,
  type TrainingGoal,
} from "@/types/training-profile";
import type { WorkoutGenerationMode } from "@/lib/workout-generation/types";

type CachedPriorityMuscle =
  | "chest"
  | "back"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "calves"
  | "core";

type CachedSupersetPreference =
  | "allowed"
  | "avoid_all"
  | "avoid_all_dumbbell";

type HomeSettingsCacheValue = {
  training_goal?: TrainingGoal | null;
  sport_focus?: SportFocus | null;
  generation_mode?: WorkoutGenerationMode | null;
  avoid_supersets?: boolean | null;
  superset_preference?: CachedSupersetPreference | null;
  primary_priority_muscle?: CachedPriorityMuscle | null;
  secondary_priority_muscle?: CachedPriorityMuscle | null;
  tertiary_priority_muscle?: CachedPriorityMuscle | null;
};

function isCachedHomeGoal(value: unknown): value is TrainingGoal {
  return (
    value === "strength" ||
    value === "hypertrophy" ||
    value === "health" ||
    value === "body_composition"
  );
}

function isCachedPriorityMuscle(value: unknown): value is CachedPriorityMuscle {
  return (
    value === "chest" ||
    value === "back" ||
    value === "quads" ||
    value === "hamstrings" ||
    value === "glutes" ||
    value === "shoulders" ||
    value === "biceps" ||
    value === "triceps" ||
    value === "calves" ||
    value === "core"
  );
}

function isCachedSupersetPreference(
  value: unknown,
): value is CachedSupersetPreference {
  return (
    value === "allowed" ||
    value === "avoid_all" ||
    value === "avoid_all_dumbbell"
  );
}

function isCachedGenerationMode(value: unknown): value is WorkoutGenerationMode {
  return (
    value === "legacy_ai_chain" ||
    value === "slot_based_v1" ||
    value === "hybrid"
  );
}

function getStorageKey(userId: string) {
  return `home_settings_cache:${userId}`;
}

export function getCachedHomeSettings(userId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      training_goal?: unknown;
      sport_focus?: unknown;
      generation_mode?: unknown;
      avoid_supersets?: unknown;
      superset_preference?: unknown;
      primary_priority_muscle?: unknown;
      secondary_priority_muscle?: unknown;
      tertiary_priority_muscle?: unknown;
    };

    return {
      training_goal: isCachedHomeGoal(parsed.training_goal)
        ? parsed.training_goal
        : null,
      sport_focus: isSportFocus(parsed.sport_focus) ? parsed.sport_focus : null,
      generation_mode: isCachedGenerationMode(parsed.generation_mode)
        ? parsed.generation_mode
        : null,
      avoid_supersets:
        typeof parsed.avoid_supersets === "boolean"
          ? parsed.avoid_supersets
          : null,
      superset_preference: isCachedSupersetPreference(parsed.superset_preference)
        ? parsed.superset_preference
        : null,
      primary_priority_muscle: isCachedPriorityMuscle(parsed.primary_priority_muscle)
        ? parsed.primary_priority_muscle
        : null,
      secondary_priority_muscle: isCachedPriorityMuscle(parsed.secondary_priority_muscle)
        ? parsed.secondary_priority_muscle
        : null,
      tertiary_priority_muscle: isCachedPriorityMuscle(parsed.tertiary_priority_muscle)
        ? parsed.tertiary_priority_muscle
        : null,
    };
  } catch {
    return null;
  }
}

export function saveCachedHomeSettings(
  userId: string,
  settings: HomeSettingsCacheValue,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(settings));
  } catch {
    // Ignorera cache-fel. Servern är fortfarande sann källa.
  }
}
