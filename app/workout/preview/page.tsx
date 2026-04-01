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

type DebugScoreBreakdown = {
  goal?: number;
  feedback?: number;
  adherence?: number;
  novelty?: number;
  recovery?: number;
  preferenceAdjustment?: number;
  repetitionPenalty?: number;
  riskPenalty?: number;
};

type DebugCandidateHistory = {
  completedCount?: number;
  recent7dCount?: number;
  recent14dCount?: number;
  avgRating?: number | null;
  avgExtraReps?: number | null;
  lastCompletedAt?: string | null;
  lastWeight?: number | null;
  lastReps?: number | null;
};

type DebugScoredCandidate = {
  id: string;
  name: string;
  movementPattern?: string;
  score?: number;
  riskLevel?: string;
  reasonSummary?: string[];
  requiredEquipment?: string[];
  primaryMuscles?: string[];
  scoreBreakdown?: DebugScoreBreakdown;
  history?: DebugCandidateHistory;
};

type DebugValidationEntry = {
  requestedId?: string | null;
  requestedName?: string | null;
  requestedMovementPattern?: string | null;
  selectedId?: string;
  selectedName?: string;
  reasonCode?: string;
  reason?: string;
};

type DebugCandidateSelection = {
  totalAvailableCount?: number;
  promptCandidateIds?: string[];
  scoredCandidates?: DebugScoredCandidate[];
};

type DebugValidation = {
  acceptedDirectly?: DebugValidationEntry[];
  replacements?: DebugValidationEntry[];
  fills?: DebugValidationEntry[];
  warnings?: string[];
  finalExerciseIds?: string[];
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

function formatNumber(value: unknown, decimals = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "–";
  }

  return value.toFixed(decimals);
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "–";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleString("sv-SE");
}

function getScoreBadgeClass(score: number | undefined) {
  if (typeof score !== "number") {
    return "bg-gray-100 text-gray-700";
  }

  if (score >= 4) {
    return "bg-green-100 text-green-800";
  }

  if (score >= 2) {
    return "bg-blue-100 text-blue-800";
  }

  if (score >= 0) {
    return "bg-yellow-100 text-yellow-800";
  }

  return "bg-red-100 text-red-800";
}

function getReasonCodeLabel(code: string | undefined) {
  switch (code) {
    case "accepted_exact_match":
      return "Accepterad";
    case "invalid_or_missing_id":
      return "Ogiltigt id";
    case "duplicate_exercise_id":
      return "Duplicerad övning";
    case "balance_adjustment":
      return "Balansjustering";
    case "filled_missing_slots":
      return "Påfylld reservövning";
    case "empty_ai_response":
      return "Tomt AI-val";
    default:
      return code ?? "Okänd";
  }
}

