"use client";

// Home ska kännas som en tydlig startskärm för träning:
// - nästa steg först
// - coachande ton
// - snabb väg till AI-pass eller eget pass
// - detaljer längre ned som sekundär information

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import AppToast from "@/components/shared/app-toast";
import { useHomeData } from "@/hooks/use-home-data";
import { getDailyHomeWisdom } from "@/lib/get-daily-home-wisdom";
import {
  getActiveWorkoutSessionDraft,
  isDraftForWorkout,
} from "@/lib/active-workout-session-storage";
import {
  buildWeeklyWorkoutStructure,
  detectWorkoutFocus,
  formatWorkoutFocus,
} from "@/lib/weekly-workout-structure";
import {
  buildInitialWeeklyPlan,
  buildWeeklyPlanContext,
  buildWeeklyPlanStatus,
  deriveWeeklyPlanState,
  formatWeekdayLabel,
  getDefaultWeeklyPlanSettings,
  getWeekStartDate,
  mapPlannedFocusToWorkoutFocus,
  type PlannedSession,
  type WeeklyPlanContext,
  type WeeklyPlanSettings,
  type WeeklyPlanStatus,
  type WeeklyPlanState,
} from "@/lib/planning/weekly-plan";
import { getLocalWeeklyPlanSettings } from "@/lib/planning/weekly-plan-local-store";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { TrainingGap } from "@/lib/planning/training-gap";
import { generateWorkout } from "@/lib/workout-generator";
import { extractEquipmentIdsFromRecords } from "@/lib/equipment";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { getPendingSyncQueue } from "@/lib/workout-flow/pending-sync-store";
import { getActiveWorkout } from "@/lib/workout-storage";
import {
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import { getExercisePreferences } from "@/lib/exercise-preference-storage";
import { saveAiDebugGeneratedWorkoutSnapshot } from "@/lib/analysis/ai-debug-generated-history";
import { getStoredHomeGymId, storeHomeGymId } from "@/hooks/use-home-preferences";
import { getSessionDraft } from "@/lib/workout-flow/session-draft-store";
import type { Workout, WorkoutFocus } from "@/types/workout";
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

function formatTrainingGapStatusTone(status: TrainingGap["status"]) {
  if (status === "recovery_first") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (status === "major_gap") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }

  if (status === "minor_gap") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (status === "insufficient_data") {
    return "border-slate-200 bg-slate-50 text-slate-800";
  }

  return "border-lime-200 bg-lime-50 text-lime-900";
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

type HomeWorkoutRecommendation = {
  focus: WorkoutFocus;
  plannedFocus: WorkoutFocus;
  durationMinutes: number;
  muscleGroups: MuscleBudgetGroup[];
  source: "weekly_plan" | "adaptive_fallback";
};

type HomeAiCoachContext = {
  usesWeeklyPlanIntention: boolean;
  selectedPlanMode:
    | "normal_training"
    | "recovery"
    | "recovery_mobility"
    | "light_accessory"
    | "selective_priority_accessory"
    | null;
  focusIntent: string | null;
  targetMuscles: MuscleBudgetGroup[];
  avoidMuscles: MuscleBudgetGroup[];
  limitedMuscles: MuscleBudgetGroup[];
  weeklyPlan:
    | Array<{
        date: string;
        dayLabel: string;
        focus: WorkoutFocus | null;
        type: "training" | "recovery";
      }>
    | undefined;
};

type WeeklyPlanApiResponse = {
  ok?: boolean;
  settings?: WeeklyPlanSettings;
  plannedSessions?: PlannedSession[];
  state?: WeeklyPlanState;
  status?: WeeklyPlanStatus;
  context?: WeeklyPlanContext;
  error?: string;
};

const HOME_FOCUS_GROUPS: Record<WorkoutFocus, MuscleBudgetGroup[]> = {
  upper_body: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower_body: ["quads", "hamstrings", "glutes", "calves"],
  full_body: ["chest", "back", "quads", "hamstrings", "glutes"],
  core: ["core"],
};

function getDurationPresetFromMinutes(value: number) {
  const normalized = clampDuration(value);

  if ([15, 20, 30, 45, 60].includes(normalized)) {
    return String(normalized);
  }

  return "custom";
}

function buildHomeWorkoutRecommendation(params: {
  weeklyPlanState: WeeklyPlanState | null;
  weeklyPlanContext: WeeklyPlanContext | null;
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
  fallbackDurationMinutes: number;
}) {
  if (params.weeklyPlanState && params.weeklyPlanContext) {
    const weeklyPlanContext = params.weeklyPlanContext;
    const weeklyPlanStatus = buildWeeklyPlanStatus(params.weeklyPlanState);
    const plannedFocus = mapPlannedFocusToWorkoutFocus(
      params.weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
    );
    const focus =
      weeklyPlanStatus.suggestedNextWorkoutFocus === "recovery_strength"
        ? plannedFocus
        : weeklyPlanStatus.suggestedNextWorkoutFocus;
    const allowedGroups = new Set(HOME_FOCUS_GROUPS[focus]);
    const deficitSortedGroups = (Object.keys(
      weeklyPlanContext.muscleSetDeficits,
    ) as MuscleBudgetGroup[])
      .filter(
        (group) =>
          allowedGroups.has(group) && weeklyPlanContext.muscleSetDeficits[group] > 0,
      )
      .sort(
        (left, right) =>
          weeklyPlanContext.muscleSetDeficits[right] -
          weeklyPlanContext.muscleSetDeficits[left],
      );
    const prioritizedGroups = weeklyPlanContext.priorityMuscles.filter((group) =>
      allowedGroups.has(group),
    );
    const muscleGroups = Array.from(
      new Set([...prioritizedGroups, ...deficitSortedGroups, ...HOME_FOCUS_GROUPS[focus]]),
    ).slice(0, 3);

    return {
      focus,
      plannedFocus,
      durationMinutes: weeklyPlanStatus.suggestedNextDurationMinutes,
      muscleGroups,
      // Weekly plan ska vara primär synlig rekommendation när status finns.
      source: "weekly_plan",
    } satisfies HomeWorkoutRecommendation;
  }

  return {
    focus: params.weeklyStructure.nextFocus,
    plannedFocus: params.weeklyStructure.nextFocus,
    durationMinutes: params.fallbackDurationMinutes,
    muscleGroups: params.weeklyStructure.nextFocusMuscleGroups,
    // Adaptive fallback används bara när veckoplanstatus saknas eller inte gick att läsa.
    source: "adaptive_fallback",
  } satisfies HomeWorkoutRecommendation;
}

function buildHomeAiCoachContext(params: {
  homeRecommendation: HomeWorkoutRecommendation;
  weeklyPlanContext: WeeklyPlanContext | null;
  weeklyPlanStatus: WeeklyPlanStatus | null;
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
}) {
  const usesWeeklyPlanIntention =
    params.homeRecommendation.source === "weekly_plan" && Boolean(params.weeklyPlanContext);
  const complementaryRecoveryLimitedMuscles = params.weeklyStructure.muscleBudget
    .filter((entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over")
    .map((entry) => entry.group);

  if (usesWeeklyPlanIntention) {
    return {
      usesWeeklyPlanIntention: true,
      // Veckoplanen är primär coachkälla när den finns. Vi skickar bara ett lätt
      // återhämtningsläge här, inte äldre planintention från weeklyStructure.
      selectedPlanMode:
        params.weeklyPlanStatus?.suggestedNextWorkoutFocus === "recovery_strength"
          ? "light_accessory"
          : null,
      focusIntent: params.weeklyPlanContext?.coachText ?? null,
      targetMuscles: params.homeRecommendation.muscleGroups,
      avoidMuscles: Array.from(
        new Set([
          ...(params.weeklyPlanContext?.recoveryLimitedMuscles ?? []),
          ...complementaryRecoveryLimitedMuscles,
        ]),
      ),
      limitedMuscles: [],
      weeklyPlan: undefined,
    } satisfies HomeAiCoachContext;
  }

  return {
    usesWeeklyPlanIntention: false,
    selectedPlanMode: params.weeklyStructure.selectedPlanMode,
    focusIntent: params.weeklyStructure.focusIntent,
    targetMuscles: params.weeklyStructure.targetMuscles,
    avoidMuscles: params.weeklyStructure.avoidMuscles,
    limitedMuscles: params.weeklyStructure.limitedMuscles,
    weeklyPlan: params.weeklyStructure.upcomingDays,
  } satisfies HomeAiCoachContext;
}

function getLastUsedGymId(userId: string, gymOptions: Array<{ id: string | number }>) {
  // Explicit sparat gymval ska vara sann källa för startsidan.
  const storedGymId = getStoredHomeGymId(userId);
  if (storedGymId && gymOptions.some((gym) => String(gym.id) === storedGymId)) {
    return storedGymId;
  }

  return null;
}

function hasResumeStateForWorkout(userId: string, workout: Workout | null) {
  if (!userId || !workout) {
    return false;
  }

  const activeSessionDraft = getActiveWorkoutSessionDraft(userId);
  if (isDraftForWorkout(activeSessionDraft, workout)) {
    return true;
  }

  const sessionDraft = getSessionDraft(userId);
  if (!sessionDraft || sessionDraft.status !== "active") {
    return false;
  }

  if (sessionDraft.workoutId && workout.id) {
    return sessionDraft.workoutId === workout.id;
  }

  return sessionDraft.workoutName.trim() === workout.name.trim();
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
  displayFocus: WorkoutFocus | null;
  displayMuscleGroups: MuscleBudgetGroup[];
  displayType: "training" | "recovery";
  isPrimaryRecommendation: boolean;
  plannedSessionStatus: PlannedSession["status"] | null;
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
    displayType: "training" | "recovery";
    displayMuscleGroups: MuscleBudgetGroup[];
    completedSummary: CompletedWeekDaySummary | null;
    isPrimaryRecommendation: boolean;
  }>;
  weeklyStructure: ReturnType<typeof buildWeeklyWorkoutStructure>;
  currentRecommendation: HomeWorkoutRecommendation | null;
}) {
  const remainingEntries = new Map(
    params.weeklyStructure.muscleBudget.map((entry) => [entry.group, entry]),
  );
  const remainingTrainingDays = params.weeklyPlanDays.filter(
    (day) =>
      day.displayType === "training" &&
      !day.completedSummary &&
      day.displayMuscleGroups.length > 0,
  );
  const occurrencesByGroup = new Map<MuscleBudgetGroup, number>();

  for (const day of remainingTrainingDays) {
    for (const group of day.displayMuscleGroups) {
      occurrencesByGroup.set(group, (occurrencesByGroup.get(group) ?? 0) + 1);
    }
  }

  const recommendedByDate = new Map<
    string,
    { recommendedSets: number; recommendedMinutes: number }
  >();

  for (const day of remainingTrainingDays) {
    const recommendedSetsRaw = day.displayMuscleGroups.reduce(
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
    const recommendedMinutes = day.isPrimaryRecommendation && params.currentRecommendation
      ? params.currentRecommendation.durationMinutes
      : Math.round(clampNumber(recommendedSets * 2.5, 20, 55));

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
  weeklyPlanState: WeeklyPlanState | null;
  currentRecommendation: HomeWorkoutRecommendation | null;
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
  const plannedSessionsByDate = new Map<string, PlannedSession>();
  const nextRecommendedSessionId =
    params.weeklyPlanState?.plannedSessions.find(
      (session) => session.status === "planned" || session.status === "moved",
    )?.id ?? null;

  params.weeklyPlanState?.plannedSessions.forEach((session) => {
    if (!plannedSessionsByDate.has(session.plannedDate)) {
      plannedSessionsByDate.set(session.plannedDate, session);
    }
  });

  const baseDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(getStartOfWeek(params.now), index);
    const dateKey = toLocalIsoDate(date);
    const planned = plannedByDate.get(dateKey) ?? null;
    const plannedSession = plannedSessionsByDate.get(dateKey) ?? null;
    const weeklyPlanFocus =
      plannedSession && plannedSession.focus !== "mobility"
        ? mapPlannedFocusToWorkoutFocus(plannedSession.focus)
        : null;
    const isPrimaryRecommendation =
      Boolean(plannedSession) &&
      plannedSession?.id === nextRecommendedSessionId &&
      (plannedSession.status === "planned" || plannedSession.status === "moved");
    const displayFocus =
      isPrimaryRecommendation && params.currentRecommendation
        ? params.currentRecommendation.focus
        : weeklyPlanFocus ?? planned?.day?.focus ?? null;
    const displayMuscleGroups =
      isPrimaryRecommendation && params.currentRecommendation
        ? params.currentRecommendation.muscleGroups
        : planned?.step?.muscleGroups?.length
          ? planned.step.muscleGroups
          : displayFocus
            ? HOME_FOCUS_GROUPS[displayFocus].slice(0, 3)
            : [];
    const displayType =
      displayFocus && (!plannedSession || plannedSession.focus !== "mobility")
        ? "training"
        : "recovery";

    return {
      date: dateKey,
      dayLabel: formatWeekDayLabel(date),
      isToday: dateKey === toLocalIsoDate(params.now),
      completedSummary: completedSummaries.get(dateKey) ?? null,
      plannedDay: planned?.day ?? null,
      plannedStep: planned?.step ?? null,
      displayFocus,
      displayMuscleGroups,
      displayType,
      isPrimaryRecommendation,
      plannedSessionStatus: plannedSession?.status ?? null,
      recommendedSets: null,
      recommendedMinutes: null,
    } satisfies WeeklyPlanDisplayDay;
  });
  const recommendedByDate = buildRecommendedVolumeByDate({
    weeklyPlanDays: baseDays,
    weeklyStructure: params.weeklyStructure,
    currentRecommendation: params.currentRecommendation,
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
  onLogout: () => void;
  isLoggingOut: boolean;
  pendingCount: number;
}) {
  return (
    <section className={cn(uiCardClasses.section, "overflow-hidden border-slate-200/80")}>
      <div className="bg-[radial-gradient(circle_at_top,_rgba(217,249,157,0.72),_rgba(236,253,245,0.96)_42%,_rgba(255,255,255,1)_82%)] px-5 py-6 sm:px-6">
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
              <p className="mt-2 text-[15px] italic leading-7 text-slate-700">
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
  coachText: string;
  gymLabel: string;
  gymOptions: Array<{ id: string | number; name: string }>;
  selectedGymId: string;
  onSelectGym: (value: string) => void;
  recommendedDurationMinutes: number;
  onAction: () => void;
  isGenerating: boolean;
  hasActiveWorkout: boolean;
  activeWorkoutName?: string | null;
  hasCompletedTrainingToday: boolean;
  completedTodayMessage: string;
}) {
  const showCompletedTodayState =
    props.hasCompletedTrainingToday && !props.hasActiveWorkout;
  const [showGymPicker, setShowGymPicker] = useState(false);

  return (
    <section className={cn(uiCardClasses.base, "p-6 shadow-[0_20px_48px_rgba(15,23,42,0.07)]")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">
        Dagens pass
      </p>
      {showCompletedTodayState ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          {/* Startsidan ska kunna visa ett lugnt klart-för-idag-läge när inget mer pass väntar. */}
          <p className="text-base font-medium text-emerald-950">
            {props.completedTodayMessage}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[clamp(1.9rem,7vw,2.5rem)] font-semibold tracking-tight text-slate-950">
                {formatWorkoutFocus(props.focus)}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-700">{props.coachText}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900">
              {props.recommendedDurationMinutes} min
            </span>
            <button
              type="button"
              onClick={() => setShowGymPicker((previous) => !previous)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
            >
              Gym: {props.gymLabel}
            </button>
            {props.hasActiveWorkout ? (
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800">
                Pågående pass
              </span>
            ) : null}
            {props.muscleGroups.length > 0 ? (
              props.muscleGroups.map((group) => (
                <span
                  key={group}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
                >
                  {formatMuscleGroup(group)}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600">
                Balans över hela kroppen
              </span>
            )}
          </div>

          {showGymPicker ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {/* Dagens pass återanvänder samma gymval som AI-genereringen för att hålla flödet konsekvent. */}
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Välj gym för dagens pass
                </span>
                <select
                  value={props.selectedGymId}
                  onChange={(event) => {
                    props.onSelectGym(event.target.value);
                    setShowGymPicker(false);
                  }}
                  className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                >
                  {props.gymOptions.map((gym) => (
                    <option key={String(gym.id)} value={String(gym.id)}>
                      {gym.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {props.hasActiveWorkout ? (
            <p className="mt-4 text-base leading-7 text-emerald-800">
              {props.activeWorkoutName?.trim()
                ? `${props.activeWorkoutName.trim()} väntar på dig.`
                : "Du har ett pågående pass som väntar på dig."}
            </p>
          ) : null}

          <button
            type="button"
            onClick={props.onAction}
            disabled={props.isGenerating}
            className={cn(
              props.hasActiveWorkout
                ? "mt-5 min-h-[52px] w-full justify-center rounded-2xl bg-emerald-200 px-4 py-3 text-base font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                : cn(uiButtonClasses.primary, "mt-5 min-h-[52px] w-full justify-center text-base"),
            )}
          >
            {props.isGenerating
              ? "Skapar..."
              : props.hasActiveWorkout
                ? "Fortsätt dagens pass"
                : "Starta dagens pass"}
          </button>
        </>
      )}
    </section>
  );
}

function TrainingGapCard(props: {
  trainingGap: TrainingGap;
  onShowDetails: () => void;
}) {
  const progressPercent = Math.round(props.trainingGap.completionRatio * 100);
  const tone = formatTrainingGapStatusTone(props.trainingGap.status);

  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Veckomål
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            {progressPercent}% på plats
          </h2>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", tone)}>
          {props.trainingGap.status === "recovery_first"
            ? "Återhämtning först"
            : props.trainingGap.status === "major_gap"
              ? "Mer kvar"
              : props.trainingGap.status === "minor_gap"
                ? "Lite kvar"
                : props.trainingGap.status === "insufficient_data"
                  ? "Lär känna dig"
                  : "Bra riktning"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">{props.trainingGap.message}</p>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-500"
          style={{ width: `${Math.max(8, progressPercent)}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Pass
          </p>
          <p className="mt-1 text-base font-semibold text-slate-950">
            {props.trainingGap.completedSessions} / {props.trainingGap.plannedSessions}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Minuter
          </p>
          <p className="mt-1 text-base font-semibold text-slate-950">
            {props.trainingGap.completedMinutes} / {props.trainingGap.plannedMinutes}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Återstår
          </p>
          <p className="mt-1 text-base font-semibold text-slate-950">
            {props.trainingGap.missingMinutes} min
          </p>
        </div>
      </div>

      <p className="mt-4 text-base text-slate-700">
        Främst:{" "}
        <span className="font-medium text-slate-900">
          {props.trainingGap.missingMuscles.length > 0
            ? props.trainingGap.missingMuscles.map((group) => formatMuscleGroup(group)).join(" · ")
            : "jämn riktning just nu"}
        </span>
      </p>

      <button
        type="button"
        onClick={props.onShowDetails}
        className={cn(uiButtonClasses.secondary, "mt-4 w-full justify-center")}
      >
        Visa detaljer
      </button>
    </section>
  );
}

function WeeklyPlanSummaryCard(props: {
  state: WeeklyPlanState;
  onOpenPlan: () => void;
}) {
  const weeklyPlanStatus = buildWeeklyPlanStatus(props.state);
  const completedSessions = weeklyPlanStatus.completedSessions;
  const targetSessions = weeklyPlanStatus.plannedSessions;
  const nextPlannedSession = props.state.plannedSessions.find(
    (session) => session.status === "planned" || session.status === "moved",
  );
  const nextPlannedDayLabel = nextPlannedSession
    ? formatWeekdayLabel(nextPlannedSession.weekday)
    : null;

  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        Veckan
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
        {completedSessions} av {targetSessions} pass genomförda
      </h2>
      <p className="mt-2 text-base leading-7 text-slate-700">
        Nästa rekommenderade pass: {weeklyPlanStatus.suggestedNextDurationMinutes} min{" "}
        {weeklyPlanStatus.suggestedNextWorkoutFocus === "full_body"
          ? "helkropp"
          : weeklyPlanStatus.suggestedNextWorkoutFocus === "upper_body"
            ? "överkropp"
            : weeklyPlanStatus.suggestedNextWorkoutFocus === "lower_body"
              ? "ben"
              : weeklyPlanStatus.suggestedNextWorkoutFocus === "core"
                    ? "bål"
                    : "återhämtande styrka"}
      </p>
      {nextPlannedDayLabel ? (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Planerat nästa gång: {nextPlannedDayLabel}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={props.onOpenPlan} className={uiButtonClasses.secondary}>
          Ändra veckoplan
        </button>
      </div>
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
        Skapa AI-pass
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
        Skapa nästa pass
      </h2>
      <p className="mt-2 text-base leading-7 text-slate-700">
        Välj gym och längd. AI bygger ett pass utifrån mål, historik och utrustning.
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

      <p className="mt-3 text-sm text-slate-600">Vald passlängd: {props.durationMinutes} min</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={props.onAiPass}
          disabled={props.isGenerating || !props.userId}
          className={cn(uiButtonClasses.primary, "w-full justify-center")}
        >
          {props.isGenerating ? "Skapar AI-pass..." : "Skapa AI-pass"}
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

function SecondaryActionsCard(props: {
  onHistory: () => void;
  onToggleInsights: () => void;
  showWeeklyInsights: boolean;
  onGyms: () => void;
  onSettings: () => void;
}) {
  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        Mer
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={props.onHistory} className={uiButtonClasses.secondary}>
          Historik
        </button>
        <button
          type="button"
          onClick={props.onToggleInsights}
          className={uiButtonClasses.secondary}
        >
          {props.showWeeklyInsights ? "Dölj detaljer" : "Veckoplan & analys"}
        </button>
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
  currentRecommendation: HomeWorkoutRecommendation;
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
          {props.weeklyStructure.trainingGap.thirtyDayEffect ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Senaste 30 dagarna
              </p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {props.weeklyStructure.trainingGap.thirtyDayEffect.estimatedEffectLabel}
              </p>
              <p className="mt-2 text-base leading-7 text-slate-700">
                {props.weeklyStructure.trainingGap.thirtyDayEffect.estimatedEffectMessage}
              </p>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                  style={{
                    width: `${Math.max(
                      8,
                      Math.min(
                        100,
                        Math.round(
                          props.weeklyStructure.trainingGap.thirtyDayEffect.setCompletionRatio * 100,
                        ),
                      ),
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-base leading-7 text-slate-700">
                Du har genomfört cirka{" "}
                <span className="font-medium text-slate-900">
                  {Math.round(
                    props.weeklyStructure.trainingGap.thirtyDayEffect.setCompletionRatio * 100,
                  )}
                  %
                </span>{" "}
                av planerad träningsvolym.
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-base leading-7 text-slate-700">
              {getWeeklyAdjustmentSummary(props.weeklyStructure)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {props.weeklyPlanDays.map((day, index) => {
              const isCompleted = Boolean(day.completedSummary);
              const isTraining = day.displayType === "training";
              const actionLabel = isCompleted
                ? "Visa historik"
                : isTraining
                  ? "Starta pass"
                  : "Öppna historik";
              const focusLabel = isCompleted
                ? day.completedSummary!.logs[0]?.workoutName ?? "Genomfört pass"
                : day.displayFocus
                  ? formatWorkoutFocus(day.displayFocus)
                  : "Återhämtning";
              const summaryText = isCompleted
                ? `${day.completedSummary!.logs.length} pass · ${day.completedSummary!.totalExercises} öv · ${day.completedSummary!.totalSets} set`
                : isTraining && day.displayMuscleGroups.length
                  ? day.displayMuscleGroups
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
                      <div className="flex flex-col items-end gap-1">
                        <span className="rounded-full border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700">
                          Idag
                        </span>
                        {day.isPrimaryRecommendation ? (
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                            Rek. nu
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {!day.isToday && day.isPrimaryRecommendation ? (
                      <span className="rounded-full border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700">
                        Rek. nu
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
                {formatWorkoutFocus(props.currentRecommendation.focus)}
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
    isLoadingGyms,
    gymError,
    pageError,
  } = useHomeData({ router });

  const userId = authUser?.id ? String(authUser.id) : "";
  const [selectedGymId, setSelectedGymId] = useState<string>("bodyweight");
  const [selectedDurationPreset, setSelectedDurationPreset] = useState<string>("30");
  const [customDurationInput, setCustomDurationInput] = useState<string>("");
  const [hasManualDurationChoice, setHasManualDurationChoice] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showWeeklyInsights, setShowWeeklyInsights] = useState(false);
  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [weeklyPlanSettings, setWeeklyPlanSettings] = useState<WeeklyPlanSettings | null>(null);
  const [weeklyPlanSessions, setWeeklyPlanSessions] = useState<PlannedSession[]>([]);
  const [serverWeeklyPlanState, setServerWeeklyPlanState] = useState<WeeklyPlanState | null>(null);
  const [serverWeeklyPlanStatus, setServerWeeklyPlanStatus] = useState<WeeklyPlanStatus | null>(null);
  const [serverWeeklyPlanContext, setServerWeeklyPlanContext] = useState<WeeklyPlanContext | null>(null);
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

  const weeklyStructure = useMemo(() => {
    return buildWeeklyWorkoutStructure({
      logs: workoutLogs,
      settings,
    });
  }, [settings, workoutLogs]);
  const fallbackWeeklyPlanState = useMemo(() => {
    if (!userId || !weeklyPlanSettings) {
      return null;
    }

    return deriveWeeklyPlanState({
      settings: weeklyPlanSettings,
      plannedSessions: weeklyPlanSessions,
      workoutLogs,
      now: new Date(),
      goal: settings?.training_goal ?? null,
      priorityMuscles: [
        settings?.primary_priority_muscle ?? null,
        settings?.secondary_priority_muscle ?? null,
        settings?.tertiary_priority_muscle ?? null,
      ].filter((group): group is MuscleBudgetGroup => Boolean(group)),
    });
  }, [
    settings?.primary_priority_muscle,
    settings?.secondary_priority_muscle,
    settings?.tertiary_priority_muscle,
    settings?.training_goal,
    userId,
    weeklyPlanSessions,
    weeklyPlanSettings,
    workoutLogs,
  ]);
  const weeklyPlanState = serverWeeklyPlanState ?? fallbackWeeklyPlanState;
  const weeklyPlanContext = useMemo(
    () => serverWeeklyPlanContext ?? (weeklyPlanState ? buildWeeklyPlanContext(weeklyPlanState) : null),
    [serverWeeklyPlanContext, weeklyPlanState],
  );
  const weeklyPlanStatus = useMemo(
    () => serverWeeklyPlanStatus ?? (weeklyPlanState ? buildWeeklyPlanStatus(weeklyPlanState) : null),
    [serverWeeklyPlanStatus, weeklyPlanState],
  );
  const homeRecommendation = useMemo(() => {
    return buildHomeWorkoutRecommendation({
      weeklyPlanState,
      weeklyPlanContext,
      weeklyStructure,
      fallbackDurationMinutes: durationMinutes,
    });
  }, [durationMinutes, weeklyPlanContext, weeklyPlanState, weeklyStructure]);
  const weeklyPlanDays = useMemo(() => {
    return buildWeeklyPlanDisplayDays({
      now: new Date(),
      logs: workoutLogs,
      weeklyStructure,
      weeklyPlanState,
      currentRecommendation: homeRecommendation,
    });
  }, [homeRecommendation, weeklyPlanState, weeklyStructure, workoutLogs]);

  useEffect(() => {
    if (!userId) {
      setWeeklyPlanSettings(null);
      setWeeklyPlanSessions([]);
      return;
    }

    let isMounted = true;

    async function loadWeeklyPlanSummary() {
      try {
        const response = await fetch(`/api/weekly-plan?userId=${encodeURIComponent(userId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const payload = (await response.json().catch(() => null)) as WeeklyPlanApiResponse | null;

        if (!response.ok || !payload?.ok || !payload.settings) {
          throw new Error(payload?.error || "Kunde inte läsa veckoplanen");
        }

        if (!isMounted) {
          return;
        }

        setWeeklyPlanSettings(payload.settings);
        setWeeklyPlanSessions(payload.plannedSessions ?? []);
        setServerWeeklyPlanState(payload.state ?? null);
        setServerWeeklyPlanStatus(payload.status ?? null);
        setServerWeeklyPlanContext(payload.context ?? null);
      } catch {
        if (!isMounted) {
          return;
        }

        const fallbackSettings =
          getLocalWeeklyPlanSettings(userId) ?? getDefaultWeeklyPlanSettings(userId);
        setWeeklyPlanSettings(fallbackSettings);
        setWeeklyPlanSessions(
          buildInitialWeeklyPlan(fallbackSettings, getWeekStartDate(new Date())),
        );
        setServerWeeklyPlanState(null);
        setServerWeeklyPlanStatus(null);
        setServerWeeklyPlanContext(null);
      }
    }

    void loadWeeklyPlanSummary();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notice = params.get("notice");

    if (notice === "workout_saved") {
      setHomeNotice("Passet sparades till historiken.");
    } else if (notice === "workout_aborted_saved") {
      setHomeNotice("Det avbrutna passet sparades till historiken.");
    } else {
      return;
    }

    params.delete("notice");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const dailyWisdom = useMemo(() => getDailyHomeWisdom(), []);
  const todayPlanDay = useMemo(
    () => weeklyPlanDays.find((day) => day.isToday) ?? null,
    [weeklyPlanDays],
  );
  const coachMessage = useMemo(() => {
    return getCoachMessage({
      logs: workoutLogs,
      nextFocus: homeRecommendation.focus,
      completedLast7Days: weeklyStructure.completedLast7Days,
      durationMinutes: homeRecommendation.durationMinutes,
    });
  }, [
    homeRecommendation.durationMinutes,
    homeRecommendation.focus,
    weeklyStructure.completedLast7Days,
    workoutLogs,
  ]);
  // Home visar ett klart-för-idag-läge när dagens planerade slot redan är genomförd.
  const hasCompletedTrainingToday = Boolean(todayPlanDay?.completedSummary);
  const completedTodayMessage = "Bra jobbat! Du har ingen mer planerad träning idag.";

  useEffect(() => {
    if (hasManualDurationChoice) {
      return;
    }

    const suggestedDuration = homeRecommendation.durationMinutes;
    if (!suggestedDuration) {
      return;
    }

    const nextPreset = getDurationPresetFromMinutes(suggestedDuration);
    if (nextPreset === "custom") {
      setSelectedDurationPreset("custom");
      setCustomDurationInput(String(suggestedDuration));
      return;
    }

    setSelectedDurationPreset(nextPreset);
    setCustomDurationInput("");
  }, [hasManualDurationChoice, homeRecommendation.durationMinutes]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    console.debug("[homeRecommendation]", {
      source: homeRecommendation.source,
      focus: homeRecommendation.focus,
      plannedFocus: homeRecommendation.plannedFocus,
      durationMinutes: homeRecommendation.durationMinutes,
      weeklyPlanSuggestedFocus: weeklyPlanState?.remainingTrainingNeed.suggestedNextFocus ?? null,
      weeklyStructureNextFocus: weeklyStructure.nextFocus,
      remainingTrainingNeed: weeklyPlanState?.remainingTrainingNeed ?? null,
    });
  }, [homeRecommendation, weeklyPlanState, weeklyStructure.nextFocus]);

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

  useEffect(() => {
    if (!userId) {
      setActiveWorkout(null);
      return;
    }

    try {
      // Ett gammalt active_workout utan riktig sessionsdraft ska inte visas som pågående pass.
      const storedActiveWorkout = getActiveWorkout(userId);
      setActiveWorkout(
        hasResumeStateForWorkout(userId, storedActiveWorkout)
          ? storedActiveWorkout
          : null,
      );
    } catch {
      setActiveWorkout(null);
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
      const aiCoachContext = buildHomeAiCoachContext({
        homeRecommendation,
        weeklyPlanContext,
        weeklyPlanStatus,
        weeklyStructure,
      });
      const requestedDuration = homeRecommendation.durationMinutes;

      const { workout } = await generateWorkout({
        userId,
        goal,
        durationMinutes: requestedDuration,
        equipment,
        gym: gymId,
        gymLabel,
        gymEquipmentDetails: selectedGym?.equipment ?? [],
        confidenceScore: weeklyStructure.confidenceScore,
        nextFocus: homeRecommendation.focus,
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
          loadStatus: entry.loadStatus,
        })),
        weeklyPlan: aiCoachContext.weeklyPlan,
        selectedPlanMode: aiCoachContext.selectedPlanMode,
        focusIntent: aiCoachContext.focusIntent,
        targetMuscles: aiCoachContext.targetMuscles,
        avoidMuscles: aiCoachContext.avoidMuscles,
        limitedMuscles: aiCoachContext.limitedMuscles,
        weeklyPlanContext,
        trainingGap: weeklyStructure.trainingGap,
        lessOftenExerciseIds,
        avoidSupersets: settings?.avoid_supersets ?? null,
        supersetPreference: settings?.superset_preference ?? null,
      });

      // Spara en liten lokal debughistorik så analys/export kan jämföra flera AI-pass över tid.
      saveAiDebugGeneratedWorkoutSnapshot(userId, {
        requestedDurationMinutes: requestedDuration,
        goal,
        selectedGym: gymLabel,
        equipmentSeed: equipment,
        workoutFocusTag: homeRecommendation.focus,
        request: {
          goal,
          durationMinutes,
          equipment,
          gym: gymId,
          gymLabel,
          confidenceScore: weeklyStructure.confidenceScore,
          nextFocus: homeRecommendation.focus,
          coachIntentionSource: aiCoachContext.usesWeeklyPlanIntention
            ? "weekly_plan"
            : "adaptive_fallback",
          selectedPlanMode: aiCoachContext.selectedPlanMode,
          focusIntent: aiCoachContext.focusIntent,
          targetMuscles: aiCoachContext.targetMuscles,
          avoidMuscles: aiCoachContext.avoidMuscles,
          limitedMuscles: aiCoachContext.limitedMuscles,
          weeklyPlanContext,
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
          loadStatus: entry.loadStatus,
        })),
        weeklyPlan: aiCoachContext.weeklyPlan ?? [],
        normalizedWorkout: workout,
        aiDebug: workout.aiDebug ?? null,
      });

      // Spara draft innan preview öppnas så run/preview kan återta samma flöde.
      saveWorkoutDraft(userId, {
        ...workout,
        duration: requestedDuration,
        gym: gymId,
        gymLabel,
        availableEquipment: equipment,
        plannedFocus: homeRecommendation.plannedFocus,
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

    if (activeWorkout) {
      router.push(`/workout/run?userId=${encodeURIComponent(userId)}`);
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
      const aiCoachContext = buildHomeAiCoachContext({
        homeRecommendation,
        weeklyPlanContext,
        weeklyPlanStatus,
        weeklyStructure,
      });
      const quickDuration = homeRecommendation.durationMinutes;

      const { workout } = await generateWorkout({
        userId,
        goal,
        durationMinutes: quickDuration,
        equipment,
        gym: gymId,
        gymLabel,
        gymEquipmentDetails: selectedGym?.equipment ?? [],
        confidenceScore: weeklyStructure.confidenceScore,
        nextFocus: homeRecommendation.focus,
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
          loadStatus: entry.loadStatus,
        })),
        weeklyPlan: aiCoachContext.weeklyPlan,
        selectedPlanMode: aiCoachContext.selectedPlanMode,
        focusIntent: aiCoachContext.focusIntent,
        targetMuscles: aiCoachContext.targetMuscles,
        avoidMuscles: aiCoachContext.avoidMuscles,
        limitedMuscles: aiCoachContext.limitedMuscles,
        weeklyPlanContext,
        trainingGap: weeklyStructure.trainingGap,
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
        workoutFocusTag: homeRecommendation.focus,
        request: {
          goal,
          durationMinutes: quickDuration,
          equipment,
          gym: gymId,
          gymLabel,
          confidenceScore: weeklyStructure.confidenceScore,
          nextFocus: homeRecommendation.focus,
          coachIntentionSource: aiCoachContext.usesWeeklyPlanIntention
            ? "weekly_plan"
            : "adaptive_fallback",
          selectedPlanMode: aiCoachContext.selectedPlanMode,
          focusIntent: aiCoachContext.focusIntent,
          targetMuscles: aiCoachContext.targetMuscles,
          avoidMuscles: aiCoachContext.avoidMuscles,
          limitedMuscles: aiCoachContext.limitedMuscles,
          weeklyPlanContext,
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
          loadStatus: entry.loadStatus,
        })),
        weeklyPlan: aiCoachContext.weeklyPlan ?? [],
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
        plannedFocus: homeRecommendation.plannedFocus,
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
      <AppToast message={homeNotice} onDismiss={() => setHomeNotice(null)} />
      <div className={cn(uiPageShellClasses.content, "space-y-5 pb-8")}>
        <HomeHeroCard
          name={getDisplayName(authUser)}
          wisdomText={dailyWisdom.text}
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          pendingCount={pendingCount}
        />

        <TodayFocusCard
          focus={homeRecommendation.focus}
          muscleGroups={homeRecommendation.muscleGroups}
          coachText={coachMessage}
          gymLabel={selectedGym?.name ?? "Kroppsvikt / utan gym"}
          gymOptions={gymOptions.map((gym) => ({ id: gym.id, name: gym.name }))}
          selectedGymId={selectedGymId}
          onSelectGym={handleSelectedGymChange}
          recommendedDurationMinutes={homeRecommendation.durationMinutes}
          onAction={handleQuickStartTodayWorkout}
          isGenerating={isGenerating}
          hasActiveWorkout={Boolean(activeWorkout)}
          activeWorkoutName={activeWorkout?.name ?? null}
          hasCompletedTrainingToday={hasCompletedTrainingToday}
          completedTodayMessage={completedTodayMessage}
        />

        {weeklyPlanState ? (
          <WeeklyPlanSummaryCard
            state={weeklyPlanState}
            onOpenPlan={() => router.push("/home/plan")}
          />
        ) : null}

        <QuickStartCard
          gymOptions={gymOptions}
          selectedGymId={selectedGymId}
          setSelectedGymId={handleSelectedGymChange}
          selectedDurationPreset={selectedDurationPreset}
          setSelectedDurationPreset={(value) => {
            setHasManualDurationChoice(true);
            setSelectedDurationPreset(value);
          }}
          customDurationInput={customDurationInput}
          setCustomDurationInput={(value) => {
            setHasManualDurationChoice(true);
            setCustomDurationInput(value);
          }}
          durationMinutes={durationMinutes}
          onAiPass={handleReviewAiWorkout}
          onCustomWorkout={handleCustomWorkout}
          isGenerating={isGenerating || isLoadingGyms}
          userId={userId}
          aiError={aiError}
          gymError={gymError}
          pageError={pageError}
        />

        <TrainingGapCard
          trainingGap={weeklyStructure.trainingGap}
          onShowDetails={() => setShowWeeklyInsights(true)}
        />

        {showWeeklyInsights ? (
          <WeeklyInsightsPanel
            showWeeklyInsights={showWeeklyInsights}
            onToggle={() => setShowWeeklyInsights((previous) => !previous)}
            weeklyStructure={weeklyStructure}
            currentRecommendation={homeRecommendation}
            weeklyPlanDays={weeklyPlanDays}
            onOpenHistoryDay={handleOpenHistoryDay}
            onStartWorkout={handleReviewAiWorkout}
          />
        ) : null}

        <SecondaryActionsCard
          onHistory={() => router.push("/history")}
          onToggleInsights={() => setShowWeeklyInsights((previous) => !previous)}
          showWeeklyInsights={showWeeklyInsights}
          onGyms={() => router.push("/gyms")}
          onSettings={() => router.push("/settings")}
        />
      </div>
    </main>
  );
}
