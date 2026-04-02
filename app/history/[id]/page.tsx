"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { WorkoutLog } from "@/lib/workout-log-storage";
import { saveActiveWorkout } from "@/lib/workout-storage";
import type { Workout } from "@/types/workout";

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

function createWorkoutFromLog(log: WorkoutLog): Workout {
  return {
    // Skapar nytt id så att detta blir ett nytt aktivt pass.
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
      // Tillfällig standardvila.
      rest: 45,
      description: undefined,
    })),
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
          }
        );

        const logsData = await logsRes.json();

        if (!logsRes.ok || !logsData?.ok || !Array.isArray(logsData.logs)) {
          throw new Error(logsData?.error || "Kunde inte hämta träningshistorik");
        }

        const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;

        const foundWorkout =
          (logsData.logs as WorkoutLog[]).find((log) => log.id === workoutId) ??
          null;

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
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-3xl font-bold text-gray-950">
          Kunde inte visa passet
        </h1>

        <p className="mt-2 text-sm text-gray-800">
          {errorMessage ?? "Passet kunde inte laddas."}
        </p>

        <div className="mt-6 flex gap-3">
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
      </main>
    );
  }

  const totalSets = getTotalSets(workout);
  const totalVolume = getWorkoutVolume(workout);

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <button
        type="button"
        onClick={() => router.push("/history")}
        className="text-sm font-medium text-blue-700 underline underline-offset-2"
      >
        Tillbaka till historik
      </button>

      <p className="mt-4 text-sm text-gray-700">Passdetaljer</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">
        {workout.workoutName}
      </h1>

      <p className="mt-2 text-sm text-gray-800">
        {formatDateTime(workout.completedAt)}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-700">Tid</p>
          <p className="mt-1 font-semibold text-gray-950">
            {formatDuration(workout.durationSeconds)}
          </p>
        </div>

        <div className="rounded-2xl bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-700">
            Övningar
          </p>
          <p className="mt-1 font-semibold text-gray-950">
            {workout.exercises.length}
          </p>
        </div>

        <div className="rounded-2xl bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-700">Set</p>
          <p className="mt-1 font-semibold text-gray-950">{totalSets}</p>
        </div>

        <div className="rounded-2xl bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-700">Volym</p>
          <p className="mt-1 font-semibold text-gray-950">
            {Math.round(totalVolume)} kg
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {workout.exercises.map((exercise) => (
          <section
            key={exercise.exerciseId}
            className="rounded-3xl border bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-gray-950">
              {exercise.exerciseName}
            </h2>

            <p className="mt-2 text-sm text-gray-800">
              {exercise.sets.length} set
            </p>

            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-800">
              {exercise.extraReps !== null ? (
                <span>
                  Extra reps: {exercise.extraReps === 6 ? "6+" : exercise.extraReps}
                </span>
              ) : null}

              {exercise.rating !== null ? (
                <span>Betyg: {exercise.rating}/5</span>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {exercise.sets.map((set) => (
                <div
                  key={`${exercise.exerciseId}-${set.setNumber}`}
                  className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-900"
                >
                  Set {set.setNumber} {" • "}
                  {set.actualReps !== null
                    ? `${set.actualReps} reps`
                    : "inga reps"}{" "}
                  {" • "}
                  {set.actualWeight !== null
                    ? `${set.actualWeight} kg`
                    : "ingen vikt"}
                  {set.actualDuration !== null
                    ? ` • ${set.actualDuration} sek`
                    : ""}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 flex gap-3">
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
    </main>
  );
}