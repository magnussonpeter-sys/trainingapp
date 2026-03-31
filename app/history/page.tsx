"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getWorkoutLogs, type WorkoutLog } from "@/lib/workout-log-storage";
import { saveActiveWorkout } from "@/lib/workout-storage";
import type { Workout } from "@/types/workout";

type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
};

type DataSource = "api" | "local";

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) return `${remainingSeconds} s`;
  return `${minutes} min ${remainingSeconds} s`;
}

function getWorkoutVolume(workout: WorkoutLog) {
  return workout.exercises.reduce((sum, exercise) => {
    return (
      sum +
      exercise.sets.reduce((setSum, set) => {
        if (set.actualWeight == null || set.actualReps == null) return setSum;
        return setSum + set.actualWeight * set.actualReps;
      }, 0)
    );
  }, 0);
}

function getTotalSets(workout: WorkoutLog) {
  return workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function createWorkoutFromLog(log: WorkoutLog): Workout {
  return {
    id: makeId(),
    name: log.workoutName,
    duration: Math.max(1, Math.round(log.durationSeconds / 60)),
    createdAt: new Date().toISOString(),
    exercises: log.exercises.map((exercise) => ({
      id: exercise.exerciseId,
      name: exercise.exerciseName,
      sets: exercise.plannedSets,
      reps: exercise.plannedReps ?? undefined,
      duration: exercise.plannedDuration ?? undefined,
      rest: 45,
    })),
  };
}

// Lokal fallback används om API inte går att nå.
function getWorkoutLogsStorageKey(userId: string) {
  return `workout-logs:${userId}`;
}

function persistWorkoutLogs(userId: string, logs: WorkoutLog[]) {
  localStorage.setItem(getWorkoutLogsStorageKey(userId), JSON.stringify(logs));
}

function removeWorkoutLogFromStorage(userId: string, workoutId: string) {
  const logs = getWorkoutLogs(userId);
  const updatedLogs = logs.filter((log) => log.id !== workoutId);
  persistWorkoutLogs(userId, updatedLogs);
  return updatedLogs;
}

function clearAllWorkoutLogsFromStorage(userId: string) {
  persistWorkoutLogs(userId, []);
}

export default function HistoryPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("api");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function loadHistory() {
      try {
        setLoadError(null);

        // Hämta inloggad användare från samma auth-källa som /run använder.
        const authRes = await fetch("/api/auth/me", { cache: "no-store" });
        const authData = await authRes.json();

        if (!authRes.ok || !authData?.ok || !authData.user) {
          router.replace("/");
          return;
        }

        const user = authData.user as AuthUser;
        const userId = String(user.id);

        setAuthUser(user);
        setAuthChecked(true);

        // Försök först att hämta historik från databasen.
        try {
          const logsRes = await fetch(
            `/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=50`,
            { cache: "no-store" }
          );

          const logsData = await logsRes.json();

          if (!logsRes.ok || !logsData?.ok || !Array.isArray(logsData.logs)) {
            throw new Error(logsData?.error || "Kunde inte hämta träningshistorik");
          }

          setWorkouts(logsData.logs as WorkoutLog[]);
          setDataSource("api");
          return;
        } catch (apiError) {
          console.error("Failed to load workout history from API", apiError);

          // Om API-hämtningen fallerar visar vi lokal fallback.
          const localLogs = getWorkoutLogs(userId);
          setWorkouts(localLogs);
          setDataSource("local");
          setLoadError("Kunde inte hämta historik från databasen. Visar lokal historik.");
        }
      } catch (error) {
        console.error("Failed to load history page", error);
        router.replace("/");
      }
    }

    void loadHistory();
  }, [router]);

  const repeatWorkout = (workoutLog: WorkoutLog) => {
    if (!authUser) return;

    const userId = String(authUser.id);

    // Skapar ett nytt aktivt pass baserat på valt historiskt pass.
    const workout = createWorkoutFromLog(workoutLog);

    // Sparar som aktivt pass så att run-sidan kan läsa det.
    saveActiveWorkout(userId, workout);

    // Går direkt till run.
    router.push("/workout/run");
  };

  const openDetails = (workoutId: string) => {
    router.push(`/history/${workoutId}`);
  };

  const deleteWorkout = async (workoutId: string) => {
    if (!authUser || isDeleting) return;

    const userId = String(authUser.id);
    setIsDeleting(true);

    try {
      if (dataSource === "api") {
        // Radera passet i databasen.
        const response = await fetch(
          `/api/workout-logs/${encodeURIComponent(workoutId)}?userId=${encodeURIComponent(userId)}`,
          {
            method: "DELETE",
          }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? "Kunde inte radera passet");
        }

        // Uppdatera listan lokalt i UI:t.
        setWorkouts((prev) => prev.filter((workout) => workout.id !== workoutId));
      } else {
        // Lokal fallback-radering.
        const updatedLogs = removeWorkoutLogFromStorage(userId, workoutId);
        setWorkouts(updatedLogs);
      }

      setDeletingWorkoutId(null);
    } catch (error) {
      console.error("Failed to delete workout", error);
      alert("Kunde inte radera passet.");
    } finally {
      setIsDeleting(false);
    }
  };

  const clearAllWorkoutData = async () => {
    if (!authUser || isDeleting) return;

    const userId = String(authUser.id);
    setIsDeleting(true);

    try {
      if (dataSource === "api") {
        // Radera all historik i databasen.
        const response = await fetch(
          `/api/workout-logs?userId=${encodeURIComponent(userId)}`,
          {
            method: "DELETE",
          }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? "Kunde inte radera all träningsdata");
        }
      }

      // Rensa alltid lokal fallback också så att ingen gammal data blir kvar.
      clearAllWorkoutLogsFromStorage(userId);

      setWorkouts([]);
      setShowClearAllConfirm(false);
      setDeletingWorkoutId(null);
    } catch (error) {
      console.error("Failed to clear all workout data", error);
      alert("Kunde inte radera all träningsdata.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-700">Laddar historik...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col p-4 pb-32">
        <header className="mb-4">
          <p className="text-sm text-gray-500">Historik</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">
            Tidigare pass
          </h1>

          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                dataSource === "api"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {dataSource === "api" ? "Visar databasdata" : "Visar lokal fallback"}
            </span>
          </div>

          {loadError ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {loadError}
            </p>
          ) : null}
        </header>

        {workouts.length === 0 ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">
              Ingen träningshistorik ännu
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              När du har genomfört ett pass kommer det att visas här.
            </p>

            <button
              onClick={() => router.push("/home")}
              className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
            >
              Till startsidan
            </button>
          </section>
        ) : (
          <>
            <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">
                Hantera träningsdata
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Du kan radera enskilda pass eller ta bort all träningsdata.
              </p>

              <button
                type="button"
                onClick={() => setShowClearAllConfirm(true)}
                disabled={isDeleting}
                className="mt-4 w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 disabled:opacity-50"
              >
                Ta bort all träningsdata
              </button>
            </section>

            <section className="space-y-3">
              {workouts.map((workout) => {
                const isDeleteOpen = deletingWorkoutId === workout.id;
                const totalSets = getTotalSets(workout);
                const totalVolume = getWorkoutVolume(workout);

                return (
                  <div
                    key={workout.id}
                    className="rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => openDetails(workout.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-gray-500">
                            {formatDateTime(workout.completedAt)}
                          </p>
                          <h2 className="mt-1 text-lg font-semibold text-gray-950">
                            {workout.workoutName}
                          </h2>
                        </div>

                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                          {workout.status === "completed" ? "Genomfört" : "Avbrutet"}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-gray-500">Tid</div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatDuration(workout.durationSeconds)}
                          </div>
                        </div>

                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-gray-500">Övningar</div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {workout.exercises.length}
                          </div>
                        </div>

                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-gray-500">Set</div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {totalSets}
                          </div>
                        </div>

                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-gray-500">Volym</div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {Math.round(totalVolume)} kg
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 text-sm text-blue-600">Visa detaljer</p>
                    </button>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => repeatWorkout(workout)}
                        className="rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
                      >
                        Kör igen
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDeletingWorkoutId((prev) =>
                            prev === workout.id ? null : workout.id
                          )
                        }
                        disabled={isDeleting}
                        className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 disabled:opacity-50"
                      >
                        Radera
                      </button>
                    </div>

                    {isDeleteOpen ? (
                      <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm font-semibold text-red-800">
                          Radera detta pass?
                        </p>
                        <p className="mt-1 text-sm text-red-700">
                          Det här passet tas bort från historiken och kan inte
                          återskapas.
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setDeletingWorkoutId(null)}
                            disabled={isDeleting}
                            className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-900 disabled:opacity-50"
                          >
                            Avbryt
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void deleteWorkout(workout.id);
                            }}
                            disabled={isDeleting}
                            className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {isDeleting ? "Raderar..." : "Ja, radera"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>

      {showClearAllConfirm ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-950">
              Ta bort all träningsdata?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Är du helt säker? All träningshistorik kommer att raderas och kan
              inte återskapas.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowClearAllConfirm(false)}
                disabled={isDeleting}
                className="rounded-2xl border px-4 py-3 text-base font-semibold text-gray-900 disabled:opacity-50"
              >
                Avbryt
              </button>

              <button
                type="button"
                onClick={() => {
                  void clearAllWorkoutData();
                }}
                disabled={isDeleting}
                className="rounded-2xl bg-red-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
              >
                {isDeleting ? "Raderar..." : "Ja, radera allt"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto w-full max-w-md p-4">
            {/* Enkel avslutsknapp som går tillbaka till startsidan */}
                <button
                    onClick={() => router.push("/home")}
                    className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white"
                >
                    Avsluta
                </button>
        </div>
      </div>
    </main>
  );
}