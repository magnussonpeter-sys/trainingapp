"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveActiveWorkout,
  saveGeneratedWorkout,
} from "@/lib/workout-storage";
import {
  generateWorkout,
  type GenerateWorkoutDebug,
} from "@/lib/workout-generator";
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

export default function WorkoutPreviewPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [newExerciseName, setNewExerciseName] = useState("");
  const [newSets, setNewSets] = useState("3");
  const [newReps, setNewReps] = useState("10");
  const [newRest, setNewRest] = useState("45");
  const [newDescription, setNewDescription] = useState("");

  const [aiDebug, setAiDebug] = useState<GenerateWorkoutDebug | null>(null);
  const [requestEquipment, setRequestEquipment] = useState<string[]>([]);
  const [requestPayload, setRequestPayload] = useState<Record<string, unknown> | null>(
    null
  );

  useEffect(() => {
    async function loadAndGenerate() {
      try {
        setAiError(null);
        setAiDebug(null);

        // Läs query-parametrar tidigt så vi kan använda dem som fallback.
        const params = new URLSearchParams(window.location.search);
        const durationFromUrl = Number(params.get("duration"));
        const gymIdFromUrl = params.get("gymId") ?? "";
        const gymModeFromUrl = params.get("gymMode") ?? "";
        const userIdFromUrl = params.get("userId") ?? "";

        const duration =
          Number.isFinite(durationFromUrl) && durationFromUrl > 0
            ? durationFromUrl
            : 30;

        // Viktigt för Safari/iPhone: auth-request ska skicka med credentials.
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
          "ok" in authData &&
          (authData as { ok?: unknown }).ok &&
          "user" in authData
            ? ((authData as { user?: AuthUser }).user ?? null)
            : null;

        // Använd auth-användaren om den finns, annars fallback till userId från query.
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
          // Minimal fallback-användare så att sidan kan fortsätta även om Safari bråkar
          // med auth-kontrollen men userId redan skickats från /home.
          setAuthUser({
            id: Number(resolvedUserId),
            email: null,
            username: null,
          });
        }

        setAuthChecked(true);

        let goal: Goal = "strength";

        try {
          // User settings hämtas med credentials för bättre Safari-stöd.
          const settingsRes = await fetch(
            `/api/user-settings?userId=${encodeURIComponent(resolvedUserId)}`,
            {
              cache: "no-store",
              credentials: "include",
            }
          );

          const settingsData =
            (await settingsRes.json()) as UserSettingsResponse;

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
            `/api/gyms/${encodeURIComponent(gymIdFromUrl)}?userId=${encodeURIComponent(
              resolvedUserId
            )}`,
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

              if (gym.equipment.length > 0) {
                equipment = gym.equipment;
              } else {
                equipment = ["bodyweight"];
              }
            }
          }
        }

        setRequestEquipment(equipment);

        // Spara payload lokalt för debug även om generateWorkout skulle kasta fel
        // innan debug-data hunnit komma tillbaka från API.
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

        console.log("Preview generate payload:", payload);

        setIsGeneratingAi(true);
        setAiError(null);

        const result = await generateWorkout({
          userId: resolvedUserId,
          goal,
          durationMinutes: duration,
          equipment,
        });

        setAiDebug(result.debug ?? null);

        console.log("Workout generate input equipment:", equipment);
        console.log("Workout generate debug:", result.debug);

        const aiWorkout = result.workout;

        const normalizedWorkout: Workout = {
          id: createExerciseId(),
          name: aiWorkout.name || "AI-genererat pass",
          duration,
          gym: getWorkoutGymLabel(gymName, equipment),
          // Kort kommentar från AI visas ovanför övningslistan i preview.
          aiComment:
            typeof aiWorkout.aiComment === "string" && aiWorkout.aiComment.trim()
              ? aiWorkout.aiComment.trim()
              : undefined,
          exercises: Array.isArray(aiWorkout.exercises)
            ? aiWorkout.exercises.map(
                (exercise: Partial<Exercise>, index: number) => {
                  const hasDuration =
                    typeof exercise.duration === "number" &&
                    exercise.duration > 0;

                  const hasReps =
                    typeof exercise.reps === "number" && exercise.reps > 0;

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
                    // Tidsstyrda övningar ska inte få default-reps.
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
                }
              )
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

  function saveUpdatedWorkout(updatedWorkout: Workout) {
    setWorkout(updatedWorkout);

    if (authUser) {
      saveGeneratedWorkout(String(authUser.id), updatedWorkout);
    }
  }

  function removeExercise(exerciseId: string) {
    if (!workout) return;

    const updatedWorkout: Workout = {
      ...workout,
      exercises: workout.exercises.filter(
        (exercise) => exercise.id !== exerciseId
      ),
    };

    saveUpdatedWorkout(updatedWorkout);
  }

  function addExercise() {
    if (!workout) return;
    if (!newExerciseName.trim()) return;

    const exercise: Exercise = {
      id: createExerciseId(),
      name: newExerciseName.trim(),
      sets: Number(newSets) || 3,
      reps: Number(newReps) || 10,
      rest: Number(newRest) || 45,
      description: newDescription.trim() || undefined,
    };

    const updatedWorkout: Workout = {
      ...workout,
      exercises: [...workout.exercises, exercise],
    };

    saveUpdatedWorkout(updatedWorkout);

    setNewExerciseName("");
    setNewSets("3");
    setNewReps("10");
    setNewRest("45");
    setNewDescription("");
  }

  function startWorkout() {
    if (!workout || !authUser) return;

    saveActiveWorkout(String(authUser.id), workout);
    router.push("/workout/run");
  }

  const debugAiInput =
    aiDebug && typeof aiDebug.aiInput === "object" && aiDebug.aiInput !== null
      ? aiDebug.aiInput
      : null;

  const debugNormalizedEquipment: unknown[] =
    debugAiInput &&
    typeof debugAiInput === "object" &&
    "normalizedEquipment" in debugAiInput &&
    Array.isArray((debugAiInput as Record<string, unknown>).normalizedEquipment)
      ? ((debugAiInput as Record<string, unknown>)
          .normalizedEquipment as unknown[])
      : [];

  const debugAvailableCatalog: unknown[] =
    debugAiInput &&
    typeof debugAiInput === "object" &&
    "availableCatalog" in debugAiInput &&
    Array.isArray((debugAiInput as Record<string, unknown>).availableCatalog)
      ? ((debugAiInput as Record<string, unknown>)
          .availableCatalog as unknown[])
      : [];

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col p-4 pb-32">
        {!authChecked ? (
          <div className="flex min-h-screen items-center justify-center p-6">
            <p className="text-sm text-gray-600">Laddar...</p>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <h1 className="text-2xl font-bold tracking-tight text-gray-950">
                Föreslaget AI-pass
              </h1>

              {isGeneratingAi ? (
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-600">Genererar AI-pass...</p>
                </div>
              ) : null}

              {aiError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                  <p className="text-sm text-red-700">{aiError}</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-amber-900">Debug AI</h2>

                <div className="mt-3 space-y-3 text-xs text-amber-950">
                  <div>
                    <p className="font-medium">Payload som preview försöker skicka</p>
                    <pre className="mt-1 overflow-x-auto rounded-xl bg-white p-3 text-[11px]">
{formatJson(requestPayload)}
                    </pre>
                  </div>

                  <div>
                    <p className="font-medium">Utrustning som preview skickar</p>
                    <pre className="mt-1 overflow-x-auto rounded-xl bg-white p-3 text-[11px]">
{formatJson(requestEquipment)}
                    </pre>
                  </div>

                  <div>
                    <p className="font-medium">Normaliserad utrustning i generate</p>
                    <pre className="mt-1 overflow-x-auto rounded-xl bg-white p-3 text-[11px]">
{formatJson(debugNormalizedEquipment)}
                    </pre>
                  </div>

                  <div>
                    <p className="font-medium">
                      Antal tillåtna katalogövningar i generate
                    </p>
                    <div className="mt-1 rounded-xl bg-white p-3 text-[11px]">
                      {debugAvailableCatalog.length}
                    </div>
                  </div>

                  <details className="rounded-xl bg-white p-3">
                    <summary className="cursor-pointer font-medium">
                      Visa hela aiInput
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto text-[11px]">
{formatJson(aiDebug?.aiInput ?? null)}
                    </pre>
                  </details>

                  <details className="rounded-xl bg-white p-3">
                    <summary className="cursor-pointer font-medium">
                      Visa hela prompten till OpenAI
                    </summary>
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-[11px]">
{typeof aiDebug?.prompt === "string" ? aiDebug.prompt : ""}
                    </pre>
                  </details>

                  <details className="rounded-xl bg-white p-3">
                    <summary className="cursor-pointer font-medium">
                      Visa råtext från OpenAI
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px]">
{typeof aiDebug?.rawAiText === "string" ? aiDebug.rawAiText : ""}
                    </pre>
                  </details>

                  <details className="rounded-xl bg-white p-3">
                    <summary className="cursor-pointer font-medium">
                      Visa parsat AI-svar
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto text-[11px]">
{formatJson(aiDebug?.parsedAiResponse ?? null)}
                    </pre>
                  </details>

                  <details className="rounded-xl bg-white p-3">
                    <summary className="cursor-pointer font-medium">
                      Visa normaliserat workout-resultat
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto text-[11px]">
{formatJson(aiDebug?.normalizedWorkout ?? null)}
                    </pre>
                  </details>
                </div>
              </div>

              {!isGeneratingAi && !aiError && workout ? (
                <>
                  {workout.aiComment ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                      <p className="text-sm font-semibold text-blue-900">
                        Dagens kommentar från AI
                      </p>
                      <p className="mt-2 text-sm leading-6 text-blue-950">
                        {workout.aiComment}
                      </p>
                    </div>
                  ) : null}

                  {workout.exercises.map((exercise, index) => (
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

                        {typeof exercise.duration === "number" &&
                        exercise.duration > 0 ? (
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            {exercise.duration} sek
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            {exercise.reps} reps
                          </span>
                        )}

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
                  ))}
                </>
              ) : null}
            </section>

            {workout ? (
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

                  <button
                    type="button"
                    onClick={addExercise}
                    className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-base font-semibold text-white"
                  >
                    Lägg till övning
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}
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