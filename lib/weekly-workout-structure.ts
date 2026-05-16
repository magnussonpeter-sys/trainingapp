import {
  buildMuscleBudget,
  getConfidenceScore,
  type ConfidenceScore,
  type MuscleBudgetEntry,
  type MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import type { SportFocus } from "@/types/training-profile";
import {
  buildGoalTrajectory,
  type GoalTrajectory,
} from "@/lib/planning/goal-trajectory";
import {
  buildTrainingGap,
  type TrainingGap,
} from "@/lib/planning/training-gap";
import {
  buildGoalFeedback,
  type GoalFeedback,
} from "@/lib/planning/goal-feedback";
import {
  buildCoachDecision,
  type CoachDecision,
} from "@/lib/planning/coach-decision";
import {
  buildTrainingDoseAdjustment,
  type TrainingDoseAdjustment,
} from "@/lib/planning/training-dose-adjustment";
import { getExerciseById } from "@/lib/exercise-catalog";
import {
  isWorkoutLogExcludedFromAnalysis,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import type { WorkoutFocus } from "@/types/workout";

type WeeklyPlanningGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

type WeeklyPlanningSettings = {
  experience_level?: string | null;
  training_goal?: WeeklyPlanningGoal | null;
  sport_focus?: SportFocus | null;
  primary_priority_muscle?: MuscleBudgetGroup | null;
  secondary_priority_muscle?: MuscleBudgetGroup | null;
  tertiary_priority_muscle?: MuscleBudgetGroup | null;
  preferred_session_duration_minutes?: number | null;
  min_session_duration_minutes?: number | null;
  max_session_duration_minutes?: number | null;
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
  goalFeedback: GoalFeedback;
  goalTrajectory: GoalTrajectory;
  muscleBudget: MuscleBudgetEntry[];
  nextFocus: WorkoutFocus;
  nextFocusMuscleGroups: MuscleBudgetGroup[];
  selectedPlanMode: PlannedTrainingMode;
  targetMuscles: MuscleBudgetGroup[];
  avoidMuscles: MuscleBudgetGroup[];
  limitedMuscles: MuscleBudgetGroup[];
  focusIntent: string;
  recoveryOverrideApplied: boolean;
  recoveryOverrideReason: string | null;
  passCount: number;
  priorityMuscles: MuscleBudgetGroup[];
  optimalPlanText: string;
  splitStyle: "full_body" | "upper_lower" | "upper_lower_full" | "adaptive";
  summaryText: string;
  trainingDoseAdjustment: TrainingDoseAdjustment;
  trainingGap: TrainingGap;
  upcomingDays: WeeklyPlanDay[];
  upcomingSteps: WeeklyPlanStep[];
};

export type PlannedTrainingMode =
  | "normal_training"
  | "recovery"
  | "recovery_mobility"
  | "light_accessory"
  | "selective_priority_accessory";

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
  lower_body: ["quads", "hamstrings", "glutes", "calves"],
  core: ["core"],
};

const PRIORITY_MULTIPLIERS = [1.75, 1.5, 1.35] as const;
const PRIORITY_BONUS_MUSCLES = new Set<MuscleBudgetGroup>([
  "chest",
  "triceps",
  "biceps",
]);
const MUSCLE_LABELS: Record<MuscleBudgetGroup, string> = {
  chest: "Bröst",
  back: "Rygg",
  quads: "Framsida lår",
  hamstrings: "Baksida lår",
  glutes: "Säte",
  shoulders: "Axlar",
  biceps: "Biceps",
  triceps: "Triceps",
  calves: "Vader",
  core: "Bål",
};

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
    .filter(
      (log) => log.status === "completed" && !isWorkoutLogExcludedFromAnalysis(log),
    )
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
    if (log.status !== "completed" || isWorkoutLogExcludedFromAnalysis(log)) {
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

function isHighRiskOrOver(entry: MuscleBudgetEntry) {
  return entry.loadStatus === "high_risk" || entry.loadStatus === "over";
}

function getEntriesByGroups(
  entries: MuscleBudgetEntry[],
  groups: MuscleBudgetGroup[],
) {
  return entries.filter((entry) => groups.includes(entry.group));
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
    if (log.status !== "completed" || isWorkoutLogExcludedFromAnalysis(log)) {
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

function getPlanModeFocusTarget(
  targetMuscles: MuscleBudgetGroup[],
  fallbackFocus: WorkoutFocus,
): WorkoutFocus {
  const upperCount = targetMuscles.filter((group) =>
    ["chest", "back", "shoulders", "biceps", "triceps"].includes(group),
  ).length;
  const lowerCount = targetMuscles.filter((group) =>
    ["quads", "hamstrings", "glutes", "calves"].includes(group),
  ).length;

  if (upperCount > lowerCount) {
    return "upper_body";
  }

  if (lowerCount > upperCount) {
    return "lower_body";
  }

  if (targetMuscles.length === 1 && targetMuscles[0] === "core") {
    return "core";
  }

  return fallbackFocus;
}

function buildLowRiskTargetMuscles(params: {
  entries: MuscleBudgetEntry[];
  configuredPriorityMuscles: MuscleBudgetGroup[];
  targetLimit: number;
}) {
  return [...params.entries]
    .filter(
      (entry) =>
        entry.remainingSets > 0 &&
        !isHighRiskOrOver(entry) &&
        entry.group !== "core",
    )
    .sort((left, right) => {
      const leftPriorityRank = getPriorityRank(
        params.configuredPriorityMuscles,
        left.group,
      );
      const rightPriorityRank = getPriorityRank(
        params.configuredPriorityMuscles,
        right.group,
      );

      if (leftPriorityRank !== rightPriorityRank) {
        if (leftPriorityRank === null) return 1;
        if (rightPriorityRank === null) return -1;
        return leftPriorityRank - rightPriorityRank;
      }

      if (right.remainingSets !== left.remainingSets) {
        return right.remainingSets - left.remainingSets;
      }

      return right.recent4WeekAvgSets - left.recent4WeekAvgSets;
    })
    .slice(0, params.targetLimit)
    .map((entry) => entry.group);
}

function shouldIncludeOptionalCalvesAccessory(
  entries: MuscleBudgetEntry[],
  selectedPlanMode: PlannedTrainingMode,
  nextFocus: WorkoutFocus,
) {
  const calves = entries.find((entry) => entry.group === "calves");

  if (!calves || calves.remainingSets <= 0 || isHighRiskOrOver(calves)) {
    return false;
  }

  if (
    selectedPlanMode !== "light_accessory" &&
    selectedPlanMode !== "selective_priority_accessory" &&
    nextFocus !== "lower_body"
  ) {
    return false;
  }

  return calves.recent4WeekAvgSets <= 1;
}

function buildFocusSummaryText(params: {
  coachDecision: CoachDecision;
  currentWeekFocuses: WorkoutFocus[];
  goalTrajectory: GoalTrajectory;
  nextFocus: WorkoutFocus;
  nextFocusScore: AdaptiveFocusScore;
  patternPreferredFocus: WorkoutFocus;
  trainingDoseAdjustment: TrainingDoseAdjustment;
  goal?: WeeklyPlanningGoal | null;
}) {
  const recentSummary =
    params.currentWeekFocuses.length > 0
      ? `Senaste 7 dagarna: ${params.currentWeekFocuses
          .map((focus) => formatWorkoutFocus(focus))
          .join(", ")}.`
      : "Ingen genomförd veckocykel ännu.";

  if (params.nextFocus !== params.patternPreferredFocus) {
    const baseText = `${recentSummary} Veckorytmen pekade mot ${formatWorkoutFocus(
      params.patternPreferredFocus,
    ).toLowerCase()}, men fokus flyttades till ${formatWorkoutFocus(
      params.nextFocus,
    ).toLowerCase()} eftersom ${params.coachDecision.message.toLowerCase()}`;

    return appendTrainingDoseAdjustmentText(
      baseText,
      params.trainingDoseAdjustment,
      params.goal,
    );
  }

  return appendTrainingDoseAdjustmentText(
    `${recentSummary} Nästa fokus blir ${formatWorkoutFocus(
    params.nextFocus,
  ).toLowerCase()} eftersom ${params.nextFocusScore.reason}. ${params.goalTrajectory.message}`,
    params.trainingDoseAdjustment,
    params.goal,
  );
}

function buildOptimalPlanText(params: {
  coachDecision: CoachDecision;
  goalTrajectory: GoalTrajectory;
  passCount: number;
  trainingDoseAdjustment: TrainingDoseAdjustment;
  goal?: WeeklyPlanningGoal | null;
}) {
  // Långsiktig riktning först, därefter konkret coachbeslut för denna vecka.
  if (params.goalTrajectory.status === "too_aggressive") {
    return appendTrainingDoseAdjustmentText(
      `${params.goalTrajectory.message} ${params.coachDecision.message}`,
      params.trainingDoseAdjustment,
      params.goal,
    );
  }

  if (params.goalTrajectory.status === "behind") {
    return appendTrainingDoseAdjustmentText(
      `${params.goalTrajectory.message} Sikta på ungefär ${params.goalTrajectory.suggestedWeeklySessions ?? params.passCount} pass den här veckan.`,
      params.trainingDoseAdjustment,
      params.goal,
    );
  }

  if (params.goalTrajectory.status === "slightly_behind") {
    return appendTrainingDoseAdjustmentText(
      `${params.goalTrajectory.message} ${params.coachDecision.message}`,
      params.trainingDoseAdjustment,
      params.goal,
    );
  }

  if (params.goalTrajectory.status === "insufficient_data") {
    return appendTrainingDoseAdjustmentText(
      `${params.goalTrajectory.message} Tills vidare är cirka ${params.passCount} träningsfönster en bra start.`,
      params.trainingDoseAdjustment,
      params.goal,
    );
  }

  if (params.coachDecision.status === "need_extra_session") {
    return appendTrainingDoseAdjustmentText(
      `${params.goalTrajectory.message} Veckan kan behöva ${params.passCount + 1} träningsfönster om energin finns.`,
      params.trainingDoseAdjustment,
      params.goal,
    );
  }

  if (params.coachDecision.status === "recovery_needed") {
    return appendTrainingDoseAdjustmentText(
      `${params.goalTrajectory.message} Håll nästa pass kortare eller lättare om du tränar idag.`,
      params.trainingDoseAdjustment,
      params.goal,
    );
  }

  return appendTrainingDoseAdjustmentText(
    `${params.goalTrajectory.message} ${params.coachDecision.message}`,
    params.trainingDoseAdjustment,
    params.goal,
  );
}

function appendTrainingDoseAdjustmentText(
  baseText: string,
  adjustment: TrainingDoseAdjustment,
  goal?: WeeklyPlanningGoal | null,
) {
  if (adjustment.compensationMode === "small" || adjustment.compensationMode === "moderate") {
    const focusText =
      adjustment.priorityMuscles.length > 0
        ? ` med lite extra fokus på ${adjustment.priorityMuscles
            .map((group) => MUSCLE_LABELS[group].toLowerCase())
            .join("/")}`
        : "";

    if (goal === "strength") {
      return `${baseText} Eftersom målet är styrka jagar vi inte missad volym. Vi behåller huvudmönstren${focusText} och gör bara en liten justering.`;
    }

    return `${baseText} Du ligger efter planerad träningsdos, så nästa pass får${focusText} – men ökningen hålls liten för att inte bli ett straffpass.`;
  }

  if (adjustment.compensationMode === "reduce_ambition") {
    if (goal === "strength") {
      return `${baseText} ${adjustment.reason} Eftersom målet är styrka jagar vi inte missad volym, utan behåller huvudmönstren i ett kortare och mer genomförbart pass.`;
    }

    return `${baseText} ${adjustment.reason}`;
  }

  if (adjustment.compensationMode === "recovery_first") {
    return `${baseText} ${adjustment.reason}`;
  }

  return baseText;
}

export function buildWeeklyWorkoutStructure(params: {
  logs: WorkoutLog[];
  now?: Date;
  settings?: WeeklyPlanningSettings | null;
  missedPlannedSessionsCount?: number | null;
  preferredSessionDurationMinutes?: number | null;
  minSessionDurationMinutes?: number | null;
  maxSessionDurationMinutes?: number | null;
}): WeeklyWorkoutStructure {
  const now = params.now ?? new Date();
  const goal = params.settings?.training_goal ?? null;
  const analysisLogs = params.logs.filter(
    (log) => !isWorkoutLogExcludedFromAnalysis(log),
  );
  const pattern = getGoalPattern(goal);
  const recentCompletedLogs = getRecentCompletedLogs(analysisLogs, now);
  const recent28DayCompletedLogs = getCompletedLogsWithinDays(analysisLogs, now, 28);
  const confidenceScore = getConfidenceScore({
    abortedCount: analysisLogs.filter((log) => log.status === "aborted").length,
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
    logs: analysisLogs,
    now,
    priorityMuscles: configuredPriorityMuscles,
    sportFocus: params.settings?.sport_focus ?? null,
  }).entries;
  const currentWeekFocuses = recentCompletedLogs.map((log) => detectWorkoutFocus(log));
  const passCount = getGoalPassCount(goal);
  const goalTrajectory = buildGoalTrajectory({
    logs: analysisLogs,
    goal,
    experienceLevel: params.settings?.experience_level ?? null,
    muscleBudget,
    completedLast7Days: recentCompletedLogs.length,
    passCount,
    now,
  });
  const trainingGap = buildTrainingGap({
    logs: analysisLogs,
    muscleBudget,
    goal,
    experienceLevel: params.settings?.experience_level ?? null,
    targetSessionsPerWeek: goalTrajectory.weeklyFrequencyTarget,
    // Veckomålets minuter ska följa den faktiska planambitionen, inte ett hårdkodat 30-minutersantagande.
    targetMinutesPerWeek:
      goalTrajectory.weeklyFrequencyTarget *
      Math.max(
        20,
        Math.round(
          params.preferredSessionDurationMinutes ??
            params.settings?.preferred_session_duration_minutes ??
            30,
        ),
      ),
    now,
  });
  const goalFeedback = buildGoalFeedback({
    logs: analysisLogs,
    goal,
    experienceLevel: params.settings?.experience_level ?? null,
    sportFocus: params.settings?.sport_focus ?? null,
    trainingGap,
    goalTrajectory,
    muscleBudget,
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
    sportFocus: params.settings?.sport_focus ?? null,
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
  const rawNextFocus = finalFocusScore?.focus ?? patternPreferredFocus;
  const coreEntry = muscleBudget.find((entry) => entry.group === "core") ?? null;
  const focusScoresExcludingCore = adaptiveFocusScores.filter(
    (entry) => entry.focus !== "core",
  );
  const nextNonCoreFocus =
    [...focusScoresExcludingCore].sort((left, right) => right.score - left.score)[0]
      ?.focus ?? "full_body";
  const nextFocus =
    rawNextFocus === "core" &&
    coreEntry &&
    (isHighRiskOrOver(coreEntry) || coreEntry.remainingSets <= 0)
      ? nextNonCoreFocus
      : rawNextFocus;
  const overloadedEntries = muscleBudget.filter((entry) => isHighRiskOrOver(entry));
  const highRiskOrOverCount = overloadedEntries.length;
  const lowRiskTargets = buildLowRiskTargetMuscles({
    entries: muscleBudget,
    configuredPriorityMuscles,
    targetLimit: 3,
  });
  let selectedPlanMode: PlannedTrainingMode = "normal_training";
  let targetMuscles = getFocusMuscleGroups(muscleBudget, nextFocus, {
    limit: 3,
    configuredPriorityMuscles,
    recommendedOnly: true,
  });
  let avoidMuscles = overloadedEntries.map((entry) => entry.group);
  let limitedMuscles: MuscleBudgetGroup[] = [];
  let focusIntent = `Normalt ${formatWorkoutFocus(nextFocus).toLowerCase()}pass utifrån veckobudgeten.`;
  let recoveryOverrideApplied = false;
  let recoveryOverrideReason: string | null = null;
  const selectedFocusRiskEntries = getEntriesByGroups(
    muscleBudget,
    FOCUS_TO_BUDGET_GROUPS[nextFocus],
  ).filter((entry) => isHighRiskOrOver(entry) || entry.remainingSets <= 0);
  const shouldApplyRecoveryOverride =
    (coachDecision.status === "recovery_needed" ||
      goalTrajectory.status === "too_aggressive") &&
    (highRiskOrOverCount >= 3 ||
      (finalFocusScore?.score ?? 0) <= 0 ||
      selectedFocusRiskEntries.length >= Math.ceil(FOCUS_TO_BUDGET_GROUPS[nextFocus].length / 2));

  if (shouldApplyRecoveryOverride) {
    // När flera grupper redan är pressade ska modellen hellre välja selektivt/lätt än ett vanligt pass.
    recoveryOverrideApplied = true;
    recoveryOverrideReason =
      coachDecision.status === "recovery_needed"
        ? coachDecision.message
        : goalTrajectory.message;

    if (lowRiskTargets.length > 0) {
      selectedPlanMode = "selective_priority_accessory";
      targetMuscles = lowRiskTargets.slice(0, 3);
      limitedMuscles = lowRiskTargets.slice(3, 5);
      focusIntent = `Lätt selektivt pass med direkt volym för ${targetMuscles
        .map((group) => MUSCLE_LABELS[group].toLowerCase())
        .join(", ")}, utan att driva upp redan belastade muskler.`;
    } else if (muscleBudget.some((entry) => entry.remainingSets > 0 && !isHighRiskOrOver(entry))) {
      selectedPlanMode = "light_accessory";
      targetMuscles = buildLowRiskTargetMuscles({
        entries: muscleBudget,
        configuredPriorityMuscles,
        targetLimit: 2,
      });
      focusIntent =
        "Lätt tillbehörspass rekommenderas om du tränar idag. Håll volym och intensitet tydligt lägre än vanligt.";
    } else {
      selectedPlanMode = "recovery_mobility";
      targetMuscles = [];
      avoidMuscles = overloadedEntries.map((entry) => entry.group);
      focusIntent =
        "Vila eller lätt rörlighet rekommenderas eftersom återhämtning väger tyngre än mer träningsfokus just nu.";
    }
  }

  if (shouldIncludeOptionalCalvesAccessory(muscleBudget, selectedPlanMode, nextFocus)) {
    if (!targetMuscles.includes("calves") && !limitedMuscles.includes("calves")) {
      limitedMuscles = [...limitedMuscles, "calves"];
    }
  }

  const effectiveFocus =
    selectedPlanMode === "selective_priority_accessory" && targetMuscles.length > 0
      ? getPlanModeFocusTarget(targetMuscles, nextFocus)
      : nextFocus;
  const trainingDoseAdjustment = buildTrainingDoseAdjustment({
    logs: analysisLogs,
    now,
    trainingGap,
    goalTrajectory,
    muscleBudget,
    nextFocus: effectiveFocus,
    goal,
    experienceLevel: params.settings?.experience_level ?? null,
    configuredPriorityMuscles,
    missedPlannedSessionsCount: params.missedPlannedSessionsCount ?? 0,
    selectedPlanMode,
    recoveryOverrideApplied,
    preferredSessionDurationMinutes:
      params.preferredSessionDurationMinutes ??
      params.settings?.preferred_session_duration_minutes ??
      30,
    minSessionDurationMinutes:
      params.minSessionDurationMinutes ??
      params.settings?.min_session_duration_minutes ??
      20,
    maxSessionDurationMinutes:
      params.maxSessionDurationMinutes ??
      params.settings?.max_session_duration_minutes ??
      60,
  });
  // Dosjustering får styra lite extra fokus, men ska aldrig bryta recovery- eller riskfilter.
  if (
    (trainingDoseAdjustment.compensationMode === "small" ||
      trainingDoseAdjustment.compensationMode === "moderate") &&
    selectedPlanMode !== "recovery_mobility"
  ) {
    const adjustmentTargets = trainingDoseAdjustment.priorityMuscles.filter(
      (group) =>
        !avoidMuscles.includes(group) &&
        !targetMuscles.includes(group),
    );
    targetMuscles = [...targetMuscles, ...adjustmentTargets].slice(0, 3);
  }
  const nextFocusMuscleGroups = targetMuscles.length > 0 ? targetMuscles : getFocusMuscleGroups(
    muscleBudget,
    effectiveFocus,
    {
      limit: 3,
      configuredPriorityMuscles,
      recommendedOnly: true,
    },
  );
  if (trainingDoseAdjustment.compensationMode === "small") {
    focusIntent = `${focusIntent} Nästa pass kan få cirka 5 minuter extra och lite mer direkt fokus på eftersatta muskler.`;
  } else if (trainingDoseAdjustment.compensationMode === "moderate") {
    focusIntent = `${focusIntent} Nästa pass kan få 5–10 minuter extra, men ökningen hålls inom en liten kontrollerad kompensation.`;
  } else if (trainingDoseAdjustment.compensationMode === "reduce_ambition") {
    focusIntent = `${focusIntent} Ambitionsnivån sänks något för att göra veckan mer genomförbar.`;
  }
  const trainingDayIndexes = getTrainingDayIndexes(passCount);
  const resolveScheduledDay = (focus: WorkoutFocus | null, index: number): WeeklyPlanDay => {
    const date = addDays(now, index);

    if (index === 0 && selectedPlanMode === "recovery_mobility") {
      return {
        date: toIsoDate(date),
        dayLabel: getDayLabel(date),
        focus: null,
        type: "recovery",
      };
    }

    if (!focus) {
      return {
        date: toIsoDate(date),
        dayLabel: getDayLabel(date),
        focus: null,
        type: "recovery",
      };
    }

    const focusEntries = getEntriesByGroups(muscleBudget, FOCUS_TO_BUDGET_GROUPS[focus]);
    const shouldReplaceCoreFocus =
      focus === "core" &&
      coreEntry &&
      (isHighRiskOrOver(coreEntry) || coreEntry.remainingSets <= 0);

    if (shouldReplaceCoreFocus) {
      return {
        date: toIsoDate(date),
        dayLabel: getDayLabel(date),
        focus: null,
        type: "recovery",
      };
    }

    if (
      index > 0 &&
      focusEntries.length > 0 &&
      focusEntries.every((entry) => isHighRiskOrOver(entry) || entry.remainingSets <= 0)
    ) {
      return {
        date: toIsoDate(date),
        dayLabel: getDayLabel(date),
        focus: null,
        type: "recovery",
      };
    }

    return {
      date: toIsoDate(date),
      dayLabel: getDayLabel(date),
      focus,
      type: "training",
    };
  };
  const upcomingDays = Array.from({ length: 7 }, (_, index) => {
    const slotIndex = trainingDayIndexes.indexOf(index);
    const focus =
      slotIndex === -1
        ? null
        : slotIndex === 0
          ? effectiveFocus
          : pattern[(nextPatternIndex + slotIndex) % pattern.length] ?? effectiveFocus;

    return resolveScheduledDay(focus, index);
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
        muscleGroups:
          trainingStepCount === 1 && targetMuscles.length > 0
            ? targetMuscles
            : getFocusMuscleGroups(muscleBudget, day.focus, {
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
    [
      ...(trainingDoseAdjustment.priorityMuscles ?? []),
      ...(coachDecision.priorityGroups ?? []),
    ],
  );
  const effectiveFocusScore =
    adaptiveFocusScores.find((entry) => entry.focus === effectiveFocus) ??
    getAdaptiveFocusScore({
      focus: effectiveFocus,
      entries: muscleBudget,
      configuredPriorityMuscles,
      patternPreferredFocus,
    });
  const summaryText = buildFocusSummaryText({
    coachDecision,
    currentWeekFocuses,
    goalTrajectory,
    nextFocus: effectiveFocus,
    nextFocusScore: effectiveFocusScore,
    patternPreferredFocus,
    trainingDoseAdjustment,
    goal,
  });
  const defaultOptimalPlanText = buildOptimalPlanText({
    coachDecision,
    goalTrajectory,
    passCount,
    trainingDoseAdjustment,
    goal,
  });
  const summaryOverride =
    selectedPlanMode === "recovery_mobility"
        ? `${buildFocusSummaryText({
          coachDecision,
          currentWeekFocuses,
          goalTrajectory,
          nextFocus: effectiveFocus,
          nextFocusScore: effectiveFocusScore,
          patternPreferredFocus,
          trainingDoseAdjustment,
        })} Vila eller lätt rörlighet väger tyngre än mer träningsvolym idag.`
      : selectedPlanMode === "selective_priority_accessory"
        ? `Nästa träningsfönster bör vara selektivt. Sikta på direkt volym för ${targetMuscles
            .map((group) => MUSCLE_LABELS[group].toLowerCase())
            .join(", ")} och undvik extra belastning på ${avoidMuscles
            .map((group) => MUSCLE_LABELS[group].toLowerCase())
            .join(", ")}.`
        : summaryText;
  const optimalPlanText =
    selectedPlanMode === "recovery_mobility"
      ? "Återhämtning rekommenderas just nu. Om du ändå tränar idag bör det vara mycket lätt rörlighet eller låg belastning."
      : selectedPlanMode === "selective_priority_accessory"
        ? `${defaultOptimalPlanText} Håll passet kort och selektivt med direkt volym för ${targetMuscles
            .map((group) => MUSCLE_LABELS[group].toLowerCase())
            .join(", ")}.`
        : defaultOptimalPlanText;

  return {
    coachDecision,
    completedLast7Days: recentCompletedLogs.length,
    confidenceScore,
    configuredPriorityMuscles,
    currentWeekFocuses,
    goalFeedback,
    goalTrajectory,
    muscleBudget,
    nextFocus: effectiveFocus,
    nextFocusMuscleGroups,
    selectedPlanMode,
    targetMuscles,
    avoidMuscles,
    limitedMuscles,
    focusIntent,
    recoveryOverrideApplied,
    recoveryOverrideReason,
    passCount,
    priorityMuscles,
    optimalPlanText,
    splitStyle: getSplitStyle(passCount),
    summaryText: summaryOverride,
    trainingDoseAdjustment,
    trainingGap,
    upcomingDays,
    upcomingSteps,
  };
}
