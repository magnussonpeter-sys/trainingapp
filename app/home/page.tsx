"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HomeStartCard from "@/components/home/home-start-card";
import LastWorkoutCard from "@/components/home/last-workout-card";
import StatusSummaryCard from "@/components/home/status-summary-card";
import AppLayout from "@/components/layout/AppLayout";
import { useHomeData, type HomeGoal } from "@/hooks/use-home-data";
import { useHomePreferences } from "@/hooks/use-home-preferences";
import {
  buildWorkoutRequest,
  type WorkoutFlowGym,
} from "@/lib/workout-flow/build-workout-request";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import { saveWorkoutDraft } from "@/lib/workout-flow/workout-draft-store";
import { generateWorkout } from "@/lib/workout-generator";
import type { WorkoutLog } from "@/lib/workout-log-storage";

type Goal = HomeGoal;

type GymEquipmentItem = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  name?: string | null;
  type?: string | null;
};

type GymDetail = WorkoutFlowGym;

type HomeStatus = {
  title: string;
  detail: string;
};

const QUICK_DURATION_OPTIONS = [15, 20, 30, 45] as const;
const BODYWEIGHT_GYM_ID = "bodyweight";
const BODYWEIGHT_LABEL = "Kroppsvikt / utan gym";

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

// Normaliserar ett enskilt gymobjekt med utrustning.
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

