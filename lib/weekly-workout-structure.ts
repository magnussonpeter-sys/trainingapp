import {
  buildMuscleBudget,
  getConfidenceScore,
  type ConfidenceScore,
  type MuscleBudgetEntry,
  type MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import {
  buildGoalTrajectory,
  type GoalTrajectory,
} from "@/lib/planning/goal-trajectory";
import {
  buildCoachDecision,
  type CoachDecision,
} from "@/lib/planning/coach-decision";
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
  primary_priority_muscle?: MuscleBudgetGroup | null;
  secondary_priority_muscle?: MuscleBudgetGroup | null;
  tertiary_priority_muscle?: MuscleBudgetGroup | null;
};

export type WeeklyPlanDay = {
  date: string;
  dayLabel: string;
  focus: WorkoutFocus | null;
  type: "training" | "recovery";
};

export type WeeklyPlanStep = {
  label: string;
  focus: WorkoutFocus | null;
  type: "training" | "recovery";
  muscleGroups: MuscleBudgetGroup[];
};

export type WeeklyWorkoutStructure = {
  coachDecision: CoachDecision;
  completedLast7Days: number;
  confidenceScore: ConfidenceScore;
  configuredPriorityMuscles: MuscleBudgetGroup[];
  currentWeekFocuses: WorkoutFocus[];
  goalTrajectory: GoalTrajectory;
  muscleBudget: MuscleBudgetEntry[];
  nextFocus: WorkoutFocus;
  nextFocusMuscleGroups: MuscleBudgetGroup[];
  passCount: number;
  priorityMuscles: MuscleBudgetGroup[];
  optimalPlanText: string;
  splitStyle: "full_body" | "upper_lower" | "upper_lower_full" | "adaptive";
  summaryText: string;
  upcomingDays: WeeklyPlanDay[];
  upcomingSteps: WeeklyPlanStep[];
};

