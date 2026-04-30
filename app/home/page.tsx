"use client";

// Home ska kännas som en tydlig startskärm för träning:
// - nästa steg först
// - coachande ton
// - snabb väg till AI-pass eller eget pass
// - detaljer längre ned som sekundär information

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useHomeData } from "@/hooks/use-home-data";
import { getDailyHomeWisdom } from "@/lib/get-daily-home-wisdom";
import {
  buildWeeklyWorkoutStructure,
  detectWorkoutFocus,
  formatWorkoutFocus,
} from "@/lib/weekly-workout-structure";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import { generateWorkout } from "@/lib/workout-generator";
import { extractEquipmentIdsFromRecords } from "@/lib/equipment";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { getPendingSyncQueue } from "@/lib/workout-flow/pending-sync-store";
import {
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import { getExercisePreferences } from "@/lib/exercise-preference-storage";
import { saveAiDebugGeneratedWorkoutSnapshot } from "@/lib/analysis/ai-debug-generated-history";
import { getStoredHomeGymId, storeHomeGymId } from "@/hooks/use-home-preferences";
import type { WorkoutFocus } from "@/types/workout";
import type { WorkoutLog } from "@/lib/workout-log-storage";

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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
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

// Normaliserar equipment till stabila interna id:n för AI-flödet.
function normalizeEquipmentStrings(input: GymEquipmentItem[] | undefined) {
  return extractEquipmentIdsFromRecords(input ?? [], {
    includeBodyweightFallback: true,
  });
}

function clampDuration(value: number) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.min(Math.max(Math.round(value), 5), 180);
}

function getLastUsedGymId(userId: string, gymOptions: Array<{ id: string | number }>) {
  // Explicit sparat gymval ska vara sann källa för startsidan.
  const storedGymId = getStoredHomeGymId(userId);
  if (storedGymId && gymOptions.some((gym) => String(gym.id) === storedGymId)) {
    return storedGymId;
  }

  return null;
}

function getCoachMessage(params: {
  logs: WorkoutLog[];
  nextFocus: WorkoutFocus;
  completedLast7Days: number;
  durationMinutes: number;
}) {
  const { logs, nextFocus, completedLast7Days, durationMinutes } = params;
  const latestCompletedLog = [...logs]
    .filter((log) => log.status === "completed")
    .sort(
      (left, right) =>
        new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime(),
    )[0];
  const latestFocus = latestCompletedLog ? detectWorkoutFocus(latestCompletedLog) : null;

  if (logs.length === 0) {
    return `Bra läge att komma igång. Ett ${durationMinutes}-minuters ${formatWorkoutFocus(nextFocus).toLowerCase()}pass passar bra idag.`;
  }

  if (completedLast7Days >= 3) {
    return `Bra kontinuitet senaste veckan. ${formatWorkoutFocus(nextFocus)} passar bra idag.`;
  }

  if (completedLast7Days === 0) {
    return `Det har varit lugnt några dagar. Börja enkelt med ${formatWorkoutFocus(nextFocus).toLowerCase()} idag.`;
  }

  if (latestFocus) {
    return `Du har tränat ${formatWorkoutFocus(latestFocus).toLowerCase()} nyligen. Nästa bästa steg nu är ${formatWorkoutFocus(nextFocus).toLowerCase()}.`;
  }

  return `Du har tränat nyligen. Nästa bästa steg nu är ${formatWorkoutFocus(nextFocus).toLowerCase()}.`;
}

