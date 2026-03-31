"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { WorkoutLog } from "@/lib/workout-log-storage";
import { saveActiveWorkout } from "@/lib/workout-storage";
import type { Workout } from "@/types/workout";

type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
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
    // Skapar ett nytt id så att det blir ett nytt aktivt pass.
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
      // Tillfällig standardvila. Kan senare göras smartare per övning.
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
    async function load() {
      try {
        setErrorMessage(null);
        setIsLoading(true);

        // Hämtar inloggad användare från samma auth-källa som övriga sidor.
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

        // Hämtar träningshistorik från databasen.
        const logsRes = await fetch(
          `/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=100`,
          { cache: "no-store" }
        );

        const logsData = await logsRes.json();

        if (!logsRes.ok || !logsData?.ok || !Array.isArray(logsData.logs)) {
          throw new Error(logsData?.error || "Kunde inte hämta träningshistorik");
        }

        // Route-param kan vara string eller string[].
        const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;

        const foundWorkout =
          (logsData.logs as WorkoutLog[]).find((log) => log.id === workoutId) ?? null;

        if (!foundWorkout) {
          setErrorMessage("Kunde inte hitta det valda passet.");
          setWorkout(null);
          return;
        }

        setWorkout(foundWorkout);
      } catch (error) {
        console.error("Failed to load workout detail page", error);
        setErrorMessage("Kunde inte ladda passdetaljer.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [params.id, router]);

  const repeatWorkout = () => {
    if (!authUser || !workout) return;

    const userId = String(authUser.id);

    // Bygger ett nytt pass utifrån det historiska passet.
    const repeatedWorkout = createWorkoutFromLog(workout);

    // Viktigt: spara som AKTIVT pass, eftersom /run läser active workout.
    saveActiveWorkout(userId, repeatedWorkout);

    // Gå direkt till run.
    router.push("/workout/run");
  };

  if (!authChecked || isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-700">Laddar passdetaljer...</p>
        </div>
      </main>
    );
  }

  if (errorMessage || !workout) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Kunde inte visa passet</h1>
          <p className="mt-2 text-sm text-gray-700">
            {errorMessage ?? "Passet kunde inte laddas."}
          </p>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => router.push("/history")}
              className="flex-1 rounded-2xl border px-4 py-3 font-semibold text-gray-900"
            >
              Till historik
            </button>

            <button
              onClick={() => router.push("/home")}
              className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              Till startsidan
            </button>
          </div>
        </div>
      </main>
    );
  }

  const totalSets = getTotalSets(workout);
  const totalVolume = getWorkoutVolume(workout);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col p-4 pb-32">
        <header className="mb-4">
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="text-sm font-medium text-blue-700 underline underline-offset-2"
          >
            Tillbaka till historik
          </button>

          <p className="mt-3 text-sm text-gray-500">Passdetaljer</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">
            {workout.workoutName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {formatDateTime(workout.completedAt)}
          </p>
        </header>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 text-sm">
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
              <div className="mt-1 font-semibold text-gray-900">{totalSets}</div>
            </div>

            <div className="rounded-xl bg-gray-50 p-3">
              <div className="text-gray-500">Volym</div>
              <div className="mt-1 font-semibold text-gray-900">
                {Math.round(totalVolume)} kg
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 space-y-3">
          {workout.exercises.map((exercise) => (
            <div
              key={exercise.exerciseId}
              className="rounded-2xl border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {exercise.exerciseName}
                  </h2>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {exercise.extraReps !== null ? (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                        Extra reps: {exercise.extraReps === 6 ? "6+" : exercise.extraReps}
                      </span>
                    ) : null}

                    {exercise.rating !== null ? (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                        Betyg: {exercise.rating}/5
                      </span>
                    ) : null}
                  </div>
                </div>

                <span className="text-sm text-gray-500">
                  {exercise.sets.length} set
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {exercise.sets.map((set) => (
                  <div
                    key={`${exercise.exerciseId}-${set.setNumber}`}
                    className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-800"
                  >
                    <span className="font-medium">Set {set.setNumber}</span>
                    {" • "}
                    {set.actualReps !== null ? `${set.actualReps} reps` : "inga reps"}
                    {" • "}
                    {set.actualWeight !== null ? `${set.actualWeight} kg` : "ingen vikt"}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md gap-3 p-4">
          <button
            onClick={() => router.push("/history")}
            className="flex-1 rounded-2xl border px-4 py-3 text-base font-semibold text-gray-900"
          >
            Tillbaka
          </button>

          <button
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