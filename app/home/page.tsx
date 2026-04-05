"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AppTopBar from "@/components/navigation/AppTopBar";
import BottomNav from "@/components/navigation/BottomNav";
import {
  getWorkoutLogs,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import {
  buildTrainingDashboardAnalysis,
  type DashboardAnalysis,
  type DashboardUserSettings,
} from "@/lib/training-dashboard-analysis";

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

type GoalReview = {
  headline: string;
  nextFocus: string;
  comment: string;
};

type UserSettings = DashboardUserSettings;

const QUICK_DURATION_OPTIONS = [15, 20, 30, 45] as const;
const BODYWEIGHT_GYM_ID = "bodyweight";
const MIN_DURATION = 5;
const MAX_DURATION = 180;

// Hjälper oss att hålla gym-svaret robust även om API-formatet varierar lite.
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

// Per användare vill vi komma ihåg vald passlängd och gym.
function getAiSettingsStorageKey(userId: string) {
  return `ai-workout-settings:${userId}`;
}

// Skyddar duration så användaren inte får konstiga värden.
function clampDuration(value: number) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(value)));
}

// Fallback för visningsnamn om något auth-fält saknas.
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

// Hjälper senaste-pass-kortet.
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

// Visar passlängd snyggt i UI.
function formatDurationMinutes(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

// Summerar set för ett loggat pass.
function getTotalSets(log: WorkoutLog) {
  return log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

// Enkel volymproxy för senaste-pass-kortet.
function getTotalVolume(log: WorkoutLog) {
  return log.exercises.reduce((sum, exercise) => {
    return (
      sum +
      exercise.sets.reduce((setSum, set) => {
        if (set.actualWeight == null || set.actualReps == null) {
          return setSum;
        }

        return setSum + set.actualWeight * set.actualReps;
      }, 0)
    );
  }, 0);
}

// Dashboard-badge beroende på analysstatus.
function getAnalysisBadgeClasses(status: DashboardAnalysis["status"]) {
  switch (status) {
    case "excellent":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "good":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "needs_attention":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "no_data":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-violet-200 bg-violet-50 text-violet-700";
  }
}

// Färg på kravkort beroende på hur väl användaren möter målet.
function getRequirementClasses(status: "good" | "warning" | "low") {
  switch (status) {
    case "good":
      return "border-emerald-200 bg-emerald-50";
    case "warning":
      return "border-amber-200 bg-amber-50";
    case "low":
    default:
      return "border-rose-200 bg-rose-50";
  }
}

export default function HomePage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  // Lokal state för snabbstart av AI-pass.
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [durationInput, setDurationInput] = useState("30");
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGymId, setSelectedGymId] = useState(BODYWEIGHT_GYM_ID);

  // Dashboard-data.
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [logsSource, setLogsSource] = useState<"api" | "local">("api");

  // AI-coach ovanpå den strukturerade analysen.
  const [goalReview, setGoalReview] = useState<GoalReview | null>(null);
  const [isLoadingGoalReview, setIsLoadingGoalReview] = useState(false);
  const [goalReviewError, setGoalReviewError] = useState<string | null>(null);

  // UI-state.
  const [isLoadingGyms, setIsLoadingGyms] = useState(false);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [gymError, setGymError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadHome() {
      try {
        setPageError(null);
        setIsLoadingDashboard(true);

        // Hämta aktuell auth-user först.
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

        // Läs tidigare sparade AI-inställningar.
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
          console.error("Kunde inte läsa sparade AI-inställningar:", error);
        }

        // Ladda gym och settings parallellt.
        setIsLoadingGyms(true);
        setGymError(null);

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

          // Om tidigare valt gym inte längre finns kvar, fall tillbaka till kroppsvikt.
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

        // Försök först med API, annars lokal fallback.
        try {
          const logsRes = await fetch(
            `/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=24`,
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
          console.error("Kunde inte hämta dashboard-loggar från API:", error);

          if (!isMounted) {
            return;
          }

          setWorkoutLogs(getWorkoutLogs(userId));
          setLogsSource("local");
        }
      } catch (error) {
        console.error("Kunde inte ladda home-sidan:", error);

        if (!isMounted) {
          return;
        }

        setPageError("Kunde inte ladda startsidan.");
      } finally {
        if (isMounted) {
          setIsLoadingGyms(false);
          setIsLoadingDashboard(false);
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

    // Spara snabbstartsval per användare.
    try {
      localStorage.setItem(
        getAiSettingsStorageKey(String(authUser.id)),
        JSON.stringify({
          duration: selectedDuration,
          gymId: selectedGymId,
        }),
      );
    } catch (error) {
      console.error("Kunde inte spara AI-inställningar:", error);
    }
  }, [authUser, selectedDuration, selectedGymId]);

  const displayName = useMemo(() => getDisplayName(authUser), [authUser]);

  const selectedGym = useMemo(() => {
    if (selectedGymId === BODYWEIGHT_GYM_ID) {
      return {
        id: BODYWEIGHT_GYM_ID,
        name: "Kroppsvikt / utan gym",
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

  const dashboardAnalysis = useMemo(() => {
    return buildTrainingDashboardAnalysis({
      logs: workoutLogs,
      settings,
    });
  }, [workoutLogs, settings]);

  useEffect(() => {
    async function loadGoalReview() {
      if (!dashboardAnalysis.structuredAnalysis) {
        setGoalReview(null);
        setGoalReviewError(null);
        return;
      }

      try {
        setIsLoadingGoalReview(true);
        setGoalReviewError(null);

        const response = await fetch("/api/goal-review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            goal: dashboardAnalysis.structuredAnalysis.goal,
            analysis: dashboardAnalysis.structuredAnalysis,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              headline?: string;
              nextFocus?: string;
              comment?: string;
              error?: string;
            }
          | null;

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? "Kunde inte hämta AI-kommentar.");
        }

        setGoalReview({
          headline: data.headline ?? "Din AI-coach säger",
          nextFocus: data.nextFocus ?? "Fortsätt bygga steg för steg",
          comment: data.comment ?? "Ingen AI-kommentar kunde visas just nu.",
        });
      } catch (error) {
        console.error("Kunde inte hämta AI-coach-kommentar:", error);
        setGoalReview(null);
        setGoalReviewError("Kunde inte hämta AI-coach-kommentar.");
      } finally {
        setIsLoadingGoalReview(false);
      }
    }

    void loadGoalReview();
  }, [dashboardAnalysis]);

  const canGenerateAiWorkout =
    authChecked && !!authUser && !isLoadingGyms && !isLoadingDashboard;

  function handleQuickDurationSelect(duration: number) {
    const nextDuration = clampDuration(duration);
    setSelectedDuration(nextDuration);
    setDurationInput(String(nextDuration));
  }

  function handleDurationInputChange(value: string) {
    // Tillåt bara siffror i textfältet.
    const sanitized = value.replace(/[^\d]/g, "");
    setDurationInput(sanitized);

    const parsed = Number(sanitized);
    if (Number.isFinite(parsed) && sanitized !== "") {
      setSelectedDuration(clampDuration(parsed));
    }
  }

  function handleDurationInputBlur() {
    // Vid blur säkerställer vi ett giltigt värde.
    const parsed = Number(durationInput);
    const nextDuration = clampDuration(parsed);
    setSelectedDuration(nextDuration);
    setDurationInput(String(nextDuration));
  }

  function handleGenerateAiWorkout() {
    if (!authUser?.id) {
      setPageError("Användaren är inte färdigladdad ännu. Försök igen.");
      return;
    }

    setPageError(null);

    const params = new URLSearchParams();
    params.set("duration", String(selectedDuration));
    params.set("userId", String(authUser.id));

    // Vid kroppsvikt skickar vi ingen vanlig gymId, utan markerar kroppsviktsläge.
    if (selectedGymId === BODYWEIGHT_GYM_ID) {
      params.set("gymMode", "bodyweight");
    } else if (selectedGymId) {
      params.set("gymId", selectedGymId);
    }

    router.push(`/workout/preview?${params.toString()}`);
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
        <AppTopBar
          title="Träningsapp"
          subtitle="Dashboard för snabbstart, översikt och målstyrd träningsanalys."
        />

        <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-4 py-8 sm:px-6">
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
              Träningsapp
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Laddar dashboard...
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Hämtar användardata, senaste pass och AI-analys.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-slate-50 pb-28 text-slate-950">
        <AppTopBar
          title="Träningsapp"
          subtitle="Dashboard för snabbstart, översikt och målstyrd träningsanalys."
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
        />

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
              Välkommen tillbaka
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Hej {displayName}
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Här startar du nästa pass, ser hur väl träningen matchar ditt mål och
              får tydliga råd om vad du behöver göra för att komma vidare.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getAnalysisBadgeClasses(
                  dashboardAnalysis.status,
                )}`}
              >
                AI-status: {dashboardAnalysis.statusLabel}
              </span>

              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Mål: {dashboardAnalysis.goalLabel}
              </span>

              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Datakälla: {logsSource === "api" ? "Databas" : "Lokal fallback"}
              </span>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
                  AI-överblick
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {dashboardAnalysis.consistencyScore}/100
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Samlad målmatchning utifrån frekvens, volym, kontinuitet,
                  progression, återhämtning och övningsbredd.
                </p>
              </div>

              <span
                className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getAnalysisBadgeClasses(
                  dashboardAnalysis.status,
                )}`}
              >
                {dashboardAnalysis.statusLabel}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">
              {dashboardAnalysis.summary}
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
                  Senaste pass
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Din senaste träningsaktivitet
                </h2>
              </div>

              <Link
                href="/history"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Se historik
              </Link>
            </div>

            {latestWorkout ? (
              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">
                  {formatDateTime(latestWorkout.completedAt)}
                </p>

                <h3 className="mt-2 text-xl font-semibold text-slate-950">
                  {latestWorkout.workoutName}
                </h3>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Tid
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {formatDurationMinutes(latestWorkout.durationSeconds)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Övningar
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {latestWorkout.exercises.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Set
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {getTotalSets(latestWorkout)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Volym
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {Math.round(getTotalVolume(latestWorkout))} kg
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/history"
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                  >
                    Visa detaljer
                  </Link>

                  <button
                    type="button"
                    onClick={handleGenerateAiWorkout}
                    disabled={!canGenerateAiWorkout}
                    className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Generera nytt AI-pass
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-slate-950">
                  Ingen träningshistorik ännu
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  När du har genomfört ditt första pass kommer dashboarden att visa
                  senaste pass, målmatchning och mer träffsäkra råd här.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
                  Snabbstart
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Starta dagens pass
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
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <label
                  htmlFor="duration"
                  className="text-sm font-semibold text-slate-900"
                >
                  Passlängd
                </label>

                <p className="mt-1 text-sm text-slate-600">
                  Välj mellan {MIN_DURATION} och {MAX_DURATION} minuter.
                </p>

                <input
                  id="duration"
                  inputMode="numeric"
                  value={durationInput}
                  onChange={(e) => handleDurationInputChange(e.target.value)}
                  onBlur={handleDurationInputBlur}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Antal minuter"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {QUICK_DURATION_OPTIONS.map((duration) => {
                    const isSelected = selectedDuration === duration;

                    return (
                      <button
                        key={duration}
                        type="button"
                        onClick={() => handleQuickDurationSelect(duration)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
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
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <label
                  htmlFor="gym"
                  className="text-sm font-semibold text-slate-900"
                >
                  Valt gym
                </label>

                <p className="mt-1 text-sm text-slate-600">
                  AI-passet anpassas efter vald utrustning.
                </p>

                {isLoadingGyms ? (
                  <p className="mt-3 text-sm text-slate-500">Hämtar gym...</p>
                ) : (
                  <>
                    <select
                      id="gym"
                      value={selectedGymId}
                      onChange={(e) => setSelectedGymId(e.target.value)}
                      className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value={BODYWEIGHT_GYM_ID}>
                        Kroppsvikt / utan gym
                      </option>

                      {gyms.map((gym) => (
                        <option key={String(gym.id)} value={String(gym.id)}>
                          {gym.name}
                        </option>
                      ))}
                    </select>

                    <p className="mt-3 text-sm text-slate-600">
                      Vald träningsmiljö:{" "}
                      <span className="font-medium text-slate-900">
                        {selectedGym?.name ?? "Kroppsvikt / utan gym"}
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

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleGenerateAiWorkout}
                  disabled={!canGenerateAiWorkout}
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {canGenerateAiWorkout
                    ? "Generera AI-pass"
                    : "Laddar användardata..."}
                </button>

                <Link
                  href="/workout/custom"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  Eget pass
                </Link>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
                  AI-analys
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Matchar träningen ditt mål?
                </h2>
              </div>

              <span
                className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getAnalysisBadgeClasses(
                  dashboardAnalysis.status,
                )}`}
              >
                {dashboardAnalysis.statusLabel}
              </span>
            </div>

            <h3 className="mt-5 text-xl font-semibold text-slate-950">
              {dashboardAnalysis.title}
            </h3>

            <p className="mt-3 text-sm leading-6 text-slate-700">
              {dashboardAnalysis.summary}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardAnalysis.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {metric.hint}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Vad målet brukar kräva
              </h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {dashboardAnalysis.requirementItems.map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-2xl border p-4 ${getRequirementClasses(
                      item.status,
                    )}`}
                  >
                    <h4 className="text-base font-semibold text-slate-950">
                      {item.label}
                    </h4>
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium">Målbild:</span> {item.target}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      <span className="font-medium">Din nivå:</span> {item.actual}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {goalReview ? (
              <div className="mt-6 rounded-3xl border border-violet-200 bg-violet-50 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-violet-500">
                  AI-coach
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">
                  {goalReview.headline}
                </h3>
                <p className="mt-3 text-sm text-slate-700">
                  <span className="font-medium">Fokus nu:</span>{" "}
                  {goalReview.nextFocus}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {goalReview.comment}
                </p>
              </div>
            ) : null}

            {isLoadingGoalReview ? (
              <p className="mt-4 text-sm text-slate-500">
                Hämtar AI-coachens kommentar...
              </p>
            ) : null}

            {goalReviewError ? (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {goalReviewError}
              </p>
            ) : null}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
              Rekommendationer framåt
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Vad du bör fokusera på nu
            </h2>

            <p className="mt-3 text-sm font-medium text-slate-700">
              För att nå målet nu
            </p>

            <div className="mt-4 grid gap-3">
              {dashboardAnalysis.actionPlan.map((step) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <h3 className="text-base font-semibold text-slate-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  Fokusområden
                </h3>

                <div className="mt-3 flex flex-wrap gap-2">
                  {dashboardAnalysis.focusAreas.map((focusArea) => (
                    <span
                      key={focusArea}
                      className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700"
                    >
                      {focusArea}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  Det som ser bra ut
                </h3>

                <div className="mt-3 grid gap-2">
                  {dashboardAnalysis.strengths.length > 0 ? (
                    dashboardAnalysis.strengths.map((strength) => (
                      <div
                        key={strength}
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                      >
                        {strength}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Fler styrkor blir tydliga när du samlat mer träningsdata.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Det som bromsar målet
              </h3>

              <div className="mt-3 grid gap-2">
                {dashboardAnalysis.gaps.length > 0 ? (
                  dashboardAnalysis.gaps.map((gap) => (
                    <div
                      key={gap}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
                    >
                      {gap}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Inga tydliga bromsklossar identifierade just nu.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      <BottomNav isAdmin={authUser?.role === "admin"} />
    </>
  );
}