function getBudgetStatusTone(loadStatus: string) {
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

type CompletedWeekDaySummary = {
  date: string;
  dayLabel: string;
  logs: WorkoutLog[];
  plannedSets: number;
  totalExercises: number;
  totalSets: number;
  totalDurationMinutes: number;
};

type WeeklyPlanDisplayDay = {
  date: string;
  dayLabel: string;
  isToday: boolean;
  completedSummary: CompletedWeekDaySummary | null;
  plannedDay: ReturnType<typeof buildWeeklyWorkoutStructure>["upcomingDays"][number] | null;
  plannedStep: ReturnType<typeof buildWeeklyWorkoutStructure>["upcomingSteps"][number] | null;
  recommendedSets: number | null;
  recommendedMinutes: number | null;
};

function toLocalIsoDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekDayLabel(value: Date) {
  return value.toLocaleDateString("sv-SE", { weekday: "short" });
}

function addDays(value: Date, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getStartOfWeek(value: Date) {
  const start = new Date(value);
  const weekday = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - weekday);
  return start;
}

function buildCompletedWeekSummaries(logs: WorkoutLog[], now: Date) {
  // Samlar genomförda pass per dag i innevarande vecka för den visuella veckoplanen.
  const weekStart = getStartOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const summaries = new Map<string, CompletedWeekDaySummary>();

  for (const log of logs) {
    if (log.status !== "completed") {
      continue;
    }

    const completedAt = new Date(log.completedAt);
    if (!Number.isFinite(completedAt.getTime())) {
      continue;
    }

    if (completedAt < weekStart || completedAt > weekEnd) {
      continue;
    }

    const dateKey = toLocalIsoDate(completedAt);
    const existing = summaries.get(dateKey);
    const totalExercises = log.exercises.length;
    const totalSets = log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    const plannedSets = log.exercises.reduce((sum, exercise) => sum + exercise.plannedSets, 0);
    const totalDurationMinutes = Math.max(1, Math.round(log.durationSeconds / 60));

    if (existing) {
      existing.logs.push(log);
      existing.totalExercises += totalExercises;
      existing.totalSets += totalSets;
      existing.plannedSets += plannedSets;
      existing.totalDurationMinutes += totalDurationMinutes;
      continue;
    }

    summaries.set(dateKey, {
      date: dateKey,
      dayLabel: formatWeekDayLabel(completedAt),
      logs: [log],
      plannedSets,
      totalExercises,
      totalSets,
      totalDurationMinutes,
    });
  }

  return summaries;
}

function buildRecommendedVolumeByDate(params: {
  weeklyPlanDays: Array<{
    date: string;
    plannedDay: ReturnType<typeof buildWeeklyWorkoutStructure>["upcomingDays"][number] | null;
    plannedStep: ReturnType<typeof buildWeeklyWorkoutStructure>["upcomingSteps"][number] | null;
    completedSummary: CompletedWeekDaySummary | null;
  }>;
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
}) {
  const remainingEntries = new Map(
    params.weeklyStructure.muscleBudget.map((entry) => [entry.group, entry]),
  );
  const remainingTrainingDays = params.weeklyPlanDays.filter(
    (day) =>
      day.plannedDay?.type === "training" &&
      !day.completedSummary &&
      (day.plannedStep?.muscleGroups.length ?? 0) > 0,
  );
  const occurrencesByGroup = new Map<MuscleBudgetGroup, number>();

  for (const day of remainingTrainingDays) {
    for (const group of day.plannedStep?.muscleGroups ?? []) {
      occurrencesByGroup.set(group, (occurrencesByGroup.get(group) ?? 0) + 1);
    }
  }

  const recommendedByDate = new Map<
    string,
    { recommendedSets: number; recommendedMinutes: number }
  >();

  for (const day of remainingTrainingDays) {
    const recommendedSetsRaw = (day.plannedStep?.muscleGroups ?? []).reduce(
      (sum, group) => {
        const entry = remainingEntries.get(group);
        const occurrences = occurrencesByGroup.get(group) ?? 1;

        if (!entry || entry.remainingSets <= 0) {
          return sum;
        }

        return sum + entry.remainingSets / occurrences;
      },
      0,
    );
    // Håll rekommendationen enkel och stabil i UI:t.
    const recommendedSets = Math.round(
      clampNumber(recommendedSetsRaw || 8, 6, 18),
    );
    const recommendedMinutes = Math.round(
      clampNumber(recommendedSets * 2.5, 20, 55),
    );

    recommendedByDate.set(day.date, {
      recommendedSets,
      recommendedMinutes,
    });
  }

  return recommendedByDate;
}

function buildWeeklyPlanDisplayDays(params: {
  now: Date;
  logs: WorkoutLog[];
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
}) {
  // Bygger en enkel måndag-söndag-vy som blandar genomfört och återstående pass.
  const completedSummaries = buildCompletedWeekSummaries(params.logs, params.now);
  const plannedByDate = new Map<
    string,
    {
      day: ReturnType<typeof buildWeeklyWorkoutStructure>["upcomingDays"][number];
      step: ReturnType<typeof buildWeeklyWorkoutStructure>["upcomingSteps"][number] | null;
    }
  >();

  params.weeklyStructure.upcomingDays.forEach((day, index) => {
    plannedByDate.set(day.date, {
      day,
      step: params.weeklyStructure.upcomingSteps[index] ?? null,
    });
  });

  const baseDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(getStartOfWeek(params.now), index);
    const dateKey = toLocalIsoDate(date);
    const planned = plannedByDate.get(dateKey) ?? null;

    return {
      date: dateKey,
      dayLabel: formatWeekDayLabel(date),
      isToday: dateKey === toLocalIsoDate(params.now),
      completedSummary: completedSummaries.get(dateKey) ?? null,
      plannedDay: planned?.day ?? null,
      plannedStep: planned?.step ?? null,
      recommendedSets: null,
      recommendedMinutes: null,
    } satisfies WeeklyPlanDisplayDay;
  });
  const recommendedByDate = buildRecommendedVolumeByDate({
    weeklyPlanDays: baseDays,
    weeklyStructure: params.weeklyStructure,
  });

  return baseDays.map((day) => {
    const recommended = recommendedByDate.get(day.date);

    return {
      ...day,
      recommendedSets: recommended?.recommendedSets ?? null,
      recommendedMinutes: recommended?.recommendedMinutes ?? null,
    };
  });
}

