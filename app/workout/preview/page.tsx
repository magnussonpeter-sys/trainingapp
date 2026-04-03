"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  name?: string | null;
  displayName?: string | null;
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

// Enkel målvalidering från settings-api.
function isGoal(value: unknown): value is Goal {
  return (
    value === "strength" ||
    value === "hypertrophy" ||
    value === "health" ||
    value === "body_composition"
  );
}

// Robust id-generator för customövningar och nya pass.
function createExerciseId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

// Läser ut utrustningssträngar även om formatet varierar lite från API.
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

// Normaliserar gym-responsen från API.
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

// Visar gym på ett mänskligt sätt i passets meta.
function getWorkoutGymLabel(gymName: string, equipment: string[]) {
  if (gymName.trim()) {
    return gymName.trim();
  }

  if (equipment.length > 0) {
    return equipment.join(", ");
  }

  return "Kroppsvikt / utan gym";
}

// Hjälper debugpanelerna.
function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// Enkel söknormalisering för kataloglistan.
function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

// Gör om katalogövning till vanlig workout-övning.
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

// Skapar customövning från formuläret.
function createCustomExercise(params: {
  name: string;
  sets: string;
  reps: string;
  duration: string;
  rest: string;
  description: string;
}): Exercise {
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

// Enkel badge-stil för infochips.
function getBadgeClasses(variant: "neutral" | "accent" | "warning" | "danger") {
  switch (variant) {
    case "accent":
      return "border-indigo-100 bg-indigo-50 text-indigo-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

// Hjälper till att visa användarnamn konsekvent.
function getDisplayName(user: AuthUser | null) {
  if (!user) {
    return "Där";
  }

  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "Där"
  );
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
  const [requestPayload, setRequestPayload] = useState<Record<string, unknown> | null>(null);

  // Panel för att lägga till övningar.
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addMode, setAddMode] = useState<"catalog" | "custom">("catalog");
  const [catalogSearch, setCatalogSearch] = useState("");

  // Fritext/custom finns kvar som reservspår.
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newSets, setNewSets] = useState("3");
  const [newReps, setNewReps] = useState("10");
  const [newDuration, setNewDuration] = useState("");
  const [newRest, setNewRest] = useState("45");
  const [newDescription, setNewDescription] = useState("");

  // Debug-sektioner kan fällas ut separat.
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
          "ok" in authData &&
          (authData as { ok?: unknown }).ok &&
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
          // Fallback om auth/me av någon anledning inte levererar full user.
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

    return availableCatalogExercises
      .filter((exercise) => {
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
      })
      .slice(0, 80);
  }, [availableCatalogExercises, catalogSearch]);

  const validation =
    aiDebug && typeof aiDebug.validation === "object" && aiDebug.validation !== null
      ? (aiDebug.validation as DebugValidation)
      : null;

  const totalSets = useMemo(() => {
    if (!workout) {
      return 0;
    }

    return workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  }, [workout]);

  const timedExercisesCount = useMemo(() => {
    if (!workout) {
      return 0;
    }

    return workout.exercises.filter(
      (exercise) => typeof exercise.duration === "number" && exercise.duration > 0
    ).length;
  }, [workout]);

  const displayName = useMemo(() => getDisplayName(authUser), [authUser]);

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
      <main className="min-h-screen bg-[var(--app-page,#f4f7fb)] px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[32px] border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
              Träningsapp
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Laddar preview...
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Hämtar användardata och genererar ditt AI-pass.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#eef3f9_100%)] px-4 py-6 pb-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
              Förhandsvisning
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Gå igenom AI-passet, justera vid behov och starta när det känns rätt.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/home"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Till dashboard
            </Link>
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
                AI-pass klart
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Hej {displayName}
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Här ser du ditt föreslagna AI-pass. Du kan ta bort övningar, lägga
                till katalogövningar eller skapa en egen övning innan du startar.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                    "accent"
                  )}`}
                >
                  {isGeneratingAi ? "AI genererar pass..." : "AI-pass färdigt"}
                </div>

                {workout ? (
                  <>
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                        "neutral"
                      )}`}
                    >
                      {workout.duration} min
                    </div>
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                        "neutral"
                      )}`}
                    >
                      {workout.exercises.length} övningar
                    </div>
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                        "neutral"
                      )}`}
                    >
                      {totalSets} set
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="rounded-[28px] border border-indigo-100 bg-[linear-gradient(180deg,rgba(238,242,255,0.9),rgba(255,255,255,0.95))] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700">
                Passöverblick
              </p>

              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                {workout?.name ?? "Föreslaget AI-pass"}
              </p>

              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">Gym:</span>{" "}
                  {workout?.gym ?? "Kroppsvikt / utan gym"}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Tidsstyrda övningar:</span>{" "}
                  {timedExercisesCount}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Utrustning:</span>{" "}
                  {requestEquipment.length > 0
                    ? requestEquipment.join(", ")
                    : "bodyweight"}
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={startWorkout}
                  disabled={!workout || workout.exercises.length === 0}
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Starta pass
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddPanel((prev) => !prev);
                    setAiError(null);
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  {showAddPanel ? "Stäng lägg till övning" : "Lägg till övning"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {aiError ? (
          <div className="mb-6 rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {aiError}
          </div>
        ) : null}

        {validation?.warnings && validation.warnings.length > 0 ? (
          <section className="mb-6 rounded-[32px] border border-amber-200 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              AI-varningar
            </p>

            <div className="mt-4 space-y-3">
              {validation.warnings.map((warning, index) => (
                <div
                  key={`${warning}-${index}`}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                >
                  {warning}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
                  Pass
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Föreslaget AI-pass
                </h2>
              </div>
            </div>

            {workout?.aiComment ? (
              <div className="mt-6 rounded-[28px] border border-indigo-100 bg-indigo-50/70 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700">
                  Dagens kommentar från AI
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  {workout.aiComment}
                </p>
              </div>
            ) : null}

            {!workout && isGeneratingAi ? (
              <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 p-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  Genererar AI-pass...
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Vi bygger ett pass utifrån mål, tid och vald utrustning.
                </p>
              </div>
            ) : null}

            {workout ? (
              <div className="mt-6 space-y-4">
                {workout.exercises.map((exercise, index) => (
                  <div
                    key={exercise.id}
                    className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-500">
                          Övning {index + 1}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-900">
                          {exercise.name}
                        </h3>

                        <p className="mt-3 text-sm text-slate-700">
                          {exercise.sets} set ·{" "}
                          {typeof exercise.duration === "number" &&
                          exercise.duration > 0
                            ? `${exercise.duration} sek`
                            : `${exercise.reps} reps`}{" "}
                          · Vila {exercise.rest} sek
                        </p>

                        {exercise.description ? (
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {exercise.description}
                          </p>
                        ) : null}

                        <div className="mt-4">
                          {exercise.id.startsWith("custom_") ? (
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getBadgeClasses(
                                "warning"
                              )}`}
                            >
                              Egen övning · mindre användbar för AI än katalogövningar
                            </span>
                          ) : (
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getBadgeClasses(
                                "accent"
                              )}`}
                            >
                              Katalogövning · bättre för AI-historik
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeExercise(exercise.id)}
                        className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
                Lägg till övning
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Anpassa passet
              </h2>
            </div>

            <p className="mt-4 text-sm leading-7 text-slate-600">
              När du lägger till övningar används biblioteket som huvudspår för bättre
              AI-historik. Egen fritext finns kvar som reserv.
            </p>

            {showAddPanel && workout ? (
              <div className="mt-6">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAddMode("catalog")}
                    className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      addMode === "catalog"
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    Bibliotek
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddMode("custom")}
                    className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      addMode === "custom"
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    Egen övning
                  </button>
                </div>

                {addMode === "catalog" ? (
                  <div className="mt-5 space-y-4">
                    <input
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Sök övning som passar vald utrustning"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />

                    <p className="text-sm text-slate-500">
                      Biblioteket är filtrerat utifrån vald utrustning i passet.
                    </p>

                    <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
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
                            className="w-full rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:bg-white"
                          >
                            <h3 className="text-base font-semibold text-slate-900">
                              {exercise.name}
                            </h3>

                            <p className="mt-2 text-sm text-slate-700">
                              {exercise.defaultSets} set ·{" "}
                              {isTimed
                                ? `${exercise.defaultDuration} sek`
                                : `${exercise.defaultReps ?? 10} reps`}{" "}
                              · Vila {exercise.defaultRest} sek
                            </p>

                            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              {exercise.movementPattern}
                            </p>

                            {exercise.description ? (
                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                {exercise.description}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}

                      {filteredCatalogExercises.length === 0 ? (
                        <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-600">
                          Ingen övning matchade sökningen.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <input
                      value={newExerciseName}
                      onChange={(e) => setNewExerciseName(e.target.value)}
                      placeholder="Namn på egen övning"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-900">
                          Set
                        </label>
                        <input
                          value={newSets}
                          onChange={(e) => setNewSets(e.target.value)}
                          inputMode="numeric"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-900">
                          Vila
                        </label>
                        <input
                          value={newRest}
                          onChange={(e) => setNewRest(e.target.value)}
                          inputMode="numeric"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-900">
                          Reps
                        </label>
                        <input
                          value={newReps}
                          onChange={(e) => setNewReps(e.target.value)}
                          inputMode="numeric"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-900">
                          Tid (sek)
                        </label>
                        <input
                          value={newDuration}
                          onChange={(e) => setNewDuration(e.target.value)}
                          inputMode="numeric"
                          placeholder="Lämna tomt för reps"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                    </div>

                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Kort beskrivning"
                      rows={3}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />

                    <button
                      type="button"
                      onClick={addCustomExercise}
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-700"
                    >
                      Lägg till egen övning
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 p-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  Inga extra ändringar just nu
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Öppna panelen för att lägga till katalogövningar eller skapa en
                  egen övning.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
              Rå debug
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Debug och validering
            </h2>
          </div>

          {requestPayload ? (
            <pre className="mt-6 overflow-x-auto rounded-[24px] bg-slate-950 p-4 text-xs text-slate-100">
              {formatJson(requestPayload)}
            </pre>
          ) : null}

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => setShowPrompt((prev) => !prev)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              {showPrompt ? "Dölj" : "Visa"} prompt
            </button>

            {showPrompt ? (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-[24px] bg-slate-950 p-4 text-xs text-slate-100">
                {typeof aiDebug?.prompt === "string" ? aiDebug.prompt : ""}
              </pre>
            ) : null}

            <button
              type="button"
              onClick={() => setShowRawResponse((prev) => !prev)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              {showRawResponse ? "Dölj" : "Visa"} rått AI-svar
            </button>

            {showRawResponse ? (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-[24px] bg-slate-950 p-4 text-xs text-slate-100">
                {typeof aiDebug?.rawAiText === "string" ? aiDebug.rawAiText : ""}
              </pre>
            ) : null}

            <button
              type="button"
              onClick={() => setShowNormalizedWorkout((prev) => !prev)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              {showNormalizedWorkout ? "Dölj" : "Visa"} normaliserat resultat
            </button>

            {showNormalizedWorkout ? (
              <pre className="overflow-x-auto rounded-[24px] bg-slate-950 p-4 text-xs text-slate-100">
                {formatJson(aiDebug?.normalizedWorkout ?? null)}
              </pre>
            ) : null}
          </div>

          {validation?.replacements && validation.replacements.length > 0 ? (
            <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">
                Ersättningar i validering
              </h3>

              <div className="mt-3 space-y-2">
                {validation.replacements.map((item, index) => (
                  <p
                    key={`${item.selectedName}-${index}`}
                    className="text-sm text-amber-800"
                  >
                    {item.selectedName ?? "Övning"} · {item.reason ?? "Ersatt"}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl gap-3 p-4">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 transition hover:bg-slate-50"
          >
            Tillbaka
          </button>

          <button
            type="button"
            onClick={startWorkout}
            disabled={!workout || workout.exercises.length === 0}
            className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Starta pass
          </button>
        </div>
      </div>
    </main>
  );
}