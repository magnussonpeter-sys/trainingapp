"use client";

// Home-sidan ska vara navet i appen.
// Fokus här:
// - behålla fungerande logik
// - AI-pass ska fungera
// - resume + pending sync tydligt
// - ljus grön, lugn design
// - tydlig knapp för att logga ut
// - förvalda passlängder + eget val i minuter

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

type AuthUser = {
  id?: string | number | null;
  name?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
};

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

function getDisplayName(user: AuthUser | null) {
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

// Normaliserar equipment till stabila interna id:n.
// Viktigt: vi skickar inte både svenska labels och interna namn till AI.
function normalizeEquipmentStrings(input: GymEquipmentItem[] | undefined) {
  if (!Array.isArray(input) || input.length === 0) {
    return ["bodyweight"];
  }

  const values = new Set<string>();

  const addNormalizedValue = (rawValue: string | null | undefined) => {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return;
    }

    const normalized = rawValue.trim().toLowerCase();

    if (
      normalized === "bodyweight" ||
      normalized === "body_weight" ||
      normalized.includes("kroppsvikt") ||
      normalized.includes("utan gym")
    ) {
      values.add("bodyweight");
      return;
    }

    if (
      normalized === "dumbbell" ||
      normalized === "dumbbells" ||
      normalized.includes("hantel")
    ) {
      values.add("dumbbells");
      return;
    }

    if (normalized === "barbell" || normalized.includes("skivstång")) {
      values.add("barbell");
      return;
    }

    if (normalized === "bench" || normalized.includes("bänk")) {
      values.add("bench");
      return;
    }

    if (normalized === "rack" || normalized.includes("ställning")) {
      values.add("rack");
      return;
    }

    if (
      normalized === "rings" ||
      normalized.includes("romerska ringar") ||
      normalized.includes("ringar")
    ) {
      values.add("rings");
      return;
    }

    if (
      normalized === "pullup_bar" ||
      normalized === "pull-up bar" ||
      normalized.includes("pullup") ||
      normalized.includes("pull-up") ||
      normalized.includes("chins") ||
      normalized.includes("räcke")
    ) {
      values.add("pullup_bar");
      return;
    }

    if (
      normalized === "cable_machine" ||
      normalized.includes("cable") ||
      normalized.includes("kabel")
    ) {
      values.add("cable_machine");
      return;
    }
  };

  for (const item of input) {
    addNormalizedValue(item.equipment_type);
    addNormalizedValue(item.equipmentType);
    addNormalizedValue(item.label);
    addNormalizedValue(item.name);
    addNormalizedValue(item.type);
  }

  if (values.size === 0) {
    values.add("bodyweight");
  }

  return Array.from(values);
}

function clampDuration(value: number) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.min(Math.max(Math.round(value), 5), 180);
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
  } = useHomeData({ router });

  const userId = authUser?.id ? String(authUser.id) : "";

  const [selectedGymId, setSelectedGymId] = useState<string>("bodyweight");
  const [selectedDurationPreset, setSelectedDurationPreset] =
    useState<string>("30");
  const [customDurationInput, setCustomDurationInput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const durationMinutes = useMemo(() => {
    if (selectedDurationPreset === "custom") {
      return clampDuration(Number(customDurationInput));
    }

    return clampDuration(Number(selectedDurationPreset));
  }, [customDurationInput, selectedDurationPreset]);

  useEffect(() => {
    if (gymOptions.length === 0) {
      return;
    }

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

      // Hämta stabila equipment-id:n från valt gym.
      const equipment = normalizeEquipmentStrings(selectedGym?.equipment);
      const goal = settings?.training_goal?.trim() || "health";
      const isBodyweightGym = String(selectedGym?.id) === "bodyweight";

      // Skicka både gym-id och gymnamn vidare.
      const gymId = isBodyweightGym ? null : String(selectedGym?.id ?? "");
      const gymLabel = isBodyweightGym
        ? "Kroppsvikt / utan gym"
        : selectedGym?.name ?? null;

      const { workout } = await generateWorkout({
        userId,
        goal,
        durationMinutes,
        equipment,
        gym: gymId,
        gymLabel,
      });

      // Spara draft innan preview öppnas.
      saveWorkoutDraft(userId, {
        ...workout,
        duration: durationMinutes,
        gym: gymId,
        gymLabel,
        availableEquipment: equipment,
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

  async function handleLogout() {
    try {
      setIsLoggingOut(true);

      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Logout misslyckades");
      }
    } catch {
      // Gå ändå till startsidan som fallback.
    } finally {
      router.push("/");
      router.refresh();
      setIsLoggingOut(false);
    }
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
          <div className="bg-gradient-to-br from-emerald-100 via-emerald-50 to-lime-50 px-6 py-6 text-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Hej
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                  {getDisplayName(authUser)}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  Vad vill du göra idag?
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className={uiButtonClasses.secondary}
              >
                {isLoggingOut ? "Loggar ut..." : "Logga ut"}
              </button>
            </div>
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
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
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

            <div className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Längd
              </span>

              <div className="space-y-3">
                <select
                  value={selectedDurationPreset}
                  onChange={(event) => setSelectedDurationPreset(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                >
                  <option value={15}>15 min</option>
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                  <option value="custom">Eget val</option>
                </select>

                {selectedDurationPreset === "custom" ? (
                  <input
                    type="number"
                    min={5}
                    max={180}
                    step={1}
                    value={customDurationInput}
                    onChange={(event) => setCustomDurationInput(event.target.value)}
                    placeholder="Ange minuter, t.ex. 45"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                ) : null}

                <p className="text-xs text-slate-500">
                  Vald passlängd: {durationMinutes} min
                </p>
              </div>
            </div>
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
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
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