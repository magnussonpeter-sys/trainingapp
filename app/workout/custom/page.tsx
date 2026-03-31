"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveActiveWorkout } from "@/lib/workout-storage";
import type { Exercise, Workout } from "@/types/workout";

type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
};

function createExerciseId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

export default function CustomWorkoutPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fält för ny övning.
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newSets, setNewSets] = useState("3");
  const [newReps, setNewReps] = useState("10");
  const [newRest, setNewRest] = useState("45");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const authRes = await fetch("/api/auth/me", { cache: "no-store" });
        const authData = await authRes.json();

        if (!authRes.ok || !authData?.ok || !authData.user) {
          router.replace("/");
          return;
        }

        setAuthUser(authData.user as AuthUser);
        setAuthChecked(true);
      } catch {
        router.replace("/");
      }
    }

    void load();
  }, [router]);

  function addExercise() {
    if (!newExerciseName.trim()) {
      setError("Ange namn på övningen.");
      return;
    }

    const exercise: Exercise = {
      id: createExerciseId(),
      name: newExerciseName.trim(),
      sets: Number(newSets) || 3,
      reps: Number(newReps) || 10,
      rest: Number(newRest) || 45,
      description: newDescription.trim() || undefined,
    };

    setExercises((prev) => [...prev, exercise]);

    // Töm formuläret efter att övningen lagts till.
    setNewExerciseName("");
    setNewSets("3");
    setNewReps("10");
    setNewRest("45");
    setNewDescription("");
    setError(null);
  }

  function removeExercise(exerciseId: string) {
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseId));
  }

  function startWorkout() {
    if (!authUser) {
      setError("Kunde inte hitta användare.");
      return;
    }

    const validExercises = exercises.filter(
      (exercise) => exercise.name.trim().length > 0
    );

    if (validExercises.length === 0) {
      setError("Lägg till minst en övning.");
      return;
    }

    // Här skapas det egna passet och sparas som aktivt pass för aktuell användare.
    const workout: Workout = {
      id: `custom_${Date.now()}`,
      name: "Eget pass",
      duration: 45,
      exercises: validExercises,
    };

    saveActiveWorkout(String(authUser.id), workout);
    router.push("/workout/run");
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-gray-600">Laddar...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col p-4 pb-32">
        <section className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">
            Eget pass
          </h1>

          {exercises.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-600">
                Inga övningar tillagda ännu.
              </p>
            </div>
          ) : (
            exercises.map((exercise, index) => (
              <div
                key={exercise.id}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Övning {index + 1}</p>
                    <h2 className="text-lg font-semibold text-gray-950">
                      {exercise.name}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeExercise(exercise.id)}
                    className="rounded-xl border px-3 py-2 text-sm font-medium text-red-600"
                  >
                    Ta bort
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-700">
                  <span className="rounded-full bg-gray-100 px-3 py-1">
                    {exercise.sets} set
                  </span>

                  <span className="rounded-full bg-gray-100 px-3 py-1">
                    {exercise.reps} reps
                  </span>

                  <span className="rounded-full bg-gray-100 px-3 py-1">
                    Vila {exercise.rest} sek
                  </span>
                </div>

                {exercise.description ? (
                  <p className="mt-3 text-sm text-gray-600">
                    {exercise.description}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </section>

        <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Lägg till övning</h2>

          <div className="mt-3 space-y-3">
            <input
              value={newExerciseName}
              onChange={(e) => setNewExerciseName(e.target.value)}
              placeholder="Namn på övning"
              className="w-full rounded-xl border px-3 py-3 text-base outline-none"
            />

            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Set</span>
                <input
                  inputMode="numeric"
                  value={newSets}
                  onChange={(e) => setNewSets(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Reps</span>
                <input
                  inputMode="numeric"
                  value={newReps}
                  onChange={(e) => setNewReps(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Vila</span>
                <input
                  inputMode="numeric"
                  value={newRest}
                  onChange={(e) => setNewRest(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                />
              </label>
            </div>

            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Kort beskrivning"
              rows={3}
              className="w-full rounded-xl border px-3 py-3 text-base outline-none"
            />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="button"
              onClick={addExercise}
              className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-base font-semibold text-white"
            >
              Lägg till övning
            </button>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md gap-3 p-4">
          <Link
            href="/home"
            className="flex-1 rounded-2xl border px-4 py-3 text-center text-base font-semibold"
          >
            Tillbaka
          </Link>

          <button
            type="button"
            onClick={startWorkout}
            disabled={exercises.length === 0}
            className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            Starta pass
          </button>
        </div>
      </div>
    </main>
  );
}