import {
  buildMuscleBudget,
  getConfidenceScore,
  getFocusDeficitScore,
  type ConfidenceScore,
  type MuscleBudgetEntry,
} from "@/lib/planning/muscle-budget";
import { getExerciseById } from "@/lib/exercise-catalog";
import type { WorkoutLog } from "@/lib/workout-log-storage";
import type { WorkoutFocus } from "@/types/workout";

type WeeklyPlanningGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

type WeeklyPlanningSettings = {
  experience_level?: string | null;
  training_goal?: WeeklyPlanningGoal | null;
};

export type WeeklyPlanDay = {
  date: string;
  dayLabel: string;
  focus: WorkoutFocus | null;
  type: "training" | "recovery";
};

export type WeeklyWorkoutStructure = {
  completedLast7Days: number;
  confidenceScore: ConfidenceScore;
  currentWeekFocuses: WorkoutFocus[];
  muscleBudget: MuscleBudgetEntry[];
  nextFocus: WorkoutFocus;
  passCount: number;
  splitStyle: "full_body" | "upper_lower" | "upper_lower_full" | "adaptive";
  summaryText: string;
  upcomingDays: WeeklyPlanDay[];
};

const UPPER_PATTERNS = new Set([
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
  "carry",
]);

const LOWER_PATTERNS = new Set(["squat", "hinge", "lunge"]);
const CORE_PATTERNS = new Set(["core"]);

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getDayLabel(value: Date) {
  return value.toLocaleDateString("sv-SE", { weekday: "short" });
}

function getGoalPattern(goal?: WeeklyPlanningGoal | null): WorkoutFocus[] {
  if (goal === "strength") {
    return ["lower_body", "upper_body", "full_body"];
  }

  if (goal === "hypertrophy") {
    return ["upper_body", "lower_body", "upper_body", "core"];
  }

  if (goal === "body_composition") {
    return ["upper_body", "lower_body", "core", "full_body"];
  }

  return ["full_body", "upper_body", "lower_body"];
}

function getGoalPassCount(goal?: WeeklyPlanningGoal | null) {
  if (goal === "hypertrophy" || goal === "body_composition") {
    return 4;
  }

  return 3;
}

export function formatWorkoutFocus(focus: WorkoutFocus) {
  if (focus === "upper_body") {
    return "Överkropp";
  }

  if (focus === "lower_body") {
    return "Ben";
  }

  if (focus === "core") {
    return "Bål";
  }

  return "Helkropp";
}

export function formatSplitStyle(
  splitStyle: WeeklyWorkoutStructure["splitStyle"],
) {
  if (splitStyle === "upper_lower") {
    return "Över/under";
  }

  if (splitStyle === "upper_lower_full") {
    return "Över/under/helkropp";
  }

  if (splitStyle === "full_body") {
    return "Helkropp";
  }

  return "Adaptiv";
}

export function detectWorkoutFocus(log: Pick<WorkoutLog, "exercises">): WorkoutFocus {
  let upperCount = 0;
  let lowerCount = 0;
  let coreCount = 0;

  for (const exercise of log.exercises) {
    const catalogExercise = getExerciseById(exercise.exerciseId);
    const movementPattern = catalogExercise?.movementPattern;

    if (!movementPattern) {
      continue;
    }

    if (UPPER_PATTERNS.has(movementPattern)) {
      upperCount += 1;
      continue;
    }

    if (LOWER_PATTERNS.has(movementPattern)) {
      lowerCount += 1;
      continue;
    }

    if (CORE_PATTERNS.has(movementPattern)) {
      coreCount += 1;
    }
  }

  if (coreCount >= 2 && upperCount <= 1 && lowerCount <= 1) {
    return "core";
  }

  if (lowerCount >= upperCount + 1 && lowerCount >= coreCount) {
    return "lower_body";
  }

  if (upperCount >= lowerCount + 1 && upperCount >= coreCount) {
    return "upper_body";
  }

  return "full_body";
}

function getRecentCompletedLogs(logs: WorkoutLog[], now: Date) {
  const thresholdMs = 7 * 24 * 60 * 60 * 1000;

  return [...logs]
    .filter((log) => log.status === "completed")
    .sort(
      (left, right) =>
        new Date(left.completedAt).getTime() - new Date(right.completedAt).getTime(),
    )
    .filter((log) => {
      const completedAtMs = new Date(log.completedAt).getTime();
      return Number.isFinite(completedAtMs) && now.getTime() - completedAtMs <= thresholdMs;
    });
}

