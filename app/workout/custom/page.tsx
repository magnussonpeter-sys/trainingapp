// app/workout/custom/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveActiveWorkout } from "@/lib/workout-storage";
import {
  EXERCISE_CATALOG,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import type { Exercise, Workout } from "@/types/workout";

type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
};

type AddMode = "catalog" | "custom";

function createExerciseId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function createExerciseFromCatalog(item: ExerciseCatalogItem): Exercise {
  const isTimed =
    typeof item.defaultDuration === "number" &&
    item.defaultDuration > 0 &&
    typeof item.defaultReps !== "number";

  return {
    // Viktigt: behåll katalogens riktiga id så AI-historiken blir konsekvent.
    id: item.id,
    name: item.name,
    sets: item.defaultSets,
    reps: isTimed ? undefined : item.defaultReps ?? 10,
    duration: isTimed ? item.defaultDuration : undefined,
    rest: item.defaultRest,
    description: item.description,
  };
}

export default function CustomWorkoutPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Välj om användaren vill plocka från katalog eller skapa egen övning.
  const [addMode, setAddMode] = useState<AddMode>("catalog");
  const [catalogSearch, setCatalogSearch] = useState("");

  // Fritextform för egen övning finns kvar som reservspår.
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newSets, setNewSets] = useState("3");
  const [newReps, setNewReps] = useState("10");
  const [newDuration, setNewDuration] = useState("");
  const [newRest, setNewRest] = useState("45");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

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

  const filteredCatalog = useMemo(() => {
    const search = normalizeSearch(catalogSearch);

    if (!search) {
      return EXERCISE_CATALOG.slice(0, 80);
    }

    return EXERCISE_CATALOG.filter((exercise) => {
      const haystack = [
        exercise.name,
        exercise.description,
        exercise.movementPattern,
        ...(exercise.primaryMuscles ?? []),
        ...(exercise.requiredEquipment ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    }).slice(0, 80);
  }, [catalogSearch]);

  function addCatalogExercise(item: ExerciseCatalogItem) {
    const alreadyAdded = exercises.some((exercise) => exercise.id === item.id);

    if (alreadyAdded) {
      setError("Övningen finns redan i passet.");
      return;
    }

    setExercises((prev) => [...prev, createExerciseFromCatalog(item)]);
    setError(null);
    setCatalogSearch("");
  }

  function addCustomExercise() {
    if (!newExerciseName.trim()) {
      setError("Ange namn på övningen.");
      return;
    }

    const parsedSets = Math.max(1, Number(newSets) || 3);
    const parsedReps = Math.max(0, Number(newReps) || 0);
    const parsedDuration = Math.max(0, Number(newDuration) || 0);
    const parsedRest = Math.max(0, Number(newRest) || 45);

    const exercise: Exercise = {
      // Egen övning får eget id så det är tydligt att den inte kommer från katalogen.
      id: `custom_${createExerciseId()}`,
      name: newExerciseName.trim(),
      sets: parsedSets,
      reps: parsedDuration > 0 ? undefined : parsedReps || 10,
      duration: parsedDuration > 0 ? parsedDuration : undefined,
      rest: parsedRest,
      description: newDescription.trim() || undefined,
    };

    setExercises((prev) => [...prev, exercise]);

    // Töm formuläret efter tillägg.
    setNewExerciseName("");
    setNewSets("3");
    setNewReps("10");
    setNewDuration("");
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
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-4 shadow-sm">
          Laddar...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-28">
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Manuellt pass</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
            Eget pass
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Välj helst från övningsbiblioteket för bättre AI-historik. Egen
            fritextövning finns kvar som reserv.
          </p>
        </section>

        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddMode("catalog")}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold ${
                addMode === "catalog"
                  ? "bg-gray-900 text-white"
                  : "border text-gray-900"
              }`}
            >
              Välj från bibliotek
            </button>

            <button
              type="button"
              onClick={() => setAddMode("custom")}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold ${
                addMode === "custom"
                  ? "bg-gray-900 text-white"
                  : "border text-gray-900"
              }`}
            >
              Skapa egen övning
            </button>
          </div>

          {addMode === "catalog" ? (
            <div className="mt-4">
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Sök övning, muskel eller utrustning"
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
              />

              <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {filteredCatalog.map((exercise) => {
                  const isTimed =
                    typeof exercise.defaultDuration === "number" &&
                    exercise.defaultDuration > 0 &&
                    typeof exercise.defaultReps !== "number";

                  return (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => addCatalogExercise(exercise)}
                      className="w-full rounded-2xl border p-4 text-left transition hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-gray-950">
                            {exercise.name}
                          </h3>
                          <p className="mt-1 text-sm text-gray-600">
                            {exercise.defaultSets} set ·{" "}
                            {isTimed
                              ? `${exercise.defaultDuration} sek`
                              : `${exercise.defaultReps ?? 10} reps`}{" "}
                            · Vila {exercise.defaultRest} sek
                          </p>
                        </div>

                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          {exercise.movementPattern}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-gray-500">
                        {exercise.description}
                      </p>
                    </button>
                  );
                })}

                {filteredCatalog.length === 0 ? (
                  <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">
                    Ingen övning matchade sökningen.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <input
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                placeholder="Namn på egen övning"
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Set</label>
                  <input
                    value={newSets}
                    onChange={(e) => setNewSets(e.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">Vila</label>
                  <input
                    value={newRest}
                    onChange={(e) => setNewRest(e.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">Reps</label>
                  <input
                    value={newReps}
                    onChange={(e) => setNewReps(e.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    Tid (sek)
                  </label>
                  <input
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    inputMode="numeric"
                    placeholder="Lämna tomt för reps"
                    className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                  />
                </div>
              </div>

              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Kort beskrivning"
                rows={3}
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
              />

              <button
                type="button"
                onClick={addCustomExercise}
                className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-base font-semibold text-white"
              >
                Lägg till egen övning
              </button>
            </div>
          )}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>

        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Övningar i passet</h2>

          {exercises.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">
              Inga övningar tillagda ännu.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {exercises.map((exercise, index) => (
                <div key={`${exercise.id}-${index}`} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Övning {index + 1}
                      </p>
                      <h3 className="text-lg font-semibold text-gray-950">
                        {exercise.name}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeExercise(exercise.id)}
                      className="rounded-xl border px-3 py-2 text-sm font-medium text-red-600"
                    >
                      Ta bort
                    </button>
                  </div>

                  <p className="mt-2 text-sm text-gray-700">
                    {exercise.sets} set ·{" "}
                    {typeof exercise.duration === "number" && exercise.duration > 0
                      ? `${exercise.duration} sek`
                      : `${exercise.reps} reps`}{" "}
                    · Vila {exercise.rest} sek
                  </p>

                  {exercise.description ? (
                    <p className="mt-2 text-sm text-gray-500">
                      {exercise.description}
                    </p>
                  ) : null}

                  {exercise.id.startsWith("custom_") ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Egen övning · används inte lika starkt i AI-analysen som
                      katalogövningar.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-700">
                      Katalogövning · ger bättre historik för AI.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
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