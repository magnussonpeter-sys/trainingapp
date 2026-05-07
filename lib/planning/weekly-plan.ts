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

export type WorkoutPlanCredit = {
  sessionCredit: number;
  minuteCredit: number;
  muscleSetCreditScale: number;
  effectiveSetCount: number;
  totalReps: number;
  weightedSetCount: number;
  durationCredit: number;
  volumeCredit: number;
  reason: string;
  countsAsMeaningful: boolean;
};

export type ProfilePriorityMuscleFields = {
  primary_priority_muscle?: MuscleBudgetGroup | null;
  secondary_priority_muscle?: MuscleBudgetGroup | null;
  tertiary_priority_muscle?: MuscleBudgetGroup | null;
};

export type WeeklyPlanState = {
  userId: string;
  weekStartDate: string;
  settings: WeeklyPlanSettings;
  goal?: string | null;
  plannedSessions: PlannedSession[];
  completedWorkoutLogIds: string[];
  spontaneousWorkoutLogIds: string[];
  missedSessions: PlannedSession[];
  profilePriorityMuscles: MuscleBudgetGroup[];
  remainingTrainingNeed: {
    sessionsRemaining: number;
    remainingSessionCredit: number;
    plannedMinutesRemaining: number;
    completedMinutesThisWeek: number;
    targetMinutesThisWeek: number;
    completedSessionCreditThisWeek: number;
    targetSessionCreditThisWeek: number;
    muscleSetDeficits: Record<MuscleBudgetGroup, number>;
    totalRelevantDeficit: number;
    recoveryLimitedMuscles: MuscleBudgetGroup[];
    suggestedNextFocus: PlannedSessionFocus;
    suggestedNextDurationMinutes: number;
    suggestedNextFocusReason: string;
  };
  debug?: WeeklyPlanDebug;
};

export type WeeklyPlanContext = {
  sessionsPerWeek: number;
  completedSessionsThisWeek: number;
  completedSessionCreditThisWeek: number;
  remainingSessionsThisWeek: number;
  remainingSessionCreditThisWeek: number;
  targetMinutesThisWeek: number;
  completedMinutesThisWeek: number;
  plannedMinutesRemaining: number;
  suggestedNextFocus: PlannedSessionFocus;
  suggestedNextDurationMinutes: number;
  priorityMuscles: MuscleBudgetGroup[];
  profilePriorityMuscles: MuscleBudgetGroup[];
  longTermPriorityMuscles: MuscleBudgetGroup[];
  recoveryLimitedMuscles: MuscleBudgetGroup[];
  easyMuscles: MuscleBudgetGroup[];
  muscleSetDeficits: Record<MuscleBudgetGroup, number>;
  isUserBehindPlan: boolean;
  hasSpontaneousWorkoutThisWeek: boolean;
  flexibility: WeeklyPlanFlexibility;
  preferredDays: Weekday[];
  preferredGymId?: string | null;
  remainingNeedDuration: number;
  typicalWorkoutDurationMinutes: number | null;
  coachText: string;
};

type FocusRecommendationScore = {
  focus: PlannedSessionFocus;
  score: number;
  remainingVolumeNeed: number;
  goalPriorityWeight: number;
  priorityMuscleWeight: number;
  timeSinceLastStimulus: number;
  plannedSessionReplacementNeed: number;
  recentFatiguePenalty: number;
  overloadRiskPenalty: number;
  practicalityBonus: number;
  remainingDaysUrgency: number;
  reason: string;
};

export type WeeklyPlanDebug = {
  workoutCredits: Array<{
    workoutLogId: string;
    workoutName: string;
    completedAt: string;
    inferredFocus: PlannedSessionFocus;
    sessionCredit: number;
    minuteCredit: number;
    effectiveSetCount: number;
    totalReps: number;
    weightedSetCount: number;
    reason: string;
    matchedSessionId: string | null;
    matchedSessionFocus: PlannedSessionFocus | null;
    matchScore: number | null;
    matchingReason: string;
  }>;
  focusScores: Array<FocusRecommendationScore & { selected: boolean }>;
  goalReachedReason: string;
  typicalWorkoutDurationMinutes: number | null;
  remainingNeedDuration: number;
  finalSuggestedDurationMinutes: number;
  lastPlannedWorkoutDate?: string | null;
  lastPlannedWorkoutStatus?: PlannedSessionStatus | null;
  missedSinceLastGeneratedWorkout?: boolean;
  missedTextReason?: string | null;
  plannedSlotsSinceLastWorkout?: number;
  spontaneousSinceLastPlannedWorkout?: number;
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
  goalReached: boolean;
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

function getSetEvidenceWeight(set: WorkoutLog["exercises"][number]["sets"][number]) {
  const hasRepEvidence = typeof set.actualReps === "number" && set.actualReps > 0;
  const hasDurationEvidence =
    typeof set.actualDuration === "number" && set.actualDuration > 0;
  const hasWeightEvidence =
    typeof set.actualWeight === "number" && Number.isFinite(set.actualWeight);
  const hasEffortEvidence = set.repsLeft !== null || set.timedEffort !== null;

  // Vi räknar bara effektiva set när det finns faktisk prestationssignal.
  // Tomma setobjekt ska inte kunna blåsa upp veckokrediten.
  if (hasRepEvidence || hasDurationEvidence) {
    return 1;
  }

  if (hasWeightEvidence && hasEffortEvidence) {
    return 0.8;
  }

  if (hasEffortEvidence) {
    return 0.6;
  }

  return typeof set.completedAt === "string" && set.completedAt.trim() ? 0.15 : 0;
}

function getWorkoutPerformanceEvidence(log: WorkoutLog) {
  let effectiveSetCount = 0;
  let weightedSetCount = 0;
  let totalReps = 0;

  for (const exercise of log.exercises) {
    for (const set of exercise.sets) {
      const evidenceWeight = getSetEvidenceWeight(set);
      weightedSetCount += evidenceWeight;

      if (evidenceWeight >= 0.5) {
        effectiveSetCount += 1;
      }

      if (typeof set.actualReps === "number" && set.actualReps > 0) {
        totalReps += set.actualReps;
      }
    }
  }

  return {
    effectiveSetCount,
    totalReps,
    weightedSetCount: roundToSingleDecimal(weightedSetCount),
  };
}

function getMedianValue(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }

  return sorted[middle];
}

function getTypicalWorkoutDurationMinutes(params: {
  workoutLogs: WorkoutLog[];
  now: Date;
  windowDays?: number;
}) {
  const windowDays = params.windowDays ?? 42;
  const cutoffTime = params.now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const durations = params.workoutLogs
    .filter((log) => new Date(log.completedAt).getTime() >= cutoffTime)
    .map((log) => ({
      log,
      credit: getWorkoutPlanCredit(log),
    }))
    .filter(({ credit }) => credit.countsAsMeaningful && credit.sessionCredit >= 0.25)
    .map(({ log }) => getWorkoutDurationMinutes(log))
    .filter((duration) => duration >= 8);

  return getMedianValue(durations);
}

