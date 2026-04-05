"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AppLayout from "@/components/layout/AppLayout";
import { generateWorkout } from "@/lib/workout-generator";
import {
  getWorkoutLogs,
  saveActiveWorkout,
  saveGeneratedWorkout,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import type { Exercise, Workout } from "@/types/workout";

type Goal = "strength" | "hypertrophy" | "health" | "body_composition";

type AuthUser = {
  id: number | string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  displayName?: string | null;
  role?: "user" | "admin";
  status?: "active" | "disabled";
};

type Gym = {
  id: string | number;
  name: string;
};

type UserSettings = {
  training_goal?: Goal | null;
};

type GymEquipmentItem = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  name?: string | null;
  type?: string | null;
};

type GymDetail = {
  id: string | number;
  name: string;
  equipment: string[];
};

type HomeStatus = {
  title: string;
  detail: string;
};

const QUICK_DURATION_OPTIONS = [15, 20, 30, 45] as const;
const BODYWEIGHT_GYM_ID = "bodyweight";
const BODYWEIGHT_LABEL = "Kroppsvikt / utan gym";
const MIN_DURATION = 5;
const MAX_DURATION = 180;

// Håller gym-listan robust även om API-formatet varierar lite.
function normalizeGyms(data: unknown): Gym[] {
  if (Array.isArray(data)) {
    return data
      .filter(
        (item): item is { id: string | number; name: string } =>
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          "name" in item &&
          (typeof (item as { id: unknown }).id === "string" ||
            typeof (item as { id: unknown }).id === "number") &&
          typeof (item as { name: unknown }).name === "string",
      )
      .map((gym) => ({
        id: gym.id,
        name: gym.name,
      }));
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "gyms" in data &&
    Array.isArray((data as { gyms?: unknown }).gyms)
  ) {
    return normalizeGyms((data as { gyms: unknown[] }).gyms);
  }

  return [];
}

// Normaliserar ett enskilt gym med utrustning.
function normalizeGymDetail(data: unknown): GymDetail | null {
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
    return normalizeGymDetail((data as { gym?: unknown }).gym);
  }

  return null;
}

// Plockar ut användbara utrustningssträngar från olika API-format.
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

// Sparar senaste val per användare.
function getAiSettingsStorageKey(userId: string) {
  return `ai-workout-settings:${userId}`;
}

// Håller tid inom rimliga gränser.
function clampDuration(value: number) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(value)));
}

// Fallback för namn i hälsningen.
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

// Fina datum för senaste pass.
function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

// Kort visning av träningslängd.
function formatDurationMinutes(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));

  return `${minutes} min`;
}

