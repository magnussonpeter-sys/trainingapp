"use client";

type CachedHomeGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

type HomeSettingsCacheValue = {
  training_goal?: CachedHomeGoal | null;
};

function isCachedHomeGoal(value: unknown): value is CachedHomeGoal {
  return (
    value === "strength" ||
    value === "hypertrophy" ||
    value === "health" ||
    value === "body_composition"
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

    const parsed = JSON.parse(raw) as { training_goal?: unknown };

    return {
      training_goal: isCachedHomeGoal(parsed.training_goal)
        ? parsed.training_goal
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