function blendSuggestedDuration(params: {
  remainingNeedDuration: number;
  typicalWorkoutDurationMinutes: number | null;
  minDuration: number;
  maxDuration: number;
  remainingSessionCredit: number;
}) {
  if (!params.typicalWorkoutDurationMinutes) {
    return clampNumber(
      params.remainingNeedDuration,
      params.minDuration,
      params.maxDuration,
    );
  }

  const urgencyWeight = params.remainingSessionCredit >= 2 ? 0.45 : 0.3;
  const typicalWeight = 1 - urgencyWeight;
  const blendedDuration =
    params.remainingNeedDuration * urgencyWeight +
    params.typicalWorkoutDurationMinutes * typicalWeight;

  return clampNumber(
    Math.round(blendedDuration),
    params.minDuration,
    params.maxDuration,
  );
}

function getRecoveryLimitedMuscles(params: {
  workoutAnalyses: Array<{
    log: WorkoutLog;
    stimulus: Record<MuscleBudgetGroup, number>;
  }>;
  now: Date;
}) {
  const recentStimulus = createMuscleRecord();
  const cutoffTime = params.now.getTime() - 48 * 60 * 60 * 1000;

  for (const analysis of params.workoutAnalyses) {
    if (new Date(analysis.log.completedAt).getTime() < cutoffTime) {
      continue;
    }

    for (const group of Object.keys(recentStimulus) as MuscleBudgetGroup[]) {
      recentStimulus[group] += analysis.stimulus[group];
    }
  }

  return (Object.keys(recentStimulus) as MuscleBudgetGroup[])
    .filter((group) => recentStimulus[group] >= 2.5)
    .sort((left, right) => recentStimulus[right] - recentStimulus[left]);
}

export function getWorkoutPlanCredit(
  log: WorkoutLog,
  plannedDurationMinutes?: number | null,
): WorkoutPlanCredit {
  if (log.status !== "completed" || isWorkoutLogExcludedFromAnalysis(log)) {
    return {
      sessionCredit: 0,
      minuteCredit: 0,
      muscleSetCreditScale: 0,
      effectiveSetCount: 0,
      totalReps: 0,
      weightedSetCount: 0,
      durationCredit: 0,
      volumeCredit: 0,
      reason: "Passet är avbrutet eller exkluderat från analys.",
      countsAsMeaningful: false,
    };
  }

  const durationMinutes = getWorkoutDurationMinutes(log);
  const evidence = getWorkoutPerformanceEvidence(log);

  // Väldigt korta testpass ska inte kunna uppfylla veckan på egen hand.
  if (
    durationMinutes < 5 &&
    evidence.effectiveSetCount <= 1 &&
    evidence.weightedSetCount < 1.5
  ) {
    return {
      sessionCredit: 0,
      minuteCredit: 0,
      muscleSetCreditScale: 0,
      effectiveSetCount: evidence.effectiveSetCount,
      totalReps: evidence.totalReps,
      weightedSetCount: evidence.weightedSetCount,
      durationCredit: 0,
      volumeCredit: 0,
      reason: "Mycket kort testpass utan tydlig träningsvolym.",
      countsAsMeaningful: false,
    };
  }

  const durationCredit =
    durationMinutes >= 35
      ? 1
      : durationMinutes >= 25
        ? 0.9
        : durationMinutes >= 15
          ? 0.65
          : durationMinutes >= 8
            ? 0.35
            : durationMinutes >= 5
              ? 0.2
              : 0;
  const volumeCredit =
    evidence.weightedSetCount >= 10
      ? 1
      : evidence.weightedSetCount >= 6
        ? 0.85
        : evidence.weightedSetCount >= 4
          ? 0.65
          : evidence.weightedSetCount >= 2
            ? 0.4
            : evidence.weightedSetCount >= 1
              ? 0.15
              : 0;
  const plannedDurationRatio =
    plannedDurationMinutes && plannedDurationMinutes > 0
      ? clampNumber(durationMinutes / plannedDurationMinutes, 0, 1)
      : null;
  let sessionCredit =
    plannedDurationRatio !== null
      ? plannedDurationRatio * 0.35 + durationCredit * 0.25 + volumeCredit * 0.4
      : durationCredit * 0.45 + volumeCredit * 0.55;

  if (durationMinutes < 10 && evidence.effectiveSetCount < 3) {
    sessionCredit = Math.min(sessionCredit, 0.5);
  }

  sessionCredit = roundToSingleDecimal(clampNumber(sessionCredit, 0, 1));
  const countsAsMeaningful =
    sessionCredit >= 0.2 || durationMinutes >= 8 || evidence.effectiveSetCount >= 2;

  return {
    sessionCredit: countsAsMeaningful ? sessionCredit : 0,
    minuteCredit: countsAsMeaningful ? durationMinutes : 0,
    muscleSetCreditScale: countsAsMeaningful ? sessionCredit : 0,
    effectiveSetCount: evidence.effectiveSetCount,
    totalReps: evidence.totalReps,
    weightedSetCount: evidence.weightedSetCount,
    durationCredit: roundToSingleDecimal(durationCredit),
    volumeCredit: roundToSingleDecimal(volumeCredit),
    reason:
      countsAsMeaningful && sessionCredit < 0.7
        ? "Kortare eller lättare pass med verklig prestation som räknas delvis i veckoplanen."
        : countsAsMeaningful
          ? "Rimligt fullvärdigt träningspass för veckoplanen."
          : "För låg volym för att räknas meningsfullt i veckoplanen.",
    countsAsMeaningful,
  };
}

