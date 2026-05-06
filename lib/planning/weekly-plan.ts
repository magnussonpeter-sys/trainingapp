import { getExerciseById } from "@/lib/exercise-catalog";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import {
  isWorkoutLogExcludedFromAnalysis,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import type { WorkoutFocus } from "@/types/workout";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type WeeklyPlanFlexibility = "strict" | "balanced" | "flexible";

export type PlannedSessionStatus =
  | "planned"
  | "completed"
  | "missed"
  | "moved"
  | "replaced_by_spontaneous";

export type PlannedSessionFocus =
  | "upper"
  | "lower"
  | "full_body"
  | "push"
  | "pull"
  | "core"
  | "mobility";

export type WeeklyPlanSettings = {
  userId: string;
  sessionsPerWeek: number;
  preferredDays: Weekday[];
  defaultDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  preferredGymId?: string | null;
  flexibility: WeeklyPlanFlexibility;
  priorityMuscles: MuscleBudgetGroup[];
  easyMuscles: MuscleBudgetGroup[];
  updatedAt: string;
};

export type PlannedSession = {
  id: string;
  userId: string;
  weekStartDate: string;
  weekday: Weekday;
  plannedDate: string;
  targetDurationMinutes: number;
  focus: PlannedSessionFocus;
  priorityMuscles: MuscleBudgetGroup[];
  preferredGymId?: string | null;
  status: PlannedSessionStatus;
  completedWorkoutLogId?: string | null;
  replacedByWorkoutLogId?: string | null;
  movedFromDate?: string | null;
  movedToDate?: string | null;
};

export type SuggestedWeeklyWorkout = {
  focus: PlannedSessionFocus;
  durationMinutes: number;
  priorityMuscles: MuscleBudgetGroup[];
  easyMuscles: MuscleBudgetGroup[];
  isUserBehindPlan: boolean;
  hasSpontaneousWorkoutThisWeek: boolean;
};

export type WeeklyPlanState = {
  userId: string;
  weekStartDate: string;
  settings: WeeklyPlanSettings;
  plannedSessions: PlannedSession[];
  completedWorkoutLogIds: string[];
  spontaneousWorkoutLogIds: string[];
  missedSessions: PlannedSession[];
  remainingTrainingNeed: {
    sessionsRemaining: number;
    plannedMinutesRemaining: number;
    completedMinutesThisWeek: number;
    targetMinutesThisWeek: number;
    muscleSetDeficits: Record<MuscleBudgetGroup, number>;
    suggestedNextFocus: PlannedSessionFocus;
    suggestedNextDurationMinutes: number;
  };
};

export type WeeklyPlanContext = {
  sessionsPerWeek: number;
  completedSessionsThisWeek: number;
  remainingSessionsThisWeek: number;
  targetMinutesThisWeek: number;
  completedMinutesThisWeek: number;
  plannedMinutesRemaining: number;
  suggestedNextFocus: PlannedSessionFocus;
  suggestedNextDurationMinutes: number;
  priorityMuscles: MuscleBudgetGroup[];
  easyMuscles: MuscleBudgetGroup[];
  muscleSetDeficits: Record<MuscleBudgetGroup, number>;
  isUserBehindPlan: boolean;
  hasSpontaneousWorkoutThisWeek: boolean;
  flexibility: WeeklyPlanFlexibility;
  preferredDays: Weekday[];
  preferredGymId?: string | null;
  coachText: string;
};

export type WeeklyPlanRecommendation = {
  recommendedSessionsPerWeek: number;
  minimumSessionsPerWeek: number;
  recommendedMinutesRange: {
    min: number;
    max: number;
  };
  explanation: string;
};

export type WeeklyPlanStatus = {
  plannedSessions: number;
  completedSessions: number;
  remainingSessions: number;
  completedMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  suggestedNextWorkoutFocus: WorkoutFocus | "recovery_strength";
  suggestedNextDurationMinutes: number;
  message: string;
};

const WEEKDAY_ORDER: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const FOCUS_MUSCLES: Record<PlannedSessionFocus, MuscleBudgetGroup[]> = {
  upper: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower: ["quads", "hamstrings", "glutes", "calves"],
  full_body: ["chest", "back", "quads", "glutes", "core"],
  push: ["chest", "shoulders", "triceps"],
  pull: ["back", "biceps", "core"],
  core: ["core"],
  mobility: [],
};

const PRIMARY_SET_CREDIT = 1;
const SECONDARY_SET_CREDIT = 0.35;
const CORE_STABILIZER_CREDIT = 0.2;

const RAW_MUSCLE_TO_BUDGET_GROUP: Record<string, MuscleBudgetGroup | null> = {
  chest: "chest",
  lats: "back",
  upper_back: "back",
  traps: "back",
  external_rotators: "back",
  quads: "quads",
  adductors: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  shoulders: "shoulders",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  biceps: "biceps",
  brachialis: "biceps",
  triceps: "triceps",
  calves: "calves",
  core: "core",
  obliques: "core",
  lower_back: "core",
  hip_flexors: "core",
  forearms: null,
  feet: null,
};

function createMuscleRecord(value = 0) {
  return {
    chest: value,
    back: value,
    quads: value,
    hamstrings: value,
    glutes: value,
    shoulders: value,
    biceps: value,
    triceps: value,
    calves: value,
    core: value,
  } satisfies Record<MuscleBudgetGroup, number>;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeIsoDate(value: string | Date) {
  if (value instanceof Date) {
    return toIsoDate(value);
  }

  return value.slice(0, 10);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateAtMidnight(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateDiffInDays(left: string, right: string) {
  const leftDate = getDateAtMidnight(left).getTime();
  const rightDate = getDateAtMidnight(right).getTime();
  return Math.round((leftDate - rightDate) / (24 * 60 * 60 * 1000));
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getWeekdayIndex(day: Weekday) {
  return WEEKDAY_ORDER.indexOf(day);
}

function getWeekdayDate(weekStartDate: string, weekday: Weekday) {
  const baseDate = getDateAtMidnight(weekStartDate);
  return toIsoDate(addDays(baseDate, getWeekdayIndex(weekday)));
}

function getWorkoutDurationMinutes(log: WorkoutLog) {
  return Math.max(0, Math.round((log.durationSeconds ?? 0) / 60));
}

function getCompletedWorkingSetCount(log: WorkoutLog) {
  return log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

function isMeaningfulWorkoutForPlan(log: WorkoutLog) {
  if (log.status !== "completed" || isWorkoutLogExcludedFromAnalysis(log)) {
    return false;
  }

  const completedSetCount = getCompletedWorkingSetCount(log);
  const durationMinutes = getWorkoutDurationMinutes(log);

  // Väldigt korta pass utan tydlig volym ska inte styra veckoplaneringen.
  if (durationMinutes < 5 && completedSetCount <= 1) {
    return false;
  }

  return completedSetCount > 0 || durationMinutes >= 5;
}

function buildMuscleStimulusFromExercises(exercises: WorkoutLog["exercises"]) {
  const totals = createMuscleRecord();

  for (const exercise of exercises) {
    const catalogExercise = getExerciseById(exercise.exerciseId);
    if (!catalogExercise) {
      continue;
    }

    const setCount = Math.max(exercise.sets.length, exercise.plannedSets ?? 0, 0);
    if (setCount <= 0) {
      continue;
    }

    const perGroupCredits = new Map<MuscleBudgetGroup, number>();

    for (const rawMuscle of catalogExercise.primaryMuscles ?? []) {
      const group = RAW_MUSCLE_TO_BUDGET_GROUP[rawMuscle] ?? null;
      if (!group) {
        continue;
      }

      perGroupCredits.set(group, Math.min(1, (perGroupCredits.get(group) ?? 0) + PRIMARY_SET_CREDIT));
    }

    for (const rawMuscle of catalogExercise.secondaryMuscles ?? []) {
      const group = RAW_MUSCLE_TO_BUDGET_GROUP[rawMuscle] ?? null;
      if (!group) {
        continue;
      }

      const secondaryCredit = group === "core" ? CORE_STABILIZER_CREDIT : SECONDARY_SET_CREDIT;
      perGroupCredits.set(group, Math.min(1, (perGroupCredits.get(group) ?? 0) + secondaryCredit));
    }

    for (const [group, credit] of perGroupCredits) {
      totals[group] += setCount * credit;
    }
  }

  return totals;
}

function inferWorkoutFocus(log: WorkoutLog): PlannedSessionFocus {
  const totals = buildMuscleStimulusFromExercises(log.exercises);
  const upperScore =
    totals.chest + totals.back + totals.shoulders + totals.biceps + totals.triceps;
  const lowerScore = totals.quads + totals.hamstrings + totals.glutes + totals.calves;
  const coreScore = totals.core;
  const pushScore = totals.chest + totals.shoulders + totals.triceps;
  const pullScore = totals.back + totals.biceps;

  if (coreScore > upperScore && coreScore > lowerScore) {
    return "core";
  }

  if (upperScore > 0 && lowerScore > 0 && Math.abs(upperScore - lowerScore) <= 2) {
    return "full_body";
  }

  if (upperScore >= lowerScore) {
    if (pushScore > pullScore * 1.25) {
      return "push";
    }

    if (pullScore > pushScore * 1.25) {
      return "pull";
    }

    return "upper";
  }

  return "lower";
}

function buildPlannedTargetMuscleSets(plannedSessions: PlannedSession[]) {
  const targets = createMuscleRecord();

  for (const session of plannedSessions) {
    const focusGroups = FOCUS_MUSCLES[session.focus];
    for (const group of focusGroups) {
      // Veckoplanen är avsiktligt enkel här. Muskelnyansering kommer från
      // historik, muskelbudget och coachmotorn snarare än manuella planfält.
      const credit = session.focus === "full_body" ? 2 : 3;
      targets[group] += credit;
    }
  }

  return targets;
}

function getPriorityMusclesForSession(
  _settings: WeeklyPlanSettings,
  focus: PlannedSessionFocus,
) {
  void focus;
  // Legacyfält finns kvar i modellen för bakåtkompatibilitet,
  // men veckoplanen styr inte längre muskler manuellt.
  return [];
}

function getAutoFillDays(
  sessionsPerWeek: number,
  preferredDays: Weekday[],
) {
  const desiredCount = clampNumber(sessionsPerWeek, 1, 6);
  const uniquePreferredDays = Array.from(
    new Set(preferredDays.filter((day): day is Weekday => WEEKDAY_ORDER.includes(day))),
  );

  if (uniquePreferredDays.length === desiredCount) {
    return uniquePreferredDays;
  }

  if (uniquePreferredDays.length > desiredCount) {
    return uniquePreferredDays.slice(0, desiredCount);
  }

  const selected = [...uniquePreferredDays];
  const candidateOrder: Weekday[] = [
    "monday",
    "wednesday",
    "friday",
    "tuesday",
    "thursday",
    "saturday",
    "sunday",
  ];

  for (const day of candidateOrder) {
    if (selected.length >= desiredCount) {
      break;
    }

    if (!selected.includes(day)) {
      selected.push(day);
    }
  }

  return selected.sort((left, right) => getWeekdayIndex(left) - getWeekdayIndex(right));
}

function buildFocusRotation(
  sessionsPerWeek: number,
): PlannedSessionFocus[] {
  if (sessionsPerWeek <= 1) {
    return ["full_body"];
  }

  if (sessionsPerWeek === 2) {
    return ["full_body", "full_body"];
  }

  if (sessionsPerWeek === 3) {
    return ["upper", "lower", "full_body"];
  }

  if (sessionsPerWeek === 4) {
    return ["upper", "lower", "push", "pull"];
  }

  if (sessionsPerWeek === 5) {
    return ["upper", "lower", "push", "pull", "full_body"];
  }

  return ["upper", "lower", "push", "pull", "full_body", "mobility"];
}

export function getWeekStartDate(value: Date | string) {
  const date = getDateAtMidnight(value);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return toIsoDate(date);
}

export function formatWeekdayLabel(weekday: Weekday) {
  if (weekday === "monday") return "Måndag";
  if (weekday === "tuesday") return "Tisdag";
  if (weekday === "wednesday") return "Onsdag";
  if (weekday === "thursday") return "Torsdag";
  if (weekday === "friday") return "Fredag";
  if (weekday === "saturday") return "Lördag";
  return "Söndag";
}

export function formatPlannedSessionFocus(focus: PlannedSessionFocus) {
  if (focus === "upper") return "Överkropp";
  if (focus === "lower") return "Ben";
  if (focus === "full_body") return "Helkropp";
  if (focus === "push") return "Press";
  if (focus === "pull") return "Drag";
  if (focus === "core") return "Bål";
  return "Rörlighet";
}

export function mapPlannedFocusToWorkoutFocus(focus: PlannedSessionFocus): WorkoutFocus {
  if (focus === "lower") {
    return "lower_body";
  }

  if (focus === "core" || focus === "mobility") {
    return "core";
  }

  if (focus === "upper" || focus === "push" || focus === "pull") {
    return "upper_body";
  }

  return "full_body";
}

export function getDefaultWeeklyPlanSettings(userId: string): WeeklyPlanSettings {
  return {
    userId,
    sessionsPerWeek: 3,
    preferredDays: ["monday", "wednesday", "friday"],
    defaultDurationMinutes: 30,
    minDurationMinutes: 15,
    maxDurationMinutes: 60,
    preferredGymId: null,
    flexibility: "balanced",
    priorityMuscles: [],
    easyMuscles: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTrainingGoal(goal?: string | null) {
  if (!goal) {
    return "health";
  }

  if (goal === "hypertrophy" || goal === "muscle_gain") {
    return "hypertrophy";
  }

  if (goal === "strength") {
    return "strength";
  }

  if (goal === "body_composition") {
    return "body_composition";
  }

  if (goal === "general_fitness" || goal === "health") {
    return "health";
  }

  return "health";
}

export function buildWeeklyPlanRecommendation(goal?: string | null): WeeklyPlanRecommendation {
  const normalizedGoal = normalizeTrainingGoal(goal);

  if (normalizedGoal === "hypertrophy") {
    return {
      recommendedSessionsPerWeek: 3,
      minimumSessionsPerWeek: 2,
      recommendedMinutesRange: { min: 35, max: 45 },
      explanation:
        "För muskeltillväxt behövs oftast minst 2 styrkepass per vecka. 3–4 pass ger bättre marginal för tillräcklig träningsvolym och återhämtning.",
    };
  }

  if (normalizedGoal === "strength") {
    return {
      recommendedSessionsPerWeek: 3,
      minimumSessionsPerWeek: 2,
      recommendedMinutesRange: { min: 35, max: 50 },
      explanation:
        "För styrkeökning behövs oftast minst 2 pass per vecka. 3 pass ger bättre möjlighet att öva basrörelser och höja belastningen gradvis.",
    };
  }

  if (normalizedGoal === "body_composition") {
    return {
      recommendedSessionsPerWeek: 3,
      minimumSessionsPerWeek: 2,
      recommendedMinutesRange: { min: 30, max: 45 },
      explanation:
        "För kroppssammansättning är 2–4 styrkepass per vecka en rimlig grund. Regelbundenhet och progression är viktigare än exakt veckoschema.",
    };
  }

  return {
    recommendedSessionsPerWeek: 2,
    minimumSessionsPerWeek: 2,
    recommendedMinutesRange: { min: 25, max: 40 },
    explanation:
      "För allmän hälsa räcker ofta 2 styrkepass per vecka som miniminivå. 3 pass ger bättre balans mellan styrka, energi och vana.",
  };
}

export function buildInitialWeeklyPlan(
  settings: WeeklyPlanSettings,
  weekStartDate: string,
): PlannedSession[] {
  const selectedDays = getAutoFillDays(settings.sessionsPerWeek, settings.preferredDays);
  const focusRotation = buildFocusRotation(selectedDays.length);

  return selectedDays.map((weekday, index) => {
    const focus = focusRotation[index] ?? focusRotation[focusRotation.length - 1] ?? "full_body";
    const plannedDate = getWeekdayDate(weekStartDate, weekday);

    return {
      id: crypto.randomUUID(),
      userId: settings.userId,
      weekStartDate,
      weekday,
      plannedDate,
      targetDurationMinutes: settings.defaultDurationMinutes,
      focus,
      priorityMuscles: getPriorityMusclesForSession(settings, focus),
      preferredGymId: settings.preferredGymId ?? null,
      status: "planned",
      completedWorkoutLogId: null,
      replacedByWorkoutLogId: null,
      movedFromDate: null,
      movedToDate: null,
    };
  });
}

type InternalMatchedSession = PlannedSession;

function getMatchWindowDays(flexibility: WeeklyPlanFlexibility) {
  if (flexibility === "strict") {
    return 0;
  }

  if (flexibility === "balanced") {
    return 1;
  }

  return 7;
}

function matchLogsToPlannedSessions(
  plannedSessions: PlannedSession[],
  logs: WorkoutLog[],
  flexibility: WeeklyPlanFlexibility,
) {
  const meaningfulLogs = logs
    .filter(isMeaningfulWorkoutForPlan)
    .sort(
      (left, right) =>
        new Date(left.completedAt).getTime() - new Date(right.completedAt).getTime(),
    );
  const sessions = plannedSessions
    .map((session) => ({ ...session }) satisfies InternalMatchedSession)
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate));
  const usedSessionIds = new Set<string>();
  const spontaneousWorkoutLogIds: string[] = [];
  const completedWorkoutLogIds: string[] = [];
  const replacedByWorkoutLogIds = new Set<string>();
  const matchWindowDays = getMatchWindowDays(flexibility);

  for (const log of meaningfulLogs) {
    const logDate = normalizeIsoDate(log.completedAt);
    const unmatchedCandidates = sessions.filter((session) => {
      if (usedSessionIds.has(session.id)) {
        return false;
      }

      const dayDifference = Math.abs(dateDiffInDays(logDate, session.plannedDate));
      if (dayDifference > matchWindowDays) {
        return false;
      }

      return true;
    });

    const bestMatch = unmatchedCandidates.sort((left, right) => {
      const leftDiff = Math.abs(dateDiffInDays(logDate, left.plannedDate));
      const rightDiff = Math.abs(dateDiffInDays(logDate, right.plannedDate));
      return leftDiff - rightDiff;
    })[0];

    if (bestMatch) {
      usedSessionIds.add(bestMatch.id);
      bestMatch.status = "completed";
      bestMatch.completedWorkoutLogId = log.id;
      completedWorkoutLogIds.push(log.id);
      continue;
    }

    spontaneousWorkoutLogIds.push(log.id);
  }

  const spontaneousLogs = meaningfulLogs.filter((log) => spontaneousWorkoutLogIds.includes(log.id));

  for (const log of spontaneousLogs) {
    const inferredFocus = inferWorkoutFocus(log);
    const logDate = normalizeIsoDate(log.completedAt);
    const candidate = sessions
      .filter((session) => !usedSessionIds.has(session.id) && !replacedByWorkoutLogIds.has(session.id))
      .filter((session) => dateDiffInDays(session.plannedDate, logDate) >= 0)
      .sort(
        (left, right) =>
          Math.abs(dateDiffInDays(left.plannedDate, logDate)) -
          Math.abs(dateDiffInDays(right.plannedDate, logDate)),
      )
      .find((session) => {
        if (flexibility === "strict") {
          return false;
        }

        const focusOverlap = FOCUS_MUSCLES[session.focus].some((group) =>
          FOCUS_MUSCLES[inferredFocus].includes(group),
        );
        const maxReplaceDistance = flexibility === "balanced" ? 2 : 4;
        return (
          focusOverlap &&
          Math.abs(dateDiffInDays(session.plannedDate, logDate)) <= maxReplaceDistance
        );
      });

    if (!candidate) {
      continue;
    }

    candidate.status = "replaced_by_spontaneous";
    candidate.replacedByWorkoutLogId = log.id;
    replacedByWorkoutLogIds.add(candidate.id);
  }

  return {
    sessions,
    completedWorkoutLogIds,
    spontaneousWorkoutLogIds,
  };
}

function markMissedSessionsForState(
  sessions: InternalMatchedSession[],
  currentDate: Date,
  flexibility: WeeklyPlanFlexibility,
) {
  const todayIso = toIsoDate(currentDate);
  const carryGraceDays = flexibility === "flexible" ? 2 : 0;

  return sessions.map((session) => {
    if (session.status !== "planned" && session.status !== "moved") {
      return session;
    }

    const daysBehind = dateDiffInDays(todayIso, session.plannedDate);
    if (daysBehind <= carryGraceDays) {
      return session;
    }

    return {
      ...session,
      status: "missed" as const,
    };
  });
}

function getCompletedStimulusThisWeek(logs: WorkoutLog[]) {
  return logs
    .filter(isMeaningfulWorkoutForPlan)
    .reduce<Record<MuscleBudgetGroup, number>>((totals, log) => {
      const logStimulus = buildMuscleStimulusFromExercises(log.exercises);
      for (const group of Object.keys(totals) as MuscleBudgetGroup[]) {
        totals[group] += logStimulus[group];
      }
      return totals;
    }, createMuscleRecord());
}

function buildMuscleSetDeficits(
  settings: WeeklyPlanSettings,
  plannedSessions: PlannedSession[],
  completedLogs: WorkoutLog[],
) {
  const targets = buildPlannedTargetMuscleSets(plannedSessions);
  const completed = getCompletedStimulusThisWeek(completedLogs);
  const deficits = createMuscleRecord();

  for (const group of Object.keys(deficits) as MuscleBudgetGroup[]) {
    deficits[group] = Math.max(0, roundToSingleDecimal(targets[group] - completed[group]));
  }

  return deficits;
}

function focusFromLargestDeficits(deficits: Record<MuscleBudgetGroup, number>): PlannedSessionFocus {
  const upperScore =
    deficits.chest + deficits.back + deficits.shoulders + deficits.biceps + deficits.triceps;
  const lowerScore =
    deficits.quads + deficits.hamstrings + deficits.glutes + deficits.calves;
  const coreScore = deficits.core;

  if (coreScore > upperScore && coreScore > lowerScore) {
    return "core";
  }

  if (upperScore > 0 && lowerScore > 0 && Math.abs(upperScore - lowerScore) <= 1.5) {
    return "full_body";
  }

  if (upperScore >= lowerScore) {
    const pushScore = deficits.chest + deficits.shoulders + deficits.triceps;
    const pullScore = deficits.back + deficits.biceps;

    if (pushScore > pullScore * 1.25) {
      return "push";
    }

    if (pullScore > pushScore * 1.25) {
      return "pull";
    }

    return "upper";
  }

  return "lower";
}

export function suggestNextWorkoutFromWeeklyPlan(planState: WeeklyPlanState): SuggestedWeeklyWorkout {
  const deficits = planState.remainingTrainingNeed.muscleSetDeficits;
  const sortedDeficitMuscles = (Object.keys(deficits) as MuscleBudgetGroup[])
    .filter((group) => deficits[group] > 0)
    .sort((left, right) => deficits[right] - deficits[left]);
  const targetMuscles = sortedDeficitMuscles.slice(0, 3);
  const suggestedNextFocus =
    planState.remainingTrainingNeed.suggestedNextFocus ?? focusFromLargestDeficits(deficits);

  return {
    focus: suggestedNextFocus,
    durationMinutes: planState.remainingTrainingNeed.suggestedNextDurationMinutes,
    priorityMuscles: targetMuscles,
    easyMuscles: [],
    isUserBehindPlan:
      planState.remainingTrainingNeed.sessionsRemaining > 0 &&
      planState.remainingTrainingNeed.completedMinutesThisWeek <
        planState.remainingTrainingNeed.targetMinutesThisWeek * 0.6,
    hasSpontaneousWorkoutThisWeek: planState.spontaneousWorkoutLogIds.length > 0,
  };
}

function getFlexibilityCoachText(flexibility: WeeklyPlanFlexibility) {
  if (flexibility === "strict") {
    return "Vi försöker hålla oss nära dina valda dagar, men planen räknas ändå om automatiskt när du tränar.";
  }

  if (flexibility === "flexible") {
    return "Planen följer främst det du faktiskt hinner under veckan.";
  }

  return "Planen kan glida någon dag åt varje håll om veckan förändras.";
}

export function buildWeeklyPlanStatus(planState: WeeklyPlanState): WeeklyPlanStatus {
  const completedSessions = Math.min(
    planState.settings.sessionsPerWeek,
    planState.completedWorkoutLogIds.length + planState.spontaneousWorkoutLogIds.length,
  );
  const targetMinutes = planState.remainingTrainingNeed.targetMinutesThisWeek;
  const completedMinutes = planState.remainingTrainingNeed.completedMinutesThisWeek;
  const remainingMinutes = planState.remainingTrainingNeed.plannedMinutesRemaining;
  const remainingSessions = planState.remainingTrainingNeed.sessionsRemaining;
  const goalReached =
    remainingSessions === 0 || completedMinutes >= Math.round(targetMinutes * 0.95);
  const suggestedNextWorkoutFocus = goalReached
    ? "recovery_strength"
    : mapPlannedFocusToWorkoutFocus(planState.remainingTrainingNeed.suggestedNextFocus);
  const suggestedNextDurationMinutes = goalReached
    ? planState.settings.minDurationMinutes
    : planState.remainingTrainingNeed.suggestedNextDurationMinutes;

  let message = "Planen räknas om automatiskt när du tränar.";

  if (goalReached) {
    message =
      "Bra jobbat! Veckans mål är i stort sett uppnått. Vill du träna mer nu passar ett kort, återhämtande styrkepass bäst.";
  } else if (completedSessions === 0) {
    message =
      `Du har ${remainingSessions} pass kvar den här veckan. Det viktigaste är att komma igång med ett genomförbart pass.`;
  } else if (planState.spontaneousWorkoutLogIds.length > 0) {
    message =
      `Planen har räknats om efter ditt spontana pass. Det återstår ungefär ${remainingSessions} pass och cirka ${remainingMinutes} minuter.`;
  } else if (remainingSessions > 0) {
    message =
      `För att hålla veckan rimlig återstår ungefär ${remainingSessions} pass på cirka ${planState.remainingTrainingNeed.suggestedNextDurationMinutes} minuter.`;
  }

  return {
    plannedSessions: planState.settings.sessionsPerWeek,
    completedSessions,
    remainingSessions,
    completedMinutes,
    targetMinutes,
    remainingMinutes,
    suggestedNextWorkoutFocus,
    suggestedNextDurationMinutes,
    message: `${message} ${getFlexibilityCoachText(planState.settings.flexibility)}`.trim(),
  };
}

export function buildWeeklyPlanContext(planState: WeeklyPlanState): WeeklyPlanContext {
  const suggestion = suggestNextWorkoutFromWeeklyPlan(planState);
  const status = buildWeeklyPlanStatus(planState);

  return {
    sessionsPerWeek: planState.settings.sessionsPerWeek,
    completedSessionsThisWeek: status.completedSessions,
    remainingSessionsThisWeek: planState.remainingTrainingNeed.sessionsRemaining,
    targetMinutesThisWeek: planState.remainingTrainingNeed.targetMinutesThisWeek,
    completedMinutesThisWeek: planState.remainingTrainingNeed.completedMinutesThisWeek,
    plannedMinutesRemaining: planState.remainingTrainingNeed.plannedMinutesRemaining,
    suggestedNextFocus: suggestion.focus,
    suggestedNextDurationMinutes: suggestion.durationMinutes,
    priorityMuscles: suggestion.priorityMuscles,
    easyMuscles: suggestion.easyMuscles,
    muscleSetDeficits: planState.remainingTrainingNeed.muscleSetDeficits,
    isUserBehindPlan: suggestion.isUserBehindPlan,
    hasSpontaneousWorkoutThisWeek: suggestion.hasSpontaneousWorkoutThisWeek,
    flexibility: planState.settings.flexibility,
    preferredDays: planState.settings.preferredDays,
    preferredGymId: planState.settings.preferredGymId ?? null,
    coachText: status.message,
  };
}

export function deriveWeeklyPlanState(params: {
  settings: WeeklyPlanSettings;
  plannedSessions: PlannedSession[];
  workoutLogs: WorkoutLog[];
  now?: Date;
}): WeeklyPlanState {
  const now = params.now ?? new Date();
  const weekStartDate = getWeekStartDate(now);
  const logsThisWeek = params.workoutLogs.filter((log) => {
    if (isWorkoutLogExcludedFromAnalysis(log)) {
      return false;
    }

    return getWeekStartDate(log.completedAt) === weekStartDate;
  });
  const currentWeekSessions = params.plannedSessions
    .filter((session) => session.weekStartDate === weekStartDate)
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate));
  const matched = matchLogsToPlannedSessions(
    currentWeekSessions,
    logsThisWeek,
    params.settings.flexibility,
  );
  const sessionsWithMissedStatus = markMissedSessionsForState(
    matched.sessions,
    now,
    params.settings.flexibility,
  );
  const missedSessions = sessionsWithMissedStatus.filter((session) => session.status === "missed");
  const completedLogs = logsThisWeek.filter(
    (log) => matched.completedWorkoutLogIds.includes(log.id) || matched.spontaneousWorkoutLogIds.includes(log.id),
  );
  const completedMinutesThisWeek = completedLogs.reduce(
    (sum, log) => sum + getWorkoutDurationMinutes(log),
    0,
  );
  const targetMinutesThisWeek = params.settings.defaultDurationMinutes * params.settings.sessionsPerWeek;
  const completedSessionCount = Math.min(
    params.settings.sessionsPerWeek,
    matched.completedWorkoutLogIds.length + matched.spontaneousWorkoutLogIds.length,
  );
  const sessionsRemaining = Math.max(0, params.settings.sessionsPerWeek - completedSessionCount);
  const plannedMinutesRemaining = Math.max(0, targetMinutesThisWeek - completedMinutesThisWeek);
  const muscleSetDeficits = buildMuscleSetDeficits(
    params.settings,
    currentWeekSessions,
    completedLogs,
  );
  const outstandingPlannedSession = sessionsWithMissedStatus.find(
    (session) => session.status === "planned" || session.status === "moved",
  );
  const suggestedNextFocus =
    outstandingPlannedSession?.focus ?? focusFromLargestDeficits(muscleSetDeficits);
  const suggestedNextDurationMinutes = clampNumber(
    sessionsRemaining > 0
      ? Math.round(plannedMinutesRemaining / sessionsRemaining)
      : params.settings.defaultDurationMinutes,
    params.settings.minDurationMinutes,
    params.settings.maxDurationMinutes,
  );

  return {
    userId: params.settings.userId,
    weekStartDate,
    settings: params.settings,
    plannedSessions: sessionsWithMissedStatus,
    completedWorkoutLogIds: matched.completedWorkoutLogIds,
    spontaneousWorkoutLogIds: matched.spontaneousWorkoutLogIds,
    missedSessions,
    remainingTrainingNeed: {
      sessionsRemaining,
      plannedMinutesRemaining,
      completedMinutesThisWeek,
      targetMinutesThisWeek,
      muscleSetDeficits,
      suggestedNextFocus,
      suggestedNextDurationMinutes,
    },
  };
}
