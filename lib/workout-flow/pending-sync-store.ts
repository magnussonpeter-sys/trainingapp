import type { CompletedExercise } from "@/lib/workout-log-storage";
import type { Workout } from "@/types/workout";

// Här lägger vi färdiga eller avbrutna pass som väntar på backend.
// Kön ska vara append-only i normalfallet så att vi inte tappar något.

const PENDING_SYNC_STORE_KEY = "workout_pending_sync_queue";
const PENDING_SYNC_STORE_VERSION = 1;

export type PendingSyncStatus = "queued" | "syncing" | "failed";

export type PendingSyncItem = {
  id: string;
  version: number;
  userId: string;
  workoutId: string | null;
  workoutName: string;
  workout: Workout;
  sessionStartedAt: string;
  completedAt: string;
  status: "completed" | "aborted";
  syncStatus: PendingSyncStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  completedExercises: CompletedExercise[];
  createdAt: string;
  updatedAt: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asArray<T>(value: unknown, fallback: T[] = []) {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function normalizeItem(raw: unknown): PendingSyncItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = asString(raw.id);
  const userId = asString(raw.userId);
  const workoutName = asString(raw.workoutName);

  if (!id || !userId || !workoutName || !isRecord(raw.workout)) {
    return null;
  }

  return {
    id,
    version: PENDING_SYNC_STORE_VERSION,
    userId,
    workoutId:
      typeof raw.workoutId === "string" && raw.workoutId.trim()
        ? raw.workoutId
        : null,
    workoutName,
    workout: raw.workout as Workout,
    sessionStartedAt: asString(raw.sessionStartedAt, new Date().toISOString()),
    completedAt: asString(raw.completedAt, new Date().toISOString()),
    status: raw.status === "aborted" ? "aborted" : "completed",
    syncStatus:
      raw.syncStatus === "syncing" || raw.syncStatus === "failed"
        ? raw.syncStatus
        : "queued",
    attemptCount: Math.max(0, asNumber(raw.attemptCount, 0)),
    lastAttemptAt:
      typeof raw.lastAttemptAt === "string" && raw.lastAttemptAt.trim()
        ? raw.lastAttemptAt
        : null,
    errorMessage:
      typeof raw.errorMessage === "string" && raw.errorMessage.trim()
        ? raw.errorMessage
        : null,
    completedExercises: asArray<CompletedExercise>(raw.completedExercises, []),
    createdAt: asString(raw.createdAt, new Date().toISOString()),
    updatedAt: asString(raw.updatedAt, new Date().toISOString()),
  };
}

function readQueue(): PendingSyncItem[] {
  const storage = getStorage();

  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(PENDING_SYNC_STORE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeItem(item))
      .filter((item): item is PendingSyncItem => item !== null);
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingSyncItem[]) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(PENDING_SYNC_STORE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error("Failed to write pending sync queue", error);
  }
}

function buildQueueId(userId: string) {
  return `sync_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getPendingSyncQueue() {
  return readQueue();
}

export function getPendingSyncCount(userId?: string) {
  const queue = readQueue();

  if (!userId) {
    return queue.length;
  }

  return queue.filter((item) => item.userId === userId).length;
}

export function enqueuePendingSyncItem(
  item: Omit<
    PendingSyncItem,
    "id" | "version" | "syncStatus" | "attemptCount" | "lastAttemptAt" | "errorMessage" | "createdAt" | "updatedAt"
  >,
) {
  const now = new Date().toISOString();

  const queue = readQueue();
  const nextItem: PendingSyncItem = {
    id: buildQueueId(item.userId),
    version: PENDING_SYNC_STORE_VERSION,
    syncStatus: "queued",
    attemptCount: 0,
    lastAttemptAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    ...item,
  };

  writeQueue([...queue, nextItem]);

  return nextItem;
}

export function markPendingSyncItemSyncing(id: string) {
  const now = new Date().toISOString();

  writeQueue(
    readQueue().map((item) =>
      item.id === id
        ? {
            ...item,
            syncStatus: "syncing",
            attemptCount: item.attemptCount + 1,
            lastAttemptAt: now,
            updatedAt: now,
            errorMessage: null,
          }
        : item,
    ),
  );
}

export function markPendingSyncItemFailed(id: string, errorMessage?: string) {
  const now = new Date().toISOString();

  writeQueue(
    readQueue().map((item) =>
      item.id === id
        ? {
            ...item,
            syncStatus: "failed",
            updatedAt: now,
            errorMessage: errorMessage?.trim() || "Okänt synkfel",
          }
        : item,
    ),
  );
}

export function markPendingSyncItemQueued(id: string) {
  const now = new Date().toISOString();

  writeQueue(
    readQueue().map((item) =>
      item.id === id
        ? {
            ...item,
            syncStatus: "queued",
            updatedAt: now,
          }
        : item,
    ),
  );
}

export function removePendingSyncItem(id: string) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export function clearPendingSyncQueueForUser(userId: string) {
  writeQueue(readQueue().filter((item) => item.userId !== userId));
}