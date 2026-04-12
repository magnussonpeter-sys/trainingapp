"use client";

// Sida för att skapa ett eget pass manuellt.
// Sprint 1:
// - Workout använder nu blocks i stället för platt exercises-lista
// - vi behåller samma UI och samma användarflöde
// - passet sparas nu som ett straight_sets-block för framtida flexibilitet

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Exercise, Workout } from "@/types/workout";
import { saveActiveWorkout } from "@/lib/workout-storage";

type AuthUser = {
  id: number | string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
};

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function toPositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

export default function CustomWorkoutPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [duration, setDuration] = useState("");
  const [rest, setRest] = useState("45");
  const [description, setDescription] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadAuth() {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        let data: unknown = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (
          !res.ok ||
          !data ||
          typeof data !== "object" ||
          !("user" in data) ||
          !(data as { user?: unknown }).user
        ) {
          router.replace("/");
          return;
        }

        if (!isMounted) return;

        setAuthUser((data as { user: AuthUser }).user);
        setAuthChecked(true);
      } catch (err) {
        console.error("Failed to load auth on custom workout page", err);
        router.replace("/");
      }
    }

    void loadAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const isTimedExercise = useMemo(() => {
    return duration.trim().length > 0 && Number(duration) > 0;
  }, [duration]);

  function resetForm() {
    setName("");
    setSets("3");
    setReps("10");
    setDuration("");
    setRest("45");
    setDescription("");
  }

  function addExercise() {
    setError(null);

    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Ange namn på övningen.");
      return;
    }

    const parsedSets = toPositiveInteger(sets, 3);
    const parsedRest = Math.max(0, toPositiveInteger(rest, 45));
    const parsedReps = isTimedExercise ? undefined : toPositiveInteger(reps, 10);
    const parsedDuration = isTimedExercise ? toPositiveInteger(duration, 30) : undefined;

    const nextExercise: Exercise = {
      id: `custom-${createId()}`,
      name: trimmedName,
      sets: parsedSets,
      reps: parsedReps,
      duration: parsedDuration,
      rest: parsedRest,
      description: description.trim() || undefined,
      isCustom: true,
    };

    setExercises((prev) => [...prev, nextExercise]);
    resetForm();
  }

  function removeExercise(exerciseId: string) {
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseId));
  }

  function moveExercise(exerciseId: string, direction: "up" | "down") {
    setExercises((prev) => {
      const index = prev.findIndex((exercise) => exercise.id === exerciseId);
      if (index === -1) return prev;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      const current = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = current;

      return next;
    });
  }

  function startWorkout() {
    if (!authUser) {
      setError("Ingen användare hittades.");
      return;
    }

    setError(null);

    const validExercises = exercises.filter((exercise) => exercise.name.trim().length > 0);

    if (validExercises.length === 0) {
      setError("Lägg till minst en övning innan du startar passet.");
      return;
    }

    const workout: Workout = {
      id: createId(),
      name: "Eget pass",
      duration: 45,
      createdAt: new Date().toISOString(),
      blocks: [
        {
          type: "straight_sets",
          title: "Huvuddel",
          exercises: validExercises,
        },
      ],
    };

    saveActiveWorkout(String(authUser.id), workout);
    router.push("/workout/run");
  }

  if (!authChecked) {
    return <div className="p-6">Laddar...</div>;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={() => router.push("/home")}
        className="text-sm font-semibold text-blue-600"
      >
        ← Tillbaka
      </button>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
          Eget pass
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Bygg ditt pass</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Lägg till övningar i den ordning du vill köra dem. Design och beteende hålls
          lika som tidigare, men passet sparas nu i en blockstruktur som förbereder för
          framtida träningsformat.
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Namn på övning
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="t.ex. Knäböj"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none ring-0 transition focus:border-blue-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Set</label>
            <input
              value={sets}
              onChange={(event) => setSets(event.target.value)}
              inputMode="numeric"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none ring-0 transition focus:border-blue-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Vila (sek)</label>
            <input
              value={rest}
              onChange={(event) => setRest(event.target.value)}
              inputMode="numeric"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none ring-0 transition focus:border-blue-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Reps</label>
            <input
              value={reps}
              onChange={(event) => setReps(event.target.value)}
              inputMode="numeric"
              disabled={isTimedExercise}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none ring-0 transition focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Tid (sek, valfritt)
            </label>
            <input
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              inputMode="numeric"
              placeholder="t.ex. 30"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none ring-0 transition focus:border-blue-400"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Beskrivning (valfritt)
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Kort instruktion eller notering"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none ring-0 transition focus:border-blue-400"
            />
          </div>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={addExercise}
            className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
          >
            Lägg till övning
          </button>
        </div>
      </section>

      <section className="mt-6 space-y-4">
        {exercises.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Inga övningar ännu. Lägg till din första övning ovan.
          </div>
        ) : (
          exercises.map((exercise, index) => {
            const isTimed = typeof exercise.duration === "number" && exercise.duration > 0;

            return (
              <article
                key={exercise.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Övning {index + 1}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-950">
                      {exercise.name}
                    </h2>
                    {exercise.description ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {exercise.description}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeExercise(exercise.id)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
                  >
                    Ta bort
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Set
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {exercise.sets}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {isTimed ? "Tid" : "Reps"}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {isTimed ? `${exercise.duration} sek` : exercise.reps}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Vila
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {exercise.rest} sek
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Typ
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {isTimed ? "Tid" : "Reps"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => moveExercise(exercise.id, "up")}
                    className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    Flytta upp
                  </button>
                  <button
                    type="button"
                    onClick={() => moveExercise(exercise.id, "down")}
                    className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    Flytta ner
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-900"
        >
          Avbryt
        </button>
        <button
          type="button"
          onClick={startWorkout}
          className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
        >
          Starta pass
        </button>
      </div>
    </main>
  );
}