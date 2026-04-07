import type { Workout } from "@/types/workout";

// Lätt snapshot för snabb resume-koll av aktivt pass.
const ACTIVE_WORKOUT_STORE_KEY = "active_workout_store";
const ACTIVE_WORKOUT_STORE_VERSION = 1;

export type ActiveWorkoutSnapshot = {
  version: number;
  userId: string;
  workoutId: string | null;
  workoutName: string;
  workout: Workout;
  currentExerciseIndex: number;
  currentSet: number;
  startedAt: string;
  updatedAt: string;
  status: "active" | "finished" | "aborted";
};

function hasWindow() {
  return typeof window !== "undefined";
}

function getStorage(): Storage | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getKey(userId: string) {
  return `${ACTIVE_WORKOUT_STORE_KEY}:${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSnapshot(raw: unknown): ActiveWorkoutSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const userId = asString(raw.userId);
  const workoutName = asString(raw.workoutName);
  const workoutRaw = raw.workout;

  if (!userId || !workoutName || !isRecord(workoutRaw)) {
    return null;
  }

  return {
    version: ACTIVE_WORKOUT_STORE_VERSION,
    userId,
    workoutId:
      typeof raw.workoutId === "string" && raw.workoutId.trim()
        ? raw.workoutId
        : null,
    workoutName,
    workout: workoutRaw as Workout,
    currentExerciseIndex: Math.max(0, asNumber(raw.currentExerciseIndex, 0)),
    currentSet: Math.max(1, asNumber(raw.currentSet, 1)),
    startedAt: asString(raw.startedAt, new Date().toISOString()),
    updatedAt: asString(raw.updatedAt, new Date().toISOString()),
    status:
      raw.status === "finished" || raw.status === "aborted"
        ? raw.status
        : "active",
  };
}

export function saveActiveWorkoutSnapshot(
  userId: string,
  snapshot: Omit<ActiveWorkoutSnapshot, "version" | "userId" | "updatedAt">,
) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  const payload: ActiveWorkoutSnapshot = {
    version: ACTIVE_WORKOUT_STORE_VERSION,
    userId,
    updatedAt: new Date().toISOString(),
    ...snapshot,
  };

  try {
    storage.setItem(getKey(userId), JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to save active workout snapshot", error);
  }
}

export function getActiveWorkoutSnapshot(
  userId: string,
): ActiveWorkoutSnapshot | null {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getKey(userId));

    if (!raw) {
      return null;
    }

    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearActiveWorkoutSnapshot(userId: string) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(getKey(userId));
  } catch (error) {
    console.error("Failed to clear active workout snapshot", error);
  }
}