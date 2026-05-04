import type { WeeklyPlanSettings } from "@/lib/planning/weekly-plan";

const STORAGE_KEY = "weekly_plan_settings";

function getStorageKey(userId: string) {
  return `${STORAGE_KEY}:${userId}`;
}

export function getLocalWeeklyPlanSettings(userId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as WeeklyPlanSettings;
  } catch {
    return null;
  }
}

export function saveLocalWeeklyPlanSettings(settings: WeeklyPlanSettings) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(getStorageKey(settings.userId), JSON.stringify(settings));
}

export function clearLocalWeeklyPlanSettings(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(getStorageKey(userId));
}

