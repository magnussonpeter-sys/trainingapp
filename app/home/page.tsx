"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  analyzeTraining,
  type FocusPriority,
  type GoalAnalysis,
  type GoalType,
  type RecommendationTimeframe,
} from "@/lib/goal-analysis";
import { getWorkoutLogs } from "@/lib/workout-log-storage";

type AuthUser = {
  id: number;
  email?: string | null;
  username?: string | null;
};

type Gym = {
  id: string | number;
  name: string;
};

type UserSettings = {
  training_goal?: GoalType | null;
};

type GoalReview = {
  headline: string;
  nextFocus: string;
  comment: string;
};

const QUICK_DURATION_OPTIONS = [15, 20, 30, 45] as const;
const BODYWEIGHT_GYM_ID = "bodyweight";
const MIN_DURATION = 5;
const MAX_DURATION = 180;

/**
 * Hjälper oss att hålla gym-svaret robust även om API-formatet varierar lite.
 */
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

/**
 * Per användare vill vi komma ihåg vald passlängd och gym.
 */
function getAiSettingsStorageKey(userId: string) {
  return `ai-workout-settings:${userId}`;
}

/**
 * Skyddar duration så användaren inte får konstiga värden.
 */
function clampDuration(value: number) {
  if (!Number.isFinite(value)) return 30;

  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(value)));
}

/**
 * Människoläsbar etikett för målet.
 */
function getGoalLabel(goal: GoalType | null) {
  switch (goal) {
    case "strength":
      return "Styrka";
    case "hypertrophy":
      return "Hypertrofi";
    case "health":
      return "Hälsa";
    case "body_composition":
      return "Kroppskomposition";
    default:
      return "Ej valt";
  }
}

/**
 * Människoläsbar etikett för analysstatus.
 */
function getStatusLabel(status: GoalAnalysis["evaluation"]["status"]) {
  switch (status) {
    case "on_track":
      return "På rätt väg";
    case "needs_attention":
      return "Behöver fokus";
    case "steady":
    default:
      return "Stabilt läge";
  }
}

/**
 * Färgtema för statuskortet.
 */
function getStatusClasses(status: GoalAnalysis["evaluation"]["status"]) {
  switch (status) {
    case "on_track":
      return {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
        progress: "bg-emerald-500",
      };

    case "needs_attention":
      return {
        badge: "border-amber-200 bg-amber-50 text-amber-700",
        progress: "bg-amber-500",
      };

    case "steady":
    default:
      return {
        badge: "border-blue-200 bg-blue-50 text-blue-700",
        progress: "bg-blue-500",
      };
  }
}

/**
 * Hjälpfärger för fokusprioritet.
 */