function getCompletedLogsWithinDays(logs: WorkoutLog[], now: Date, days: number) {
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  return logs.filter((log) => {
    if (log.status !== "completed") {
      return false;
    }

    const completedAtMs = new Date(log.completedAt).getTime();
    return Number.isFinite(completedAtMs) && now.getTime() - completedAtMs <= thresholdMs;
  });
}

function getTrainingDayIndexes(slotCount: number) {
  if (slotCount <= 3) {
    return [0, 2, 4];
  }

  return [0, 2, 4, 6];
}

function getDistinctTrainingWeeks(logs: WorkoutLog[]) {
  const weekKeys = new Set<string>();

  for (const log of logs) {
    if (log.status !== "completed") {
      continue;
    }

    const completedAt = new Date(log.completedAt);
    if (!Number.isFinite(completedAt.getTime())) {
      continue;
    }

    const firstDayOfYear = new Date(completedAt.getFullYear(), 0, 1);
    const days = Math.floor(
      (completedAt.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000),
    );
    weekKeys.add(`${completedAt.getFullYear()}-${Math.ceil((days + firstDayOfYear.getDay() + 1) / 7)}`);
  }

  return weekKeys.size;
}

function getSplitStyle(passCount: number) {
  if (passCount <= 2) {
    return "full_body" as const;
  }

  if (passCount === 3) {
    return "upper_lower_full" as const;
  }

  return "upper_lower" as const;
}

export function buildWeeklyWorkoutStructure(params: {
  logs: WorkoutLog[];
  now?: Date;
  settings?: WeeklyPlanningSettings | null;
}): WeeklyWorkoutStructure {
  const now = params.now ?? new Date();
  const goal = params.settings?.training_goal ?? null;
  const pattern = getGoalPattern(goal);
  const recentCompletedLogs = getRecentCompletedLogs(params.logs, now);
  const recent28DayCompletedLogs = getCompletedLogsWithinDays(params.logs, now, 28);
  const confidenceScore = getConfidenceScore({
    abortedCount: params.logs.filter((log) => log.status === "aborted").length,
    completedLast28Days: recent28DayCompletedLogs.length,
    distinctTrainingWeeks: getDistinctTrainingWeeks(recent28DayCompletedLogs),
  });
  const muscleBudget = buildMuscleBudget({
    confidenceScore,
    experienceLevel: params.settings?.experience_level ?? null,
    goal,
    logs: params.logs,
    now,
  }).entries;
  const currentWeekFocuses = recentCompletedLogs.map((log) => detectWorkoutFocus(log));
  const passCount = getGoalPassCount(goal);
  const nextPatternIndex = recentCompletedLogs.length % pattern.length;
  const patternPreferredFocus = pattern[nextPatternIndex] ?? pattern[0] ?? "full_body";
  const focusScores = (["upper_body", "lower_body", "core", "full_body"] as WorkoutFocus[]).map(
    (focus) => ({
      focus,
      score:
        getFocusDeficitScore(muscleBudget, focus) +
        (focus === patternPreferredFocus ? 2 : 0),
    }),
  );
  const nextFocus =
    focusScores.sort((left, right) => right.score - left.score)[0]?.focus ??
    patternPreferredFocus;
  const trainingDayIndexes = getTrainingDayIndexes(passCount);
  const upcomingDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(now, index);
    const slotIndex = trainingDayIndexes.indexOf(index);
    const focus =
      slotIndex === -1
        ? null
        : slotIndex === 0
          ? nextFocus
          : pattern[(nextPatternIndex + slotIndex) % pattern.length] ?? nextFocus;

    return {
      date: toIsoDate(date),
      dayLabel: getDayLabel(date),
      focus,
      type: focus ? "training" : "recovery",
    } satisfies WeeklyPlanDay;
  });

  const summaryText =
    currentWeekFocuses.length > 0
      ? `Senaste 7 dagarna: ${currentWeekFocuses
          .map((focus) => formatWorkoutFocus(focus))
          .join(", ")}. Nästa fokus blir ${formatWorkoutFocus(nextFocus).toLowerCase()} utifrån både veckorytm och återstående muskelbudget.`
      : `Ingen genomförd veckocykel ännu. Nästa rekommenderade fokus är ${formatWorkoutFocus(
          nextFocus,
        ).toLowerCase()}.`;

  return {
    completedLast7Days: recentCompletedLogs.length,
    confidenceScore,
    currentWeekFocuses,
    muscleBudget,
    nextFocus,
    passCount,
    splitStyle: getSplitStyle(passCount),
    summaryText,
    upcomingDays,
  };
}
