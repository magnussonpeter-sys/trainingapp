"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getWorkoutLogs, type WorkoutLog } from "@/lib/workout-log-storage";
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
          typeof (item as { name: unknown }).name === "string"
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
function getAnalysisBadgeClasses(
  status: DashboardAnalysis["status"]
) {
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
function getRequirementClasses(
  status: "good" | "warning" | "low"
) {
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
  const menuRef = useRef<HTMLDivElement | null>(null);

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
              (gym) => String(gym.id) === prev
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
            }
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
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

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
        })
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
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
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
          comment:
            data.comment ?? "Ingen AI-kommentar kunde visas just nu.",
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

  const canGenerateAiWorkout = authChecked && !!authUser && !isLoadingGyms;

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
      <main className="min-h-screen bg-[var(--app-page,#f4f7fb)] px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[32px] border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
              Träningsapp
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Laddar dashboard...
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Hämtar användardata, senaste pass och AI-analys.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#eef3f9_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
              Träningsapp
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Dashboard för snabbstart, översikt och målstyrd träningsanalys.
            </p>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:shadow-md"
              aria-label="Öppna meny"
            >
              ☰
            </button>

            {isMenuOpen ? (
              <div className="absolute right-0 top-14 z-20 w-56 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)]">
                <Link
                  href="/settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Inställningar
                </Link>
                <Link
                  href="/gyms"
                  onClick={() => setIsMenuOpen(false)}
                  className="block border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Hantera gym
                </Link>
                <Link
                  href="/history"
                  onClick={() => setIsMenuOpen(false)}
                  className="block border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Träningshistorik
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full border-t border-slate-100 px-4 py-3 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
                >
                  {isLoggingOut ? "Loggar ut..." : "Logga ut"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
                Välkommen tillbaka
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Hej {displayName}
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Här startar du nästa pass, ser hur väl träningen matchar ditt mål
                och får tydliga råd om vad du behöver göra för att komma vidare.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
                  AI-status: {dashboardAnalysis.statusLabel}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  Mål: {dashboardAnalysis.goalLabel}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  Datakälla: {logsSource === "api" ? "Databas" : "Lokal fallback"}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-indigo-100 bg-[linear-gradient(180deg,rgba(238,242,255,0.9),rgba(255,255,255,0.95))] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700">
                AI-överblick
              </p>

              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                {dashboardAnalysis.consistencyScore}/100
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Samlad målmatchning utifrån frekvens, volym, kontinuitet,
                progression, återhämtning och övningsbredd.
              </p>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-indigo-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${dashboardAnalysis.consistencyScore}%` }}
                />
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-700">
                {dashboardAnalysis.summary}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
                  Senaste pass
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Din senaste träningsaktivitet
                </h2>
              </div>

              <Link
                href="/history"
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Se historik
              </Link>
            </div>

            {latestWorkout ? (
              <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-medium text-slate-500">
                  {formatDateTime(latestWorkout.completedAt)}
                </p>

                <h3 className="mt-2 text-xl font-semibold text-slate-900">
                  {latestWorkout.workoutName}
                </h3>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Tid
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {formatDurationMinutes(latestWorkout.durationSeconds)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Övningar
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {latestWorkout.exercises.length}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Set
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {getTotalSets(latestWorkout)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Volym
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {Math.round(getTotalVolume(latestWorkout))} kg
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/history"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-white"
                  >
                    Visa detaljer
                  </Link>
                  <button
                    type="button"
                    onClick={handleGenerateAiWorkout}
                    className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canGenerateAiWorkout}
                  >
                    Generera nytt AI-pass
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 p-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  Ingen träningshistorik ännu
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  När du har genomfört ditt första pass kommer dashboarden att visa
                  senaste pass, målmatchning och mer träffsäkra råd här.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
                  Snabbstart
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Starta dagens pass
                </h2>
              </div>

              <Link
                href="/gyms"
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Redigera gym
              </Link>
            </div>

            <div className="mt-6 space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                <label className="text-sm font-semibold text-slate-900">
                  Passlängd
                </label>
                <p className="mt-1 text-sm text-slate-500">
                  Välj mellan {MIN_DURATION} och {MAX_DURATION} minuter.
                </p>

                <input
                  inputMode="numeric"
                  value={durationInput}
                  onChange={(e) => handleDurationInputChange(e.target.value)}
                  onBlur={handleDurationInputBlur}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Antal minuter"
                />

                <div className="mt-4 flex flex-wrap gap-3">
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

              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                <label className="text-sm font-semibold text-slate-900">
                  Valt gym
                </label>
                <p className="mt-1 text-sm text-slate-500">
                  AI-passet anpassas efter vald utrustning.
                </p>

                {isLoadingGyms ? (
                  <p className="mt-3 text-sm text-slate-500">Hämtar gym...</p>
                ) : (
                  <>
                    <select
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
                      <span className="font-semibold text-slate-900">
                        {selectedGym?.name ?? "Kroppsvikt / utan gym"}
                      </span>
                    </p>
                  </>
                )}

                {gymError ? (
                  <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {gymError}
                  </p>
                ) : null}
              </div>

              {pageError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {pageError}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleGenerateAiWorkout}
                  disabled={!canGenerateAiWorkout}
                  className="inline-flex flex-1 items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {canGenerateAiWorkout ? "Generera AI-pass" : "Laddar användardata..."}
                </button>

                <Link
                  href="/custom"
                  className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  Eget pass
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
                  AI-analys
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Matchar träningen ditt mål?
                </h2>
              </div>

              <div
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${getAnalysisBadgeClasses(
                  dashboardAnalysis.status
                )}`}
              >
                {dashboardAnalysis.statusLabel}
              </div>
            </div>

            <h3 className="mt-6 text-xl font-semibold text-slate-900">
              {dashboardAnalysis.title}
            </h3>

            <p className="mt-3 text-sm leading-7 text-slate-600">
              {dashboardAnalysis.summary}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {dashboardAnalysis.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {metric.hint}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Vad målet brukar kräva
              </p>

              <div className="mt-4 space-y-3">
                {dashboardAnalysis.requirementItems.map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-[24px] border p-4 ${getRequirementClasses(
                      item.status
                    )}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {item.label}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Målbild: {item.target}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Din nivå
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {item.actual}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {goalReview ? (
              <div className="mt-6 rounded-[28px] border border-indigo-100 bg-indigo-50/70 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700">
                  AI-coach
                </p>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">
                  {goalReview.headline}
                </h3>
                <p className="mt-3 text-sm font-medium text-indigo-700">
                  Fokus nu: {goalReview.nextFocus}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-700">
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
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {goalReviewError}
              </p>
            ) : null}
          </div>

          <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong,#4338ca)]">
                Rekommendationer framåt
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Vad du bör fokusera på nu
              </h2>
            </div>

            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Fokusområden
              </p>

              <div className="mt-4 space-y-3">
                {dashboardAnalysis.focusAreas.map((focusArea) => (
                  <div
                    key={focusArea}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    {focusArea}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Det som ser bra ut
                </p>

                <div className="mt-4 space-y-3">
                  {dashboardAnalysis.strengths.length > 0 ? (
                    dashboardAnalysis.strengths.map((strength) => (
                      <div
                        key={strength}
                        className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                      >
                        {strength}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500">
                      Fler styrkor blir tydliga när du samlat mer träningsdata.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Det som bromsar målet
                </p>

                <div className="mt-4 space-y-3">
                  {dashboardAnalysis.gaps.length > 0 ? (
                    dashboardAnalysis.gaps.map((gap) => (
                      <div
                        key={gap}
                        className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                      >
                        {gap}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500">
                      Inga tydliga bromsklossar identifierade just nu.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {dashboardAnalysis.recommendations.map((recommendation) => (
                <div
                  key={`${recommendation.title}-${recommendation.timeframe ?? "none"}`}
                  className="rounded-[24px] border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-base font-semibold text-slate-900">
                      {recommendation.title}
                    </h3>

                    {recommendation.timeframe ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                        {recommendation.timeframe}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {recommendation.detail}
                  </p>
                </div>
              ))}
            </div>

            {isLoadingDashboard ? (
              <p className="mt-5 text-sm text-slate-500">
                Uppdaterar analysen...
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}