// Väljer bästa möjliga namn för hälsningen.
function getDisplayName(
  user:
    | {
        displayName?: string | null;
        name?: string | null;
        username?: string | null;
        email?: string | null;
      }
    | null,
) {
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

// Formaterar datum för senaste pass.
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

// Formaterar träningslängd i minuter.
function formatDurationMinutes(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

// Räknar totalt antal set i ett loggat pass.
function getTotalSets(log: WorkoutLog) {
  return log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

// Visar mänsklig etikett för måltypen.
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

// Enkel statusruta på home utan tung dashboard-logik.
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
      detail: `Du har tränat ${recentCount} pass senaste veckan. Fortsätt så för ${getGoalLabel(
        goal,
      ).toLowerCase()}.`,
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

  // Home-data är nu samlad i egen hook.
  const {
    authChecked,
    authUser,
    gyms,
    settings,
    workoutLogs,
    logsSource,
    isLoadingGyms,
    gymError,
    pageError,
    setPageError,
  } = useHomeData({ router });

  // Knapplägen stannar kvar lokalt i sidan.
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Home-preferenser hålls i egen hook.
  const {
    selectedDuration,
    durationInput,
    selectedGymId,
    hasLoadedPreferences,
    setSelectedGymId,
    updateDuration,
    updateDurationInput,
    commitDurationInput,
  } = useHomePreferences({
    userId: authUser?.id ? String(authUser.id) : null,
    defaultGymId: BODYWEIGHT_GYM_ID,
  });

  useEffect(() => {
    // Om valt gym försvunnit, återgå till kroppsvikt.
    setSelectedGymId((prev) => {
      if (prev === BODYWEIGHT_GYM_ID) {
        return prev;
      }

      const gymExists = gyms.some((gym) => String(gym.id) === prev);
      return gymExists ? prev : BODYWEIGHT_GYM_ID;
    });
  }, [gyms, setSelectedGymId]);

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

  // Startknapparna aktiveras först när allt nödvändigt är laddat.
  const canUseStartActions =
    authChecked &&
    !!authUser &&
    hasLoadedPreferences &&
    !isLoadingGyms &&
    !isStartingWorkout &&
    !isOpeningPreview;

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

  async function buildSelectedWorkoutRequest() {
    if (!authUser?.id) {
      throw new Error("Användaren är inte färdigladdad ännu.");
    }

    const userId = String(authUser.id);

    // Ladda gymdetaljer bara när ett riktigt gym är valt.
    const gymDetail =
      selectedGymId === BODYWEIGHT_GYM_ID
        ? null
        : await loadSelectedGymDetail({
            userId,
            gymId: selectedGymId,
          });

    return buildWorkoutRequest({
      userId,
      goal: settings?.training_goal,
      durationMinutes: selectedDuration,
      selectedGymId,
      selectedGymName: selectedGym?.name,
      bodyweightGymId: BODYWEIGHT_GYM_ID,
      bodyweightLabel: BODYWEIGHT_LABEL,
      gymDetail,
    });
  }

  async function handleStartWorkout() {
    try {
      setIsStartingWorkout(true);
      setPageError(null);

      // Bygg request enligt workout-flow-lagret.
      const request = await buildSelectedWorkoutRequest();

      const result = await generateWorkout({
        userId: request.userId,
        goal: request.goal,
        durationMinutes: request.durationMinutes,
        equipment: request.equipment,
      });

      // Normalisera själva workout-objektet, inte ett wrapper-objekt.
      const normalizedWorkout = normalizePreviewWorkout({
        ...result.workout,
        duration: request.durationMinutes,
        gymLabel: request.gymLabel,
      });

      // Spara draft med korrekt signatur: (userId, draft)
      saveWorkoutDraft(request.userId, normalizedWorkout);

      // Defaultflödet enligt planen är direkt till run.
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

  async function handleReviewFirst() {
    if (!authUser?.id) {
      setPageError("Användaren är inte färdigladdad ännu.");
      return;
    }

    try {
      setIsOpeningPreview(true);
      setPageError(null);

      // Preview behöver ett faktiskt workout-draft för att kunna ladda något.
      const request = await buildSelectedWorkoutRequest();

      const result = await generateWorkout({
        userId: request.userId,
        goal: request.goal,
        durationMinutes: request.durationMinutes,
        equipment: request.equipment,
      });

      const normalizedWorkout = normalizePreviewWorkout({
        ...result.workout,
        duration: request.durationMinutes,
        gymLabel: request.gymLabel,
      });

      // Vi sparar samma draft som /run använder, men leder till preview i stället.
      saveWorkoutDraft(request.userId, normalizedWorkout);

      const params = new URLSearchParams();
      params.set("userId", request.userId);

      router.push(`/workout/preview?${params.toString()}`);
    } catch (error) {
      console.error("Kunde inte öppna preview:", error);
      setPageError(
        error instanceof Error
          ? error.message
          : "Kunde inte öppna preview just nu.",
      );
    } finally {
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
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
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
    <AppLayout>
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
            Hej igen
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {displayName}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Starta pass direkt eller granska först. Senaste tid och gym sparas
            automatiskt.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Mål: {getGoalLabel(settings?.training_goal)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Pass senaste 7 dagar: {recentWeekCount}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Källa: {logsSource === "api" ? "Databas" : "Lokal fallback"}
            </span>
          </div>
        </section>

        <HomeStartCard
          selectedDuration={selectedDuration}
          durationInput={durationInput}
          quickDurationOptions={QUICK_DURATION_OPTIONS}
          selectedGymId={selectedGymId}
          selectedGymName={selectedGym?.name ?? BODYWEIGHT_LABEL}
          gyms={gyms}
          bodyweightId={BODYWEIGHT_GYM_ID}
          bodyweightLabel={BODYWEIGHT_LABEL}
          canUseStartActions={canUseStartActions}
          isStartingWorkout={isStartingWorkout}
          isOpeningPreview={isOpeningPreview}
          onDurationSelect={updateDuration}
          onDurationInputChange={updateDurationInput}
          onDurationInputBlur={commitDurationInput}
          onGymChange={setSelectedGymId}
          onStartWorkout={handleStartWorkout}
          onReviewFirst={handleReviewFirst}
        />

        <StatusSummaryCard
          title={statusSummary.title}
          detail={statusSummary.detail}
        />

        {latestWorkout ? (
          <LastWorkoutCard
            title={latestWorkout.workoutName}
            completedAtLabel={formatDateTime(latestWorkout.completedAt)}
            durationLabel={formatDurationMinutes(latestWorkout.durationSeconds)}
            setsLabel={`${getTotalSets(latestWorkout)} set`}
            href={`/history/${latestWorkout.id}`}
          />
        ) : null}

        {gymError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {gymError}
          </div>
        ) : null}

        {pageError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {pageError}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? "Loggar ut..." : "Logga ut"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}