function getWeeklyAdjustmentSummary(
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>,
) {
  const overloadedGroups = weeklyStructure.muscleBudget
    .filter((entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over")
    .slice(0, 3)
    .map((entry) => entry.label.toLowerCase());
  const remainingGroups = weeklyStructure.muscleBudget
    .filter(
      (entry) =>
        entry.remainingSets > 0 &&
        entry.loadStatus !== "high_risk" &&
        entry.loadStatus !== "over",
    )
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 3)
    .map((entry) => `${entry.label}: ${formatDecimal(entry.remainingSets)} kvar`);

  if (overloadedGroups.length > 0 && remainingGroups.length > 0) {
    return `Planen är justerad. ${overloadedGroups.join(", ")} ligger redan högt, så nästa pass prioriterar ${remainingGroups.join(" · ")} utifrån kvarvarande set.`;
  }

  if (remainingGroups.length > 0) {
    return `Planen uppdateras löpande efter genomförda pass. Just nu ligger fokus på ${remainingGroups.join(" · ")} utifrån kvarvarande set.`;
  }

  return "Planen uppdateras löpande efter genomförda pass och återhämtning.";
}

function HomeHeroCard(props: {
  name: string;
  wisdomText: string;
  coachMessage: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  pendingCount: number;
}) {
  return (
    <section className={cn(uiCardClasses.section, "overflow-hidden border-slate-200/80")}>
      <div className="bg-[radial-gradient(circle_at_top,_rgba(217,249,157,0.75),_rgba(236,253,245,0.98)_42%,_rgba(255,255,255,1)_82%)] px-5 py-6 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Hej
            </p>
            <h1 className="mt-2 text-[clamp(2rem,7vw,2.8rem)] font-semibold tracking-tight text-slate-950">
              {props.name}
            </h1>
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                Dagens visdom
              </p>
              <p className="mt-2 text-base italic leading-7 text-slate-700">
                {props.wisdomText}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={props.onLogout}
            disabled={props.isLoggingOut}
            className={cn(uiButtonClasses.secondary, "shrink-0 px-3")}
          >
            {props.isLoggingOut ? "Loggar ut..." : "Logga ut"}
          </button>
        </div>

        <div className="mt-5 rounded-[24px] border border-emerald-200/80 bg-white/85 px-4 py-4 shadow-sm backdrop-blur">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">
            AI-coach
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-800">{props.coachMessage}</p>
        </div>

        {props.pendingCount > 0 ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {props.pendingCount} pass väntar på synk. Du kan fortsätta träna som vanligt.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TodayFocusCard(props: {
  focus: WorkoutFocus;
  muscleGroups: MuscleBudgetGroup[];
  summaryText: string;
  gymLabel: string;
  onAction: () => void;
  isGenerating: boolean;
}) {
  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        Dagens fokus
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            {formatWorkoutFocus(props.focus)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{props.summaryText}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
          Gym: {props.gymLabel}
        </span>
        {props.muscleGroups.length > 0 ? (
          props.muscleGroups.map((group) => (
            <span
              key={group}
              className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              {formatMuscleGroup(group)}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
            Balans över hela kroppen
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={props.onAction}
        disabled={props.isGenerating}
        className={cn(uiButtonClasses.secondary, "mt-4 w-full justify-center")}
      >
        {props.isGenerating ? "Skapar..." : "Snabbstarta dagens pass"}
      </button>
    </section>
  );
}

function QuickStartCard(props: {
  gymOptions: Array<{ id: string | number; name: string }>;
  selectedGymId: string;
  setSelectedGymId: (value: string) => void;
  selectedDurationPreset: string;
  setSelectedDurationPreset: (value: string) => void;
  customDurationInput: string;
  setCustomDurationInput: (value: string) => void;
  durationMinutes: number;
  onAiPass: () => void;
  onCustomWorkout: () => void;
  isGenerating: boolean;
  userId: string;
  aiError: string | null;
  gymError: string | null;
  pageError: string | null;
}) {
  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        Starta snabbt
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
        Skapa pass
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Välj gym och längd. Sedan kan du starta direkt med AI eller bygga ett eget pass.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Gym</span>
          <select
            value={props.selectedGymId}
            onChange={(event) => props.setSelectedGymId(event.target.value)}
            className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          >
            {props.gymOptions.map((gym) => (
              <option key={String(gym.id)} value={String(gym.id)}>
                {gym.name}
              </option>
            ))}
          </select>
        </label>

        <div className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Längd</span>

          <div className="space-y-3">
            <select
              value={props.selectedDurationPreset}
              onChange={(event) => props.setSelectedDurationPreset(event.target.value)}
              className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            >
              <option value={15}>15 min</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
              <option value="custom">Eget val</option>
            </select>

            {props.selectedDurationPreset === "custom" ? (
              <input
                type="number"
                min={5}
                max={180}
                step={1}
                value={props.customDurationInput}
                onChange={(event) => props.setCustomDurationInput(event.target.value)}
                placeholder="Ange minuter"
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">Vald passlängd: {props.durationMinutes} min</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={props.onAiPass}
          disabled={props.isGenerating || !props.userId}
          className={cn(uiButtonClasses.primary, "w-full justify-center")}
        >
          {props.isGenerating ? "Skapar AI-pass..." : "AI-pass"}
        </button>

        <button
          type="button"
          onClick={props.onCustomWorkout}
          disabled={!props.userId}
          className={cn(uiButtonClasses.secondary, "w-full justify-center")}
        >
          Eget pass
        </button>
      </div>

      {props.aiError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{props.aiError}</div> : null}
      {props.gymError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{props.gymError}</div> : null}
      {props.pageError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{props.pageError}</div> : null}
    </section>
  );
}

function RecentWorkoutCard(props: {
  latestWorkout: WorkoutLog | null;
  logsSource: string;
  onHistory: () => void;
  onRepeat: () => void;
  isGenerating: boolean;
}) {
  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Senaste aktivitet
          </p>
          {props.latestWorkout ? (
            <>
              <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950">
                {props.latestWorkout.workoutName}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Senast genomfört {new Date(props.latestWorkout.completedAt).toLocaleDateString("sv-SE")} ·{" "}
                {props.logsSource === "api" ? "synkad historik" : "lokal historik"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ingen träningshistorik ännu. Ditt första pass bygger momentum direkt.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={props.onHistory}
          className={cn(uiButtonClasses.secondary, "shrink-0 px-3")}
        >
          Historik
        </button>
      </div>

      {props.latestWorkout ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={props.onRepeat}
            disabled={props.isGenerating}
            className={cn(uiButtonClasses.secondary, "justify-center")}
          >
            {props.isGenerating ? "Skapar..." : "Skapa liknande"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SecondaryActionsCard(props: {
  onGyms: () => void;
  onSettings: () => void;
}) {
  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        Mer
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={props.onGyms} className={uiButtonClasses.secondary}>
          Gym & utrustning
        </button>
        <button type="button" onClick={props.onSettings} className={uiButtonClasses.secondary}>
          Inställningar
        </button>
      </div>
    </section>
  );
}

function WeeklyInsightsPanel(props: {
  showWeeklyInsights: boolean;
  onToggle: () => void;
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
  weeklyPlanDays: WeeklyPlanDisplayDay[];
  onOpenHistoryDay: (date: string) => void;
  onStartWorkout: () => void;
}) {
  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Fördjupning
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
            Veckoplan och muskelbudget
          </h2>
        </div>

        <button type="button" onClick={props.onToggle} className={cn(uiButtonClasses.secondary, "px-3")}>
          {props.showWeeklyInsights ? "Dölj" : "Visa"}
        </button>
      </div>

      {props.showWeeklyInsights ? (
        <div className="mt-5 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm leading-6 text-slate-700">
              {getWeeklyAdjustmentSummary(props.weeklyStructure)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {props.weeklyPlanDays.map((day, index) => {
              const isCompleted = Boolean(day.completedSummary);
              const isTraining = day.plannedDay?.type === "training";
              const actionLabel = isCompleted
                ? "Visa historik"
                : isTraining
                  ? "Starta pass"
                  : "Öppna historik";
              const focusLabel = isCompleted
                ? day.completedSummary!.logs[0]?.workoutName ?? "Genomfört pass"
                : day.plannedDay?.focus
                  ? formatWorkoutFocus(day.plannedDay.focus)
                  : "Återhämtning";
              const summaryText = isCompleted
                ? `${day.completedSummary!.logs.length} pass · ${day.completedSummary!.totalExercises} öv · ${day.completedSummary!.totalSets} set`
                : isTraining && day.plannedStep?.muscleGroups.length
                  ? day.plannedStep.muscleGroups
                      .slice(0, 2)
                      .map((group) => formatMuscleGroup(group))
                      .join(" · ")
                  : "Lugnare dag";
              const volumeText = isCompleted
                ? `Plan ${day.completedSummary!.plannedSets} set · Gjort ${day.completedSummary!.totalSets} set · ${day.completedSummary!.totalDurationMinutes} min`
                : isTraining && day.recommendedSets && day.recommendedMinutes
                  ? `Rek. ${day.recommendedSets} set · ca ${day.recommendedMinutes} min`
                  : "Ingen volym att styra mot";

              return (
                <button
                  key={`${day.date}-${index}`}
                  type="button"
                  onClick={() => {
                    if (isTraining && !isCompleted) {
                      props.onStartWorkout();
                      return;
                    }

                    props.onOpenHistoryDay(day.date);
                  }}
                  className={cn(
                    "rounded-2xl border px-4 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500",
                    day.isToday
                      ? "border-emerald-400 bg-emerald-100 shadow-[0_10px_24px_rgba(16,185,129,0.14)]"
                      : isCompleted
                        ? "border-sky-200 bg-sky-50"
                        : isTraining
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-300 bg-slate-100",
                  )}
                  aria-label={`${day.dayLabel} ${day.date}. ${focusLabel}. ${actionLabel}.`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {day.dayLabel}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">{day.date}</p>
                    </div>

                    {day.isToday ? (
                      <span className="rounded-full border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700">
                        Idag
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-sm font-semibold text-slate-950">
                    {focusLabel}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-700">
                    {summaryText}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {volumeText}
                  </p>

                  <div className="mt-3 flex items-center justify-between">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium",
                        isCompleted
                          ? "border border-sky-200 bg-white text-sky-700"
                          : isTraining
                            ? "border border-emerald-200 bg-white text-emerald-700"
                            : "border border-slate-300 bg-white text-slate-600",
                      )}
                    >
                      {isCompleted ? "Genomfört" : isTraining ? "Planerat pass" : "Återhämtning"}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">{actionLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Klart
              </p>
              <p className="mt-1 text-base font-semibold text-slate-950">
                {props.weeklyPlanDays.filter((day) => day.completedSummary).length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Återstår
              </p>
              <p className="mt-1 text-base font-semibold text-slate-950">
                {props.weeklyPlanDays.filter(
                  (day) => day.plannedDay?.type === "training" && !day.completedSummary,
                ).length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Dagens läge
              </p>
              <p className="mt-1 text-base font-semibold text-slate-950">
                {formatWorkoutFocus(props.weeklyStructure.nextFocus)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {props.weeklyStructure.muscleBudget
              .filter((entry) => {
                return (
                  entry.priority !== "low" ||
                  entry.completedSets > 0 ||
                  entry.remainingSets > 0
                );
              })
              .sort((left, right) => right.remainingSets - left.remainingSets)
              .slice(0, 6)
              .map((entry) => {
                const progress =
                  entry.targetSets > 0
                    ? Math.min(100, (entry.effectiveSets / entry.targetSets) * 100)
                    : 0;
                const tone = getBudgetStatusTone(entry.loadStatus);

                return (
                  <div key={entry.group} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                            {getProgressLabel(entry.progressStatus)}
                          </span>
                        </div>
                      </div>

                      <p className="text-sm font-semibold text-slate-900">
                        {entry.remainingSets > 0 ? `${entry.remainingSets} kvar` : "Klar"}
                      </p>
                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
                      <div
                        className={cn("h-full rounded-full", tone.barClassName)}
                        style={{ width: `${Math.max(8, progress)}%` }}
                      />
                    </div>

                    <p className="mt-3 text-xs text-slate-600">
                      {formatDecimal(entry.effectiveSets)}/{entry.targetSets} effektiva set · 4v-snitt{" "}
                      {formatDecimal(entry.recent4WeekAvgEffectiveSets)}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}
    </section>
  );
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
  const [selectedDurationPreset, setSelectedDurationPreset] = useState<string>("30");
  const [customDurationInput, setCustomDurationInput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showWeeklyInsights, setShowWeeklyInsights] = useState(false);
  const hasAppliedInitialGymRef = useRef(false);

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
    return gymOptions.find((gym) => String(gym.id) === selectedGymId) ?? gymOptions[0];
  }, [gymOptions, selectedGymId]);

  const durationMinutes = useMemo(() => {
    if (selectedDurationPreset === "custom") {
      return clampDuration(Number(customDurationInput));
    }

    return clampDuration(Number(selectedDurationPreset));
  }, [customDurationInput, selectedDurationPreset]);

  const latestWorkout = workoutLogs?.[0] ?? null;
  const weeklyStructure = useMemo(() => {
    return buildWeeklyWorkoutStructure({
      logs: workoutLogs,
      settings,
    });
  }, [settings, workoutLogs]);
  const weeklyPlanDays = useMemo(() => {
    return buildWeeklyPlanDisplayDays({
      now: new Date(),
      logs: workoutLogs,
      weeklyStructure,
    });
  }, [weeklyStructure, workoutLogs]);

  const coachMessage = useMemo(() => {
    return getCoachMessage({
      logs: workoutLogs,
      nextFocus: weeklyStructure.nextFocus,
      completedLast7Days: weeklyStructure.completedLast7Days,
      durationMinutes,
    });
  }, [durationMinutes, weeklyStructure.completedLast7Days, weeklyStructure.nextFocus, workoutLogs]);
  const dailyWisdom = useMemo(() => getDailyHomeWisdom(), []);

  useEffect(() => {
    hasAppliedInitialGymRef.current = false;
  }, [userId]);

  useEffect(() => {
    // Vänta tills gymhämtningen är klar, annars finns ofta bara bodyweight i listan.
    if (isLoadingGyms) {
      return;
    }

    if (gymOptions.length === 0) {
      return;
    }

    if (userId && !hasAppliedInitialGymRef.current) {
      const lastUsedGymId = getLastUsedGymId(userId, gymOptions);
      if (lastUsedGymId && lastUsedGymId !== selectedGymId) {
        hasAppliedInitialGymRef.current = true;
        setSelectedGymId(lastUsedGymId);
        return;
      }

      hasAppliedInitialGymRef.current = true;
    }

    const stillExists = gymOptions.some((gym) => String(gym.id) === String(selectedGymId));
    if (!stillExists) {
      setSelectedGymId(String(gymOptions[0].id));
    }
  }, [gymOptions, isLoadingGyms, selectedGymId, userId]);

  function handleSelectedGymChange(nextGymId: string) {
    setSelectedGymId(nextGymId);

    if (userId) {
      storeHomeGymId(userId, nextGymId);
    }
  }

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

      const equipment = normalizeEquipmentStrings(selectedGym?.equipment);
      const goal = settings?.training_goal?.trim() || "health";
      const isBodyweightGym = String(selectedGym?.id) === "bodyweight";
      const gymId = isBodyweightGym ? null : String(selectedGym?.id ?? "");
      const gymLabel = isBodyweightGym ? "Kroppsvikt / utan gym" : selectedGym?.name ?? null;
      storeHomeGymId(userId, String(selectedGym?.id ?? "bodyweight"));
      const lessOftenExerciseIds = getExercisePreferences(userId)
        .filter((entry) => entry.preference === "less_often")
        .map((entry) => entry.exerciseId);

      const { workout } = await generateWorkout({
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
        supersetPreference: settings?.superset_preference ?? null,
      });

      // Spara en liten lokal debughistorik så analys/export kan jämföra flera AI-pass över tid.
      saveAiDebugGeneratedWorkoutSnapshot(userId, {
        requestedDurationMinutes: durationMinutes,
        goal,
        selectedGym: gymLabel,
        equipmentSeed: equipment,
        workoutFocusTag: weeklyStructure.nextFocus,
        request: {
          goal,
          durationMinutes,
          equipment,
          gym: gymId,
          gymLabel,
          confidenceScore: weeklyStructure.confidenceScore,
          nextFocus: weeklyStructure.nextFocus,
          splitStyle: weeklyStructure.splitStyle,
          supersetPreference: settings?.superset_preference ?? null,
        },
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
        normalizedWorkout: workout,
        aiDebug: workout.aiDebug ?? null,
      });

      // Spara draft innan preview öppnas så run/preview kan återta samma flöde.
      saveWorkoutDraft(userId, {
        ...workout,
        duration: durationMinutes,
        gym: gymId,
        gymLabel,
        availableEquipment: equipment,
        plannedFocus: weeklyStructure.nextFocus,
      });

      router.push(`/workout/preview?userId=${encodeURIComponent(userId)}`);
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Kunde inte skapa AI-pass just nu.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleOpenHistoryDay(date: string) {
    router.push(`/history?date=${encodeURIComponent(date)}`);
  }

  async function handleQuickStartTodayWorkout() {
    if (!userId) {
      setAiError("Kunde inte läsa in användaren.");
      return;
    }

    try {
      setAiError(null);
      setIsGenerating(true);

      const equipment = normalizeEquipmentStrings(selectedGym?.equipment);
      const goal = settings?.training_goal?.trim() || "health";
      const isBodyweightGym = String(selectedGym?.id) === "bodyweight";
      const gymId = isBodyweightGym ? null : String(selectedGym?.id ?? "");
      const gymLabel = isBodyweightGym ? "Kroppsvikt / utan gym" : selectedGym?.name ?? null;
      storeHomeGymId(userId, String(selectedGym?.id ?? "bodyweight"));
      const lessOftenExerciseIds = getExercisePreferences(userId)
        .filter((entry) => entry.preference === "less_often")
        .map((entry) => entry.exerciseId);

      const quickDuration = durationMinutes;

      const { workout } = await generateWorkout({
        userId,
        goal,
        durationMinutes: quickDuration,
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
        supersetPreference: settings?.superset_preference ?? null,
      });

      // Snabbstart ska också lämna spår i debughistoriken utan att ändra själva träningsflödet.
      saveAiDebugGeneratedWorkoutSnapshot(userId, {
        requestedDurationMinutes: quickDuration,
        goal,
        selectedGym: gymLabel,
        equipmentSeed: equipment,
        workoutFocusTag: weeklyStructure.nextFocus,
        request: {
          goal,
          durationMinutes: quickDuration,
          equipment,
          gym: gymId,
          gymLabel,
          confidenceScore: weeklyStructure.confidenceScore,
          nextFocus: weeklyStructure.nextFocus,
          splitStyle: weeklyStructure.splitStyle,
          supersetPreference: settings?.superset_preference ?? null,
        },
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
        normalizedWorkout: workout,
        aiDebug: workout.aiDebug ?? null,
      });

      // Save draft before entering /run so the active session restores correctly offline too.
      saveWorkoutDraft(userId, {
        ...workout,
        duration: quickDuration,
        gym: gymId,
        gymLabel,
        availableEquipment: equipment,
        plannedFocus: weeklyStructure.nextFocus,
      });

      router.push(`/workout/run?userId=${encodeURIComponent(userId)}`);
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Kunde inte snabbstarta passet just nu.",
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
      <div className={cn(uiPageShellClasses.content, "space-y-5 pb-8")}>
        <HomeHeroCard
          name={getDisplayName(authUser)}
          wisdomText={dailyWisdom.text}
          coachMessage={coachMessage}
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          pendingCount={pendingCount}
        />

        <TodayFocusCard
          focus={weeklyStructure.nextFocus}
          muscleGroups={weeklyStructure.nextFocusMuscleGroups}
          summaryText={weeklyStructure.optimalPlanText}
          gymLabel={selectedGym?.name ?? "Kroppsvikt / utan gym"}
          onAction={handleQuickStartTodayWorkout}
          isGenerating={isGenerating}
        />

        <QuickStartCard
          gymOptions={gymOptions}
          selectedGymId={selectedGymId}
          setSelectedGymId={handleSelectedGymChange}
          selectedDurationPreset={selectedDurationPreset}
          setSelectedDurationPreset={setSelectedDurationPreset}
          customDurationInput={customDurationInput}
          setCustomDurationInput={setCustomDurationInput}
          durationMinutes={durationMinutes}
          onAiPass={handleReviewAiWorkout}
          onCustomWorkout={handleCustomWorkout}
          isGenerating={isGenerating || isLoadingGyms}
          userId={userId}
          aiError={aiError}
          gymError={gymError}
          pageError={pageError}
        />

        <RecentWorkoutCard
          latestWorkout={latestWorkout}
          logsSource={logsSource}
          onHistory={() => router.push("/history")}
          onRepeat={handleReviewAiWorkout}
          isGenerating={isGenerating}
        />

        <WeeklyInsightsPanel
          showWeeklyInsights={showWeeklyInsights}
          onToggle={() => setShowWeeklyInsights((previous) => !previous)}
          weeklyStructure={weeklyStructure}
          weeklyPlanDays={weeklyPlanDays}
          onOpenHistoryDay={handleOpenHistoryDay}
          onStartWorkout={handleReviewAiWorkout}
        />

        <SecondaryActionsCard
          onGyms={() => router.push("/gyms")}
          onSettings={() => router.push("/settings")}
        />
      </div>
    </main>
  );
}