function getPriorityClasses(priority: FocusPriority) {
  switch (priority) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

/**
 * Hjälpetikett för när ett råd gäller.
 */
function getTimeframeLabel(timeframe: RecommendationTimeframe) {
  switch (timeframe) {
    case "next_workout":
      return "Nästa pass";
    case "next_7_days":
      return "Nästa 7 dagar";
    case "next_14_days":
    default:
      return "Nästa 14 dagar";
  }
}

/**
 * Små hjälpetiketter för metrics.
 */
function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function HomePage() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  // Fritt val av passlängd i minuter.
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [durationInput, setDurationInput] = useState("30");

  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGymId, setSelectedGymId] = useState(BODYWEIGHT_GYM_ID);
  const [isLoadingGyms, setIsLoadingGyms] = useState(false);
  const [gymError, setGymError] = useState<string | null>(null);

  // Nytt: mål + analys på home.
  const [userGoal, setUserGoal] = useState<GoalType | null>(null);
  const [analysis, setAnalysis] = useState<GoalAnalysis | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showAnalysisDebug, setShowAnalysisDebug] = useState(false);

  // Nytt: AI-coach ovanpå den strukturerade analysen.
  const [goalReview, setGoalReview] = useState<GoalReview | null>(null);
  const [isLoadingGoalReview, setIsLoadingGoalReview] = useState(false);
  const [goalReviewError, setGoalReviewError] = useState<string | null>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  /**
   * Ladda användare, sparade AI-inställningar, gym och mål.
   */
  useEffect(() => {
    async function load() {
      try {
        setPageError(null);

        // Viktigt för Safari/iPhone: skicka alltid med credentials vid auth-kontroll.
        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const authData = await authRes.json();

        if (!authRes.ok || !authData?.ok || !authData.user) {
          router.replace("/");
          return;
        }

        const user = authData.user as AuthUser;
        const userId = String(user.id);

        setAuthUser(user);
        setAuthChecked(true);

        // Läs tidigare sparade AI-inställningar för användaren.
        try {
          const rawSettings = localStorage.getItem(
            getAiSettingsStorageKey(userId)
          );

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

        // Hämta användarens sparade mål.
        try {
          const settingsRes = await fetch(
            `/api/user-settings?userId=${encodeURIComponent(userId)}`,
            {
              cache: "no-store",
              credentials: "include",
            }
          );

          let settingsData: unknown = null;

          try {
            settingsData = await settingsRes.json();
          } catch {
            settingsData = null;
          }

          if (
            settingsRes.ok &&
            settingsData &&
            typeof settingsData === "object" &&
            "settings" in settingsData
          ) {
            const settings = (
              settingsData as { settings?: UserSettings | null }
            ).settings;

            setUserGoal(settings?.training_goal ?? null);
          } else {
            setUserGoal(null);
          }
        } catch (error) {
          console.error("Kunde inte hämta användarinställningar:", error);
          setUserGoal(null);
        }

        setIsLoadingGyms(true);
        setGymError(null);

        // Skicka även med credentials här för konsekvent beteende i Safari.
        const gymsRes = await fetch(`/api/gyms?userId=${user.id}`, {
          cache: "no-store",
          credentials: "include",
        });

        let gymsData: unknown = null;

        try {
          gymsData = await gymsRes.json();
        } catch {
          gymsData = null;
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
          return;
        }

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
      } catch (error) {
        console.error("Kunde inte ladda home-sidan:", error);
        setPageError("Kunde inte ladda användardata.");
        router.replace("/");
      } finally {
        setIsLoadingGyms(false);
        setAuthChecked(true);
      }
    }

    void load();
  }, [router]);

  /**
   * Stäng meny vid klick utanför.
   */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;

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

  /**
   * Spara senast vald passlängd och gym-val per användare.
   */
  useEffect(() => {
    if (!authUser) return;

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

  /**
   * Bygg analysen lokalt från loggar när användare + mål finns.
   */
  useEffect(() => {
    if (!authUser) return;

    setIsLoadingAnalysis(true);
    setAnalysisError(null);

    try {
      // Fallback till health om mål ännu inte är valt.
      const goal = userGoal ?? "health";
      const logs = getWorkoutLogs(String(authUser.id));
      const nextAnalysis = analyzeTraining(logs, goal);

      setAnalysis(nextAnalysis);
    } catch (error) {
      console.error("Kunde inte analysera träningshistorik:", error);
      setAnalysis(null);
      setAnalysisError("Kunde inte analysera träningshistorik.");
    } finally {
      setIsLoadingAnalysis(false);
    }
  }, [authUser, userGoal]);

  /**
   * Hämta AI-coach-kommentar ovanpå den strukturerade analysen.
   */
  useEffect(() => {
    async function loadGoalReview() {
      if (!analysis) {
        setGoalReview(null);
        return;
      }

      try {
        setIsLoadingGoalReview(true);
        setGoalReviewError(null);

        const goal = userGoal ?? "health";

        const response = await fetch("/api/goal-review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            goal,
            analysis,
          }),
        });

        const data = (await response.json()) as
          | {
              ok?: boolean;
              headline?: string;
              nextFocus?: string;
              comment?: string;
              error?: string;
            }
          | null;

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? "Kunde inte hämta AI-utvärdering.");
        }

        setGoalReview({
          headline: data.headline ?? "Din AI-coach säger",
          nextFocus: data.nextFocus ?? "Fortsätt bygga vidare steg för steg",
          comment: data.comment ?? "Ingen AI-kommentar tillgänglig just nu.",
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
  }, [analysis, userGoal]);

  /**
   * Visar valt gym i UI.
   */
  const selectedGym = useMemo(() => {
    if (selectedGymId === BODYWEIGHT_GYM_ID) {
      return {
        id: BODYWEIGHT_GYM_ID,
        name: "Kroppsvikt / utan gym",
      };
    }

    return gyms.find((gym) => String(gym.id) === selectedGymId) ?? null;
  }, [gyms, selectedGymId]);

  /**
   * Låser generera-knappen tills användardata finns.
   */
  const canGenerateAiWorkout = authChecked && !!authUser && !isLoadingGyms;

  /**
   * Progressbar för analyskortet.
   */
  const analysisProgressWidth = useMemo(() => {
    if (!analysis) return "0%";

    return `${Math.max(4, Math.round(analysis.evaluation.overallScore * 100))}%`;
  }, [analysis]);

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
    // Extra skydd så att Safari inte hinner navigera vidare innan auth är klar.
    if (!authUser?.id) {
      setPageError("Användaren är inte färdigladdad ännu. Försök igen.");
      return;
    }

    setPageError(null);

    const params = new URLSearchParams();
    params.set("duration", String(selectedDuration));

    // Skicka med userId uttryckligen så preview-sidan har ett robust fallback.
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
    return <div className="p-6 text-sm text-gray-600">Laddar...</div>;
  }

  const statusClasses = analysis
    ? getStatusClasses(analysis.evaluation.status)
    : getStatusClasses("steady");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        {/* Topp */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-600">Träningsapp</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
              Dagens pass
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Välj inställningar för AI-pass eller skapa ett eget pass.
            </p>
          </div>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-sm"
              aria-label="Öppna meny"
            >
              {isMenuOpen ? "×" : "☰"}
            </button>

            {isMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <Link
                  href="/settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Inställningar
                </Link>

                <Link
                  href="/history"
                  onClick={() => setIsMenuOpen(false)}
                  className="block border-t border-gray-100 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Träningshistorik
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full border-t border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  {isLoggingOut ? "Loggar ut..." : "Logga ut"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {/* Analyskort */}
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">Din utveckling</p>
              <h2 className="mt-1 text-xl font-bold text-gray-950">
                Träning i förhållande till mål
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Strukturerad analys först, AI-coach ovanpå.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Mål: <span className="font-semibold">{getGoalLabel(userGoal)}</span>
            </div>
          </div>

          {!userGoal ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Du har ännu inte valt något träningsmål. Analysen utgår därför
              tillfälligt från <span className="font-semibold">hälsa</span>.
              <Link href="/settings" className="ml-1 font-semibold underline">
                Välj mål i inställningar
              </Link>
              .
            </div>
          ) : null}

          {isLoadingAnalysis ? (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Analyserar träningshistorik...
            </div>
          ) : null}

          {analysisError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {analysisError}
            </div>
          ) : null}

          {analysis ? (
            <>
              {/* AI-coach */}
              <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                      AI-coach
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-indigo-950">
                      {goalReview?.headline ?? "Din coach analyserar läget"}
                    </h3>
                  </div>

                  {isLoadingGoalReview ? (
                    <span className="text-sm font-medium text-indigo-700">
                      Tänker...
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-sm font-semibold text-indigo-900">
                  Viktigast just nu:{" "}
                  <span className="font-normal">
                    {goalReview?.nextFocus ??
                      analysis.focusAreas[0]?.title ??
                      "Fortsätt med jämn träning och tydlig riktning."}
                  </span>
                </p>

                <p className="mt-3 text-sm leading-6 text-indigo-950">
                  {goalReview?.comment ??
                    "När AI-kommentaren är klar visas en kort coachbedömning här."}
                </p>

                {goalReviewError ? (
                  <p className="mt-3 text-sm text-red-700">{goalReviewError}</p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${statusClasses.badge}`}
                >
                  {getStatusLabel(analysis.evaluation.status)}
                </div>

                <div className="text-sm text-gray-600">
                  Total bedömning:{" "}
                  <span className="font-semibold text-gray-900">
                    {Math.round(analysis.evaluation.overallScore * 100)} / 100
                  </span>
                </div>
              </div>

              {/* Progressbar för snabb översikt */}
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${statusClasses.progress}`}
                  style={{ width: analysisProgressWidth }}
                />
              </div>

              <p className="mt-4 text-sm leading-6 text-gray-700">
                {analysis.evaluation.summary}
              </p>

              {/* Metrics */}
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Frekvens
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-950">
                    {analysis.metrics.weeklyFrequency}
                    <span className="ml-1 text-base font-medium text-gray-500">
                      pass/vecka
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Snitt senaste 28 dagarna.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Kontinuitet
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-950">
                    {formatPercent(analysis.metrics.consistencyScore)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Hur jämnt passen ligger över tid.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Progression
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-950">
                    {formatPercent(analysis.metrics.progressionScore)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Enkel trend mellan senaste och föregående period.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Återhämtning
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-950">
                    {formatPercent(analysis.metrics.recoveryScore)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Rimlig balans mellan pass och vila.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Övningsbredd
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-950">
                    {formatPercent(analysis.metrics.exerciseVarietyScore)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Baserat på antal unika övningar senaste perioden.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Snittpass
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-950">
                    {analysis.metrics.averageWorkoutMinutes}
                    <span className="ml-1 text-base font-medium text-gray-500">
                      min
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Genomsnitt senaste 28 dagarna.
                  </p>
                </div>
              </div>

              {/* Fokusområden */}
              <div className="mt-5 rounded-2xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Fokusområden just nu
                  </h3>
                </div>

                <div className="space-y-3 p-4">
                  {analysis.focusAreas.length > 0 ? (
                    analysis.focusAreas.map((area) => (
                      <div
                        key={area.id}
                        className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-gray-900">
                            {area.title}
                          </h4>

                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPriorityClasses(
                              area.priority
                            )}`}
                          >
                            {area.priority === "high"
                              ? "Hög prioritet"
                              : area.priority === "medium"
                              ? "Medel"
                              : "Låg"}
                          </span>
                        </div>

                        <p className="mt-2 text-sm leading-6 text-gray-700">
                          {area.reason}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">
                      Inga tydliga fokusområden sticker ut just nu. Fortsätt med
                      jämn och hållbar träning.
                    </p>
                  )}
                </div>
              </div>

              {/* Rekommendationer */}
              <div className="mt-5 rounded-2xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Råd framåt
                  </h3>
                </div>

                <div className="space-y-3 p-4">
                  {analysis.recommendations.length > 0 ? (
                    analysis.recommendations.map((recommendation) => (
                      <div
                        key={recommendation.id}
                        className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-indigo-950">
                            {recommendation.title}
                          </h4>

                          <span className="inline-flex rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700">
                            {getTimeframeLabel(recommendation.timeframe)}
                          </span>
                        </div>

                        <p className="mt-2 text-sm leading-6 text-indigo-950">
                          {recommendation.description}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">
                      Fler konkreta råd kommer när mer träningshistorik finns.
                    </p>
                  )}
                </div>
              </div>

              {/* Styrkor och luckor */}
              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <h3 className="text-sm font-semibold text-emerald-900">
                    Det som ser bra ut
                  </h3>

                  {analysis.evaluation.strengths.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-emerald-900">
                      {analysis.evaluation.strengths.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-emerald-900">
                      Här kommer tydligare styrkor fram när mer historik finns.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold text-amber-900">
                    Det som bör förbättras
                  </h3>

                  {analysis.evaluation.gaps.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-amber-900">
                      {analysis.evaluation.gaps.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-amber-900">
                      Inga tydliga varningssignaler just nu.
                    </p>
                  )}
                </div>
              </div>

              {/* Debug-toggle */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowAnalysisDebug((prev) => !prev)}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  {showAnalysisDebug ? "Dölj analysdebug" : "Visa analysdebug"}
                </button>

                {showAnalysisDebug ? (
                  <pre className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-gray-950 p-4 text-xs leading-6 text-gray-100">
                    {JSON.stringify(
                      {
                        analysis,
                        goalReview,
                      },
                      null,
                      2
                    )}
                  </pre>
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        {/* AI-pass-inställningar */}
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">
            Inställningar för AI-pass
          </p>
          <h2 className="mt-1 text-xl font-bold text-gray-950">
            Nästa träningspass
          </h2>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm font-semibold text-gray-900">
                Passlängd
              </label>
              <span className="text-sm text-gray-500">
                {MIN_DURATION}–{MAX_DURATION} min
              </span>
            </div>

            {/* Fritt val av längd i minuter */}
            <div className="mt-3">
              <label className="text-sm text-gray-600">Antal minuter</label>
              <input
                inputMode="numeric"
                value={durationInput}
                onChange={(e) => handleDurationInputChange(e.target.value)}
                onBlur={handleDurationInputBlur}
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base outline-none"
              />
              <p className="mt-2 text-sm text-gray-500">
                AI-passet genereras för cirka {selectedDuration} minuter.
              </p>
            </div>

            {/* Snabbval finns kvar för bekvämlighet */}
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_DURATION_OPTIONS.map((duration) => {
                const isSelected = selectedDuration === duration;

                return (
                  <button
                    key={duration}
                    type="button"
                    onClick={() => handleQuickDurationSelect(duration)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-semibold ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-gray-200 bg-white text-gray-900"
                    }`}
                  >
                    {duration} min
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm font-semibold text-gray-900">
                Valt gym
              </label>
              <Link
                href="/gyms"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Redigera gym
              </Link>
            </div>

            {isLoadingGyms ? (
              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                Hämtar gym...
              </div>
            ) : (
              <>
                <select
                  value={selectedGymId}
                  onChange={(e) => setSelectedGymId(e.target.value)}
                  className="mt-3 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base outline-none"
                >
                  {/* Kroppsvikt finns alltid som alternativ */}
                  <option value={BODYWEIGHT_GYM_ID}>
                    Kroppsvikt / utan gym
                  </option>

                  {gyms.map((gym) => (
                    <option key={String(gym.id)} value={String(gym.id)}>
                      {gym.name}
                    </option>
                  ))}
                </select>

                {selectedGym ? (
                  <p className="mt-2 text-sm text-gray-500">
                    Vald träningsmiljö:{" "}
                    <span className="font-semibold text-gray-700">
                      {selectedGym.name}
                    </span>
                  </p>
                ) : null}

                {gymError ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {gymError}
                  </div>
                ) : null}
              </>
            )}
          </div>

          {pageError ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleGenerateAiWorkout}
              disabled={!canGenerateAiWorkout}
              className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {canGenerateAiWorkout
                ? "Generera AI-pass"
                : "Laddar användardata..."}
            </button>

            <Link
              href="/workout/custom"
              className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50"
            >
              Eget pass
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}