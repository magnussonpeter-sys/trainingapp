"use client";

// Detaljsidan följer samma lugna formspråk som historiklistan.
// Fokus ligger på att förstå passet snabbt och kunna köra det igen.

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import StickyActionBar from "@/components/app-shell/sticky-action-bar";
import { getFavoriteWorkoutIds, toggleWorkoutFavorite } from "@/lib/history-favorites-storage";
import { getWorkoutLogs, type WorkoutLog } from "@/lib/workout-log-storage";
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

function formatSetResult(set: WorkoutLog["exercises"][number]["sets"][number]) {
  const parts: string[] = [];

  if (set.actualReps !== null) {
    parts.push(`${set.actualReps} reps`);
  }

  if (set.actualWeight !== null) {
    parts.push(`${set.actualWeight} kg`);
  }

  if (set.actualDuration !== null) {
    parts.push(`${set.actualDuration} sek`);
  }

  return parts.length > 0 ? parts.join(" • ") : "Ingen loggning";
}

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function mapLogExerciseToWorkoutExercise(exercise: WorkoutLog["exercises"][number]): Exercise {
  return {
    id: exercise.exerciseId,
    name: exercise.exerciseName,
    sets: exercise.plannedSets,
    reps: exercise.plannedReps ?? undefined,
    duration: exercise.plannedDuration ?? undefined,
    // Behåll ett enkelt standardupplägg när ett historiskt pass körs igen.
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

export default function HistoryWorkoutDetailPage() {
  const router = useRouter();
  const params = useParams();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [workout, setWorkout] = useState<WorkoutLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setErrorMessage(null);
        setIsLoading(true);

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
        const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;

        if (!isMounted) return;

        setAuthUser(user);
        setAuthChecked(true);

        const localLogs = getWorkoutLogs(userId);
        const logsRes = await fetch(
          `/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=100`,
          {
            cache: "no-store",
            credentials: "include",
          },
        );

        const logsData = await logsRes.json().catch(() => null);

        const apiLogs =
          logsRes.ok && logsData?.ok && Array.isArray(logsData.logs)
            ? (logsData.logs as WorkoutLog[])
            : [];
        const mergedLogs = mergeWorkoutLogs(apiLogs, localLogs);
        const foundWorkout = mergedLogs.find((log) => log.id === workoutId) ?? null;

        if (!isMounted) return;

        setIsFavorite(getFavoriteWorkoutIds(userId).includes(String(workoutId)));

        if (!foundWorkout) {
          setErrorMessage("Kunde inte hitta det valda passet.");
          setWorkout(null);
          return;
        }

        setWorkout(foundWorkout);
      } catch {
        if (!isMounted) return;
        setErrorMessage("Kunde inte ladda passdetaljer.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setAuthChecked(true);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [params.id, router]);

  const totalSets = useMemo(() => {
    return workout ? getTotalSets(workout) : 0;
  }, [workout]);

  const totalVolume = useMemo(() => {
    return workout ? getWorkoutVolume(workout) : 0;
  }, [workout]);

  const repeatWorkout = () => {
    if (!authUser || !workout) return;

    const userId = String(authUser.id);
    saveActiveWorkout(userId, createWorkoutFromLog(workout));
    router.push("/workout/run");
  };

  const handleToggleFavorite = () => {
    if (!authUser || !workout) {
      return;
    }

    const nextValue = toggleWorkoutFavorite(String(authUser.id), workout.id);
    setIsFavorite(nextValue);
  };

  if (!authChecked || isLoading) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={cn(uiPageShellClasses.content, "py-12")}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-600">Laddar passdetaljer...</p>
          </section>
        </div>
      </main>
    );
  }

  if (errorMessage || !workout) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={cn(uiPageShellClasses.content, "py-12")}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Historik
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Kunde inte visa passet
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {errorMessage ?? "Passet kunde inte laddas."}
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push("/history")}
                className={cn(uiButtonClasses.secondary, "sm:flex-1")}
              >
                Till historik
              </button>
              <button
                type="button"
                onClick={() => router.push("/home")}
                className={cn(uiButtonClasses.primary, "sm:flex-1")}
              >
                Till startsidan
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, "pb-32")}>
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
          >
            ← Tillbaka till historik
          </button>

          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Historiskt pass
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {workout.workoutName}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  {formatDateTime(workout.completedAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleFavorite}
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
                <p className="mt-1 text-base font-semibold text-slate-950">{totalSets}</p>
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
          </section>

          <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Övningar
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">
                  Det här gjorde du
                </h2>
              </div>
              <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                {workout.status === "completed" ? "Genomfört" : "Avbrutet"}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {workout.exercises.map((exercise) => (
                <article key={exercise.exerciseId} className={cn(uiCardClasses.soft, "bg-white")}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-slate-950">
                        {exercise.exerciseName}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {exercise.sets.length} set
                      </p>
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      {exercise.extraReps !== null ? (
                        <p>Extra reps: {exercise.extraReps === 6 ? "6+" : exercise.extraReps}</p>
                      ) : null}
                      {exercise.rating !== null ? <p>Betyg: {exercise.rating}/5</p> : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {exercise.sets.map((set) => (
                      <div
                        key={`${exercise.exerciseId}-${set.setNumber}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                      >
                        <span className="font-medium text-slate-900">Set {set.setNumber}</span>
                        <span className="ml-2">{formatSetResult(set)}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>

      <StickyActionBar>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/history")}
            className={cn(uiButtonClasses.secondary, "w-full sm:flex-1")}
          >
            Till historik
          </button>
          <button
            type="button"
            onClick={repeatWorkout}
            className={cn(uiButtonClasses.primary, "w-full sm:flex-1")}
          >
            Kör igen
          </button>
        </div>
      </StickyActionBar>
    </main>
  );
}
