import type { MuscleBudgetEntry, MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { WeeklyPlanState, WeeklyPlanStatus } from "@/lib/planning/weekly-plan";
import {
  isWorkoutLogExcludedFromAnalysis,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import type { WorkoutFocus } from "@/types/workout";

type PlanningGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

type ExperienceLevel =
  | "beginner"
  | "novice"
  | "intermediate"
  | "advanced";

export type HomeTrainingTrendBar = {
  key: string;
  label: string;
  kind: "past" | "current" | "future";
  completedMinutes: number;
  plannedMinutes: number;
  effectiveSets: number;
  targetEffectiveSets: number;
  score: number;
};

export type HomeTrainingTrend = {
  score: number;
  statusLabel: string;
  coachText: string;
  recommendation: string;
  bars: HomeTrainingTrendBar[];
  targetMinutesPerWeek: number;
  currentWeekLabel: string;
  summary: string;
  completedSessionsThisWeek: number;
  completedMinutesThisWeek: number;
  completedWorkSetsThisWeek: number;
  hasHistory: boolean;
};

export type HomeTrainingTrendInput = {
  logs: WorkoutLog[];
  weeklyPlanState?: WeeklyPlanState | null;
  weeklyPlanStatus?: WeeklyPlanStatus | null;
  fallbackTargetMinutesPerWeek: number;
  goal?: PlanningGoal | null;
  experienceLevel?: string | null;
  muscleBudget?: MuscleBudgetEntry[] | null;
  nextFocus?: WorkoutFocus | null;
  nextFocusMuscleGroups?: MuscleBudgetGroup[] | null;
  now?: Date;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getStartOfWeek(value: Date) {
  const start = new Date(value);
  const weekday = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - weekday);
  return start;
}

function addDays(value: Date, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getIsoWeekNumber(value: Date) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getTargetMinutesPerWeek(params: {
  weeklyPlanState?: WeeklyPlanState | null;
  weeklyPlanStatus?: WeeklyPlanStatus | null;
  fallbackTargetMinutesPerWeek: number;
}) {
  if ((params.weeklyPlanStatus?.targetMinutes ?? 0) > 0) {
    return params.weeklyPlanStatus?.targetMinutes ?? params.fallbackTargetMinutesPerWeek;
  }

  const settings = params.weeklyPlanState?.settings;
  if (settings) {
    return Math.max(30, settings.sessionsPerWeek * settings.defaultDurationMinutes);
  }

  return Math.max(30, params.fallbackTargetMinutesPerWeek);
}

function getTargetEffectiveSets(goal?: PlanningGoal | null, experienceLevel?: string | null) {
  const level = experienceLevel as ExperienceLevel | null;

  if (goal === "strength") {
    return level === "intermediate" || level === "advanced" ? 24 : 18;
  }

  if (goal === "hypertrophy") {
    return level === "intermediate" || level === "advanced" ? 36 : 24;
  }

  if (goal === "body_composition") {
    return level === "intermediate" || level === "advanced" ? 28 : 20;
  }

  return level === "intermediate" || level === "advanced" ? 24 : 18;
}

function getDoseStatusLabel(score: number, hasHistory: boolean) {
  if (!hasHistory && score <= 0) {
    return "Kom igång";
  }

  if (score > 110) {
    return "Hög dos – tänk på återhämtning";
  }

  if (score >= 90) {
    return "Bra nivå";
  }

  if (score >= 65) {
    return "Nära målet";
  }

  if (score >= 35) {
    return "Något under målet";
  }

  return "Tydligt under målet";
}

function getDoseCoachText(score: number, goal?: PlanningGoal | null, hasHistory?: boolean) {
  if (!hasHistory && score <= 0) {
    return "När du har genomfört några pass kan vi visa träningsdos och veckotrend här.";
  }

  if (score > 110) {
    return "Du har redan hög träningsdos. Se till att återhämtningen hänger med innan du lägger till mer.";
  }

  if (score >= 90) {
    return "Bra träningsdos den här veckan. Prioritera kvalitet och återhämtning i stället för att jaga mer mängd.";
  }

  if (score >= 65) {
    return "Du är nära veckans mål. Ett kort pass kan räcka för att nå en bra nivå.";
  }

  if (score >= 35) {
    return goal === "strength"
      ? "Du är på väg åt rätt håll, men veckans dos är fortfarande något låg för tydlig styrkeutveckling."
      : "Du är på väg åt rätt håll, men veckans dos räcker sannolikt inte hela vägen.";
  }

  return goal === "strength"
    ? "Du ligger tydligt under den träningsdos som oftast krävs för att bygga styrka och vana i huvudlyften."
    : "Du ligger tydligt under den träningsdos som oftast krävs för tydlig utveckling.";
}

function getFocusLabel(
  nextFocus?: WorkoutFocus | null,
  nextFocusMuscleGroups?: MuscleBudgetGroup[] | null,
) {
  if (nextFocus === "upper_body") {
    return "upper body";
  }

  if (nextFocus === "lower_body") {
    return "lower body";
  }

  if (nextFocus === "full_body") {
    return "helkropp";
  }

  if (nextFocus === "core") {
    return "core";
  }

  if (nextFocusMuscleGroups?.includes("quads") || nextFocusMuscleGroups?.includes("glutes")) {
    return "lower body";
  }

  return "helkropp";
}

function getDoseRecommendation(params: {
  score: number;
  nextFocus?: WorkoutFocus | null;
  nextFocusMuscleGroups?: MuscleBudgetGroup[] | null;
  hasHistory: boolean;
}) {
  if (!params.hasHistory && params.score <= 0) {
    return "Börja med ett kort helkroppspass.";
  }

  const focusLabel = getFocusLabel(params.nextFocus, params.nextFocusMuscleGroups);

  if (params.score > 110) {
    return "Behåll nivån och välj ett lättare eller mer återhämtande pass nästa gång.";
  }

  if (params.score >= 90) {
    return "Behåll planen – du ligger bra till.";
  }

  if (params.score >= 65) {
    return `Nästa bästa steg: ${focusLabel} 20–30 min eller 4–6 bra arbetsset.`;
  }

  if (params.score >= 35) {
    return `+1 kort ${focusLabel}-pass eller 4–8 bra arbetsset denna vecka.`;
  }

  return `+1 kort ${focusLabel}-pass eller 6–8 bra arbetsset denna vecka.`;
}

function sumCurrentWeekLogSets(logs: WorkoutLog[], currentWeekKey: string) {
  return logs
    .filter((log) => toIsoDate(getStartOfWeek(new Date(log.completedAt))) === currentWeekKey)
    .reduce((sum, log) => {
      return (
        sum +
        log.exercises.reduce((exerciseSum, exercise) => exerciseSum + exercise.sets.length, 0)
      );
    }, 0);
}

function getWeekBars(params: {
  completedLogs: WorkoutLog[];
  currentWeekStart: Date;
  currentWeekKey: string;
  targetMinutesPerWeek: number;
  targetEffectiveSetsPerWeek: number;
  weeklyPlanStatus?: WeeklyPlanStatus | null;
}) {
  const weeklyTotals = new Map<
    string,
    { completedMinutes: number; completedSets: number }
  >();

  for (const log of params.completedLogs) {
    const completedAt = new Date(log.completedAt);
    if (!Number.isFinite(completedAt.getTime())) {
      continue;
    }

    const weekKey = toIsoDate(getStartOfWeek(completedAt));
    const existing = weeklyTotals.get(weekKey) ?? { completedMinutes: 0, completedSets: 0 };
    existing.completedMinutes += Math.max(0, Math.round((log.durationSeconds ?? 0) / 60));
    existing.completedSets += log.exercises.reduce(
      (sum, exercise) => sum + exercise.sets.length,
      0,
    );
    weeklyTotals.set(weekKey, existing);
  }

  const bars: HomeTrainingTrendBar[] = [];

  // Veckovis trend blir lättare att läsa på Home än dagliga datumkort.
  for (let weekOffset = -3; weekOffset <= 1; weekOffset += 1) {
    const weekStart = addDays(params.currentWeekStart, weekOffset * 7);
    const weekKey = toIsoDate(weekStart);
    const isCurrent = weekKey === params.currentWeekKey;
    const isFuture = weekOffset > 0;
    const totals = weeklyTotals.get(weekKey) ?? { completedMinutes: 0, completedSets: 0 };
    const targetMinutes = isFuture
      ? params.targetMinutesPerWeek
      : isCurrent
        ? params.weeklyPlanStatus?.targetMinutes ?? params.targetMinutesPerWeek
        : params.targetMinutesPerWeek;
    const targetSets = params.targetEffectiveSetsPerWeek;
    const scoreSource = totals.completedSets > 0
      ? (totals.completedSets / Math.max(targetSets, 1)) * 100
      : (totals.completedMinutes / Math.max(targetMinutes, 1)) * 100;

    bars.push({
      key: weekKey,
      label: isCurrent ? "nu" : isFuture ? "plan" : `v${String(getIsoWeekNumber(weekStart)).padStart(2, "0")}`,
      kind: isFuture ? "future" : isCurrent ? "current" : "past",
      completedMinutes: totals.completedMinutes,
      plannedMinutes: targetMinutes,
      effectiveSets: totals.completedSets,
      targetEffectiveSets: targetSets,
      score: clamp(scoreSource, 0, 140),
    });
  }

  return bars;
}

export function buildHomeTrainingTrend(input: HomeTrainingTrendInput): HomeTrainingTrend {
  const now = input.now ?? new Date();
  const currentWeekStart = getStartOfWeek(now);
  const currentWeekKey = toIsoDate(currentWeekStart);
  const targetMinutesPerWeek = getTargetMinutesPerWeek({
    weeklyPlanState: input.weeklyPlanState,
    weeklyPlanStatus: input.weeklyPlanStatus,
    fallbackTargetMinutesPerWeek: input.fallbackTargetMinutesPerWeek,
  });
  const completedLogs = input.logs.filter(
    (log) => log.status === "completed" && !isWorkoutLogExcludedFromAnalysis(log),
  );
  const hasHistory = completedLogs.length > 0;

  const budgetTargetSets = Math.round(
    (input.muscleBudget ?? []).reduce((sum, entry) => sum + Math.max(0, entry.targetSets), 0),
  );
  const budgetCompletedSets = Math.round(
    (input.muscleBudget ?? []).reduce((sum, entry) => sum + Math.max(0, entry.effectiveSets), 0),
  );
  const targetEffectiveSetsPerWeek =
    budgetTargetSets > 0
      ? budgetTargetSets
      : getTargetEffectiveSets(input.goal, input.experienceLevel);
  const completedWorkSetsThisWeek = sumCurrentWeekLogSets(completedLogs, currentWeekKey);
  const completedMinutesThisWeek =
    input.weeklyPlanStatus?.completedMinutes ??
    completedLogs
      .filter((log) => toIsoDate(getStartOfWeek(new Date(log.completedAt))) === currentWeekKey)
      .reduce((sum, log) => sum + Math.max(0, Math.round((log.durationSeconds ?? 0) / 60)), 0);
  const completedSessionsThisWeek =
    input.weeklyPlanStatus?.completedSessions ??
    completedLogs.filter(
      (log) => toIsoDate(getStartOfWeek(new Date(log.completedAt))) === currentWeekKey,
    ).length;

  // MVP: träningsdos bygger först på veckans setbudget. Minuter används bara som fallback.
  const scoreSource =
    budgetCompletedSets > 0
      ? (budgetCompletedSets / Math.max(targetEffectiveSetsPerWeek, 1)) * 100
      : (completedMinutesThisWeek / Math.max(targetMinutesPerWeek, 1)) * 100;
  const score = clamp(Math.round(scoreSource), 0, 140);
  const statusLabel = getDoseStatusLabel(score, hasHistory);
  const coachText = getDoseCoachText(score, input.goal, hasHistory);
  const recommendation = getDoseRecommendation({
    score,
    nextFocus: input.nextFocus,
    nextFocusMuscleGroups: input.nextFocusMuscleGroups,
    hasHistory,
  });
  const bars = getWeekBars({
    completedLogs,
    currentWeekStart,
    currentWeekKey,
    targetMinutesPerWeek,
    targetEffectiveSetsPerWeek,
    weeklyPlanStatus: input.weeklyPlanStatus,
  });
  const currentWeekLabel = `Den här veckan · ${completedSessionsThisWeek} pass · ${completedMinutesThisWeek}/${targetMinutesPerWeek} min`;
  const summary = hasHistory
    ? `Den här veckan: ${completedMinutesThisWeek}/${targetMinutesPerWeek} min · plan framåt: ${input.weeklyPlanStatus?.plannedSessions ?? input.weeklyPlanState?.settings.sessionsPerWeek ?? 0} pass`
    : "Din översikt fylls på när du tränar. Vi visar redan nu en enkel plan framåt.";

  return {
    score,
    statusLabel,
    coachText,
    recommendation,
    bars,
    targetMinutesPerWeek,
    currentWeekLabel,
    summary,
    completedSessionsThisWeek,
    completedMinutesThisWeek,
    completedWorkSetsThisWeek: completedWorkSetsThisWeek > 0 ? completedWorkSetsThisWeek : budgetCompletedSets,
    hasHistory,
  };
}
