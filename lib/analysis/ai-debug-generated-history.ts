import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import type {
  StoredAiGeneratedWorkoutSnapshot,
} from "@/lib/analysis/ai-debug-types";
import type { Workout, WorkoutAiDebug, WorkoutFocus } from "@/types/workout";

const AI_DEBUG_GENERATED_HISTORY_KEY_PREFIX = "ai_debug_generated_history:";
const MAX_HISTORY_ITEMS = 5;

function getStorageKey(userId: string) {
  return `${AI_DEBUG_GENERATED_HISTORY_KEY_PREFIX}${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSnapshot(
  value: unknown,
): StoredAiGeneratedWorkoutSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const normalizedWorkout = normalizePreviewWorkout(value.normalizedWorkout) as Workout | null;

  return {
    createdAt:
      typeof value.createdAt === "string" && value.createdAt.trim()
        ? value.createdAt
        : new Date().toISOString(),
    requestedDurationMinutes:
      typeof value.requestedDurationMinutes === "number" &&
      Number.isFinite(value.requestedDurationMinutes)
        ? value.requestedDurationMinutes
        : null,
    goal:
      typeof value.goal === "string" && value.goal.trim() ? value.goal : null,
    selectedGym:
      typeof value.selectedGym === "string" && value.selectedGym.trim()
        ? value.selectedGym
        : null,
    equipmentSeed: Array.isArray(value.equipmentSeed)
      ? value.equipmentSeed.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        )
      : [],
    workoutFocusTag:
      value.workoutFocusTag === "full_body" ||
      value.workoutFocusTag === "upper_body" ||
      value.workoutFocusTag === "lower_body" ||
      value.workoutFocusTag === "core"
        ? (value.workoutFocusTag as WorkoutFocus)
        : null,
    request: isRecord(value.request) ? value.request : null,
    weeklyBudget: Array.isArray(value.weeklyBudget)
      ? value.weeklyBudget.filter(isRecord) as StoredAiGeneratedWorkoutSnapshot["weeklyBudget"]
      : null,
    weeklyPlan: Array.isArray(value.weeklyPlan)
      ? value.weeklyPlan.filter(isRecord) as StoredAiGeneratedWorkoutSnapshot["weeklyPlan"]
      : null,
    normalizedWorkout,
    aiDebug: isRecord(value.aiDebug) ? (value.aiDebug as WorkoutAiDebug) : null,
  };
}

export function getAiDebugGeneratedWorkoutHistory(userId: string) {
  if (typeof window === "undefined") {
    return [] as StoredAiGeneratedWorkoutSnapshot[];
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeSnapshot(item))
      .filter(
        (item): item is StoredAiGeneratedWorkoutSnapshot => item !== null,
      )
      .sort((left, right) => {
        return (
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        );
      });
  } catch {
    return [];
  }
}

export function saveAiDebugGeneratedWorkoutSnapshot(
  userId: string,
  snapshot: Omit<StoredAiGeneratedWorkoutSnapshot, "createdAt" | "normalizedWorkout"> & {
    createdAt?: string;
    normalizedWorkout: Workout | null;
  },
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const nextSnapshot = normalizeSnapshot({
      ...snapshot,
      createdAt: snapshot.createdAt ?? new Date().toISOString(),
    });

    if (!nextSnapshot) {
      return;
    }

    const existing = getAiDebugGeneratedWorkoutHistory(userId);
    const deduped = existing.filter((item) => {
      const sameTimestamp = item.createdAt === nextSnapshot.createdAt;
      const sameWorkoutName =
        item.normalizedWorkout?.name?.trim() === nextSnapshot.normalizedWorkout?.name?.trim();

      return !(sameTimestamp && sameWorkoutName);
    });

    const nextHistory = [nextSnapshot, ...deduped].slice(0, MAX_HISTORY_ITEMS);
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(nextHistory));
  } catch {
    // Debughistorik får aldrig påverka vanliga AI-flödet.
  }
}
