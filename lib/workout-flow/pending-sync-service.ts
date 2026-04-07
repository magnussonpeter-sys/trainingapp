import {
  getPendingSyncQueue,
  markPendingSyncItemFailed,
  markPendingSyncItemQueued,
  markPendingSyncItemSyncing,
  removePendingSyncItem,
  type PendingSyncItem,
} from "@/lib/workout-flow/pending-sync-store";

// Resultat för hela sync-körningen.
// Användbart både för debug och framtida UI-status.
export type PendingSyncRunResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

// Bygger payload i formatet som /api/workout-logs redan accepterar.
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
    // Metadata gör det lättare att debugga senare.
    metadata: {
      offlineSync: true,
      pendingSyncId: item.id,
      syncedAt: new Date().toISOString(),
    },
  };
}

// Synkar ett enskilt köat pass till backend.
export async function syncPendingWorkoutItem(item: PendingSyncItem) {
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

    // Vid lyckad sync tas posten bort ur kön.
    removePendingSyncItem(item.id);

    return { ok: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Okänt synkfel";

    markPendingSyncItemFailed(item.id, message);

    return {
      ok: false as const,
      error: message,
    };
  }
}

// Kör igenom hela kön.
// Vi tar queued + failed så att gamla fel också får en ny chans.
export async function syncPendingWorkoutQueue(): Promise<PendingSyncRunResult> {
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

  const queue = getPendingSyncQueue();
  const candidates = queue.filter(
    (item) => item.syncStatus === "queued" || item.syncStatus === "failed",
  );

  let succeeded = 0;
  let failed = 0;

  for (const item of candidates) {
    const result = await syncPendingWorkoutItem(item);

    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return {
    attempted: candidates.length,
    succeeded,
    failed,
    skipped: Math.max(0, queue.length - candidates.length),
  };
}

// Hjälper future-proof återköning om något fastnat i syncing.
export function resetStaleSyncingItems() {
  const queue = getPendingSyncQueue();

  for (const item of queue) {
    if (item.syncStatus === "syncing") {
      markPendingSyncItemQueued(item.id);
    }
  }
}