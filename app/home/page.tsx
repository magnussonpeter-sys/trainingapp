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
import {
  buildWeeklyWorkoutStructure,
  formatSplitStyle,
  formatWorkoutFocus,
} from "@/lib/weekly-workout-structure";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import { generateWorkout } from "@/lib/workout-generator";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { getPendingSyncQueue } from "@/lib/workout-flow/pending-sync-store";
import { saveWorkoutDraft } from "@/lib/workout-flow/workout-draft-store";
import { getExercisePreferences } from "@/lib/exercise-preference-storage";

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
  weights_kg?: number[] | null;
  quantity?: number | null;
};

type GymWithEquipment = {
  id: string | number;
  name: string;
  equipment?: GymEquipmentItem[];
};

type BudgetStatusTone = {
  barClassName: string;
  chipClassName: string;
  chipText: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}

function getBudgetStatusTone(loadStatus: string): BudgetStatusTone {
  if (loadStatus === "high_risk") {
    return {
      barClassName: "bg-gradient-to-r from-rose-500 to-red-500",
      chipClassName: "border border-rose-200 bg-rose-50 text-rose-700",
      chipText: "Överbelastning",
    };
  }

  if (loadStatus === "over") {
    return {
      barClassName: "bg-gradient-to-r from-amber-500 to-orange-500",
      chipClassName: "border border-amber-200 bg-amber-50 text-amber-700",
      chipText: "Över budget",
    };
  }

  if (loadStatus === "on_target") {
    return {
      barClassName: "bg-gradient-to-r from-emerald-500 to-lime-500",
      chipClassName: "border border-emerald-200 bg-emerald-50 text-emerald-700",
      chipText: "På rätt nivå",
    };
  }

  return {
    barClassName: "bg-gradient-to-r from-sky-500 to-cyan-500",
    chipClassName: "border border-sky-200 bg-sky-50 text-sky-700",
    chipText: "Bygg vidare",
  };
}

function getProgressLabel(progressStatus: string) {
  if (progressStatus === "improving") {
    return "Framåt";
  }

  if (progressStatus === "plateau") {
    return "Platå";
  }

  if (progressStatus === "fatigued") {
    return "Hög trötthet";
  }

  if (progressStatus === "stable") {
    return "Stabil";
  }

  return "Begränsad data";
}

function getFrequencyLabel(frequencyCount: number) {
  if (frequencyCount <= 0) {
    return "Inte tränad ännu";
  }

  if (frequencyCount === 1) {
    return "1 pass denna vecka";
  }

  return `${frequencyCount} pass denna vecka`;
}

