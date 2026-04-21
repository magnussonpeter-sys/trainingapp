import { getExerciseById } from "@/lib/exercise-catalog";
import type {
  CompletedExercise,
  CompletedSet,
  WorkoutLog,
} from "@/lib/workout-log-storage";
import type { WorkoutFocus } from "@/types/workout";

type PlanningGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

export type ConfidenceScore = "low" | "medium" | "high";

export type MuscleBudgetGroup =
  | "chest"
  | "back"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "calves"
  | "core";

type PriorityRank = 1 | 2 | 3;

export type MuscleBudgetEntry = {
  group: MuscleBudgetGroup;
  label: string;
  priority: "high" | "medium" | "low";
  targetSets: number;
  minimumSets: number;
  completedSets: number;
  effectiveSets: number;
  directSets: number;
  indirectSets: number;
  recent4WeekAvgSets: number;
  recent4WeekAvgEffectiveSets: number;
  remainingSets: number;
  qualityScore: number | null;
  frequencyCount: number;
  lastTrainedAt: string | null;
  progressStatus:
    | "improving"
    | "stable"
    | "plateau"
    | "fatigued"
    | "insufficient_data";
  loadStatus: "under" | "on_target" | "over" | "high_risk";
  distributionStatus: "balanced" | "clustered" | "insufficient_data";
  warningText: string | null;
};

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

const FOCUS_GROUPS: Record<WorkoutFocus, MuscleBudgetGroup[]> = {
  full_body: ["quads", "glutes", "back", "chest", "core"],
  upper_body: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower_body: ["quads", "hamstrings", "glutes", "calves", "core"],
  core: ["core", "glutes"],
};

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

type MuscleTotals = {
  completed: Record<MuscleBudgetGroup, number>;
  direct: Record<MuscleBudgetGroup, number>;
  effective: Record<MuscleBudgetGroup, number>;
  exposureCount: Record<MuscleBudgetGroup, number>;
  lastTrainedAt: Partial<Record<MuscleBudgetGroup, string>>;
  performanceSignals: Record<MuscleBudgetGroup, number[]>;
};

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getExperienceAdjustment(experienceLevel?: string | null) {
  if (experienceLevel === "advanced") {
    return 2;
  }

  if (experienceLevel === "intermediate") {
    return 1;
  }

  if (experienceLevel === "novice" || experienceLevel === "beginner") {
    return -1;
  }

  return 0;
}

function getBaseTargets(goal?: PlanningGoal | null) {
  if (goal === "strength") {
    return { high: 8, medium: 5, low: 3 };
  }

  if (goal === "hypertrophy") {
    return { high: 12, medium: 8, low: 5 };
  }

  if (goal === "body_composition") {
    return { high: 10, medium: 7, low: 4 };
  }

  return { high: 8, medium: 5, low: 3 };
}

function getGoalPriorities(
  goal?: PlanningGoal | null,
): Record<MuscleBudgetGroup, "high" | "medium" | "low"> {
  if (goal === "strength") {
    return {
      chest: "medium",
      back: "high",
      quads: "high",
      hamstrings: "medium",
      glutes: "high",
      shoulders: "medium",
      biceps: "low",
      triceps: "medium",
      calves: "low",
      core: "medium",
    };
  }

  if (goal === "hypertrophy") {
    return {
      chest: "high",
      back: "high",
      quads: "high",
      hamstrings: "medium",
      glutes: "medium",
      shoulders: "high",
      biceps: "medium",
      triceps: "medium",
      calves: "low",
      core: "low",
    };
  }

  if (goal === "body_composition") {
    return {
      chest: "medium",
      back: "high",
      quads: "high",
      hamstrings: "medium",
      glutes: "medium",
      shoulders: "medium",
      biceps: "low",
      triceps: "low",
      calves: "low",
      core: "high",
    };
  }

  return {
    chest: "medium",
    back: "medium",
    quads: "medium",
    hamstrings: "medium",
    glutes: "medium",
    shoulders: "medium",
    biceps: "low",
    triceps: "low",
    calves: "low",
    core: "medium",
  };
}

function createEmptyTotals() {
  return {
    chest: 0,
    back: 0,
    quads: 0,
    hamstrings: 0,
    glutes: 0,
    shoulders: 0,
    biceps: 0,
    triceps: 0,
    calves: 0,
    core: 0,
  } satisfies Record<MuscleBudgetGroup, number>;
}