function InfoCard(props: {
  title: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {props.title}
      </p>
      <p className="mt-2 text-xl font-semibold text-gray-950">{props.value}</p>
      {props.subtext ? (
        <p className="mt-1 text-sm text-gray-500">{props.subtext}</p>
      ) : null}
    </div>
  );
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

  // Små toggles så debuggen blir användbar även på iPhone.
  const [showRawInput, setShowRawInput] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [showParsedResponse, setShowParsedResponse] = useState(false);
  const [showNormalizedWorkout, setShowNormalizedWorkout] = useState(false);

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
          // Minimal fallback-användare för Safari om auth-checken krånglar.
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

        // Spara payload lokalt för debug även om generateWorkout kastar tidigt.
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

          // Kort kommentar från AI visas ovanför övningslistan i preview.
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

  function addExercise() {
    if (!workout || !newExerciseName.trim()) {
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
    if (!workout || !authUser) {
      return;
    }

    saveActiveWorkout(String(authUser.id), workout);
    router.push("/workout/run");
  }

  const debugAiInput =
    aiDebug && typeof aiDebug.aiInput === "object" && aiDebug.aiInput !== null
      ? (aiDebug.aiInput as Record<string, unknown>)
      : null;

  const debugNormalizedEquipment = Array.isArray(
    debugAiInput?.normalizedEquipment
  )
    ? (debugAiInput?.normalizedEquipment as unknown[])
    : [];

  const debugAvailableCatalog = Array.isArray(debugAiInput?.availableCatalog)
    ? (debugAiInput?.availableCatalog as unknown[])
    : [];

  const debugCandidateSelection =
    aiDebug &&
    typeof aiDebug.candidateSelection === "object" &&
    aiDebug.candidateSelection !== null
      ? (aiDebug.candidateSelection as DebugCandidateSelection)
      : null;

  const debugValidation =
    aiDebug && typeof aiDebug.validation === "object" && aiDebug.validation !== null
      ? (aiDebug.validation as DebugValidation)
      : null;

  const scoredCandidates = useMemo(() => {
    if (!Array.isArray(debugCandidateSelection?.scoredCandidates)) {
      return [];
    }

    return debugCandidateSelection.scoredCandidates.slice(0, 12);
  }, [debugCandidateSelection]);

  const validationWarnings = Array.isArray(debugValidation?.warnings)
    ? debugValidation.warnings
    : [];

  const acceptedDirectly = Array.isArray(debugValidation?.acceptedDirectly)
    ? debugValidation.acceptedDirectly
    : [];

  const replacements = Array.isArray(debugValidation?.replacements)
    ? debugValidation.replacements
    : [];

  const fills = Array.isArray(debugValidation?.fills) ? debugValidation.fills : [];

  const promptCandidateCount = Array.isArray(debugCandidateSelection?.promptCandidateIds)
    ? debugCandidateSelection?.promptCandidateIds?.length ?? 0
    : 0;

  return (
    <main className="min-h-screen bg-gray-50 pb-28">
      <div className="mx-auto w-full max-w-md px-4 py-6">
        {!authChecked ? (
          <div className="rounded-2xl border bg-white p-5 text-sm text-gray-600">
            Laddar...
          </div>
        ) : (
          <>
            <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
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
            </section>

            <section className="mb-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoCard
                  title="Katalogövningar"
                  value={String(debugAvailableCatalog.length)}
                  subtext="Övningar efter utrustningsfilter"
                />
                <InfoCard
                  title="Promptkandidater"
                  value={String(promptCandidateCount)}
                  subtext="Övningar som skickades till AI"
                />
                <InfoCard
                  title="Ersättningar"
                  value={String(replacements.length)}
                  subtext="AI-val som byttes ut"
                />
                <InfoCard
                  title="Warnings"
                  value={String(validationWarnings.length)}
                  subtext="Valideringsvarningar"
                />
              </div>
            </section>

            <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Debugöversikt</h2>
                  <p className="text-sm text-gray-500">
                    Snabb koll på input, scoring och validering.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="font-medium text-gray-900">Payload från preview</p>
                  <p className="mt-1 text-gray-600">
                    UserId: {String(requestPayload?.userId ?? "–")} · Mål:{" "}
                    {String(requestPayload?.goal ?? "–")} · Längd:{" "}
                    {String(requestPayload?.durationMinutes ?? "–")} min
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="font-medium text-gray-900">Utrustning</p>
                  <p className="mt-1 text-gray-600">
                    {requestEquipment.length > 0
                      ? requestEquipment.join(", ")
                      : "Ingen utrustning skickad"}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    Normaliserad:{" "}
                    {debugNormalizedEquipment.length > 0
                      ? debugNormalizedEquipment.join(", ")
                      : "–"}
                  </p>
                </div>

                {validationWarnings.length > 0 ? (
                  <div className="rounded-2xl bg-yellow-50 p-3">
                    <p className="font-medium text-yellow-900">Warnings</p>
                    <div className="mt-2 space-y-2">
                      {validationWarnings.map((warning, index) => (
                        <p key={`${warning}-${index}`} className="text-yellow-800">
                          {warning}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">
                    Topprankade kandidater
                  </h2>
                  <p className="text-sm text-gray-500">
                    De kandidater som hade bäst score innan AI byggde passet.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {scoredCandidates.length === 0 ? (
                  <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">
                    Ingen scoring att visa ännu.
                  </p>
                ) : (
                  scoredCandidates.map((candidate, index) => (
                    <div
                      key={`${candidate.id}-${index}`}
                      className="rounded-2xl border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Kandidat {index + 1}
                          </p>
                          <h3 className="text-base font-semibold text-gray-950">
                            {candidate.name}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {candidate.movementPattern ?? "okänt rörelsemönster"}
                            {candidate.riskLevel
                              ? ` · risk ${candidate.riskLevel}`
                              : ""}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-sm font-semibold ${getScoreBadgeClass(
                            candidate.score
                          )}`}
                        >
                          {formatNumber(candidate.score)}
                        </span>
                      </div>

                      {Array.isArray(candidate.reasonSummary) &&
                      candidate.reasonSummary.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {candidate.reasonSummary.map((reason, reasonIndex) => (
                            <span
                              key={`${reason}-${reasonIndex}`}
                              className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Goal
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {formatNumber(candidate.scoreBreakdown?.goal)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Feedback
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {formatNumber(candidate.scoreBreakdown?.feedback)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Novelty
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {formatNumber(candidate.scoreBreakdown?.novelty)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Recovery
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {formatNumber(candidate.scoreBreakdown?.recovery)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Repetition penalty
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {formatNumber(candidate.scoreBreakdown?.repetitionPenalty)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Risk penalty
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {formatNumber(candidate.scoreBreakdown?.riskPenalty)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Avg rating
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {formatNumber(candidate.history?.avgRating)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Avg extra reps
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {formatNumber(candidate.history?.avgExtraReps)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Senaste 7 dagar
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {String(candidate.history?.recent7dCount ?? "–")}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Senaste 14 dagar
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {String(candidate.history?.recent14dCount ?? "–")}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-gray-500">
                        Senast körd: {formatDateTime(candidate.history?.lastCompletedAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">
                Validering av AI-svar
              </h2>
              <p className="text-sm text-gray-500">
                Här ser du vilka AI-val som accepterades, byttes ut eller fylldes på.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">
                    Accepterade direkt ({acceptedDirectly.length})
                  </p>

                  {acceptedDirectly.length === 0 ? (
                    <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">
                      Inga direkta acceptar att visa.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {acceptedDirectly.map((entry, index) => (
                        <div
                          key={`accepted-${index}-${entry.selectedId ?? entry.selectedName}`}
                          className="rounded-2xl border bg-green-50 p-3"
                        >
                          <p className="font-medium text-green-900">
                            {entry.selectedName ?? "Okänd övning"}
                          </p>
                          <p className="mt-1 text-sm text-green-800">
                            {getReasonCodeLabel(entry.reasonCode)} ·{" "}
                            {entry.reason ?? "AI-valet accepterades direkt."}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">
                    Ersättningar ({replacements.length})
                  </p>

                  {replacements.length === 0 ? (
                    <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">
                      Inga ersättningar behövdes.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {replacements.map((entry, index) => (
                        <div
                          key={`replacement-${index}-${entry.selectedId ?? entry.selectedName}`}
                          className="rounded-2xl border bg-yellow-50 p-3"
                        >
                          <p className="font-medium text-yellow-900">
                            {entry.requestedName || entry.requestedId || "Okänt AI-val"} →{" "}
                            {entry.selectedName ?? "Reservövning"}
                          </p>
                          <p className="mt-1 text-sm text-yellow-800">
                            {getReasonCodeLabel(entry.reasonCode)} ·{" "}
                            {entry.reason ?? "AI-valet ersattes vid validering."}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">
                    Påfyllda reservövningar ({fills.length})
                  </p>

                  {fills.length === 0 ? (
                    <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">
                      Inga reservövningar behövde fyllas på.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {fills.map((entry, index) => (
                        <div
                          key={`fill-${index}-${entry.selectedId ?? entry.selectedName}`}
                          className="rounded-2xl border bg-blue-50 p-3"
                        >
                          <p className="font-medium text-blue-900">
                            {entry.selectedName ?? "Reservövning"}
                          </p>
                          <p className="mt-1 text-sm text-blue-800">
                            {getReasonCodeLabel(entry.reasonCode)} ·{" "}
                            {entry.reason ?? "Valideringen fyllde på passet."}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Rå debug</h2>
              <p className="text-sm text-gray-500">
                För djupfelsökning när något beter sig konstigt.
              </p>

              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowRawInput((value) => !value)}
                  className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium"
                >
                  {showRawInput ? "Dölj" : "Visa"} hela aiInput
                </button>

                {showRawInput ? (
                  <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100">
                    {formatJson(aiDebug?.aiInput ?? null)}
                  </pre>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowPrompt((value) => !value)}
                  className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium"
                >
                  {showPrompt ? "Dölj" : "Visa"} prompt till OpenAI
                </button>

                {showPrompt ? (
                  <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100 whitespace-pre-wrap">
                    {typeof aiDebug?.prompt === "string" ? aiDebug.prompt : ""}
                  </pre>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowRawResponse((value) => !value)}
                  className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium"
                >
                  {showRawResponse ? "Dölj" : "Visa"} råtext från OpenAI
                </button>

                {showRawResponse ? (
                  <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100 whitespace-pre-wrap">
                    {typeof aiDebug?.rawAiText === "string" ? aiDebug.rawAiText : ""}
                  </pre>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowParsedResponse((value) => !value)}
                  className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium"
                >
                  {showParsedResponse ? "Dölj" : "Visa"} parsat AI-svar
                </button>

                {showParsedResponse ? (
                  <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100">
                    {formatJson(aiDebug?.parsedAiResponse ?? null)}
                  </pre>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowNormalizedWorkout((value) => !value)}
                  className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium"
                >
                  {showNormalizedWorkout ? "Dölj" : "Visa"} normaliserat workout-resultat
                </button>

                {showNormalizedWorkout ? (
                  <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs text-gray-100">
                    {formatJson(aiDebug?.normalizedWorkout ?? null)}
                  </pre>
                ) : null}
              </div>
            </section>

            {!isGeneratingAi && !aiError && workout ? (
              <>
                {workout.aiComment ? (
                  <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-950">
                      Dagens kommentar från AI
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-gray-700">
                      {workout.aiComment}
                    </p>
                  </section>
                ) : null}

                <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-500">Pass</p>
                      <h2 className="text-xl font-semibold text-gray-950">
                        {workout.name}
                      </h2>
                    </div>

                    <div className="text-right text-sm text-gray-500">
                      <p>{workout.duration} min</p>
                      <p>{workout.exercises.length} övningar</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {workout.exercises.map((exercise, index) => (
                      <div
                        key={exercise.id}
                        className="rounded-2xl border p-4 shadow-sm"
                      >
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
                          {typeof exercise.duration === "number" &&
                          exercise.duration > 0
                            ? `${exercise.duration} sek`
                            : `${exercise.reps} reps`}{" "}
                          · Vila {exercise.rest} sek
                        </p>

                        {exercise.description ? (
                          <p className="mt-2 text-sm text-gray-500">
                            {exercise.description}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {workout ? (
              <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-950">
                  Lägg till övning
                </h2>

                <div className="mt-4 space-y-3">
                  <input
                    value={newExerciseName}
                    onChange={(e) => setNewExerciseName(e.target.value)}
                    placeholder="Namn på övning"
                    className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                  />

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">
                        Set
                      </label>
                      <input
                        value={newSets}
                        onChange={(e) => setNewSets(e.target.value)}
                        className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                        inputMode="numeric"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-600">
                        Reps
                      </label>
                      <input
                        value={newReps}
                        onChange={(e) => setNewReps(e.target.value)}
                        className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                        inputMode="numeric"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-600">
                        Vila
                      </label>
                      <input
                        value={newRest}
                        onChange={(e) => setNewRest(e.target.value)}
                        className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                        inputMode="numeric"
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