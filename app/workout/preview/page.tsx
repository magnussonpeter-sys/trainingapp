// app/workout/preview/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveActiveWorkout,
  saveGeneratedWorkout,
} from "@/lib/workout-storage";
import {
  generateWorkout,
  type GenerateWorkoutDebug,
} from "@/lib/workout-generator";
import {
  getAvailableExercises,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import type { Exercise, Workout } from "@/types/workout";

type Goal = "strength" | "hypertrophy" | "health" | "body_composition";

type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
};

type GymEquipmentItem = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  name?: string | null;
  type?: string | null;
};

type Gym = {
  id: string | number;
  name: string;
  equipment: string[];
};

type UserSettingsResponse = {
  ok?: boolean;
  settings?: {
    training_goal?: Goal | null;
  } | null;
  error?: string;
};

type DebugValidationEntry = {
  selectedName?: string;
  reason?: string;
};

type DebugValidation = {
  warnings?: string[];
  replacements?: DebugValidationEntry[];
};

const BODYWEIGHT_GYM_MODE = "bodyweight";

function isGoal(value: unknown): value is Goal {
  return (
    value === "strength" ||
    value === "hypertrophy" ||
    value === "health" ||
    value === "body_composition"
  );
}

function createExerciseId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function extractEquipmentStrings(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const values = new Set<string>();

  for (const item of input) {
    if (typeof item === "string") {
      const trimmed = item.trim();

      if (trimmed) {
        values.add(trimmed);
      }

      continue;
    }

    if (typeof item === "object" && item !== null) {
      const equipmentItem = item as GymEquipmentItem;

      const candidates = [
        equipmentItem.equipment_type,
        equipmentItem.equipmentType,
        equipmentItem.label,
        equipmentItem.name,
        equipmentItem.type,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === "string") {
          const trimmed = candidate.trim();

          if (trimmed) {
            values.add(trimmed);
          }
        }
      }
    }
  }

  return Array.from(values);
}

function normalizeGym(data: unknown): Gym | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (
    "id" in data &&
    "name" in data &&
    (typeof (data as { id: unknown }).id === "string" ||
      typeof (data as { id: unknown }).id === "number") &&
    typeof (data as { name: unknown }).name === "string"
  ) {
    const gym = data as {
      id: string | number;
      name: string;
      equipment?: unknown;
    };

    return {
      id: gym.id,
      name: gym.name,
      equipment: extractEquipmentStrings(gym.equipment),
    };
  }

  if ("gym" in data) {
    return normalizeGym((data as { gym?: unknown }).gym);
  }

  return null;
}

function getWorkoutGymLabel(gymName: string, equipment: string[]) {
  if (gymName.trim()) {
    return gymName.trim();
  }

  if (equipment.length > 0) {
    return equipment.join(", ");
  }

  return "Kroppsvikt / utan gym";
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
    id: item.id,
    name: item.name,
    sets: item.defaultSets,
    reps: isTimed ? undefined : item.defaultReps ?? 10,
    duration: isTimed ? item.defaultDuration : undefined,
    rest: item.defaultRest,
    description: item.description,
  };
}

function createCustomExercise(params: {
  name: string;
  sets: string;
  reps: string;
  duration: string;
  rest: string;
  description: string;
}) {
  const parsedSets = Math.max(1, Number(params.sets) || 3);
  const parsedReps = Math.max(0, Number(params.reps) || 0);
  const parsedDuration = Math.max(0, Number(params.duration) || 0);
  const parsedRest = Math.max(0, Number(params.rest) || 45);

  return {
    id: `custom_${createExerciseId()}`,
    name: params.name.trim(),
    sets: parsedSets,
    reps: parsedDuration > 0 ? undefined : parsedReps || 10,
    duration: parsedDuration > 0 ? parsedDuration : undefined,
    rest: parsedRest,
    description: params.description.trim() || undefined,
  } satisfies Exercise;
}