function createEmptyMuscleTotals(): MuscleTotals {
  return {
    completed: createEmptyTotals(),
    direct: createEmptyTotals(),
    effective: createEmptyTotals(),
    exposureCount: createEmptyTotals(),
    lastTrainedAt: {},
    performanceSignals: {
      chest: [],
      back: [],
      quads: [],
      hamstrings: [],
      glutes: [],
      shoulders: [],
      biceps: [],
      triceps: [],
      calves: [],
      core: [],
    },
  };
}

function addStimulus(
  totals: Record<MuscleBudgetGroup, number>,
  muscles: string[] | undefined,
  setCount: number,
  weight: number,
) {
  if (!Array.isArray(muscles) || setCount <= 0 || weight <= 0) {
    return;
  }

  for (const rawMuscle of muscles) {
    const group = RAW_MUSCLE_TO_BUDGET_GROUP[rawMuscle] ?? null;

    if (group) {
      totals[group] += setCount * weight;
    }
  }
}

function getMappedMuscleGroups(muscles: string[] | undefined) {
  if (!Array.isArray(muscles)) {
    return [];
  }

  const groups = new Set<MuscleBudgetGroup>();

  for (const rawMuscle of muscles) {
    const group = RAW_MUSCLE_TO_BUDGET_GROUP[rawMuscle] ?? null;

    if (group) {
      groups.add(group);
    }
  }

  return Array.from(groups);
}

function getSetCountForExercise(logExercise: WorkoutLog["exercises"][number]) {
  return logExercise.sets.length > 0
    ? logExercise.sets.length
    : Math.max(0, logExercise.plannedSets ?? 0);
}

function getExerciseQualityWeight(exercise: CompletedExercise) {
  if (exercise.plannedDuration && !exercise.plannedReps) {
    if (exercise.timedEffort === "tough") {
      return 1;
    }

    if (exercise.timedEffort === "just_right") {
      return 0.85;
    }

    if (exercise.timedEffort === "light") {
      return 0.65;
    }

    return 0.8;
  }

  if (exercise.extraReps === 0) {
    return 1;
  }

  if (exercise.extraReps === 2) {
    return 0.92;
  }

  if (exercise.extraReps === 4) {
    return 0.78;
  }

  if (exercise.extraReps === 6) {
    return 0.62;
  }

  return 0.8;
}

function getSetPerformanceSignal(set: CompletedSet) {
  if (
    typeof set.actualWeight === "number" &&
    Number.isFinite(set.actualWeight) &&
    typeof set.actualReps === "number" &&
    Number.isFinite(set.actualReps)
  ) {
    return set.actualWeight * set.actualReps;
  }

  if (typeof set.actualReps === "number" && Number.isFinite(set.actualReps)) {
    return set.actualReps;
  }

  if (
    typeof set.actualDuration === "number" &&
    Number.isFinite(set.actualDuration)
  ) {
    return set.actualDuration;
  }

  return null;
}

function getExercisePerformanceSignal(exercise: CompletedExercise) {
  const signals = exercise.sets
    .map((set) => getSetPerformanceSignal(set))
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );

  if (signals.length === 0) {
    return null;
  }

  return Math.max(...signals);
}

function summarizeLogsByMuscle(logs: WorkoutLog[]) {
  const totals = createEmptyMuscleTotals();

  for (const log of logs) {
    const exposedGroups = new Set<MuscleBudgetGroup>();

    for (const exercise of log.exercises) {
      const catalogExercise = getExerciseById(exercise.exerciseId);

      if (!catalogExercise) {
        continue;
      }

      const setCount = getSetCountForExercise(exercise);
      const qualityWeight = getExerciseQualityWeight(exercise);
      const performanceSignal = getExercisePerformanceSignal(exercise);
      const primaryGroups = getMappedMuscleGroups(catalogExercise.primaryMuscles);
      const secondaryGroups = getMappedMuscleGroups(catalogExercise.secondaryMuscles);

      addStimulus(totals.completed, catalogExercise.primaryMuscles, setCount, 1);
      addStimulus(totals.completed, catalogExercise.secondaryMuscles, setCount, 0.5);
      addStimulus(totals.direct, catalogExercise.primaryMuscles, setCount, 1);
      addStimulus(totals.effective, catalogExercise.primaryMuscles, setCount, qualityWeight);
      addStimulus(
        totals.effective,
        catalogExercise.secondaryMuscles,
        setCount,
        0.5 * qualityWeight,
      );

      for (const group of [...primaryGroups, ...secondaryGroups]) {
        exposedGroups.add(group);

        if (typeof performanceSignal === "number") {
          totals.performanceSignals[group].push(performanceSignal);
        }
      }
    }

    for (const group of exposedGroups) {
      totals.exposureCount[group] += 1;

      const previousValue = totals.lastTrainedAt[group];
      if (
        !previousValue ||
        new Date(log.completedAt).getTime() > new Date(previousValue).getTime()
      ) {
        totals.lastTrainedAt[group] = log.completedAt;
      }
    }
  }

  return totals;
}

