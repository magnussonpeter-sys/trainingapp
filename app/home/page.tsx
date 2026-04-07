"use client";

// Home-sidan ska vara navet i appen.
// Fokus här:
// - behålla fungerande logik
// - generera AI-pass på ett säkert sätt
// - spara draft innan preview
// - visa resume + pending sync tydligt
// - hålla designen lugn och konsekvent

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHomeData } from "@/hooks/use-home-data";
import { generateWorkout } from "@/lib/workout-generator";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { getPendingSyncQueue } from "@/lib/workout-flow/pending-sync-store";
import {
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";

type GymEquipmentItem = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  name?: string | null;
  type?: string | null;
};

type GymWithEquipment = {
  id: string | number;
  name: string;
  equipment?: GymEquipmentItem[];
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
} | null) {
  if (!user) {
    return "där";
  }

  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "där"
  );
}

function normalizeEquipmentStrings(input: GymEquipmentItem[] | undefined) {
  if (!Array.isArray(input)) {
    return ["bodyweight"];
  }

  const values = new Set<string>();

  for (const item of input) {
    const candidates = [
      item.equipment_type,
      item.equipmentType,
      item.label,
      item.name,
      item.type,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        values.add(candidate.trim());
      }
    }
  }

  if (values.size === 0) {
    values.add("bodyweight");
  }

  return Array.from(values);
}

export default function HomePage() {
  const router = useRouter();

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

  const userId = authUser?.id ? String(authUser.id) : "";

  const [selectedGymId, setSelectedGymId] = useState<string>("bodyweight");
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const gymOptions = useMemo(() => {
    const normalizedGyms = (gyms as GymWithEquipment[]) ?? [];

    return [
      {
        id: "bodyweight",
        name: "Kroppsvikt / utan gym",
        equipment: [{ equipment_type: "bodyweight", label: "bodyweight" }],
      },
      ...normalizedGyms,
    ];
  }, [gyms]);

  const selectedGym = useMemo(() => {
    return (
      gymOptions.find((gym) => String(gym.id) === selectedGymId) ?? gymOptions[0]
    );
  }, [gymOptions, selectedGymId]);

  const latestWorkout = workoutLogs?.[0] ?? null;

  useEffect(() => {
    if (gymOptions.length === 0) {
      return;
    }

    // Behåll valt gym om det fortfarande finns, annars välj första.
    const stillExists = gymOptions.some(
      (gym) => String(gym.id) === String(selectedGymId),
    );

    if (!stillExists) {
      setSelectedGymId(String(gymOptions[0].id));
    }
  }, [gymOptions, selectedGymId]);

  useEffect(() => {
    if (!userId) {
      setHasDraft(false);
      setPendingCount(0);
      return;
    }

    try {
      const draft = getWorkoutDraft(userId);
      setHasDraft(Boolean(draft));

      const queue = getPendingSyncQueue();
      setPendingCount(queue.filter((item) => item.userId === userId).length);
    } catch {
      setHasDraft(false);
      setPendingCount(0);
    }
  }, [userId, workoutLogs]);

  async function handleReviewAiWorkout() {
    if (!userId) {
      setAiError("Kunde inte läsa in användaren.");
      return;
    }

    try {
      setAiError(null);
      setIsGenerating(true);

      const equipment = normalizeEquipmentStrings(selectedGym?.equipment);
      const goal = settings?.training_goal?.trim() || "health";

      const { workout } = await generateWorkout({
        userId,
        goal,
        durationMinutes,
        equipment,
      });

      // Spara alltid draft innan preview öppnas.
      saveWorkoutDraft(userId, {
        ...workout,
        duration: durationMinutes,
        gym: selectedGym?.name || "Kroppsvikt / utan gym",
      });

      setHasDraft(true);

      router.push(`/workout/preview?userId=${encodeURIComponent(userId)}`);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Kunde inte skapa AI-pass just nu.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleContinueWorkout() {
    if (!userId) {
      return;
    }

    router.push(`/workout/run?userId=${encodeURIComponent(userId)}`);
  }

  function handleCustomWorkout() {
    if (!userId) {
      return;
    }

    router.push(`/workout/custom?userId=${encodeURIComponent(userId)}`);
  }

  if (!authChecked) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-600">Laddar startsidan...</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, uiPageShellClasses.stack)}>
        <section className={cn(uiCardClasses.section, "overflow-hidden")}>
          <div className="bg-slate-900 px-6 py-6 text-white">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
              Hej
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {getDisplayName(authUser)}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Vad vill du göra idag?
            </p>
          </div>

          <div className="space-y-3 px-6 py-5">
            {hasDraft ? (
              <button
                type="button"
                onClick={handleContinueWorkout}
                className={cn(uiButtonClasses.primary, "w-full")}
              >
                Fortsätt pass
              </button>
            ) : null}

            {pendingCount > 0 ? (
              <div className={uiCardClasses.success}>
                <p className="font-medium">
                  {pendingCount} pass väntar på synk
                </p>
                <p className="mt-1 text-sm">
                  De skickas automatiskt när internet finns tillgängligt.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Skapa pass
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Gym
              </span>
              <select
                value={selectedGymId}
                onChange={(event) => setSelectedGymId(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                disabled={isLoadingGyms}
              >
                {gymOptions.map((gym) => (
                  <option key={String(gym.id)} value={String(gym.id)}>
                    {gym.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Längd
              </span>
              <select
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
              >
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleReviewAiWorkout}
              disabled={isGenerating || !userId}
              className={cn(uiButtonClasses.primary, "w-full")}
            >
              {isGenerating ? "Skapar AI-pass..." : "AI-pass"}
            </button>

            <button
              type="button"
              onClick={handleCustomWorkout}
              disabled={!userId}
              className={cn(uiButtonClasses.secondary, "w-full")}
            >
              Eget pass
            </button>
          </div>

          {aiError ? (
            <div className={cn(uiCardClasses.danger, "mt-4")}>{aiError}</div>
          ) : null}

          {gymError ? (
            <div className={cn(uiCardClasses.danger, "mt-4")}>{gymError}</div>
          ) : null}

          {pageError ? (
            <div className={cn(uiCardClasses.danger, "mt-4")}>{pageError}</div>
          ) : null}
        </section>

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Senaste aktivitet
              </p>
              {latestWorkout ? (
                <>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                    {latestWorkout.workoutName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Källa: {logsSource === "api" ? "synkad historik" : "lokal fallback"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  Ingen träningshistorik ännu.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.push("/history")}
              className={uiButtonClasses.secondary}
            >
              Historik
            </button>
          </div>
        </section>

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => router.push("/gyms")}
              className={uiButtonClasses.secondary}
            >
              Gym & utrustning
            </button>

            <button
              type="button"
              onClick={() => router.push("/settings")}
              className={uiButtonClasses.secondary}
            >
              Inställningar
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}