export default function WorkoutPreviewPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [aiDebug, setAiDebug] = useState<GenerateWorkoutDebug | null>(null);
  const [requestEquipment, setRequestEquipment] = useState<string[]>([]);
  const [requestPayload, setRequestPayload] = useState<Record<string, unknown> | null>(
    null
  );

  // För katalogval i stället för fritext som huvudspår.
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addMode, setAddMode] = useState<"catalog" | "custom">("catalog");
  const [catalogSearch, setCatalogSearch] = useState("");

  // Fritext finns kvar som undantag.
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newSets, setNewSets] = useState("3");
  const [newReps, setNewReps] = useState("10");
  const [newDuration, setNewDuration] = useState("");
  const [newRest, setNewRest] = useState("45");
  const [newDescription, setNewDescription] = useState("");

  // Små debug-toggles.
  const [showPrompt, setShowPrompt] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [showNormalizedWorkout, setShowNormalizedWorkout] = useState(false);

  useEffect(() => {
    async function loadAndGenerate() {
      try {
        setAiError(null);
        setAiDebug(null);

        const params = new URLSearchParams(window.location.search);
        const durationFromUrl = Number(params.get("duration"));
        const gymIdFromUrl = params.get("gymId") ?? "";
        const gymModeFromUrl = params.get("gymMode") ?? "";
        const userIdFromUrl = params.get("userId") ?? "";

        const duration =
          Number.isFinite(durationFromUrl) && durationFromUrl > 0
            ? durationFromUrl
            : 30;

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

const authUserFromApi =
  authRes.ok &&
  typeof authData === "object" &&
  authData !== null &&
  "user" in authData
    ? ((authData as { user?: AuthUser }).user ?? null)
    : null;

        const resolvedUserId =
          authUserFromApi?.id != null
            ? String(authUserFromApi.id)
            : userIdFromUrl.trim()
            ? userIdFromUrl.trim()
            : "";

        if (!resolvedUserId) {
          setAiError("Kunde inte identifiera användaren. Gå tillbaka och försök igen.");
          setAuthChecked(true);
          return;
        }

        if (authUserFromApi) {
          setAuthUser(authUserFromApi);
        } else {
          setAuthUser({
            id: Number(resolvedUserId),
            email: null,
            username: null,
          });
        }

        setAuthChecked(true);

        let goal: Goal = "strength";

        try {
          const settingsRes = await fetch(
            `/api/user-settings?userId=${encodeURIComponent(resolvedUserId)}`,
            {
              cache: "no-store",
              credentials: "include",
            }
          );

          const settingsData = (await settingsRes.json()) as UserSettingsResponse;

          if (
            settingsRes.ok &&
            settingsData?.ok &&
            isGoal(settingsData.settings?.training_goal)
          ) {
            goal = settingsData.settings.training_goal;
          }
        } catch (error) {
          console.error("Kunde inte hämta user settings:", error);
        }

        let gymName = "";
        let equipment: string[] = ["bodyweight"];

        if (gymModeFromUrl === BODYWEIGHT_GYM_MODE) {
          gymName = "Kroppsvikt / utan gym";
          equipment = ["bodyweight"];
        } else if (gymIdFromUrl) {
          const gymRes = await fetch(
            `/api/gyms/${encodeURIComponent(
              gymIdFromUrl
            )}?userId=${encodeURIComponent(resolvedUserId)}`,
            {
              cache: "no-store",
              credentials: "include",
            }
          );

          let gymData: unknown = null;

          try {
            gymData = await gymRes.json();
          } catch {
            gymData = null;
          }

          if (gymRes.ok) {
            const gym = normalizeGym(gymData);

            if (gym) {
              gymName = gym.name;
              equipment = gym.equipment.length > 0 ? gym.equipment : ["bodyweight"];
            }
          }
        }

        setRequestEquipment(equipment);

        const payload = {
          userId: resolvedUserId,
          goal,
          durationMinutes: duration,
          equipment,
          gymIdFromUrl,
          gymModeFromUrl,
          userIdFromUrl,
          authUserId: authUserFromApi?.id ?? null,
        };

        setRequestPayload(payload);

        setIsGeneratingAi(true);
        setAiError(null);

        const result = await generateWorkout({
          userId: resolvedUserId,
          goal,
          durationMinutes: duration,
          equipment,
        });

        setAiDebug(result.debug ?? null);

        const aiWorkout = result.workout;

        const normalizedWorkout: Workout = {
          id: createExerciseId(),
          name: aiWorkout.name || "AI-genererat pass",
          duration,
          gym: getWorkoutGymLabel(gymName, equipment),
          aiComment:
            typeof aiWorkout.aiComment === "string" && aiWorkout.aiComment.trim()
              ? aiWorkout.aiComment.trim()
              : undefined,
          exercises: Array.isArray(aiWorkout.exercises)
            ? aiWorkout.exercises.map((exercise: Partial<Exercise>, index: number) => {
                const hasDuration =
                  typeof exercise.duration === "number" && exercise.duration > 0;
                const hasReps = typeof exercise.reps === "number" && exercise.reps > 0;

                return {
                  id:
                    typeof exercise.id === "string" && exercise.id.trim()
                      ? exercise.id
                      : `exercise-${index + 1}`,
                  name:
                    typeof exercise.name === "string" && exercise.name.trim()
                      ? exercise.name
                      : `Övning ${index + 1}`,
                  sets:
                    typeof exercise.sets === "number" && exercise.sets > 0
                      ? exercise.sets
                      : 3,
                  reps: hasDuration ? undefined : hasReps ? exercise.reps : 10,
                  duration: hasDuration ? exercise.duration : undefined,
                  rest:
                    typeof exercise.rest === "number" && exercise.rest >= 0
                      ? exercise.rest
                      : 60,
                  description:
                    typeof exercise.description === "string" &&
                    exercise.description.trim()
                      ? exercise.description.trim()
                      : undefined,
                };
              })
            : [],
        };

        saveGeneratedWorkout(resolvedUserId, normalizedWorkout);
        setWorkout(normalizedWorkout);
      } catch (error) {
        console.error("Kunde inte generera AI-pass i preview:", error);
        setAiError(
          error instanceof Error ? error.message : "Kunde inte generera AI-pass."
        );
      } finally {
        setIsGeneratingAi(false);
        setAuthChecked(true);
      }
    }

    void loadAndGenerate();
  }, [router]);

  const availableCatalogExercises = useMemo(() => {
    if (requestEquipment.length === 0) {
      return getAvailableExercises(["bodyweight"]);
    }

    return getAvailableExercises(requestEquipment);
  }, [requestEquipment]);

  const filteredCatalogExercises = useMemo(() => {
    const search = normalizeSearch(catalogSearch);

    if (!search) {
      return availableCatalogExercises.slice(0, 80);
    }

    return availableCatalogExercises.filter((exercise) => {
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
  }, [availableCatalogExercises, catalogSearch]);

  const validation =
    aiDebug && typeof aiDebug.validation === "object" && aiDebug.validation !== null
      ? (aiDebug.validation as DebugValidation)
      : null;

  function saveUpdatedWorkout(updatedWorkout: Workout) {
    setWorkout(updatedWorkout);

    if (authUser) {
      saveGeneratedWorkout(String(authUser.id), updatedWorkout);
    }
  }

  function removeExercise(exerciseId: string) {
    if (!workout) {
      return;
    }

    const updatedWorkout: Workout = {
      ...workout,
      exercises: workout.exercises.filter((exercise) => exercise.id !== exerciseId),
    };

    saveUpdatedWorkout(updatedWorkout);
  }

  function addCatalogExercise(item: ExerciseCatalogItem) {
    if (!workout) {
      return;
    }

    const alreadyExists = workout.exercises.some((exercise) => exercise.id === item.id);

    if (alreadyExists) {
      setAiError("Övningen finns redan i passet.");
      return;
    }

    const updatedWorkout: Workout = {
      ...workout,
      exercises: [...workout.exercises, createExerciseFromCatalog(item)],
    };

    saveUpdatedWorkout(updatedWorkout);
    setAiError(null);
    setShowAddPanel(false);
    setCatalogSearch("");
  }

  function addCustomExercise() {
    if (!workout) {
      return;
    }

    if (!newExerciseName.trim()) {
      setAiError("Ange namn på övningen.");
      return;
    }

    const customExercise = createCustomExercise({
      name: newExerciseName,
      sets: newSets,
      reps: newReps,
      duration: newDuration,
      rest: newRest,
      description: newDescription,
    });

    const updatedWorkout: Workout = {
      ...workout,
      exercises: [...workout.exercises, customExercise],
    };

    saveUpdatedWorkout(updatedWorkout);

    setNewExerciseName("");
    setNewSets("3");
    setNewReps("10");
    setNewDuration("");
    setNewRest("45");
    setNewDescription("");
    setAiError(null);
    setShowAddPanel(false);
  }

  function startWorkout() {
    if (!workout || !authUser) {
      return;
    }

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
          <p className="text-sm text-gray-500">Förhandsvisning</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
            Föreslaget AI-pass
          </h1>

          {isGeneratingAi ? (
            <p className="mt-3 rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Genererar AI-pass...
            </p>
          ) : null}

          {aiError ? (
            <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {aiError}
            </p>
          ) : null}

          <p className="mt-3 text-sm text-gray-600">
            När du lägger till övningar används biblioteket som huvudspår för bättre
            AI-historik. Egen fritext finns kvar som reserv.
          </p>
        </section>

        {validation?.warnings && validation.warnings.length > 0 ? (
          <section className="mt-4 rounded-3xl border bg-yellow-50 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-yellow-900">AI-varningar</h2>
            <div className="mt-3 space-y-2">
              {validation.warnings.map((warning, index) => (
                <p key={`${warning}-${index}`} className="text-sm text-yellow-800">
                  {warning}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {workout?.aiComment ? (
          <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">
              Dagens kommentar från AI
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              {workout.aiComment}
            </p>
          </section>
        ) : null}

        {workout ? (
          <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">Pass</p>
                <h2 className="text-xl font-semibold text-gray-950">{workout.name}</h2>
              </div>

              <div className="text-right text-sm text-gray-500">
                <p>{workout.duration} min</p>
                <p>{workout.exercises.length} övningar</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {workout.exercises.map((exercise, index) => (
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
                      Egen övning · mindre användbar för AI än katalogövningar.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-700">
                      Katalogövning · bättre för AI-historik.
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAddPanel((prev) => !prev);
                setAiError(null);
              }}
              className="mt-4 w-full rounded-2xl border px-4 py-3 text-base font-semibold text-gray-900"
            >
              {showAddPanel ? "Stäng lägg till övning" : "Lägg till övning"}
            </button>
          </section>
        ) : null}

        {showAddPanel && workout ? (
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
                Bibliotek
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
                Egen övning
              </button>
            </div>

            {addMode === "catalog" ? (
              <div className="mt-4">
                <input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Sök övning som passar vald utrustning"
                  className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                />

                <p className="mt-2 text-xs text-gray-500">
                  Biblioteket är filtrerat utifrån vald utrustning i passet.
                </p>

                <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {filteredCatalogExercises.map((exercise) => {
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

                  {filteredCatalogExercises.length === 0 ? (
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
          </section>
        ) : null}

        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Rå debug</h2>

          {requestPayload ? (
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100">
              {formatJson(requestPayload)}
            </pre>
          ) : null}

          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => setShowPrompt((prev) => !prev)}
              className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium"
            >
              {showPrompt ? "Dölj" : "Visa"} prompt
            </button>

            {showPrompt ? (
              <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100 whitespace-pre-wrap">
                {typeof aiDebug?.prompt === "string" ? aiDebug.prompt : ""}
              </pre>
            ) : null}

            <button
              type="button"
              onClick={() => setShowRawResponse((prev) => !prev)}
              className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium"
            >
              {showRawResponse ? "Dölj" : "Visa"} rått AI-svar
            </button>

            {showRawResponse ? (
              <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100 whitespace-pre-wrap">
                {typeof aiDebug?.rawAiText === "string" ? aiDebug.rawAiText : ""}
              </pre>
            ) : null}

            <button
              type="button"
              onClick={() => setShowNormalizedWorkout((prev) => !prev)}
              className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium"
            >
              {showNormalizedWorkout ? "Dölj" : "Visa"} normaliserat resultat
            </button>

            {showNormalizedWorkout ? (
              <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100">
                {formatJson(aiDebug?.normalizedWorkout ?? null)}
              </pre>
            ) : null}
          </div>

          {validation?.replacements && validation.replacements.length > 0 ? (
            <div className="mt-4 rounded-2xl bg-yellow-50 p-4">
              <h3 className="text-sm font-semibold text-yellow-900">
                Ersättningar i validering
              </h3>

              <div className="mt-2 space-y-2">
                {validation.replacements.map((item, index) => (
                  <p key={`${item.selectedName}-${index}`} className="text-sm text-yellow-800">
                    {item.selectedName ?? "Övning"} · {item.reason ?? "Ersatt"}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md gap-3 p-4">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="flex-1 rounded-2xl border px-4 py-3 text-base font-semibold"
          >
            Tillbaka
          </button>

          <button
            type="button"
            onClick={startWorkout}
            disabled={!workout || workout.exercises.length === 0}
            className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            Starta pass
          </button>
        </div>
      </div>
    </main>
  );
}