function buildMuscleStimulusFromExercises(
  exercises: WorkoutLog["exercises"],
  creditScale = 1,
) {
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
      totals[group] += setCount * credit * creditScale;
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

function getPlannedSessionVolumeScale(params: {
  session: PlannedSession;
  settings: WeeklyPlanSettings;
  goal?: string | null;
}) {
  const normalizedGoal = normalizeTrainingGoal(params.goal);
  const duration = params.session.targetDurationMinutes;
  const durationScale =
    duration <= 20 ? 0.6 : duration <= 30 ? 0.8 : duration <= 45 ? 1 : duration <= 60 ? 1.15 : 1.25;
  const frequencyScale =
    params.settings.sessionsPerWeek <= 2 ? 1.05 : params.settings.sessionsPerWeek >= 5 ? 0.9 : 1;
  const goalScale =
    normalizedGoal === "hypertrophy"
      ? 1.1
      : normalizedGoal === "strength"
        ? 0.95
        : normalizedGoal === "body_composition"
          ? 1
          : 0.85;

  // Detta är en praktisk planeringsuppskattning, inte en exakt fysiologisk sanning.
  return durationScale * frequencyScale * goalScale;
}

function buildPlannedTargetMuscleSets(
  plannedSessions: PlannedSession[],
  settings: WeeklyPlanSettings,
  goal?: string | null,
) {
  const targets = createMuscleRecord();

  for (const session of plannedSessions) {
    const focusGroups = FOCUS_MUSCLES[session.focus];
    const sessionScale = getPlannedSessionVolumeScale({
      session,
      settings,
      goal,
    });
    const baseCredit =
      session.focus === "full_body"
        ? 1.8
        : session.focus === "push" || session.focus === "pull"
          ? 2.4
          : session.focus === "core"
            ? 1.4
            : session.focus === "mobility"
              ? 0
              : 2.6;

    for (const group of focusGroups) {
      const groupScale =
        session.focus === "lower" && group === "calves"
          ? 0.65
          : session.focus === "upper" && group === "shoulders"
            ? 0.85
            : 1;
      targets[group] += roundToSingleDecimal(baseCredit * sessionScale * groupScale);
    }
  }

  return targets;
}

export function getPriorityMusclesFromProfile(
  profile: ProfilePriorityMuscleFields | null | undefined,
  settings?: Pick<WeeklyPlanSettings, "priorityMuscles"> | null,
) {
  const explicitProfilePriorities = [
    profile?.primary_priority_muscle ?? null,
    profile?.secondary_priority_muscle ?? null,
    profile?.tertiary_priority_muscle ?? null,
  ].filter((group): group is MuscleBudgetGroup => Boolean(group));

  // Legacyfält läses bara som passiv fallback för äldre data.
  return Array.from(
    new Set([
      ...explicitProfilePriorities,
      ...(settings?.priorityMuscles ?? []),
    ]),
  );
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
type WorkoutFocusAnalysis = {
  log: WorkoutLog;
  logDate: string;
  inferredFocus: PlannedSessionFocus;
  credit: WorkoutPlanCredit;
  stimulus: Record<MuscleBudgetGroup, number>;
  topStimulusGroups: MuscleBudgetGroup[];
};
type MatchedWorkoutDebugEntry = WeeklyPlanDebug["workoutCredits"][number];
type MatchEvaluation = {
  score: number;
  reason: string;
};

function getMatchWindowDays(flexibility: WeeklyPlanFlexibility) {
  if (flexibility === "strict") {
    return 0;
  }

  if (flexibility === "balanced") {
    return 1;
  }

  return 7;
}

function getTopStimulusGroups(stimulus: Record<MuscleBudgetGroup, number>) {
  return (Object.keys(stimulus) as MuscleBudgetGroup[])
    .filter((group) => stimulus[group] > 0.4)
    .sort((left, right) => stimulus[right] - stimulus[left])
    .slice(0, 4);
}

function getWorkoutFocusAnalysis(log: WorkoutLog): WorkoutFocusAnalysis {
  const credit = getWorkoutPlanCredit(log);
  const stimulus = buildMuscleStimulusFromExercises(log.exercises, credit.muscleSetCreditScale);

  return {
    log,
    logDate: normalizeIsoDate(log.completedAt),
    inferredFocus: inferWorkoutFocus(log),
    credit,
    stimulus,
    topStimulusGroups: getTopStimulusGroups(stimulus),
  };
}

function getFocusOverlapScore(
  plannedFocus: PlannedSessionFocus,
  inferredFocus: PlannedSessionFocus,
) {
  if (plannedFocus === inferredFocus) {
    return 3.25;
  }

  const plannedMappedFocus = mapPlannedFocusToWorkoutFocus(plannedFocus);
  const inferredMappedFocus = mapPlannedFocusToWorkoutFocus(inferredFocus);

  if (plannedMappedFocus === inferredMappedFocus) {
    return 2.25;
  }

  if (plannedFocus === "full_body" || inferredFocus === "full_body") {
    return 1.2;
  }

  return 0;
}

function evaluateWorkoutSessionMatch(params: {
  log: WorkoutFocusAnalysis;
  session: PlannedSession;
  flexibility: WeeklyPlanFlexibility;
}) {
  const dateDistance = Math.abs(dateDiffInDays(params.log.logDate, params.session.plannedDate));
  const dateProximityScore = Math.max(0, 4 - dateDistance * 1.1);
  const focusOverlapScore = getFocusOverlapScore(
    params.session.focus,
    params.log.inferredFocus,
  );
  const sessionGroups = new Set(FOCUS_MUSCLES[params.session.focus]);
  const overlappingGroups = params.log.topStimulusGroups.filter((group) => sessionGroups.has(group));
  const muscleOverlapScore =
    overlappingGroups.length * 0.85 +
    overlappingGroups.reduce((sum, group) => sum + Math.min(1.2, params.log.stimulus[group] * 0.3), 0);
  const mismatchPenalty =
    focusOverlapScore === 0 &&
    overlappingGroups.length === 0 &&
    params.session.focus !== "mobility"
      ? 2.25
      : 0;
  const extraDistancePenalty =
    dateDistance > getMatchWindowDays(params.flexibility)
      ? (dateDistance - getMatchWindowDays(params.flexibility)) * 1.25
      : 0;

  return {
    score:
      dateProximityScore +
      focusOverlapScore +
      muscleOverlapScore -
      mismatchPenalty -
      extraDistancePenalty,
    reason: `datum ${roundToSingleDecimal(dateProximityScore)}, fokus ${roundToSingleDecimal(
      focusOverlapScore,
    )}, muskelöverlapp ${roundToSingleDecimal(muscleOverlapScore)}, avdrag ${roundToSingleDecimal(
      mismatchPenalty + extraDistancePenalty,
    )}`,
  } satisfies MatchEvaluation;
}

function matchLogsToPlannedSessions(
  plannedSessions: PlannedSession[],
  logs: WorkoutLog[],
  flexibility: WeeklyPlanFlexibility,
) {
  const analyzedLogs = logs
    .sort(
      (left, right) =>
        new Date(left.completedAt).getTime() - new Date(right.completedAt).getTime(),
    )
    .map((log) => getWorkoutFocusAnalysis(log));
  const sessions = plannedSessions
    .map((session) => ({ ...session }) satisfies InternalMatchedSession)
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate));
  const usedSessionIds = new Set<string>();
  const spontaneousWorkoutLogIds: string[] = [];
  const completedWorkoutLogIds: string[] = [];
  const replacedByWorkoutLogIds = new Set<string>();
  const debugEntries: MatchedWorkoutDebugEntry[] = [];
  const explicitSessionByLogId = new Map<string, InternalMatchedSession>();

  for (const session of sessions) {
    if (session.completedWorkoutLogId) {
      explicitSessionByLogId.set(session.completedWorkoutLogId, session);
    }
    if (session.replacedByWorkoutLogId) {
      explicitSessionByLogId.set(session.replacedByWorkoutLogId, session);
    }
  }

  for (const analysis of analyzedLogs) {
    if (!analysis.credit.countsAsMeaningful) {
      debugEntries.push({
        workoutLogId: analysis.log.id,
        workoutName: analysis.log.workoutName,
        completedAt: analysis.log.completedAt,
        inferredFocus: analysis.inferredFocus,
        sessionCredit: analysis.credit.sessionCredit,
        minuteCredit: analysis.credit.minuteCredit,
        effectiveSetCount: analysis.credit.effectiveSetCount,
        totalReps: analysis.credit.totalReps,
        weightedSetCount: analysis.credit.weightedSetCount,
        reason: analysis.credit.reason,
        matchedSessionId: null,
        matchedSessionFocus: null,
        matchScore: null,
        matchingReason: "Passet gav för låg kredit för att styra veckoplanen.",
      });
      continue;
    }

    const explicitSession = explicitSessionByLogId.get(analysis.log.id);
    if (explicitSession) {
      usedSessionIds.add(explicitSession.id);

      if (explicitSession.completedWorkoutLogId === analysis.log.id) {
        completedWorkoutLogIds.push(analysis.log.id);
      } else {
        spontaneousWorkoutLogIds.push(analysis.log.id);
      }

      debugEntries.push({
        workoutLogId: analysis.log.id,
        workoutName: analysis.log.workoutName,
        completedAt: analysis.log.completedAt,
        inferredFocus: analysis.inferredFocus,
        sessionCredit: analysis.credit.sessionCredit,
        minuteCredit: analysis.credit.minuteCredit,
        effectiveSetCount: analysis.credit.effectiveSetCount,
        totalReps: analysis.credit.totalReps,
        weightedSetCount: analysis.credit.weightedSetCount,
        reason: analysis.credit.reason,
        matchedSessionId: explicitSession.id,
        matchedSessionFocus: explicitSession.focus,
        matchScore: 999,
        matchingReason: "Använde sparad koppling mellan workoutLog och planerat pass.",
      });
      continue;
    }

    const unmatchedCandidates = sessions.filter((session) => {
      if (usedSessionIds.has(session.id)) {
        return false;
      }

      const dayDifference = Math.abs(dateDiffInDays(analysis.logDate, session.plannedDate));
      if (dayDifference > Math.max(getMatchWindowDays(flexibility), flexibility === "flexible" ? 4 : 2)) {
        return false;
      }

      return true;
    });

    const bestMatch =
      unmatchedCandidates
        .map((session) => ({
          session,
          evaluation: evaluateWorkoutSessionMatch({
            log: analysis,
            session,
            flexibility,
          }),
        }))
        .sort((left, right) => right.evaluation.score - left.evaluation.score)[0] ?? null;

    if (bestMatch && bestMatch.evaluation.score >= 2.25) {
      usedSessionIds.add(bestMatch.session.id);
      bestMatch.session.status = "completed";
      bestMatch.session.completedWorkoutLogId = analysis.log.id;
      completedWorkoutLogIds.push(analysis.log.id);
      debugEntries.push({
        workoutLogId: analysis.log.id,
        workoutName: analysis.log.workoutName,
        completedAt: analysis.log.completedAt,
        inferredFocus: analysis.inferredFocus,
        sessionCredit: analysis.credit.sessionCredit,
        minuteCredit: analysis.credit.minuteCredit,
        effectiveSetCount: analysis.credit.effectiveSetCount,
        totalReps: analysis.credit.totalReps,
        weightedSetCount: analysis.credit.weightedSetCount,
        reason: analysis.credit.reason,
        matchedSessionId: bestMatch.session.id,
        matchedSessionFocus: bestMatch.session.focus,
        matchScore: roundToSingleDecimal(bestMatch.evaluation.score),
        matchingReason: bestMatch.evaluation.reason,
      });
      continue;
    }

    spontaneousWorkoutLogIds.push(analysis.log.id);
    debugEntries.push({
      workoutLogId: analysis.log.id,
      workoutName: analysis.log.workoutName,
      completedAt: analysis.log.completedAt,
      inferredFocus: analysis.inferredFocus,
      sessionCredit: analysis.credit.sessionCredit,
      minuteCredit: analysis.credit.minuteCredit,
      effectiveSetCount: analysis.credit.effectiveSetCount,
      totalReps: analysis.credit.totalReps,
      weightedSetCount: analysis.credit.weightedSetCount,
      reason: analysis.credit.reason,
      matchedSessionId: null,
      matchedSessionFocus: null,
      matchScore: bestMatch ? roundToSingleDecimal(bestMatch.evaluation.score) : null,
      matchingReason: bestMatch
        ? `Ingen tillräckligt stark matchning. Bästa kandidat gav ${roundToSingleDecimal(
            bestMatch.evaluation.score,
          )} poäng.`
        : "Inget rimligt planerat pass att matcha mot.",
    });
  }

  const spontaneousLogs = analyzedLogs.filter((analysis) =>
    spontaneousWorkoutLogIds.includes(analysis.log.id),
  );

  for (const analysis of spontaneousLogs) {
    const candidate =
      sessions
      .filter((session) => !usedSessionIds.has(session.id) && !replacedByWorkoutLogIds.has(session.id))
      .filter((session) => dateDiffInDays(session.plannedDate, analysis.logDate) >= 0)
      .map((session) => ({
        session,
        evaluation: evaluateWorkoutSessionMatch({
          log: analysis,
          session,
          flexibility,
        }),
      }))
      .sort((left, right) => right.evaluation.score - left.evaluation.score)[0] ?? null;

    if (!candidate || flexibility === "strict" || candidate.evaluation.score < 3) {
      continue;
    }

    candidate.session.status = "replaced_by_spontaneous";
    candidate.session.replacedByWorkoutLogId = analysis.log.id;
    replacedByWorkoutLogIds.add(candidate.session.id);

    const debugEntry = debugEntries.find((entry) => entry.workoutLogId === analysis.log.id);
    if (debugEntry) {
      debugEntry.matchedSessionId = candidate.session.id;
      debugEntry.matchedSessionFocus = candidate.session.focus;
      debugEntry.matchScore = roundToSingleDecimal(candidate.evaluation.score);
      debugEntry.matchingReason = `Spontant pass som ersatte framtida planerat pass. ${candidate.evaluation.reason}`;
    }
  }

  return {
    sessions,
    completedWorkoutLogIds,
    spontaneousWorkoutLogIds,
    workoutAnalyses: analyzedLogs,
    debugEntries,
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

function getCompletedStimulusThisWeek(workoutAnalyses: WorkoutFocusAnalysis[]) {
  return workoutAnalyses.reduce<Record<MuscleBudgetGroup, number>>((totals, analysis) => {
      const logStimulus = analysis.stimulus;
      for (const group of Object.keys(totals) as MuscleBudgetGroup[]) {
        totals[group] += logStimulus[group];
      }
      return totals;
    }, createMuscleRecord());
}

function buildMuscleSetDeficits(
  settings: WeeklyPlanSettings,
  plannedSessions: PlannedSession[],
  completedWorkoutAnalyses: WorkoutFocusAnalysis[],
  goal?: string | null,
) {
  const targets = buildPlannedTargetMuscleSets(plannedSessions, settings, goal);
  const completed = getCompletedStimulusThisWeek(completedWorkoutAnalyses);
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

function getRemainingDaysInWeek(now: Date) {
  const weekdayIndex = (now.getDay() + 6) % 7;
  return Math.max(1, 7 - weekdayIndex);
}

function getHoursSince(timestamp: string, now: Date) {
  const then = new Date(timestamp).getTime();
  const current = now.getTime();

  if (!Number.isFinite(then) || !Number.isFinite(current)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (current - then) / (60 * 60 * 1000));
}

function getFocusDeficitScore(
  focus: PlannedSessionFocus,
  deficits: Record<MuscleBudgetGroup, number>,
) {
  return FOCUS_MUSCLES[focus].reduce((sum, group) => sum + deficits[group], 0);
}

function getFocusReplacementNeed(
  focus: PlannedSessionFocus,
  sessions: PlannedSession[],
) {
  return sessions.reduce((sum, session) => {
    if (
      session.status !== "planned" &&
      session.status !== "moved" &&
      session.status !== "missed"
    ) {
      return sum;
    }

    if (session.focus === focus) {
      return sum + (session.status === "missed" ? 1.1 : 0.75);
    }

    const sameMappedFocus =
      mapPlannedFocusToWorkoutFocus(session.focus) ===
      mapPlannedFocusToWorkoutFocus(focus);

    return sameMappedFocus ? sum + 0.35 : sum;
  }, 0);
}

function getFocusGoalBias(
  focus: PlannedSessionFocus,
  goal: string | null | undefined,
) {
  const normalizedGoal = normalizeTrainingGoal(goal);

  if (normalizedGoal === "strength") {
    if (focus === "full_body") return 0.9;
    if (focus === "upper" || focus === "lower") return 0.6;
    return -0.2;
  }

  if (normalizedGoal === "hypertrophy" || normalizedGoal === "body_composition") {
    if (focus === "upper" || focus === "lower" || focus === "push" || focus === "pull") {
      return 0.45;
    }

    if (focus === "full_body") {
      return 0.1;
    }

    if (focus === "core") {
      return -0.75;
    }
  }

  if (normalizedGoal === "health") {
    if (focus === "full_body") return 0.8;
    if (focus === "core") return 0.15;
  }

  return 0;
}

function getFocusPriorityMuscleWeight(params: {
  focus: PlannedSessionFocus;
  deficits: Record<MuscleBudgetGroup, number>;
  profilePriorityMuscles: MuscleBudgetGroup[];
}) {
  if (params.profilePriorityMuscles.length === 0) {
    return 0;
  }

  const focusGroups = new Set(FOCUS_MUSCLES[params.focus]);
  return params.profilePriorityMuscles.reduce((sum, group) => {
    if (!focusGroups.has(group)) {
      return sum;
    }

    return sum + Math.max(0.4, params.deficits[group] * 0.55);
  }, 0);
}

function getFocusTimeSinceLastStimulusBonus(params: {
  focus: PlannedSessionFocus;
  workoutAnalyses: WorkoutFocusAnalysis[];
  now: Date;
}) {
  const focusGroups = new Set(FOCUS_MUSCLES[params.focus]);
  const lastRelevantHours = params.workoutAnalyses
    .filter((analysis) => analysis.topStimulusGroups.some((group) => focusGroups.has(group)))
    .map((analysis) => getHoursSince(analysis.log.completedAt, params.now))
    .sort((left, right) => left - right)[0];

  if (!Number.isFinite(lastRelevantHours)) {
    return 1.8;
  }

  if (lastRelevantHours >= 96) return 1.6;
  if (lastRelevantHours >= 72) return 1.2;
  if (lastRelevantHours >= 48) return 0.8;
  if (lastRelevantHours >= 30) return 0.35;
  return 0;
}

function getFocusPracticalityBonus(params: {
  focus: PlannedSessionFocus;
  deficits: Record<MuscleBudgetGroup, number>;
  remainingSessionCredit: number;
  remainingDaysInWeek: number;
  averageRemainingMinutes: number;
  goal: string | null | undefined;
}) {
  const { focus, deficits, remainingSessionCredit, remainingDaysInWeek, averageRemainingMinutes, goal } =
    params;
  const normalizedGoal = normalizeTrainingGoal(goal);
  const upperScore =
    deficits.chest + deficits.back + deficits.shoulders + deficits.biceps + deficits.triceps;
  const lowerScore =
    deficits.quads + deficits.hamstrings + deficits.glutes + deficits.calves;
  const majorLowerScore = deficits.quads + deficits.hamstrings + deficits.glutes;
  let bonus = 0;

  // När veckan börjar ta slut är ett rimligt helkropps- eller brett fokus ofta bättre än att jaga en gammal dagslabel.
  if (remainingSessionCredit <= 1.1 && remainingDaysInWeek <= 2 && upperScore > 0 && lowerScore > 0) {
    bonus += focus === "full_body" ? 2.4 : 0;
  }

  if (averageRemainingMinutes <= 25 && focus === "full_body") {
    bonus -= 1.2;
  }

  if (focus === "core" && deficits.core <= 1) {
    bonus -= 2.5;
  }

  // Vader ska kunna smyga med som tillbehör, men ska sällan driva ett helt benpass själva.
  if (focus === "lower" && majorLowerScore < 1.25 && deficits.calves > 0) {
    bonus -= 2;
  }

  if (normalizedGoal === "health" && focus === "full_body") {
    bonus += 0.4;
  }

  return bonus;
}

function getFocusRecentPenalty(params: {
  focus: PlannedSessionFocus;
  workoutAnalyses: WorkoutFocusAnalysis[];
  now: Date;
}) {
  const recentLogs = [...params.workoutAnalyses]
    .sort(
      (left, right) =>
        new Date(right.log.completedAt).getTime() - new Date(left.log.completedAt).getTime(),
    )
    .slice(0, 2);
  let penalty = 0;
  const focusGroups = new Set(FOCUS_MUSCLES[params.focus]);

  for (const analysis of recentLogs) {
    const inferredFocus = analysis.inferredFocus;
    const hoursSince = getHoursSince(analysis.log.completedAt, params.now);
    const sameMappedFocus =
      mapPlannedFocusToWorkoutFocus(params.focus) ===
      mapPlannedFocusToWorkoutFocus(inferredFocus);
    const overlapCount = analysis.topStimulusGroups.filter((group) => focusGroups.has(group)).length;

    if (sameMappedFocus) {
      if (hoursSince <= 30) {
        penalty += 4;
      } else if (hoursSince <= 48) {
        penalty += 2.5;
      } else if (hoursSince <= 72) {
        penalty += 1.2;
      }
    } else if (overlapCount >= 2) {
      if (hoursSince <= 30) {
        penalty += 1.5;
      } else if (hoursSince <= 48) {
        penalty += 0.8;
      }
    }

    if (params.focus === "core" && inferredFocus === "core" && hoursSince <= 72) {
      penalty += 2;
    }
  }

  return penalty;
}

function getFocusOverloadPenalty(params: {
  focus: PlannedSessionFocus;
  workoutAnalyses: WorkoutFocusAnalysis[];
  now: Date;
}) {
  const focusGroups = new Set(FOCUS_MUSCLES[params.focus]);
  let recentStimulus = 0;

  for (const analysis of params.workoutAnalyses) {
    const hoursSince = getHoursSince(analysis.log.completedAt, params.now);
    if (hoursSince > 48) {
      continue;
    }

    for (const group of analysis.topStimulusGroups) {
      if (focusGroups.has(group)) {
        recentStimulus += analysis.stimulus[group];
      }
    }
  }

  if (params.focus === "core" && recentStimulus > 2.4) {
    return 2.2;
  }

  if (recentStimulus > 6) {
    return 1.8;
  }

  if (recentStimulus > 3.5) {
    return 1;
  }

  return 0;
}

function getFocusRemainingDaysUrgency(params: {
  focus: PlannedSessionFocus;
  deficits: Record<MuscleBudgetGroup, number>;
  remainingDaysInWeek: number;
  remainingSessionCredit: number;
}) {
  const focusDeficit = getFocusDeficitScore(params.focus, params.deficits);

  if (focusDeficit <= 0) {
    return 0;
  }

  if (params.remainingDaysInWeek <= Math.max(1, Math.ceil(params.remainingSessionCredit))) {
    return Math.min(1.8, focusDeficit * 0.22);
  }

  return Math.min(0.9, focusDeficit * 0.1);
}

function buildFocusRecommendationScores(params: {
  sessions: PlannedSession[];
  workoutAnalyses: WorkoutFocusAnalysis[];
  deficits: Record<MuscleBudgetGroup, number>;
  settings: WeeklyPlanSettings;
  now: Date;
  goal?: string | null;
  profilePriorityMuscles: MuscleBudgetGroup[];
  remainingSessionCredit: number;
  completedMinutesThisWeek: number;
  targetMinutesThisWeek: number;
}) {
  const remainingSessions = Math.max(1, Math.ceil(params.remainingSessionCredit));
  const remainingMinutes = Math.max(0, params.targetMinutesThisWeek - params.completedMinutesThisWeek);
  const averageRemainingMinutes =
    remainingSessions > 0
      ? Math.round(remainingMinutes / remainingSessions)
      : params.settings.defaultDurationMinutes;
  const remainingDaysInWeek = getRemainingDaysInWeek(params.now);
  const candidates: PlannedSessionFocus[] = ["upper", "lower", "full_body", "push", "pull", "core"];

  return candidates.map((focus) => {
    const remainingVolumeNeed = getFocusDeficitScore(focus, params.deficits);
    const goalPriorityWeight = getFocusGoalBias(focus, params.goal);
    const priorityMuscleWeight = getFocusPriorityMuscleWeight({
      focus,
      deficits: params.deficits,
      profilePriorityMuscles: params.profilePriorityMuscles,
    });
    const timeSinceLastStimulus = getFocusTimeSinceLastStimulusBonus({
      focus,
      workoutAnalyses: params.workoutAnalyses,
      now: params.now,
    });
    const plannedSessionReplacementNeed = getFocusReplacementNeed(focus, params.sessions);
    const practicalityBonus = getFocusPracticalityBonus({
      focus,
      deficits: params.deficits,
      remainingSessionCredit: params.remainingSessionCredit,
      remainingDaysInWeek,
      averageRemainingMinutes,
      goal: params.goal,
    });
    const recentFatiguePenalty = getFocusRecentPenalty({
      focus,
      workoutAnalyses: params.workoutAnalyses,
      now: params.now,
    });
    const overloadRiskPenalty = getFocusOverloadPenalty({
      focus,
      workoutAnalyses: params.workoutAnalyses,
      now: params.now,
    });
    const remainingDaysUrgency = getFocusRemainingDaysUrgency({
      focus,
      deficits: params.deficits,
      remainingDaysInWeek,
      remainingSessionCredit: params.remainingSessionCredit,
    });

    return {
      focus,
      score:
        remainingVolumeNeed +
        goalPriorityWeight +
        priorityMuscleWeight +
        timeSinceLastStimulus +
        plannedSessionReplacementNeed +
        remainingDaysUrgency -
        recentFatiguePenalty -
        overloadRiskPenalty +
        practicalityBonus,
      remainingVolumeNeed,
      goalPriorityWeight,
      priorityMuscleWeight,
      timeSinceLastStimulus,
      plannedSessionReplacementNeed,
      recentFatiguePenalty,
      overloadRiskPenalty,
      practicalityBonus,
      remainingDaysUrgency,
      reason: [
        `volym ${roundToSingleDecimal(remainingVolumeNeed)}`,
        `mål ${roundToSingleDecimal(goalPriorityWeight)}`,
        `prioritet ${roundToSingleDecimal(priorityMuscleWeight)}`,
        `tid sedan stimuli ${roundToSingleDecimal(timeSinceLastStimulus)}`,
        `ersättningsbehov ${roundToSingleDecimal(plannedSessionReplacementNeed)}`,
        `dag-urgens ${roundToSingleDecimal(remainingDaysUrgency)}`,
        `trötthet -${roundToSingleDecimal(recentFatiguePenalty)}`,
        `risk -${roundToSingleDecimal(overloadRiskPenalty)}`,
        `praktik ${roundToSingleDecimal(practicalityBonus)}`,
      ].join(" · "),
    } satisfies FocusRecommendationScore;
  });
}

function selectSuggestedNextFocus(params: {
  sessions: PlannedSession[];
  workoutAnalyses: WorkoutFocusAnalysis[];
  deficits: Record<MuscleBudgetGroup, number>;
  settings: WeeklyPlanSettings;
  now: Date;
  goal?: string | null;
  profilePriorityMuscles: MuscleBudgetGroup[];
  remainingSessionCredit: number;
  completedMinutesThisWeek: number;
  targetMinutesThisWeek: number;
}) {
  const scores = buildFocusRecommendationScores(params);

  return [...scores].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.remainingVolumeNeed !== left.remainingVolumeNeed) {
      return right.remainingVolumeNeed - left.remainingVolumeNeed;
    }

    return right.plannedSessionReplacementNeed - left.plannedSessionReplacementNeed;
  })[0] ?? {
    focus: focusFromLargestDeficits(params.deficits),
    score: 0,
    remainingVolumeNeed: 0,
    goalPriorityWeight: 0,
    priorityMuscleWeight: 0,
    timeSinceLastStimulus: 0,
    plannedSessionReplacementNeed: 0,
    recentFatiguePenalty: 0,
    overloadRiskPenalty: 0,
    practicalityBonus: 0,
    remainingDaysUrgency: 0,
    reason: "Fallback till största kvarvarande underskott.",
  };
}