export type AdaptiveFocusScore = {
  focus: WorkoutFocus;
  score: number;
  remainingScore: number;
  priorityScore: number;
  overloadPenalty: number;
  patternBonus: number;
  reason: string;
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
const FOCUS_TO_BUDGET_GROUPS: Record<WorkoutFocus, MuscleBudgetGroup[]> = {
  full_body: ["quads", "glutes", "back", "chest", "core"],
  upper_body: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower_body: ["quads", "hamstrings", "glutes", "calves", "core"],
  core: ["core", "glutes"],
};

const PRIORITY_MULTIPLIERS = [1.75, 1.5, 1.35] as const;
const PRIORITY_BONUS_MUSCLES = new Set<MuscleBudgetGroup>([
  "chest",
  "triceps",
  "biceps",
]);

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

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
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

function getPriorityRank(
  configuredPriorityMuscles: MuscleBudgetGroup[],
  group: MuscleBudgetGroup,
) {
  const index = configuredPriorityMuscles.indexOf(group);
  return index >= 0 ? index : null;
}

function getLoadPenalty(entry: MuscleBudgetEntry) {
  if (entry.loadStatus === "high_risk") {
    return 3;
  }

  if (entry.loadStatus === "over") {
    return 1.5;
  }

  return 0;
}

function getFocusEntries(
  entries: MuscleBudgetEntry[],
  focus: WorkoutFocus,
) {
  return entries.filter((entry) => FOCUS_TO_BUDGET_GROUPS[focus].includes(entry.group));
}

export function isFocusOverloaded(
  entries: MuscleBudgetEntry[],
  focus: WorkoutFocus,
): boolean {
  const focusEntries = getFocusEntries(entries, focus);

  if (focusEntries.length === 0) {
    return false;
  }

  const overloadedCount = focusEntries.filter(
    (entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over",
  ).length;

  if (overloadedCount >= Math.ceil(focusEntries.length / 2)) {
    return true;
  }

  if (focus === "lower_body") {
    const quads = focusEntries.find((entry) => entry.group === "quads");
    const glutes = focusEntries.find((entry) => entry.group === "glutes");

    if (
      quads &&
      glutes &&
      (quads.loadStatus === "high_risk" || quads.loadStatus === "over") &&
      (glutes.loadStatus === "high_risk" || glutes.loadStatus === "over")
    ) {
      return true;
    }
  }

  if (focus === "core") {
    const core = focusEntries.find((entry) => entry.group === "core");

    if (core && (core.loadStatus === "high_risk" || core.loadStatus === "over")) {
      return true;
    }
  }

  return false;
}

export function getAdaptiveFocusScore(params: {
  focus: WorkoutFocus;
  entries: MuscleBudgetEntry[];
  configuredPriorityMuscles: MuscleBudgetGroup[];
  patternPreferredFocus: WorkoutFocus;
}): AdaptiveFocusScore {
  const focusEntries = getFocusEntries(params.entries, params.focus);

  if (focusEntries.length === 0) {
    return {
      focus: params.focus,
      score: params.focus === params.patternPreferredFocus ? 0.5 : 0,
      remainingScore: 0,
      priorityScore: 0,
      overloadPenalty: 0,
      patternBonus: params.focus === params.patternPreferredFocus ? 0.5 : 0,
      reason: "Inga tydliga muskelgrupper hittades för fokuset.",
    };
  }

  let remainingScore = 0;
  let priorityScore = 0;
  let overloadPenalty = 0;
  let overloadedCount = 0;

  for (const entry of focusEntries) {
    remainingScore += entry.remainingSets;

    const priorityRank = getPriorityRank(
      params.configuredPriorityMuscles,
      entry.group,
    );

    if (priorityRank !== null) {
      const multiplier = PRIORITY_MULTIPLIERS[priorityRank] ?? 1;
      priorityScore += entry.remainingSets * (multiplier - 1);

      if (PRIORITY_BONUS_MUSCLES.has(entry.group) && entry.remainingSets > 0) {
        priorityScore += entry.remainingSets * 0.5;
      }
    }

    const penalty = getLoadPenalty(entry);
    overloadPenalty += penalty;

    if (penalty > 0) {
      overloadedCount += 1;
    }
  }

  // Om majoriteten av fokusets huvudmuskler redan är överbelastade ska fokuset falla tydligt.
  if (overloadedCount >= Math.ceil(focusEntries.length / 2)) {
    overloadPenalty += 4;
  }

  if (params.focus === "lower_body") {
    const quads = focusEntries.find((entry) => entry.group === "quads");
    const glutes = focusEntries.find((entry) => entry.group === "glutes");

    if (
      quads &&
      glutes &&
      (quads.loadStatus === "high_risk" || quads.loadStatus === "over") &&
      (glutes.loadStatus === "high_risk" || glutes.loadStatus === "over")
    ) {
      overloadPenalty += 4;
    }
  }

  if (params.focus === "core") {
    const core = focusEntries.find((entry) => entry.group === "core");

    if (core && (core.loadStatus === "high_risk" || core.loadStatus === "over")) {
      overloadPenalty += 3;
    }
  }

  const patternBonus = params.focus === params.patternPreferredFocus ? 0.5 : 0;
  const score = roundToSingleDecimal(
    remainingScore + priorityScore + patternBonus - overloadPenalty,
  );
  const topRemainingGroups = focusEntries
    .filter((entry) => entry.remainingSets > 0)
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 3)
    .map((entry) => entry.label.toLowerCase());
  const overloadedGroups = focusEntries
    .filter((entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over")
    .map((entry) => entry.label.toLowerCase());
  const reasonParts = [
    `remaining ${roundToSingleDecimal(remainingScore)}`,
    `prio ${roundToSingleDecimal(priorityScore)}`,
    `överlast -${roundToSingleDecimal(overloadPenalty)}`,
    patternBonus > 0 ? "veckorytm +0.5" : null,
    topRemainingGroups.length > 0
      ? `behov i ${topRemainingGroups.join(", ")}`
      : "inga starka kvarvarande behov",
    overloadedGroups.length > 0
      ? `överlast i ${overloadedGroups.join(", ")}`
      : null,
  ].filter(Boolean);

  return {
    focus: params.focus,
    score,
    remainingScore: roundToSingleDecimal(remainingScore),
    priorityScore: roundToSingleDecimal(priorityScore),
    overloadPenalty: roundToSingleDecimal(overloadPenalty),
    patternBonus,
    reason: reasonParts.join(" · "),
  };
}

function getFocusMuscleGroups(
  entries: MuscleBudgetEntry[],
  focus: WorkoutFocus | null,
  options?: {
    limit?: number;
    configuredPriorityMuscles?: MuscleBudgetGroup[];
    recommendedOnly?: boolean;
  },
) {
  if (!focus) {
    return [];
  }

  const configuredPriorityMuscles = options?.configuredPriorityMuscles ?? [];
  const scopedEntries = [...entries].filter((entry) =>
    FOCUS_TO_BUDGET_GROUPS[focus].includes(entry.group),
  );
  const recommendedEntries = scopedEntries.filter(
    (entry) =>
      entry.remainingSets > 0 &&
      entry.loadStatus !== "high_risk" &&
      entry.loadStatus !== "over",
  );
  const sourceEntries =
    options?.recommendedOnly && recommendedEntries.length > 0
      ? recommendedEntries
      : scopedEntries;

  return sourceEntries
    .sort((left, right) => {
      const leftPriorityRank = getPriorityRank(
        configuredPriorityMuscles,
        left.group,
      );
      const rightPriorityRank = getPriorityRank(
        configuredPriorityMuscles,
        right.group,
      );

      if (leftPriorityRank !== rightPriorityRank) {
        if (leftPriorityRank === null) return 1;
        if (rightPriorityRank === null) return -1;
        return leftPriorityRank - rightPriorityRank;
      }

      const leftLoadPenalty = getLoadPenalty(left);
      const rightLoadPenalty = getLoadPenalty(right);

      if (leftLoadPenalty !== rightLoadPenalty) {
        return leftLoadPenalty - rightLoadPenalty;
      }

      if (right.remainingSets !== left.remainingSets) {
        return right.remainingSets - left.remainingSets;
      }

      const priorityRank = { high: 0, medium: 1, low: 2 };
      return priorityRank[left.priority] - priorityRank[right.priority];
    })
    .slice(0, options?.limit ?? Number.POSITIVE_INFINITY)
    .map((entry) => entry.group);
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
    weekKeys.add(
      `${completedAt.getFullYear()}-${Math.ceil((days + firstDayOfYear.getDay() + 1) / 7)}`,
    );
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

function buildPriorityMuscles(
  entries: MuscleBudgetEntry[],
  configuredPriorityMuscles: MuscleBudgetGroup[],
  coachPriorityGroups?: MuscleBudgetGroup[],
) {
  const result: MuscleBudgetGroup[] = [];

  const addIfMissing = (group: MuscleBudgetGroup) => {
    if (!result.includes(group)) {
      result.push(group);
    }
  };

  // Coachlagret får lägga sina viktigaste grupper först utan att skriva över budgeten.
  (coachPriorityGroups ?? []).forEach((group) => addIfMissing(group));

  configuredPriorityMuscles
    .map((group) => entries.find((entry) => entry.group === group) ?? null)
    .filter((entry): entry is MuscleBudgetEntry => entry !== null)
    .filter(
      (entry) =>
        entry.remainingSets > 0 &&
        entry.loadStatus !== "high_risk" &&
        entry.loadStatus !== "over",
    )
    .forEach((entry) => addIfMissing(entry.group));

  entries
    .filter(
      (entry) =>
        entry.priority === "high" &&
        entry.remainingSets > 0 &&
        entry.loadStatus !== "high_risk",
    )
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .forEach((entry) => addIfMissing(entry.group));

  entries
    .filter(
      (entry) =>
        entry.priority === "medium" &&
        entry.remainingSets > 0 &&
        entry.loadStatus !== "high_risk",
    )
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .forEach((entry) => addIfMissing(entry.group));

  entries
    .filter(
      (entry) =>
        entry.remainingSets > 0 &&
        entry.loadStatus !== "high_risk",
    )
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .forEach((entry) => addIfMissing(entry.group));

  return result.slice(0, 4);
}

function buildFocusSummaryText(params: {
  coachDecision: CoachDecision;
  currentWeekFocuses: WorkoutFocus[];
  goalTrajectory: GoalTrajectory;
  nextFocus: WorkoutFocus;
  nextFocusScore: AdaptiveFocusScore;
  patternPreferredFocus: WorkoutFocus;
}) {
  const recentSummary =
    params.currentWeekFocuses.length > 0
      ? `Senaste 7 dagarna: ${params.currentWeekFocuses
          .map((focus) => formatWorkoutFocus(focus))
          .join(", ")}.`
      : "Ingen genomförd veckocykel ännu.";

  if (params.nextFocus !== params.patternPreferredFocus) {
    return `${recentSummary} Veckorytmen pekade mot ${formatWorkoutFocus(
      params.patternPreferredFocus,
    ).toLowerCase()}, men fokus flyttades till ${formatWorkoutFocus(
      params.nextFocus,
    ).toLowerCase()} eftersom ${params.coachDecision.message.toLowerCase()}`;
  }

  return `${recentSummary} Nästa fokus blir ${formatWorkoutFocus(
    params.nextFocus,
  ).toLowerCase()} eftersom ${params.nextFocusScore.reason}. ${params.goalTrajectory.message}`;
}

function buildOptimalPlanText(params: {
  coachDecision: CoachDecision;
  goalTrajectory: GoalTrajectory;
  passCount: number;
}) {
  // Långsiktig riktning först, därefter konkret coachbeslut för denna vecka.
  if (params.goalTrajectory.status === "too_aggressive") {
    return `${params.goalTrajectory.message} ${params.coachDecision.message}`;
  }

  if (params.goalTrajectory.status === "behind") {
    return `${params.goalTrajectory.message} Sikta på ungefär ${params.goalTrajectory.suggestedWeeklySessions ?? params.passCount} pass den här veckan.`;
  }

  if (params.goalTrajectory.status === "slightly_behind") {
    return `${params.goalTrajectory.message} ${params.coachDecision.message}`;
  }

  if (params.goalTrajectory.status === "insufficient_data") {
    return `${params.goalTrajectory.message} Tills vidare är cirka ${params.passCount} träningsfönster en bra start.`;
  }

  if (params.coachDecision.status === "need_extra_session") {
    return `${params.goalTrajectory.message} Veckan kan behöva ${params.passCount + 1} träningsfönster om energin finns.`;
  }

  if (params.coachDecision.status === "recovery_needed") {
    return `${params.goalTrajectory.message} Håll nästa pass kortare eller lättare om du tränar idag.`;
  }

  return `${params.goalTrajectory.message} ${params.coachDecision.message}`;
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
  const configuredPriorityMuscles = [
    params.settings?.primary_priority_muscle ?? null,
    params.settings?.secondary_priority_muscle ?? null,
    params.settings?.tertiary_priority_muscle ?? null,
  ].filter((value): value is MuscleBudgetGroup => typeof value === "string");
  const muscleBudget = buildMuscleBudget({
    confidenceScore,
    experienceLevel: params.settings?.experience_level ?? null,
    goal,
    logs: params.logs,
    now,
    priorityMuscles: configuredPriorityMuscles,
  }).entries;
  const currentWeekFocuses = recentCompletedLogs.map((log) => detectWorkoutFocus(log));
  const passCount = getGoalPassCount(goal);
  const goalTrajectory = buildGoalTrajectory({
    logs: params.logs,
    goal,
    experienceLevel: params.settings?.experience_level ?? null,
    muscleBudget,
    completedLast7Days: recentCompletedLogs.length,
    passCount,
    now,
  });
  const nextPatternIndex = recentCompletedLogs.length % pattern.length;
  const patternPreferredFocus = pattern[nextPatternIndex] ?? pattern[0] ?? "full_body";
  const adaptiveFocusScores = (
    ["upper_body", "lower_body", "core", "full_body"] as WorkoutFocus[]
  ).map((focus) =>
    getAdaptiveFocusScore({
      focus,
      entries: muscleBudget,
      configuredPriorityMuscles,
      patternPreferredFocus,
    }),
  );
  const nonOverloadedCandidates = adaptiveFocusScores.filter(
    (entry) =>
      !isFocusOverloaded(muscleBudget, entry.focus) &&
      (entry.remainingScore > 0 || entry.priorityScore > 0),
  );
  const focusCandidates =
    nonOverloadedCandidates.length > 0
      ? nonOverloadedCandidates
      : adaptiveFocusScores;
  const sortedFocusCandidates = [...focusCandidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (left.overloadPenalty !== right.overloadPenalty) {
      return left.overloadPenalty - right.overloadPenalty;
    }

    if (right.priorityScore !== left.priorityScore) {
      return right.priorityScore - left.priorityScore;
    }

    if (right.remainingScore !== left.remainingScore) {
      return right.remainingScore - left.remainingScore;
    }

    return right.patternBonus - left.patternBonus;
  });
  const selectedFocusScore = sortedFocusCandidates[0] ?? null;
  const coachDecision = buildCoachDecision({
    entries: muscleBudget,
    configuredPriorityMuscles,
    currentWeekFocuses,
    completedLast7Days: recentCompletedLogs.length,
    passCount,
    patternPreferredFocus,
    confidenceScore,
  });
  const coachSuggestedFocus = coachDecision.suggestedFocus;
  const coachSuggestedFocusScore = coachSuggestedFocus
    ? adaptiveFocusScores.find((entry) => entry.focus === coachSuggestedFocus) ?? null
    : null;
  const selectedFocusIsUsable =
    coachSuggestedFocusScore &&
    (coachDecision.status === "rebalance_focus" ||
      coachDecision.status === "need_more_volume" ||
      coachDecision.status === "need_extra_session") &&
    (!isFocusOverloaded(muscleBudget, coachSuggestedFocusScore.focus) ||
      nonOverloadedCandidates.length === 0);
  const finalFocusScore = selectedFocusIsUsable
    ? coachSuggestedFocusScore
    : selectedFocusScore;
  const nextFocus = finalFocusScore?.focus ?? patternPreferredFocus;
  const nextFocusMuscleGroups = getFocusMuscleGroups(muscleBudget, nextFocus, {
    limit: 3,
    configuredPriorityMuscles,
    recommendedOnly: true,
  });
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
  let trainingStepCount = 0;
  let recoveryStepCount = 0;
  const upcomingSteps = upcomingDays.map((day) => {
    if (day.type === "training") {
      trainingStepCount += 1;
      return {
        label: `Pass ${trainingStepCount}`,
        focus: day.focus,
        type: day.type,
        muscleGroups: getFocusMuscleGroups(muscleBudget, day.focus, {
          configuredPriorityMuscles,
        }),
      } satisfies WeeklyPlanStep;
    }

    recoveryStepCount += 1;
    return {
      label: recoveryStepCount === 1 ? "Återhämtning" : `Återhämtning ${recoveryStepCount}`,
      focus: null,
      type: "recovery",
      muscleGroups: [],
    } satisfies WeeklyPlanStep;
  });
  const priorityMuscles = buildPriorityMuscles(
    muscleBudget,
    configuredPriorityMuscles,
    coachDecision.priorityGroups,
  );
  const summaryText = buildFocusSummaryText({
    coachDecision,
    currentWeekFocuses,
    goalTrajectory,
    nextFocus,
    nextFocusScore:
      finalFocusScore ??
      getAdaptiveFocusScore({
        focus: nextFocus,
        entries: muscleBudget,
        configuredPriorityMuscles,
        patternPreferredFocus,
      }),
    patternPreferredFocus,
  });
  const optimalPlanText = buildOptimalPlanText({
    coachDecision,
    goalTrajectory,
    passCount,
  });

  return {
    coachDecision,
    completedLast7Days: recentCompletedLogs.length,
    confidenceScore,
    configuredPriorityMuscles,
    currentWeekFocuses,
    goalTrajectory,
    muscleBudget,
    nextFocus,
    nextFocusMuscleGroups,
    passCount,
    priorityMuscles,
    optimalPlanText,
    splitStyle: getSplitStyle(passCount),
    summaryText,
    upcomingDays,
    upcomingSteps,
  };
}
