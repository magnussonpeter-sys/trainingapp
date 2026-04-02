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
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
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
    let isMounted = true;

    async function load() {
      try {
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

        if (!isMounted) return;

        setAuthUser((authData as { user: AuthUser }).user);
        setAuthChecked(true);
      } catch {
        router.replace("/");
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
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
    setExercises((prev) =>
      prev.filter((exercise) => exercise.id !== exerciseId)
    );
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
    return <div className="p-6">Laddar...</div>;
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/home" className="text-sm font-semibold text-blue-600">
          ← Manuellt pass
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-950">Eget pass</h1>
      <p className="mt-2 text-sm text-gray-800">
        Välj helst från övningsbiblioteket för bättre AI-historik. Egen
        fritextövning finns kvar som reserv.
      </p>

      <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex gap-3">
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

            <div className="mt-4 grid gap-3">
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
                    <h3 className="font-semibold text-gray-950">
                      {exercise.name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-800">
                      {exercise.defaultSets} set ·{" "}
                      {isTimed
                        ? `${exercise.defaultDuration} sek`
                        : `${exercise.defaultReps ?? 10} reps`}{" "}
                      · Vila {exercise.defaultRest} sek
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-700">
                      {exercise.movementPattern}
                    </p>
                    <p className="mt-2 text-sm text-gray-800">
                      {exercise.description}
                    </p>
                  </button>
                );
              })}

              {filteredCatalog.length === 0 ? (
                <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
                  Ingen övning matchade sökningen.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <input
              value={newExerciseName}
              onChange={(e) => setNewExerciseName(e.target.value)}
              placeholder="Namn på egen övning"
              className="w-full rounded-xl border px-3 py-3 text-base outline-none"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Set
                </label>
                <input
                  value={newSets}
                  onChange={(e) => setNewSets(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Vila
                </label>
                <input
                  value={newRest}
                  onChange={(e) => setNewRest(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Reps
                </label>
                <input
                  value={newReps}
                  onChange={(e) => setNewReps(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
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
        <h2 className="text-lg font-semibold text-gray-950">
          Övningar i passet
        </h2>

        {exercises.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
            Inga övningar tillagda ännu.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {exercises.map((exercise) => (
              <div
                key={exercise.id}
                className="rounded-2xl border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950">
                      {exercise.name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-800">
                      {exercise.sets} set ·{" "}
                      {typeof exercise.duration === "number" &&
                      exercise.duration > 0
                        ? `${exercise.duration} sek`
                        : `${exercise.reps ?? 10} reps`}{" "}
                      · Vila {exercise.rest} sek
                    </p>
                    {exercise.description ? (
                      <p className="mt-2 text-sm text-gray-800">
                        {exercise.description}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeExercise(exercise.id)}
                    className="rounded-xl border px-3 py-2 text-sm font-medium text-gray-900"
                  >
                    Ta bort
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Link
            href="/home"
            className="rounded-2xl border border-gray-200 px-5 py-3 font-semibold text-gray-900"
          >
            Tillbaka
          </Link>

          <button
            type="button"
            onClick={startWorkout}
            className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white"
          >
            Starta pass
          </button>
        </div>
      </section>
    </main>
  );
}