// Summerar set i senaste passet.
function getTotalSets(log: WorkoutLog) {
  return log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

// En enkel, användbar etikett för målet.
function getGoalLabel(goal: Goal | null | undefined) {
  switch (goal) {
    case "strength":
      return "Styrka";
    case "hypertrophy":
      return "Muskelvolym";
    case "health":
      return "Hälsa";
    case "body_composition":
      return "Kroppskomposition";
    default:
      return "Ej valt";
  }
}

// Skapar id för nytt pass och egna övningsrader.
function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

// Ser till att passet alltid får ett format som run-sidan klarar.
function normalizeWorkout(params: {
  workout: Workout;
  duration: number;
  gymLabel: string;
}): Workout {
  const { workout, duration, gymLabel } = params;

  return {
    id: workout.id ?? createId(),
    name: workout.name?.trim() || "AI-genererat pass",
    duration,
    goal: workout.goal,
    gym: gymLabel,
    aiComment:
      typeof workout.aiComment === "string" && workout.aiComment.trim()
        ? workout.aiComment.trim()
        : undefined,
    createdAt: workout.createdAt ?? new Date().toISOString(),
    exercises: Array.isArray(workout.exercises)
      ? workout.exercises.map((exercise, index) => {
          const hasDuration =
            typeof exercise.duration === "number" && exercise.duration > 0;
          const hasReps =
            typeof exercise.reps === "number" && exercise.reps > 0;

          return {
            id:
              typeof exercise.id === "string" && exercise.id.trim()
                ? exercise.id
                : `exercise-${index + 1}-${createId()}`,
            name:
              typeof exercise.name === "string" && exercise.name.trim()
                ? exercise.name.trim()
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
          } satisfies Exercise;
        })
      : [],
  };
}

// Enkel statusrad på home i stället för tung dashboard.
function buildHomeStatus(params: {
  logs: WorkoutLog[];
  goal: Goal | null | undefined;
}): HomeStatus {
  const { logs, goal } = params;

  const completedLogs = logs.filter((log) => log.status === "completed");

  if (completedLogs.length === 0) {
    return {
      title: "Redo att börja",
      detail: "Starta första passet så lär sig appen dina vanor snabbare.",
    };
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const recentCount = completedLogs.filter(
    (log) => new Date(log.completedAt).getTime() >= sevenDaysAgo,
  ).length;

  if (recentCount >= 3) {
    return {
      title: "Bra rytm",
      detail: `Du har tränat ${recentCount} pass senaste veckan. Fortsätt så för ${getGoalLabel(goal).toLowerCase()}.`,
    };
  }

  if (recentCount >= 1) {
    return {
      title: "På gång",
      detail: "Du är igång. Ett till pass snart ger bättre kontinuitet.",
    };
  }

  return {
    title: "Dags att återstarta",
    detail: "Det var ett tag sedan senaste passet. Börja med ett kort pass idag.",
  };
}

export default function HomePage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  // Home ska främst hålla koll på senaste val för snabbstart.
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [durationInput, setDurationInput] = useState("30");
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGymId, setSelectedGymId] = useState(BODYWEIGHT_GYM_ID);

  // Vi behåller bara den data som verkligen behövs för /home.
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [logsSource, setLogsSource] = useState<"api" | "local">("api");

  // Separata busy-lägen gör knapparna tydligare.
  const [isLoadingGyms, setIsLoadingGyms] = useState(false);
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [gymError, setGymError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadHome() {
      try {
        setPageError(null);

        // Börja alltid med att hämta användaren.
        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const authData = (await authRes.json().catch(() => null)) as
          | { ok?: boolean; user?: AuthUser | null }
          | null;

        if (!authRes.ok || !authData?.user) {
          router.replace("/");
          return;
        }

        const user = authData.user;
        const userId = String(user.id);

        if (!isMounted) {
          return;
        }

        setAuthUser(user);
        setAuthChecked(true);

        // Läs tidigare snabbstartsval.
        try {
          const rawSettings = localStorage.getItem(getAiSettingsStorageKey(userId));

          if (rawSettings) {
            const parsed = JSON.parse(rawSettings) as {
              duration?: unknown;
              gymId?: unknown;
            };

            if (
              typeof parsed.duration === "number" &&
              Number.isFinite(parsed.duration)
            ) {
              const nextDuration = clampDuration(parsed.duration);
              setSelectedDuration(nextDuration);
              setDurationInput(String(nextDuration));
            }

            if (typeof parsed.gymId === "string" && parsed.gymId.trim()) {
              setSelectedGymId(parsed.gymId);
            }
          }
        } catch (error) {
          console.error("Kunde inte läsa sparade home-val:", error);
        }

        setIsLoadingGyms(true);
        setGymError(null);

        // Home behöver bara gym, settings och senaste loggar.
        const [gymsRes, settingsRes] = await Promise.all([
          fetch(`/api/gyms?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(`/api/user-settings?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
            credentials: "include",
          }),
        ]);

        const gymsData = (await gymsRes.json().catch(() => null)) as unknown;
        const settingsData = (await settingsRes.json().catch(() => null)) as
          | { ok?: boolean; settings?: UserSettings | null; error?: string }
          | null;

        if (!isMounted) {
          return;
        }

        if (!gymsRes.ok) {
          const apiMessage =
            typeof gymsData === "object" &&
            gymsData !== null &&
            "error" in gymsData &&
            typeof (gymsData as { error?: unknown }).error === "string"
              ? (gymsData as { error: string }).error
              : "Kunde inte hämta gym.";

          setGymError(apiMessage);
          setGyms([]);
        } else {
          const normalizedGyms = normalizeGyms(gymsData);
          setGyms(normalizedGyms);

          // Om senaste gym saknas längre, gå tillbaka till kroppsvikt.
          setSelectedGymId((prev) => {
            if (prev === BODYWEIGHT_GYM_ID) {
              return prev;
            }

            const gymExists = normalizedGyms.some(
              (gym) => String(gym.id) === prev,
            );

            return gymExists ? prev : BODYWEIGHT_GYM_ID;
          });
        }

        if (settingsRes.ok && settingsData?.ok) {
          setSettings(settingsData.settings ?? null);
        }

        // Läs historik från API, annars lokal fallback.
        try {
          const logsRes = await fetch(
            `/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=12`,
            {
              cache: "no-store",
              credentials: "include",
            },
          );

          const logsData = (await logsRes.json().catch(() => null)) as
            | { ok?: boolean; logs?: WorkoutLog[]; error?: string }
            | null;

          if (!logsRes.ok || !logsData?.ok || !Array.isArray(logsData.logs)) {
            throw new Error(logsData?.error || "Kunde inte hämta träningshistorik");
          }

          if (!isMounted) {
            return;
          }

          setWorkoutLogs(logsData.logs);
          setLogsSource("api");
        } catch (error) {
          console.error("Kunde inte hämta loggar från API:", error);

          if (!isMounted) {
            return;
          }

          setWorkoutLogs(getWorkoutLogs(userId));
          setLogsSource("local");
        }
      } catch (error) {
        console.error("Kunde inte ladda home:", error);

        if (!isMounted) {
          return;
        }

        setPageError("Kunde inte ladda startsidan.");
      } finally {
        if (isMounted) {
          setIsLoadingGyms(false);
          setAuthChecked(true);
        }
      }
    }

    void loadHome();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    // Spara val direkt så /home känns personlig och snabb.
    try {
      localStorage.setItem(
        getAiSettingsStorageKey(String(authUser.id)),
        JSON.stringify({
          duration: selectedDuration,
          gymId: selectedGymId,
        }),
      );
    } catch (error) {
      console.error("Kunde inte spara home-val:", error);
    }
  }, [authUser, selectedDuration, selectedGymId]);

  const displayName = useMemo(() => getDisplayName(authUser), [authUser]);

  const selectedGym = useMemo(() => {
    if (selectedGymId === BODYWEIGHT_GYM_ID) {
      return {
        id: BODYWEIGHT_GYM_ID,
        name: BODYWEIGHT_LABEL,
      };
    }

    return gyms.find((gym) => String(gym.id) === selectedGymId) ?? null;
  }, [gyms, selectedGymId]);

  const latestWorkout = useMemo(() => {
    return [...workoutLogs]
      .filter((log) => log.status === "completed")
      .sort(
        (a, b) =>
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
      )[0];
  }, [workoutLogs]);

  const statusSummary = useMemo(() => {
    return buildHomeStatus({
      logs: workoutLogs,
      goal: settings?.training_goal,
    });
  }, [workoutLogs, settings]);

  const recentWeekCount = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    return workoutLogs.filter(
      (log) =>
        log.status === "completed" &&
        new Date(log.completedAt).getTime() >= sevenDaysAgo,
    ).length;
  }, [workoutLogs]);

  const canUseStartActions =
    authChecked &&
    !!authUser &&
    !isLoadingGyms &&
    !isStartingWorkout &&
    !isOpeningPreview;

  function handleQuickDurationSelect(duration: number) {
    const nextDuration = clampDuration(duration);
    setSelectedDuration(nextDuration);
    setDurationInput(String(nextDuration));
  }

  function handleDurationInputChange(value: string) {
    // Tillåt bara siffror i fältet.
    const sanitized = value.replace(/[^\d]/g, "");
    setDurationInput(sanitized);

    const parsed = Number(sanitized);

    if (Number.isFinite(parsed) && sanitized !== "") {
      setSelectedDuration(clampDuration(parsed));
    }
  }

  function handleDurationInputBlur() {
    // Säkerställ alltid ett rimligt värde.
    const parsed = Number(durationInput);
    const nextDuration = clampDuration(parsed);
    setSelectedDuration(nextDuration);
    setDurationInput(String(nextDuration));
  }

  async function loadSelectedGymDetail(params: {
    userId: string;
    gymId: string;
  }) {
    const { userId, gymId } = params;

    const response = await fetch(
      `/api/gyms/${encodeURIComponent(gymId)}?userId=${encodeURIComponent(userId)}`,
      {
        cache: "no-store",
        credentials: "include",
      },
    );

    const data = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new Error("Kunde inte hämta valt gym.");
    }

    return normalizeGymDetail(data);
  }

  async function buildWorkoutInput() {
    if (!authUser?.id) {
      throw new Error("Användaren är inte färdigladdad ännu.");
    }

    const userId = String(authUser.id);
    const goal = settings?.training_goal ?? "strength";

    if (selectedGymId === BODYWEIGHT_GYM_ID) {
      return {
        userId,
        goal,
        equipment: ["bodyweight"],
        gymLabel: BODYWEIGHT_LABEL,
      };
    }

    const gymDetail = await loadSelectedGymDetail({
      userId,
      gymId: selectedGymId,
    });

    return {
      userId,
      goal,
      equipment:
        gymDetail && gymDetail.equipment.length > 0
          ? gymDetail.equipment
          : ["bodyweight"],
      gymLabel: gymDetail?.name?.trim() || selectedGym?.name || BODYWEIGHT_LABEL,
    };
  }

  async function handleStartWorkout() {
    try {
      setIsStartingWorkout(true);
      setPageError(null);

      // Bygg underlaget direkt från användare, mål, tid och gym.
      const input = await buildWorkoutInput();

      const result = await generateWorkout({
        userId: input.userId,
        goal: input.goal,
        durationMinutes: selectedDuration,
        equipment: input.equipment,
      });

      const normalizedWorkout = normalizeWorkout({
        workout: result.workout,
        duration: selectedDuration,
        gymLabel: input.gymLabel,
      });

      // Spara både preview- och active-version så resten av flödet fungerar.
      saveGeneratedWorkout(input.userId, normalizedWorkout);
      saveActiveWorkout(input.userId, normalizedWorkout);

      router.push("/workout/run");
    } catch (error) {
      console.error("Kunde inte starta AI-pass direkt:", error);

      setPageError(
        error instanceof Error
          ? error.message
          : "Kunde inte starta passet just nu.",
      );
    } finally {
      setIsStartingWorkout(false);
    }
  }

  function handleReviewFirst() {
    if (!authUser?.id) {
      setPageError("Användaren är inte färdigladdad ännu.");
      return;
    }

    try {
      setIsOpeningPreview(true);
      setPageError(null);

      const params = new URLSearchParams();
      params.set("duration", String(selectedDuration));
      params.set("userId", String(authUser.id));

      // Bodyweight-läge skickas separat.
      if (selectedGymId === BODYWEIGHT_GYM_ID) {
        params.set("gymMode", "bodyweight");
      } else if (selectedGymId) {
        params.set("gymId", selectedGymId);
      }

      router.push(`/workout/preview?${params.toString()}`);
    } finally {
      // Vi återställer snabbt eftersom navigation sker direkt.
      setIsOpeningPreview(false);
    }
  }

  async function handleLogout() {
    try {
      setIsLoggingOut(true);

      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Kunde inte logga ut:", error);
      router.replace("/");
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-4 py-8 sm:px-6">
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
              Träningsapp
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Laddar hem...
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Hämtar dina snabbval och senaste pass.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <AppLayout
      title="Träningsapp"
      subtitle="Snabbstart för dagens pass."
      onLogout={handleLogout}
      isLoggingOut={isLoggingOut}
      isAdmin={authUser?.role === "admin"}
    >
      <div className="flex flex-col gap-5">
        {/* Kort och tydlig toppdel. */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
            Hej igen
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {displayName}
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Starta pass direkt eller granska först. Senaste tid och gym sparas
            automatiskt.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Mål: {getGoalLabel(settings?.training_goal)}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Pass senaste 7 dagar: {recentWeekCount}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Källa: {logsSource === "api" ? "Databas" : "Lokal fallback"}
            </span>
          </div>
        </section>

        {/* Huvudytan enligt docs: startkort med tid + gym + tydlig CTA. */}
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
                Starta pass
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Dagens träning
              </h2>
            </div>

            <Link
              href="/gyms"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Redigera gym
            </Link>
          </div>

          <div className="mt-6 grid gap-5">
            {/* Tidsval hålls snabbt med chips och enkel input. */}
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <label
                htmlFor="duration"
                className="text-sm font-semibold text-slate-900"
              >
                Tid
              </label>

              <p className="mt-1 text-sm text-slate-600">
                Välj hur långt pass du vill ha idag.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_DURATION_OPTIONS.map((duration) => {
                  const isSelected = selectedDuration === duration;

                  return (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => handleQuickDurationSelect(duration)}
                      className={`min-h-[44px] rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      {duration} min
                    </button>
                  );
                })}
              </div>

              <input
                id="duration"
                inputMode="numeric"
                value={durationInput}
                onChange={(e) => handleDurationInputChange(e.target.value)}
                onBlur={handleDurationInputBlur}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="Annan tid i minuter"
              />
            </div>

            {/* Gym-val hålls enkelt och nära startknappen. */}
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <label
                htmlFor="gym"
                className="text-sm font-semibold text-slate-900"
              >
                Gym
              </label>

              <p className="mt-1 text-sm text-slate-600">
                Passet anpassas efter vald utrustning.
              </p>

              {isLoadingGyms ? (
                <p className="mt-3 text-sm text-slate-500">Hämtar gym...</p>
              ) : (
                <>
                  <select
                    id="gym"
                    value={selectedGymId}
                    onChange={(e) => setSelectedGymId(e.target.value)}
                    className="mt-3 min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value={BODYWEIGHT_GYM_ID}>
                      {BODYWEIGHT_LABEL}
                    </option>

                    {gyms.map((gym) => (
                      <option key={String(gym.id)} value={String(gym.id)}>
                        {gym.name}
                      </option>
                    ))}
                  </select>

                  <p className="mt-3 text-sm text-slate-600">
                    Val idag:{" "}
                    <span className="font-medium text-slate-900">
                      {selectedGym?.name ?? BODYWEIGHT_LABEL}
                    </span>
                  </p>
                </>
              )}

              {gymError ? (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {gymError}
                </p>
              ) : null}
            </div>

            {pageError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {pageError}
              </div>
            ) : null}

            {/* En tydlig primär handling och valfria sidospår. */}
            <div className="grid gap-3">
              <button
                type="button"
                onClick={handleStartWorkout}
                disabled={!canUseStartActions}
                className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStartingWorkout ? "Startar pass..." : "Starta pass"}
              </button>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleReviewFirst}
                  disabled={!canUseStartActions}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isOpeningPreview ? "Öppnar..." : "Granska först"}
                </button>

                <Link
                  href="/workout/custom"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  Eget pass
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Kort status i liten skala, inte full dashboard. */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
            Kort status
          </p>

          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            {statusSummary.title}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {statusSummary.detail}
          </p>
        </section>

        {/* Senaste pass finns kvar, men kompakt. */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
                Senaste pass
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                Senast genomfört
              </h2>
            </div>

            <Link
              href="/history"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Historik
            </Link>
          </div>

          {latestWorkout ? (
            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                {formatDateTime(latestWorkout.completedAt)}
              </p>

              <h3 className="mt-2 text-lg font-semibold text-slate-950">
                {latestWorkout.workoutName}
              </h3>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  {formatDurationMinutes(latestWorkout.durationSeconds)}
                </span>

                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  {latestWorkout.exercises.length} övningar
                </span>

                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  {getTotalSets(latestWorkout)} set
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm leading-6 text-slate-600">
                Inget genomfört pass ännu. Börja med ett kort pass idag.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}