function filterLogsWithinDays(logs: WorkoutLog[], now: Date, days: number) {
  const threshold = days * 24 * 60 * 60 * 1000;

  return logs.filter((log) => {
    if (log.status !== "completed") {
      return false;
    }

    const completedAtMs = new Date(log.completedAt).getTime();
    return Number.isFinite(completedAtMs) && now.getTime() - completedAtMs <= threshold;
  });
}

function getProgressStatus(params: {
  currentSignals: number[];
  previousSignals: number[];
  completedSets: number;
  targetSets: number;
  qualityScore: number | null;
}) {
  if (params.currentSignals.length === 0 || params.previousSignals.length === 0) {
    return "insufficient_data" as const;
  }

  const currentAverage = getAverage(params.currentSignals);
  const previousAverage = getAverage(params.previousSignals);

  if (previousAverage <= 0) {
    return "insufficient_data" as const;
  }

  const deltaRatio = (currentAverage - previousAverage) / previousAverage;

  if (deltaRatio >= 0.05) {
    return "improving" as const;
  }

  if (
    params.completedSets >= params.targetSets &&
    (params.qualityScore ?? 0) < 0.75 &&
    deltaRatio <= -0.03
  ) {
    return "fatigued" as const;
  }

  if (
    params.completedSets >= params.targetSets * 0.85 &&
    Math.abs(deltaRatio) < 0.03
  ) {
    return "plateau" as const;
  }

  return "stable" as const;
}

function getLoadStatus(params: {
  completedSets: number;
  effectiveSets: number;
  minimumSets: number;
  targetSets: number;
}) {
  if (
    params.completedSets > params.targetSets * 1.25 ||
    params.effectiveSets > params.targetSets * 1.2
  ) {
    return "high_risk" as const;
  }

  if (params.completedSets > params.targetSets || params.effectiveSets > params.targetSets) {
    return "over" as const;
  }

  if (
    params.completedSets >= params.minimumSets ||
    params.effectiveSets >= params.minimumSets
  ) {
    return "on_target" as const;
  }

  return "under" as const;
}

function getDistributionStatus(params: {
  completedSets: number;
  frequencyCount: number;
}) {
  if (params.completedSets <= 0) {
    return "insufficient_data" as const;
  }

  if (params.frequencyCount <= 1 && params.completedSets >= 6) {
    return "clustered" as const;
  }

  return "balanced" as const;
}

function getWarningText(params: {
  groupLabel: string;
  loadStatus: MuscleBudgetEntry["loadStatus"];
  distributionStatus: MuscleBudgetEntry["distributionStatus"];
  qualityScore: number | null;
}) {
  if (params.loadStatus === "high_risk") {
    return `${params.groupLabel} ligger tydligt över planerad veckodos. Prioritera återhämtning eller lägre trötthet nästa pass.`;
  }

  if (params.loadStatus === "over") {
    return `${params.groupLabel} är redan över veckobudget. Behåll eller omfördela belastningen i nästa pass.`;
  }

  if (
    params.distributionStatus === "clustered" &&
    params.loadStatus !== "under"
  ) {
    return `${params.groupLabel} har fått mycket volym i få pass. Att sprida dosen kan ge bättre kvalitet.`;
  }

  if ((params.qualityScore ?? 1) < 0.75) {
    return `${params.groupLabel} fick många set, men flera verkar ha varit ganska lätta. Jaga kvalitet före fler set.`;
  }

  return null;
}

export function getConfidenceScore(params: {
  abortedCount: number;
  completedLast28Days: number;
  distinctTrainingWeeks: number;
}) {
  if (
    params.completedLast28Days >= 8 &&
    params.distinctTrainingWeeks >= 3 &&
    params.abortedCount <= 1
  ) {
    return "high" as const;
  }

  if (params.completedLast28Days >= 3) {
    return "medium" as const;
  }

  return "low" as const;
}

