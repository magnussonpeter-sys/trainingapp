"use client";

// Detaljsida för ett tidigare genomfört pass.
// Här kan användaren granska passet och köra samma upplägg igen.
// Sprint 1:
// - Workout använder nu blocks i stället för platt exercises-lista
// - "Kör passet igen" bygger därför ett nytt aktivt pass med ett straight_sets-block

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import type { WorkoutLog } from "@/lib/workout-log-storage";
import { saveActiveWorkout } from "@/lib/workout-storage";
import type { Exercise, Workout } from "@/types/workout";

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
};

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

function mapLogExerciseToWorkoutExercise(exercise: WorkoutLog["exercises"][number]): Exercise {
  return {
    id: exercise.exerciseId,
    name: exercise.exerciseName,
    sets: exercise.plannedSets,
    reps: exercise.plannedReps ?? undefined,
    duration: exercise.plannedDuration ?? undefined,
    // Tillfällig standardvila när vi bygger ett nytt pass från historiken.
    rest: 45,
    description: undefined,
  };
}

function createWorkoutFromLog(log: WorkoutLog): Workout {
  return {
    // Skapar nytt id så att detta blir ett nytt aktivt pass.
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

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setErrorMessage(null);
        setIsLoading(true);

        // Nytt auth-format: { user }
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

        const logsRes = await fetch(
          `/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=100`,
          {
            cache: "no-store",
            credentials: "include",
          },
        );

        const logsData = await logsRes.json();

        if (!logsRes.ok || !logsData?.ok || !Array.isArray(logsData.logs)) {
          throw new Error(logsData?.error || "Kunde inte hämta träningshistorik");
        }

        const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;

        const foundWorkout =
          (logsData.logs as WorkoutLog[]).find((log) => log.id === workoutId) ?? null;

        if (!isMounted) return;

        if (!foundWorkout) {
          setErrorMessage("Kunde inte hitta det valda passet.");
          setWorkout(null);
          return;
        }

        setWorkout(foundWorkout);
      } catch (error) {
        console.error("Failed to load workout detail page", error);

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

  function repeatWorkout() {
    if (!authUser || !workout) return;

    const userId = String(authUser.id);

    // Bygger nytt aktivt pass från historiken.
    const repeatedWorkout = createWorkoutFromLog(workout);
    saveActiveWorkout(userId, repeatedWorkout);
    router.push("/workout/run");
  }

  if (!authChecked || isLoading) {
    return <div className="p-6">Laddar passdetaljer...</div>;
  }

  if (errorMessage || !workout) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Kunde inte visa passet</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {errorMessage ?? "Passet kunde inte laddas."}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => router.push("/history")}
              className="flex-1 rounded-2xl border px-4 py-3 font-semibold text-gray-900"
            >
              Till historik
            </button>
            <button
              type="button"
              onClick={() => router.push("/home")}
              className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              Till startsidan
            </button>
          </div>
        </section>
      </main>
    );
  }

  const totalSets = getTotalSets(workout);
  const totalVolume = getWorkoutVolume(workout);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push("/history")}
          className="text-sm font-medium text-blue-700 underline underline-offset-2"
        >
          Tillbaka till historik
        </button>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            Passdetaljer
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">{workout.workoutName}</h1>
          <p className="mt-2 text-sm text-slate-600">{formatDateTime(workout.completedAt)}</p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tid</p>
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
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Set</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{totalSets}</p>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Volym</p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {Math.round(totalVolume)} kg
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {workout.exercises.map((exercise) => (
            <article
              key={exercise.exerciseId}
              className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {exercise.exerciseName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{exercise.sets.length} set</p>
                </div>

                <div className="text-right text-sm text-slate-600">
                  {exercise.extraReps !== null ? (
                    <p>Extra reps: {exercise.extraReps === 6 ? "6+" : exercise.extraReps}</p>
                  ) : null}
                  {exercise.rating !== null ? <p>Betyg: {exercise.rating}/5</p> : null}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {exercise.sets.map((set) => (
                  <div
                    key={`${exercise.exerciseId}-${set.setNumber}`}
                    className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    Set {set.setNumber} {" • "}{" "}
                    {set.actualReps !== null ? `${set.actualReps} reps` : "inga reps"}{" "}
                    {" • "}{" "}
                    {set.actualWeight !== null ? `${set.actualWeight} kg` : "ingen vikt"}
                    {set.actualDuration !== null ? ` • ${set.actualDuration} sek` : ""}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="flex-1 rounded-2xl border px-4 py-3 text-base font-semibold text-gray-900"
          >
            Tillbaka
          </button>

          <button
            type="button"
            onClick={repeatWorkout}
            className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
          >
            Kör passet igen
          </button>
        </div>
      </div>
    </main>
  );
}