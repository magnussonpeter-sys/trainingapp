"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import StickyActionBar from "@/components/app-shell/sticky-action-bar";
import {
  clearFavoriteWorkoutIds,
  getFavoriteWorkoutIds,
  removeWorkoutFavorite,
  toggleWorkoutFavorite,
} from "@/lib/history-favorites-storage";
import {
  clearWorkoutLogs,
  getWorkoutLogs,
  removeWorkoutLog,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import { saveActiveWorkout } from "@/lib/workout-storage";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import type { Exercise, Workout } from "@/types/workout";

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
};

type DataSource = "api" | "local";
type HistoryFilter = "all" | "favorites";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

function toLocalIsoDate(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    // Behåll ett enkelt standardupplägg när vi återskapar pass från historiken.
    rest: 45,
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
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("api");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    // Läser datumfiltret lokalt för att undvika extra Suspense-krav på sidan.
    const rawValue = new URLSearchParams(window.location.search).get("date");
    setSelectedDate(
      rawValue && /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? rawValue : null,
    );
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      try {
        setLoadError(null);

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
        setFavoriteIds(getFavoriteWorkoutIds(userId));

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

  const visibleWorkouts = useMemo(() => {
    let nextWorkouts = workouts;

    if (historyFilter === "favorites") {
      const favoriteSet = new Set(favoriteIds);
      nextWorkouts = workouts.filter((workout) => favoriteSet.has(workout.id));
    }

    if (selectedDate) {
      nextWorkouts = nextWorkouts.filter(
        (workout) => toLocalIsoDate(workout.completedAt) === selectedDate,
      );
    }

    return nextWorkouts;
  }, [favoriteIds, historyFilter, selectedDate, workouts]);

  const favoriteCount = useMemo(() => {
    const favoriteSet = new Set(favoriteIds);
    return workouts.filter((workout) => favoriteSet.has(workout.id)).length;
  }, [favoriteIds, workouts]);

  const totalCompletedWorkouts = useMemo(() => {
    return workouts.filter((workout) => workout.status === "completed").length;
  }, [workouts]);

  const canClearHistory = workouts.length > 0 && !isDeleting;

  const repeatWorkout = (workoutLog: WorkoutLog) => {
    if (!authUser) return;

    const userId = String(authUser.id);
    const workout = createWorkoutFromLog(workoutLog);
    saveActiveWorkout(userId, workout);
    router.push("/workout/run");
  };

  const toggleFavorite = (workoutId: string) => {
    if (!authUser) {
      return;
    }

    const nextValue = toggleWorkoutFavorite(String(authUser.id), workoutId);

    setFavoriteIds((previous) => {
      if (nextValue) {
        return Array.from(new Set([...previous, workoutId]));
      }

      return previous.filter((id) => id !== workoutId);
    });
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
          // Passet finns bara lokalt i merged historik.
        } else if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? "Kunde inte radera passet");
        }
      }

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

      removeWorkoutFavorite(userId, workoutId);
      setFavoriteIds((previous) => previous.filter((id) => id !== workoutId));
      setWorkouts((previous) => previous.filter((workout) => workout.id !== workoutId));
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

      clearWorkoutLogs(userId);
      clearFavoriteWorkoutIds(userId);
      setWorkouts([]);
      setFavoriteIds([]);
      setDeletingWorkoutId(null);
    } catch (error) {
      console.error("Failed to clear all workout data", error);
      alert("Kunde inte radera all träningsdata.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleManageHistory = () => {
    if (!canClearHistory) {
      return;
    }

    const confirmed = window.confirm(
      "Är du säker på att du vill radera all träningshistorik? Detta går inte att ångra.",
    );

    if (!confirmed) {
      return;
    }

    void clearAllWorkoutData();
  };

  if (!authChecked) {
    return <div className="p-6">Laddar historik...</div>;
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, "pb-6")}>
        <div className="space-y-5">
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Historik
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Tidigare pass
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Hitta pass du vill köra igen, markera favoriter och håll koll på din
              kontinuitet.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Totalt
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950">{workouts.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Genomförda
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950">
                  {totalCompletedWorkouts}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Favoriter
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950">{favoriteCount}</p>
              </div>
            </div>

            {loadError ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {loadError}
              </div>
            ) : null}

            {selectedDate ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Visar historik för {selectedDate}.
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(null);
                    router.push("/history");
                  }}
                  className="ml-2 font-semibold text-emerald-900 underline underline-offset-2"
                >
                  Visa hela historiken
                </button>
              </div>
            ) : null}
          </section>

          <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Visa
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">
                  Filtrera historiken
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryFilter("all")}
                  className={cn(
                    uiButtonClasses.chip,
                    historyFilter === "all"
                      ? uiButtonClasses.chipSelected
                      : uiButtonClasses.chipDefault,
                  )}
                >
                  Alla pass
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter("favorites")}
                  className={cn(
                    uiButtonClasses.chip,
                    historyFilter === "favorites"
                      ? uiButtonClasses.chipSelected
                      : uiButtonClasses.chipDefault,
                  )}
                >
                  Favoriter
                </button>
              </div>
            </div>
          </section>

          {visibleWorkouts.length === 0 ? (
            <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
              <h2 className="text-xl font-semibold text-slate-950">
                {historyFilter === "favorites"
                  ? "Inga favoritpass ännu"
                  : selectedDate
                    ? "Ingen historik för vald dag"
                    : "Ingen träningshistorik ännu"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {historyFilter === "favorites"
                  ? "Markera pass med stjärnan så samlas de här för snabb åtkomst."
                  : selectedDate
                    ? "Det finns inga genomförda pass sparade för just den här dagen."
                    : "När du har genomfört ett pass kommer det att visas här."}
              </p>
              <button
                type="button"
                onClick={() => router.push("/home")}
                className={cn(uiButtonClasses.primary, "mt-4 w-full")}
              >
                Till startsidan
              </button>
            </section>
          ) : (
            <div className="space-y-4">
              {visibleWorkouts.map((workout) => {
                const isDeleteOpen = deletingWorkoutId === workout.id;
                const isFavorite = favoriteIds.includes(workout.id);
                const totalSets = getTotalSets(workout);
                const totalVolume = getWorkoutVolume(workout);

                return (
                  <article
                    key={workout.id}
                    className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openDetails(workout.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm text-slate-500">
                          {formatDateTime(workout.completedAt)}
                        </p>
                        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                          {workout.workoutName}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          {workout.status === "completed" ? "Genomfört pass" : "Avbrutet pass"}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleFavorite(workout.id)}
                        aria-label={isFavorite ? "Ta bort favorit" : "Markera som favorit"}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl border text-lg transition",
                          isFavorite
                            ? "border-amber-300 bg-amber-50 text-amber-600"
                            : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50",
                        )}
                      >
                        {isFavorite ? "★" : "☆"}
                      </button>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className={cn(uiCardClasses.soft, "bg-slate-50")}>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Tid
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-950">
                          {formatDuration(workout.durationSeconds)}
                        </p>
                      </div>

                      <div className={cn(uiCardClasses.soft, "bg-slate-50")}>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Övningar
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-950">
                          {workout.exercises.length}
                        </p>
                      </div>

                      <div className={cn(uiCardClasses.soft, "bg-slate-50")}>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Set
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-950">
                          {totalSets}
                        </p>
                      </div>

                      <div className={cn(uiCardClasses.soft, "bg-slate-50")}>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Volym
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-950">
                          {Math.round(totalVolume)} kg
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => openDetails(workout.id)}
                        className={cn(uiButtonClasses.secondary, "sm:flex-1")}
                      >
                        Visa detaljer
                      </button>

                      <button
                        type="button"
                        onClick={() => repeatWorkout(workout)}
                        className={cn(uiButtonClasses.primary, "sm:flex-1")}
                      >
                        Kör igen
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDeletingWorkoutId((previous) =>
                            previous === workout.id ? null : workout.id,
                          )
                        }
                        disabled={isDeleting}
                        className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50 sm:flex-1"
                      >
                        Radera
                      </button>
                    </div>

                    {isDeleteOpen ? (
                      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                        <h3 className="text-base font-semibold text-rose-900">
                          Radera detta pass?
                        </h3>
                        <p className="mt-2 text-sm text-rose-800">
                          Det här passet tas bort från historiken och kan inte återskapas.
                        </p>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => setDeletingWorkoutId(null)}
                            disabled={isDeleting}
                            className={cn(uiButtonClasses.secondary, "sm:flex-1")}
                          >
                            Avbryt
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void deleteWorkout(workout.id);
                            }}
                            disabled={isDeleting}
                            className="min-h-11 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:flex-1"
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
          )}

        </div>
        {workouts.length > 0 ? (
          <div
            aria-hidden="true"
            className="h-[calc(env(safe-area-inset-bottom)+10rem)] sm:h-[calc(env(safe-area-inset-bottom)+8.5rem)]"
          />
        ) : null}
      </div>

      {workouts.length > 0 ? (
        <StickyActionBar className="rounded-[22px] p-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => router.push("/home")}
              className={cn(uiButtonClasses.secondary, "min-h-10 flex-1 py-2.5")}
            >
              Till hem
            </button>
            <button
              type="button"
              onClick={handleManageHistory}
              disabled={!canClearHistory}
              className="min-h-10 flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50"
            >
              {isDeleting ? "Raderar..." : "Radera all historik"}
            </button>
          </div>
        </StickyActionBar>
      ) : null}
    </main>
  );
}