export function suggestNextWorkoutFromWeeklyPlan(planState: WeeklyPlanState): SuggestedWeeklyWorkout {
  const deficits = planState.remainingTrainingNeed.muscleSetDeficits;
  const sortedDeficitMuscles = (Object.keys(deficits) as MuscleBudgetGroup[])
    .filter((group) => deficits[group] > 0)
    .sort((left, right) => deficits[right] - deficits[left]);
  const priorityDeficitMuscles = planState.profilePriorityMuscles
    .filter((group) => deficits[group] > 0)
    .sort((left, right) => deficits[right] - deficits[left]);
  const targetMuscles = sortedDeficitMuscles.slice(0, 3);
  const suggestedNextFocus =
    planState.remainingTrainingNeed.suggestedNextFocus ?? focusFromLargestDeficits(deficits);

  return {
    focus: suggestedNextFocus,
    durationMinutes: planState.remainingTrainingNeed.suggestedNextDurationMinutes,
    priorityMuscles: Array.from(new Set([...priorityDeficitMuscles, ...targetMuscles])).slice(0, 3),
    easyMuscles: [],
    isUserBehindPlan:
      planState.remainingTrainingNeed.remainingSessionCredit > 0.5 &&
      planState.remainingTrainingNeed.completedMinutesThisWeek <
        planState.remainingTrainingNeed.targetMinutesThisWeek * 0.75,
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

function getAllowedDeficitThreshold(planState: WeeklyPlanState) {
  const flexibilityBonus =
    planState.settings.flexibility === "flexible"
      ? 1.2
      : planState.settings.flexibility === "balanced"
        ? 0.6
        : 0;

  return Math.max(2.5, planState.settings.sessionsPerWeek * 1.5 + flexibilityBonus);
}

export function buildWeeklyPlanStatus(planState: WeeklyPlanState): WeeklyPlanStatus {
  const completedSessions =
    planState.completedWorkoutLogIds.length + planState.spontaneousWorkoutLogIds.length;
  const targetMinutes = planState.remainingTrainingNeed.targetMinutesThisWeek;
  const completedMinutes = planState.remainingTrainingNeed.completedMinutesThisWeek;
  const minuteCompletionRatio = targetMinutes > 0 ? completedMinutes / targetMinutes : 0;
  const remainingMinutes = planState.remainingTrainingNeed.plannedMinutesRemaining;
  const remainingSessions = planState.remainingTrainingNeed.sessionsRemaining;
  const hasEnoughSessionCredit =
    planState.remainingTrainingNeed.completedSessionCreditThisWeek >=
    planState.remainingTrainingNeed.targetSessionCreditThisWeek * 0.85;
  const hasEnoughMinutes = completedMinutes >= targetMinutes * 0.75;
  const hasAcceptableMuscleDeficit =
    planState.remainingTrainingNeed.totalRelevantDeficit <= getAllowedDeficitThreshold(planState);
  const goalReached =
    hasEnoughSessionCredit && (hasEnoughMinutes || hasAcceptableMuscleDeficit);
  const shortSessionPattern =
    completedSessions > 0 &&
    planState.remainingTrainingNeed.completedSessionCreditThisWeek <
      Math.max(0.75, completedSessions * 0.7) &&
    completedMinutes < targetMinutes * 0.7;
  const missedSessionsCount = planState.missedSessions.length;
  const spontaneousSessionsCount = planState.spontaneousWorkoutLogIds.length;
  const completedPlannedSessions = planState.plannedSessions
    .filter((session) => session.status === "completed" || session.status === "replaced_by_spontaneous")
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate));
  const lastCompletedPlannedSession =
    completedPlannedSessions[completedPlannedSessions.length - 1] ?? null;
  const missedAfterLastCompleted = planState.missedSessions
    .filter((session) =>
      lastCompletedPlannedSession
        ? session.plannedDate > lastCompletedPlannedSession.plannedDate
        : true,
    )
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate));
  const latestPastPlannedSession = [...planState.plannedSessions]
    .filter((session) => session.status !== "planned")
    .sort((left, right) => right.plannedDate.localeCompare(left.plannedDate))[0] ?? null;
  const plannedSlotsSinceLastWorkout = planState.plannedSessions.filter((session) =>
    lastCompletedPlannedSession
      ? session.plannedDate > lastCompletedPlannedSession.plannedDate
      : true,
  ).length;
  const spontaneousSinceLastPlannedWorkout = planState.spontaneousWorkoutLogIds.length;
  const missedSinceLastGeneratedWorkout = missedAfterLastCompleted.length > 0;
  const missedTextReason = missedSinceLastGeneratedWorkout
    ? `Missat planerat pass ${missedAfterLastCompleted[0]?.plannedDate ?? ""} efter senaste genomförda planerade pass.`
    : null;
  const normalizedGoal = normalizeTrainingGoal(planState.goal);
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
  } else if (missedSessionsCount >= 1 && spontaneousSessionsCount > 0) {
    message =
      `Du missade minst ett planerat pass men fick ändå in ett spontant pass. Vi kompenserar inte med något onödigt hårt, utan fyller de viktigaste luckorna med ett realistiskt ${formatPlannedSessionFocus(
        planState.remainingTrainingNeed.suggestedNextFocus,
      ).toLowerCase()}pass.`;
  } else if (missedSinceLastGeneratedWorkout) {
    message =
      `Du missade förra passet, men vi jagar inte igen allt på en gång. Nästa ${formatPlannedSessionFocus(
        planState.remainingTrainingNeed.suggestedNextFocus,
      ).toLowerCase()}pass ska fylla de viktigaste luckorna på ett rimligt sätt.`;
  } else if (missedSessionsCount >= 1) {
    message =
      "Det finns ett tidigare planerat pass som inte blev av under veckan, men vi låter nästa rekommendation styras av det viktigaste behovet just nu.";
  } else if (
    normalizedGoal === "hypertrophy" &&
    completedSessions > 0 &&
    minuteCompletionRatio < 0.45
  ) {
    message =
      `Du har fått in träning, men just nu ligger den faktiska träningsdosen klart under vad som normalt krävs för tydlig muskeltillväxt. Vi håller nästa pass genomförbart och prioriterar ${formatPlannedSessionFocus(
        planState.remainingTrainingNeed.suggestedNextFocus,
      ).toLowerCase()} med basövningar så att varje minut ger mer effekt.`;
  } else if (shortSessionPattern) {
    message =
      `Du har tränat ${completedSessions} gånger den här veckan, men passen blev kortare än planerat. För målet behöver vi prioritera basövningarna i ett ${formatPlannedSessionFocus(
        planState.remainingTrainingNeed.suggestedNextFocus,
      ).toLowerCase()}pass nu snarare än att bara lägga till mer slumpvolym.`;
  } else if (spontaneousSessionsCount > 0) {
    message =
      `Du fick in ett spontant pass, därför räknar vi om veckan och håller nästa pass mer träffsäkert i stället för att upprepa samma belastning.`;
  } else if (remainingSessions > 0) {
    message =
      `För att hålla veckan rimlig återstår ungefär ${remainingSessions} pass på cirka ${planState.remainingTrainingNeed.suggestedNextDurationMinutes} minuter.`;
  }

  if (planState.debug) {
    planState.debug.lastPlannedWorkoutDate = latestPastPlannedSession?.plannedDate ?? null;
    planState.debug.lastPlannedWorkoutStatus = latestPastPlannedSession?.status ?? null;
    planState.debug.missedSinceLastGeneratedWorkout = missedSinceLastGeneratedWorkout;
    planState.debug.missedTextReason = missedTextReason;
    planState.debug.plannedSlotsSinceLastWorkout = plannedSlotsSinceLastWorkout;
    planState.debug.spontaneousSinceLastPlannedWorkout = spontaneousSinceLastPlannedWorkout;
  }

  return {
    plannedSessions: planState.settings.sessionsPerWeek,
    completedSessions,
    remainingSessions,
    completedMinutes,
    targetMinutes,
    remainingMinutes,
    goalReached,
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
    completedSessionCreditThisWeek:
      planState.remainingTrainingNeed.completedSessionCreditThisWeek,
    remainingSessionsThisWeek: planState.remainingTrainingNeed.sessionsRemaining,
    remainingSessionCreditThisWeek:
      planState.remainingTrainingNeed.remainingSessionCredit,
    targetMinutesThisWeek: planState.remainingTrainingNeed.targetMinutesThisWeek,
    completedMinutesThisWeek: planState.remainingTrainingNeed.completedMinutesThisWeek,
    plannedMinutesRemaining: planState.remainingTrainingNeed.plannedMinutesRemaining,
    suggestedNextFocus: suggestion.focus,
    suggestedNextDurationMinutes: suggestion.durationMinutes,
    priorityMuscles: suggestion.priorityMuscles,
    profilePriorityMuscles: planState.profilePriorityMuscles,
    longTermPriorityMuscles: planState.profilePriorityMuscles,
    recoveryLimitedMuscles: planState.remainingTrainingNeed.recoveryLimitedMuscles,
    easyMuscles: suggestion.easyMuscles,
    muscleSetDeficits: planState.remainingTrainingNeed.muscleSetDeficits,
    isUserBehindPlan: suggestion.isUserBehindPlan,
    hasSpontaneousWorkoutThisWeek: suggestion.hasSpontaneousWorkoutThisWeek,
    flexibility: planState.settings.flexibility,
    preferredDays: planState.settings.preferredDays,
    preferredGymId: planState.settings.preferredGymId ?? null,
    remainingNeedDuration:
      planState.debug?.remainingNeedDuration ?? planState.settings.defaultDurationMinutes,
    typicalWorkoutDurationMinutes: planState.debug?.typicalWorkoutDurationMinutes ?? null,
    coachText: status.message,
  };
}