export function buildMuscleBudget(params: {
  confidenceScore: ConfidenceScore;
  experienceLevel?: string | null;
  goal?: PlanningGoal | null;
  logs: WorkoutLog[];
  now?: Date;
  priorityMuscles?: MuscleBudgetGroup[];
}) {
  const now = params.now ?? new Date();
  const completedLast7Days = filterLogsWithinDays(params.logs, now, 7);
  const completedLast28Days = filterLogsWithinDays(params.logs, now, 28);
  const recent14Days = filterLogsWithinDays(params.logs, now, 14);
  const previous14Days = completedLast28Days.filter((log) => {
    const completedAtMs = new Date(log.completedAt).getTime();
    const ageMs = now.getTime() - completedAtMs;
    return ageMs > 14 * 24 * 60 * 60 * 1000;
  });
  const currentWeekTotals = summarizeLogsByMuscle(completedLast7Days);
  const last28DayTotals = summarizeLogsByMuscle(completedLast28Days);
  const recent14DayTotals = summarizeLogsByMuscle(recent14Days);
  const previous14DayTotals = summarizeLogsByMuscle(previous14Days);
  const goalPriorities = getGoalPriorities(params.goal);
  const baseTargets = getBaseTargets(params.goal);
  const experienceAdjustment = getExperienceAdjustment(params.experienceLevel);
  const confidenceAdjustment =
    params.confidenceScore === "high" ? 1 : params.confidenceScore === "low" ? -1 : 0;
  const priorityBoosts = new Map<MuscleBudgetGroup, PriorityRank>();

  (params.priorityMuscles ?? [])
    .slice(0, 3)
    .forEach((group, index) => {
      priorityBoosts.set(group, index === 0 ? 1 : index === 1 ? 2 : 3);
    });

  const entries = (Object.keys(MUSCLE_LABELS) as MuscleBudgetGroup[]).map((group) => {
    const priorityRank = priorityBoosts.get(group);
    const priority =
      priorityRank === 1
        ? "high"
        : (priorityRank === 2 || priorityRank === 3) && goalPriorities[group] === "low"
          ? "medium"
          : goalPriorities[group];
    const baseTarget =
      priority === "high"
        ? baseTargets.high
        : priority === "medium"
          ? baseTargets.medium
          : baseTargets.low;
    const priorityTargetAdjustment =
      priorityRank === 1 ? 2 : priorityRank === 2 ? 1 : priorityRank === 3 ? 0.5 : 0;
    const targetSets = clamp(
      baseTarget + experienceAdjustment + confidenceAdjustment + priorityTargetAdjustment,
      2,
      18,
    );
    const minimumSets = Math.max(2, targetSets - 2);
    const completedSets = roundToHalf(currentWeekTotals.completed[group]);
    const directSets = roundToHalf(currentWeekTotals.direct[group]);
    const indirectSets = roundToHalf(
      Math.max(0, currentWeekTotals.completed[group] - currentWeekTotals.direct[group]),
    );
    const effectiveSets = roundToHalf(currentWeekTotals.effective[group]);
    const recent4WeekAvgSets = roundToHalf(last28DayTotals.completed[group] / 4);
    const recent4WeekAvgEffectiveSets = roundToHalf(last28DayTotals.effective[group] / 4);
    const remainingSets = roundToHalf(Math.max(0, targetSets - effectiveSets));
    const qualityScore =
      completedSets > 0
        ? Number(
            (currentWeekTotals.effective[group] / currentWeekTotals.completed[group]).toFixed(2),
          )
        : null;
    const frequencyCount = currentWeekTotals.exposureCount[group];
    const progressStatus = getProgressStatus({
      currentSignals: recent14DayTotals.performanceSignals[group],
      previousSignals: previous14DayTotals.performanceSignals[group],
      completedSets,
      targetSets,
      qualityScore,
    });
    const loadStatus = getLoadStatus({
      completedSets,
      effectiveSets,
      minimumSets,
      targetSets,
    });
    const distributionStatus = getDistributionStatus({
      completedSets,
      frequencyCount,
    });
    const warningText = getWarningText({
      groupLabel: MUSCLE_LABELS[group],
      loadStatus,
      distributionStatus,
      qualityScore,
    });

    return {
      group,
      label: MUSCLE_LABELS[group],
      priority,
      targetSets,
      minimumSets,
      completedSets,
      effectiveSets,
      directSets,
      indirectSets,
      recent4WeekAvgSets,
      recent4WeekAvgEffectiveSets,
      remainingSets,
      qualityScore,
      frequencyCount,
      lastTrainedAt: currentWeekTotals.lastTrainedAt[group] ?? null,
      progressStatus,
      loadStatus,
      distributionStatus,
      warningText,
    } satisfies MuscleBudgetEntry;
  });

  return {
    currentWeekTotals: currentWeekTotals.completed,
    entries,
  };
}

export function getFocusDeficitScore(
  entries: MuscleBudgetEntry[],
  focus: WorkoutFocus,
) {
  return roundToHalf(
    FOCUS_GROUPS[focus].reduce((sum, group) => {
      const entry = entries.find((item) => item.group === group);
      return sum + (entry?.remainingSets ?? 0);
    }, 0),
  );
}
