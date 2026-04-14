"use client";

// Historiksida för tidigare träningspass.
// Sprint 1:
// - Workout använder nu blocks i stället för platt exercises-lista
// - "Kör igen" bygger därför ett nytt aktivt pass med ett straight_sets-block
// - UI hålls så likt tidigare som möjligt

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  clearWorkoutLogs,
  getWorkoutLogs,
  removeWorkoutLog,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import { saveActiveWorkout } from "@/lib/workout-storage";
import type { Exercise, Workout } from "@/types/workout";

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
};

type DataSource = "api" | "local";

function mergeWorkoutLogs(apiLogs: WorkoutLog[], localLogs: WorkoutLog[]) {
  const merged = [...apiLogs];
  const seen = new Set(
    apiLogs.map((log) => `${log.workoutName}:${log.completedAt}:${log.status}`),
  );

  for (const log of localLogs) {
    const key = `${log.workoutName}:${log.completedAt}:${log.status}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(log);
  }

  return merged.sort((a, b) => {
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });
}

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

function mapLogExerciseToWorkoutExercise(
  exercise: WorkoutLog["exercises"][number],
): Exercise {
  return {
    id: exercise.exerciseId,
    name: exercise.exerciseName,
    sets: exercise.plannedSets,
    reps: exercise.plannedReps ?? undefined,
    duration: exercise.plannedDuration ?? undefined,
    rest: 45, // Tillfällig standardvila när vi bygger pass från historik
    description: undefined,
  };
}

function createWorkoutFromLog(log: WorkoutLog): Workout {
  return {
    id: makeId(),
    name: log.workoutName,
    duration: Math.max(1, Math.round(log.durationSeconds / 60)),
    createdAt: new Date().toISOString(),
    blocks: [
      {
        type: "straight_sets",
        title: "Huvuddel",
        exercises: log.exercises.map(mapLogExerciseToWorkoutExercise),
      },
    ],
  };
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
    let isMounted = true;

    async function loadHistory() {
      try {
        setLoadError(null);

        // Hämta inloggad användare från nya auth-formatet: { user }.
        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        let authData: unknown = null;
        try {
          authData = await authRes.json();
        } catch {
          authData = null;
        }

        if (
          !authRes.ok ||
          !authData ||
          typeof authData !== "object" ||
          !("user" in authData) ||
          !(authData as { user?: unknown }).user
        ) {
          router.replace("/");
          return;
        }

        const user = (authData as { user: AuthUser }).user;
        const userId = String(user.id);

        if (!isMounted) return;

        setAuthUser(user);
        setAuthChecked(true);

        // Försök först att hämta historik från databasen.
        try {
          const localLogs = getWorkoutLogs(userId);
          const logsRes = await fetch(
            `/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=50`,
            {
              cache: "no-store",
              credentials: "include",
            },
          );

          const logsData = await logsRes.json();

          if (!logsRes.ok || !logsData?.ok || !Array.isArray(logsData.logs)) {
            throw new Error(logsData?.error || "Kunde inte hämta träningshistorik");
          }

          if (!isMounted) return;

          const apiLogs = logsData.logs as WorkoutLog[];
          const mergedLogs = mergeWorkoutLogs(apiLogs, localLogs);

          setWorkouts(mergedLogs);
          setDataSource(apiLogs.length > 0 ? "api" : localLogs.length > 0 ? "local" : "api");

          if (apiLogs.length === 0 && localLogs.length > 0) {
            setLoadError("Visar lokalt sparad historik som ännu inte finns i databasen.");
          }
          return;
        } catch (apiError) {
          console.error("Failed to load workout history from API", apiError);

          // Om API-hämtningen fallerar visar vi lokal fallback.
          const localLogs = getWorkoutLogs(userId);

          if (!isMounted) return;

          setWorkouts(localLogs);
          setDataSource("local");
          setLoadError("Kunde inte hämta historik från databasen. Visar lokal historik.");
        }
      } catch (error) {
        console.error("Failed to load history page", error);
        router.replace("/");
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    void loadHistory();

    return () => {
      isMounted = false;
    };
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
    const workoutToDelete = workouts.find((workout) => workout.id === workoutId) ?? null;
    const localLogs = getWorkoutLogs(userId);
    const existsLocally = localLogs.some((log) => log.id === workoutId);
    setIsDeleting(true);

    try {
      if (dataSource === "api" && workoutToDelete) {
        // Radera passet i databasen.
        const response = await fetch(
          `/api/workout-logs/${encodeURIComponent(workoutId)}?userId=${encodeURIComponent(
            userId,
          )}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        );

        const data = await response.json().catch(() => null);

        if (response.status === 404 && existsLocally) {
          // Passet fanns bara lokalt i merged historik.
        } else if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? "Kunde inte radera passet");
        }
      }

      // Rensa alltid lokal fallback också för att merged historik inte ska skapa spökposter.
      removeWorkoutLog(userId, (log) => {
        if (log.id === workoutId) {
          return true;
        }

        if (!workoutToDelete) {
          return false;
        }

        return (
          log.workoutName === workoutToDelete.workoutName &&
          log.completedAt === workoutToDelete.completedAt &&
          log.status === workoutToDelete.status
        );
      });

      setWorkouts((prev) => prev.filter((workout) => workout.id !== workoutId));

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
            credentials: "include",
          },
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? "Kunde inte radera all träningsdata");
        }
      }

      // Rensa alltid lokal fallback också så att ingen gammal data blir kvar.
      clearWorkoutLogs(userId);
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
    return <div className="p-6">Laddar historik...</div>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6">
      <button
        type="button"
        onClick={() => router.push("/home")}
        className="text-sm font-semibold text-blue-600"
      >
        ← Historik
      </button>

      <h1 className="mt-4 text-3xl font-bold text-slate-900">Tidigare pass</h1>

      <p className="mt-2 text-sm text-slate-600">
        {dataSource === "api" ? "Visar databasdata" : "Visar lokal fallback"}
      </p>

      {loadError ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {loadError}
        </div>
      ) : null}

      {workouts.length === 0 ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            Ingen träningshistorik ännu
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            När du har genomfört ett pass kommer det att visas här.
          </p>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
          >
            Till startsidan
          </button>
        </section>
      ) : (
        <>
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Hantera träningsdata</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
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

          <div className="mt-6 space-y-4">
            {workouts.map((workout) => {
              const isDeleteOpen = deletingWorkoutId === workout.id;
              const totalSets = getTotalSets(workout);
              const totalVolume = getWorkoutVolume(workout);

              return (
                <article
                  key={workout.id}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => openDetails(workout.id)}
                    className="w-full text-left"
                  >
                    <p className="text-sm text-slate-500">
                      {formatDateTime(workout.completedAt)}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-900">
                      {workout.workoutName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {workout.status === "completed" ? "Genomfört" : "Avbrutet"}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Tid
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {formatDuration(workout.durationSeconds)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Övningar
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {workout.exercises.length}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Set
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {totalSets}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Volym
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {Math.round(totalVolume)} kg
                        </p>
                      </div>
                    </div>
                  </button>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => openDetails(workout.id)}
                      className="rounded-2xl border border-gray-200 px-4 py-3 text-base font-semibold text-gray-900"
                    >
                      Visa detaljer
                    </button>

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
                          prev === workout.id ? null : workout.id,
                        )
                      }
                      disabled={isDeleting}
                      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 disabled:opacity-50"
                    >
                      Radera
                    </button>
                  </div>

                  {isDeleteOpen ? (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                      <h3 className="text-base font-semibold text-red-900">
                        Radera detta pass?
                      </h3>
                      <p className="mt-2 text-sm text-red-800">
                        Det här passet tas bort från historiken och kan inte återskapas.
                      </p>

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
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
                </article>
              );
            })}
          </div>
        </>
      )}

      {showClearAllConfirm ? (
        <section className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-xl font-semibold text-red-900">Ta bort all träningsdata?</h2>
          <p className="mt-2 text-sm leading-6 text-red-800">
            Är du helt säker? All träningshistorik kommer att raderas och kan inte återskapas.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
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
        </section>
      ) : null}

      {/* Enkel avslutsknapp som går tillbaka till startsidan */}
      <button
        type="button"
        onClick={() => router.push("/home")}
        className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white"
      >
        Avsluta
      </button>
    </main>
  );
}
