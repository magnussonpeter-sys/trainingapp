import {
  getPendingSyncQueue,
  markPendingSyncItemFailed,
  markPendingSyncItemQueued,
  markPendingSyncItemSyncing,
  removePendingSyncItem,
  type PendingSyncItem,
} from "@/lib/workout-flow/pending-sync-store";

// Resultat från en körning av synk-loopen.
export type PendingSyncRunResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

// Globalt lås i klienten så att flera sync-loopar inte kör parallellt.
let activeSyncPromise: Promise<PendingSyncRunResult> | null = null;

// Bygger payload till workout-logs.
// Viktigt: vi skickar med en stabil klientnyckel för dedupe.
function buildWorkoutLogPayload(item: PendingSyncItem) {
  const startedAtMs = new Date(item.sessionStartedAt).getTime();
  const completedAtMs = new Date(item.completedAt).getTime();

  const durationSeconds =
    Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs)
      ? Math.max(0, Math.round((completedAtMs - startedAtMs) / 1000))
      : 0;

  return {
    userId: item.userId,
    workoutId: item.workoutId,
    workoutName: item.workoutName,
    startedAt: item.sessionStartedAt,
    completedAt: item.completedAt,
    durationSeconds,
    status: item.status,
    exercises: item.completedExercises,
    metadata: {
      offlineSync: true,
      clientSyncId: item.id, // Stabil nyckel för att undvika dubletter.
      syncedAt: new Date().toISOString(),
    },
  };
}

export async function syncPendingWorkoutItem(item: PendingSyncItem) {
  // Bara queued/failed ska försöka synkas på nytt.
  if (item.syncStatus !== "queued" && item.syncStatus !== "failed") {
    return {
      ok: false as const,
      skipped: true as const,
      error: "Item är inte redo för synk",
    };
  }

  markPendingSyncItemSyncing(item.id);

  try {
    const payload = buildWorkoutLogPayload(item);

    const response = await fetch("/api/workout-logs", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string; details?: string }
      | null;

    if (!response.ok || !data?.ok) {
      const message =
        data?.details || data?.error || "Kunde inte spara träningslogg";
      throw new Error(message);
    }

    // Vid lyckad synk tas posten bort ur kön.
    removePendingSyncItem(item.id);

    return { ok: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Okänt synkfel";

    markPendingSyncItemFailed(item.id, message);

    return {
      ok: false as const,
      skipped: false as const,
      error: message,
    };
  }
}

// Återställ fastnade syncing-poster, men bara om de är gamla.
// Då undviker vi att en pågående synk direkt återköas av en annan trigger.
export function resetStaleSyncingItems(maxAgeMs = 60_000) {
  const now = Date.now();
  const queue = getPendingSyncQueue();

  for (const item of queue) {
    if (item.syncStatus !== "syncing") {
      continue;
    }

    const lastAttemptMs = item.lastAttemptAt
      ? new Date(item.lastAttemptAt).getTime()
      : 0;

    const isStale =
      !Number.isFinite(lastAttemptMs) || now - lastAttemptMs > maxAgeMs;

    if (isStale) {
      markPendingSyncItemQueued(item.id);
    }
  }
}

// Kör en enda synk-loop åt gången.
export async function syncPendingWorkoutQueue(): Promise<PendingSyncRunResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    if (typeof window === "undefined") {
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      };
    }

    if (!navigator.onLine) {
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: getPendingSyncQueue().length,
      };
    }

    // Bara gamla syncing får återställas.
    resetStaleSyncingItems();

    const queue = getPendingSyncQueue();
    const candidates = queue.filter(
      (item) => item.syncStatus === "queued" || item.syncStatus === "failed",
    );

    let succeeded = 0;
    let failed = 0;
    let skipped = Math.max(0, queue.length - candidates.length);

    for (const item of candidates) {
      const result = await syncPendingWorkoutItem(item);

      if (result.ok) {
        succeeded += 1;
      } else if (result.skipped) {
        skipped += 1;
      } else {
        failed += 1;
      }
    }

    return {
      attempted: candidates.length,
      succeeded,
      failed,
      skipped,
    };
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}