function formatMuscleGroup(group: MuscleBudgetGroup) {
  if (group === "chest") return "Bröst";
  if (group === "back") return "Rygg";
  if (group === "quads") return "Framsida lår";
  if (group === "hamstrings") return "Baksida lår";
  if (group === "glutes") return "Säte";
  if (group === "shoulders") return "Axlar";
  if (group === "biceps") return "Biceps";
  if (group === "triceps") return "Triceps";
  if (group === "calves") return "Vader";
  return "Bål";
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
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showWeeklyInsights, setShowWeeklyInsights] = useState(false);

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
  const weeklyStructure = useMemo(() => {
    return buildWeeklyWorkoutStructure({
      logs: workoutLogs,
      settings,
    });
  }, [settings, workoutLogs]);

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
      setPendingCount(0);
      return;
    }

    try {
      const queue = getPendingSyncQueue();
      setPendingCount(queue.filter((item) => item.userId === userId).length);
    } catch {
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
      const lessOftenExerciseIds = getExercisePreferences(userId)
        .filter((entry) => entry.preference === "less_often")
        .map((entry) => entry.exerciseId);

      const { workout, debug } = await generateWorkout({
        userId,
        goal,
        durationMinutes,
        equipment,
        gym: gymId,
        gymLabel,
        gymEquipmentDetails: selectedGym?.equipment ?? [],
        confidenceScore: weeklyStructure.confidenceScore,
        nextFocus: weeklyStructure.nextFocus,
        splitStyle: weeklyStructure.splitStyle,
        weeklyBudget: weeklyStructure.muscleBudget.map((entry) => ({
          group: entry.group,
          label: entry.label,
          priority: entry.priority,
          targetSets: entry.targetSets,
          completedSets: entry.completedSets,
          effectiveSets: entry.effectiveSets,
          remainingSets: entry.remainingSets,
          recent4WeekAvgSets: entry.recent4WeekAvgSets,
        })),
        weeklyPlan: weeklyStructure.upcomingDays,
        lessOftenExerciseIds,
        avoidSupersets: settings?.avoid_supersets ?? null,
      });

      // Spara draft innan preview öppnas.
      saveWorkoutDraft(userId, {
        ...workout,
        duration: durationMinutes,
        gym: gymId,
        gymLabel,
        availableEquipment: equipment,
        plannedFocus: weeklyStructure.nextFocus,
        // Behåll AI-debug med draften så preview kan visa exakt input/output vid behov.
        aiDebug: debug ?? undefined,
      });
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Veckostruktur
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                Nästa fokus: {formatWorkoutFocus(weeklyStructure.nextFocus)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {weeklyStructure.summaryText}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {weeklyStructure.optimalPlanText}
              </p>
              {weeklyStructure.configuredPriorityMuscles.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {weeklyStructure.configuredPriorityMuscles.map((group, index) => (
                    <span
                      key={group}
                      className="rounded-full border border-lime-300 bg-lime-100 px-3 py-1 text-xs font-medium text-slate-800"
                    >
                      {index === 0 ? "Prio 1" : "Prio 2"}: {formatMuscleGroup(group)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                  7 dagar
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {weeklyStructure.completedLast7Days}
                </p>
                <p className="text-xs text-slate-600">genomförda pass</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Confidence
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {weeklyStructure.confidenceScore === "high"
                    ? "Hög"
                    : weeklyStructure.confidenceScore === "medium"
                      ? "Medel"
                      : "Låg"}
                </p>
                <p className="text-xs text-slate-600">
                  {formatSplitStyle(weeklyStructure.splitStyle)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowWeeklyInsights((previous) => !previous)}
              className={cn(uiButtonClasses.secondary, "w-full")}
            >
              {showWeeklyInsights ? "Dölj veckoplan & muskelbudget" : "Visa veckoplan & muskelbudget"}
            </button>

            {showWeeklyInsights ? (
              <div className="mt-5 space-y-6">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Optimal rytm framåt
                    </p>
                    <p className="text-xs text-slate-500">
                      Kör när tid finns, appen anpassar nästa pass efter läget
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {weeklyStructure.upcomingSteps.map((step) => (
                      <div
                        key={step.label}
                        className={cn(
                          "rounded-2xl border px-4 py-4",
                          step.type === "training"
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-slate-50",
                        )}
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {step.label}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {step.focus ? formatWorkoutFocus(step.focus) : "Återhämtning"}
                        </p>
                        <div className="mt-2 flex min-h-[40px] flex-wrap gap-1.5">
                          {step.type === "training" && step.muscleGroups.length > 0 ? (
                            step.muscleGroups.map((group) => (
                              <span
                                key={`${step.label}-${group}`}
                                className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                              >
                                {formatMuscleGroup(group)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">
                              Låt återhämtning och vardag styra när nästa pass passar bäst.
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: "Nästa pass",
                      value: weeklyStructure.nextFocusMuscleGroups.length
                        ? weeklyStructure.nextFocusMuscleGroups
                            .map((group) => formatMuscleGroup(group))
                            .join(", ")
                        : formatWorkoutFocus(weeklyStructure.nextFocus),
                    },
                    {
                      label: "Planerade pass",
                      value: `${weeklyStructure.passCount} träningspass i flexibel rytm`,
                    },
                    {
                      label: "Återhämtning",
                      value: "Växla efter tid, energi och hur förra passet kändes",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Muskelbudget denna vecka
                    </p>
                    <p className="text-xs text-slate-500">
                      Effektiva set väger in både volym och upplevd ansträngning
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {weeklyStructure.muscleBudget
                      .filter((entry) => {
                        return (
                          entry.priority !== "low" ||
                          entry.completedSets > 0 ||
                          entry.remainingSets > 0
                        );
                      })
                      .sort((left, right) => {
                        const priorityRank = { high: 0, medium: 1, low: 2 };
                        const rankDifference =
                          priorityRank[left.priority] - priorityRank[right.priority];

                        if (rankDifference !== 0) {
                          return rankDifference;
                        }

                        return right.remainingSets - left.remainingSets;
                      })
                      .map((entry) => {
                        const progress =
                          entry.targetSets > 0
                            ? Math.min(100, (entry.effectiveSets / entry.targetSets) * 100)
                            : 0;
                        const tone = getBudgetStatusTone(entry.loadStatus);
                        const qualityPercent =
                          entry.qualityScore != null
                            ? Math.round(entry.qualityScore * 100)
                            : null;

                        return (
                          <div key={entry.group} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span
                                    className={cn(
                                      "rounded-full px-2.5 py-1 text-[11px] font-medium",
                                      tone.chipClassName,
                                    )}
                                  >
                                    {tone.chipText}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                    {getProgressLabel(entry.progressStatus)}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right">
                                <p className="text-sm font-semibold text-slate-900">
                                  {entry.remainingSets > 0 ? `${entry.remainingSets} kvar` : "Klar"}
                                </p>
                                <p className="text-xs text-slate-500">
                                  4v-snitt {formatDecimal(entry.recent4WeekAvgEffectiveSets)} effektiva set
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={cn("h-full rounded-full", tone.barClassName)}
                                style={{ width: `${Math.max(8, progress)}%` }}
                              />
                            </div>

                            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                              <p>
                                <span className="font-medium text-slate-800">
                                  {formatDecimal(entry.effectiveSets)}/{entry.targetSets}
                                </span>{" "}
                                effektiva set
                              </p>
                              <p>
                                Direkt/indirekt:{" "}
                                <span className="font-medium text-slate-800">
                                  {formatDecimal(entry.directSets)} / {formatDecimal(entry.indirectSets)}
                                </span>
                              </p>
                              <p>
                                Kvalitet:{" "}
                                <span className="font-medium text-slate-800">
                                  {qualityPercent != null ? `${qualityPercent}%` : "saknas"}
                                </span>
                              </p>
                              <p>{getFrequencyLabel(entry.frequencyCount)}</p>
                            </div>

                            <p className="mt-2 text-xs text-slate-500">
                              Direkta set kommer från övningar där muskeln är huvudmål. Indirekta set
                              är assisterande stimulans, till exempel triceps i pressövningar.
                            </p>

                            {entry.warningText ? (
                              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                {entry.warningText}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                </div>
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