export function deriveWeeklyPlanState(params: {
  settings: WeeklyPlanSettings;
  plannedSessions: PlannedSession[];
  workoutLogs: WorkoutLog[];
  now?: Date;
  goal?: string | null;
  priorityMuscles?: MuscleBudgetGroup[];
}): WeeklyPlanState {
  const now = params.now ?? new Date();
  const weekStartDate = getWeekStartDate(now);
  const profilePriorityMuscles = getPriorityMusclesFromProfile(
    {
      primary_priority_muscle: params.priorityMuscles?.[0] ?? null,
      secondary_priority_muscle: params.priorityMuscles?.[1] ?? null,
      tertiary_priority_muscle: params.priorityMuscles?.[2] ?? null,
    },
    params.settings,
  );
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
  const completedWorkoutAnalyses = matched.workoutAnalyses.filter(
    (analysis) =>
      matched.completedWorkoutLogIds.includes(analysis.log.id) ||
      matched.spontaneousWorkoutLogIds.includes(analysis.log.id),
  );
  const completedMinutesThisWeek = completedWorkoutAnalyses.reduce(
    (sum, analysis) => sum + analysis.credit.minuteCredit,
    0,
  );
  const completedSessionCreditThisWeek = roundToSingleDecimal(
    completedWorkoutAnalyses.reduce(
      (sum, analysis) => sum + analysis.credit.sessionCredit,
      0,
    ),
  );
  const targetMinutesThisWeek =
    params.settings.defaultDurationMinutes * params.settings.sessionsPerWeek;
  const targetSessionCreditThisWeek = params.settings.sessionsPerWeek;
  const remainingSessionCredit = Math.max(
    0,
    roundToSingleDecimal(targetSessionCreditThisWeek - completedSessionCreditThisWeek),
  );
  const sessionsRemaining =
    remainingSessionCredit <= 0
      ? 0
      : Math.max(1, Math.ceil(remainingSessionCredit - 0.15));
  const plannedMinutesRemaining = Math.max(0, targetMinutesThisWeek - completedMinutesThisWeek);
  const muscleSetDeficits = buildMuscleSetDeficits(
    params.settings,
    currentWeekSessions,
    completedWorkoutAnalyses,
    params.goal,
  );
  const focusRecommendation = selectSuggestedNextFocus({
    sessions: sessionsWithMissedStatus,
    workoutAnalyses: completedWorkoutAnalyses,
    deficits: muscleSetDeficits,
    settings: params.settings,
    now,
    goal: params.goal,
    profilePriorityMuscles,
    remainingSessionCredit,
    completedMinutesThisWeek,
    targetMinutesThisWeek,
  });
  // Nästa fokus ska spegla bästa nästa pass från och med nu, inte bara dagens ursprungliga planrad.
  const suggestedNextFocus = focusRecommendation.focus;
  const remainingNeedDuration =
    sessionsRemaining > 0
      ? Math.round(plannedMinutesRemaining / sessionsRemaining)
      : params.settings.defaultDurationMinutes;
  const typicalWorkoutDurationMinutes = getTypicalWorkoutDurationMinutes({
    workoutLogs: params.workoutLogs,
    now,
  });
  const suggestedNextDurationMinutes = blendSuggestedDuration({
    remainingNeedDuration,
    typicalWorkoutDurationMinutes,
    minDuration: params.settings.minDurationMinutes,
    maxDuration: params.settings.maxDurationMinutes,
    remainingSessionCredit,
  });
  const totalRelevantDeficit = roundToSingleDecimal(
    (Object.keys(muscleSetDeficits) as MuscleBudgetGroup[]).reduce((sum, group) => {
      const weight = profilePriorityMuscles.includes(group)
        ? 1.25
        : group === "calves" || group === "core"
          ? 0.65
          : 1;
      return sum + muscleSetDeficits[group] * weight;
    }, 0),
  );
  const recoveryLimitedMuscles = getRecoveryLimitedMuscles({
    workoutAnalyses: completedWorkoutAnalyses,
    now,
  });
  const focusScores = buildFocusRecommendationScores({
    sessions: sessionsWithMissedStatus,
    workoutAnalyses: completedWorkoutAnalyses,
    deficits: muscleSetDeficits,
    settings: params.settings,
    now,
    goal: params.goal,
    profilePriorityMuscles,
    remainingSessionCredit,
    completedMinutesThisWeek,
    targetMinutesThisWeek,
  });
  const goalReachedReason =
    remainingSessionCredit <= 0.15 && plannedMinutesRemaining <= params.settings.minDurationMinutes
      ? "Session- och minutmålet är i praktiken uppnått."
      : `Sessioncredit ${completedSessionCreditThisWeek}/${targetSessionCreditThisWeek}, minuter ${completedMinutesThisWeek}/${targetMinutesThisWeek}, relevant deficit ${totalRelevantDeficit}.`;

  return {
    userId: params.settings.userId,
    weekStartDate,
    settings: params.settings,
    goal: params.goal ?? null,
    plannedSessions: sessionsWithMissedStatus,
    completedWorkoutLogIds: matched.completedWorkoutLogIds,
    spontaneousWorkoutLogIds: matched.spontaneousWorkoutLogIds,
    missedSessions,
    profilePriorityMuscles,
    remainingTrainingNeed: {
      sessionsRemaining,
      remainingSessionCredit,
      plannedMinutesRemaining,
      completedMinutesThisWeek,
      targetMinutesThisWeek,
      completedSessionCreditThisWeek,
      targetSessionCreditThisWeek,
      muscleSetDeficits,
      totalRelevantDeficit,
      recoveryLimitedMuscles,
      suggestedNextFocus,
      suggestedNextDurationMinutes,
      suggestedNextFocusReason: focusRecommendation.reason,
    },
    debug: {
      workoutCredits: matched.debugEntries,
      focusScores: focusScores.map((score) => ({
        ...score,
        selected: score.focus === suggestedNextFocus,
      })),
      goalReachedReason,
      typicalWorkoutDurationMinutes,
      remainingNeedDuration,
      finalSuggestedDurationMinutes: suggestedNextDurationMinutes,
    },
  };
}
