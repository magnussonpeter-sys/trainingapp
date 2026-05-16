import type { GoalTrajectory } from "@/lib/planning/goal-trajectory";
import type { MuscleBudgetEntry, MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { TrainingGap } from "@/lib/planning/training-gap";
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

type TrainingDoseAdjustmentPlanMode =
  | "normal_training"
  | "recovery"
  | "recovery_mobility"
  | "light_accessory"
  | "selective_priority_accessory";

export type TrainingDoseAdjustment = {
  compensationMode:
    | "none"
    | "small"
    | "moderate"
    | "reduce_ambition"
    | "recovery_first";
  adherence7d: number;
  adherence14d: number;
  adherence30d: number;
  plannedMinutes7d: number;
  completedMinutes7d: number;
  plannedMinutes14d: number;
  completedMinutes14d: number;
  plannedMinutes30d: number;
  completedMinutes30d: number;
  missedSessions7d: number;
  missedSessions14d: number;
  missedSessions30d: number;
  suggestedDurationDelta: number;
  recommendedDurationCapMinutes?: number;
  maxExtraDosePercent: number;
  priorityMuscles: MuscleBudgetGroup[];
  focusCompatiblePriorityMuscles: MuscleBudgetGroup[];
  globalUndertrainedMuscles: MuscleBudgetGroup[];
  deferredMuscles: MuscleBudgetGroup[];
  durationReductionReason?: string | null;
  reductionTriggeredByTrend: boolean;
  singleMissIgnoredForDuration: boolean;
  spontaneousSessionsOffsetMissed: boolean;
  previousRecommendedDuration: number;
  adjustedRecommendedDuration: number;
  durationDelta: number;
  minDurationApplied: boolean;
  reason: string;
  debugReasonCode:
    | "insufficient_history_no_adjustment"
    | "on_track"
    | "single_missed_small_adjustment"
    | "moderate_gap_controlled_adjustment"
    | "low_adherence_reduce_ambition"
    | "recovery_first_local_high_risk"
    | "recovery_first_total_dose_high"
    | "no_safe_adjustment";
};

type BuildTrainingDoseAdjustmentParams = {
  logs: WorkoutLog[];
  now: Date;
  trainingGap: TrainingGap;
  goalTrajectory: GoalTrajectory;
  muscleBudget: MuscleBudgetEntry[];
  nextFocus: WorkoutFocus;
  goal?: PlanningGoal | null;
  experienceLevel?: string | null;
  configuredPriorityMuscles?: MuscleBudgetGroup[];
  missedPlannedSessionsCount?: number | null;
  selectedPlanMode?: TrainingDoseAdjustmentPlanMode | null;
  recoveryOverrideApplied?: boolean;
  preferredSessionDurationMinutes?: number | null;
  minSessionDurationMinutes?: number | null;
  maxSessionDurationMinutes?: number | null;
};

type AdherenceWindow = {
  adherence: number;
  plannedMinutes: number;
  completedMinutes: number;
  plannedSessions: number;
  completedSessions: number;
  missedSessions: number;
  spontaneousCompletedSessions: number;
  minuteCompletionRatio: number;
  sessionCompletionRatio: number;
};

export type TrainingDoseDurationAdjustmentResult = {
  baseRecommendedDuration: number;
  adjustedRecommendedDuration: number;
  recommendedDurationCapMinutes?: number;
  durationAdjustmentReason: string | null;
  durationDelta: number;
  minDurationApplied: boolean;
};

const MIN_RECOMMENDED_DURATION_MINUTES = 15;

const FOCUS_GROUPS: Record<WorkoutFocus, MuscleBudgetGroup[]> = {
  full_body: ["quads", "hamstrings", "glutes", "back", "chest", "core"],
  upper_body: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower_body: ["quads", "hamstrings", "glutes", "calves", "core"],
  core: ["core", "glutes"],
};

const STRENGTH_PRIMARY_GROUPS = new Set<MuscleBudgetGroup>([
  "quads",
  "hamstrings",
  "glutes",
  "back",
  "chest",
  "shoulders",
  "core",
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToFive(value: number) {
  return Math.round(value / 5) * 5;
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function computeAdjustedDuration(params: {
  baseDurationMinutes: number;
  suggestedDurationDelta: number;
  recommendedDurationCapMinutes?: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  maxExtraDosePercent: number;
}) {
  const maxExtraMinutes = Math.round(
    params.baseDurationMinutes * (params.maxExtraDosePercent / 100),
  );
  const boundedDelta =
    params.suggestedDurationDelta > 0
      ? Math.min(params.suggestedDurationDelta, maxExtraMinutes)
      : params.suggestedDurationDelta;
  let adjustedDuration = Math.round(params.baseDurationMinutes + boundedDelta);

  if (typeof params.recommendedDurationCapMinutes === "number") {
    adjustedDuration = Math.min(
      adjustedDuration,
      params.recommendedDurationCapMinutes,
    );
  }

  // Sänk gradvis så att ett enskilt steg inte gör stora hopp i rekommenderad längd.
  adjustedDuration = Math.max(
    adjustedDuration,
    params.baseDurationMinutes - 10,
  );
  adjustedDuration = Math.min(
    params.maxDurationMinutes,
    Math.max(
      Math.max(MIN_RECOMMENDED_DURATION_MINUTES, params.minDurationMinutes),
      adjustedDuration,
    ),
  );

  const minDurationApplied =
    adjustedDuration ===
    Math.max(
      MIN_RECOMMENDED_DURATION_MINUTES,
      params.minDurationMinutes,
    );

  return {
    adjustedRecommendedDuration: Math.round(adjustedDuration),
    durationDelta: Math.round(adjustedDuration - params.baseDurationMinutes),
    minDurationApplied,
  };
}

function getLogDurationMinutes(log: WorkoutLog) {
  return Math.max(0, Math.round((log.durationSeconds ?? 0) / 60));
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

function countCompletedSpontaneousSessions(params: {
  logs: WorkoutLog[];
  now: Date;
  days: number;
}) {
  return getCompletedLogsWithinDays(params.logs, params.now, params.days).filter(
    (log) => log.metadata?.dayEvent === "spontaneous_training",
  ).length;
}

export function countMissedPlannedSessions(params: {
  plannedSessions: number;
  completedSessions: number;
  explicitMissedSessions?: number | null;
  estimateFromCadence?: boolean;
  spontaneousCompletedSessions?: number;
}) {
  const explicitMissed = Math.max(0, params.explicitMissedSessions ?? 0);

  if (params.estimateFromCadence === false) {
    return explicitMissed;
  }

  const estimatedMissed = Math.max(
    0,
    Math.round(params.plannedSessions) - params.completedSessions,
  );
  const rawMissed = Math.max(estimatedMissed, explicitMissed);

  // Spontana pass kan delvis kompensera missade planfönster när totaldosen ändå kom in.
  return Math.max(0, rawMissed - Math.max(0, params.spontaneousCompletedSessions ?? 0));
}

export function calculateAdherenceWindow(params: {
  logs: WorkoutLog[];
  now: Date;
  days: number;
  plannedSessionsPerWeek: number;
  plannedMinutesPerWeek: number;
  explicitMissedSessions?: number | null;
  estimateMissedFromCadence?: boolean;
}) {
  const completedLogs = getCompletedLogsWithinDays(params.logs, params.now, params.days);
  const spontaneousCompletedSessions = countCompletedSpontaneousSessions({
    logs: params.logs,
    now: params.now,
    days: params.days,
  });
  const completedSessions = completedLogs.length;
  const completedMinutes = completedLogs.reduce(
    (sum, log) => sum + getLogDurationMinutes(log),
    0,
  );
  const plannedSessions = roundToSingleDecimal(
    params.plannedSessionsPerWeek * (params.days / 7),
  );
  const plannedMinutes = Math.max(
    0,
    Math.round(params.plannedMinutesPerWeek * (params.days / 7)),
  );
  const sessionCompletionRatio =
    plannedSessions > 0 ? completedSessions / plannedSessions : 1;
  const minuteCompletionRatio =
    plannedMinutes > 0 ? completedMinutes / plannedMinutes : 1;
  const adherence = clamp(
    Math.min(sessionCompletionRatio, minuteCompletionRatio),
    0,
    1.25,
  );

  return {
    adherence,
    plannedMinutes,
    completedMinutes,
    plannedSessions,
    completedSessions,
    missedSessions: countMissedPlannedSessions({
      plannedSessions,
      completedSessions,
      explicitMissedSessions: params.explicitMissedSessions,
      estimateFromCadence: params.estimateMissedFromCadence,
      spontaneousCompletedSessions,
    }),
    spontaneousCompletedSessions,
    minuteCompletionRatio,
    sessionCompletionRatio,
  } satisfies AdherenceWindow;
}

export function getTypicalCompletedDuration(params: {
  logs: WorkoutLog[];
  now: Date;
  days?: number;
}) {
  const completedLogs = getCompletedLogsWithinDays(
    params.logs,
    params.now,
    params.days ?? 30,
  )
    .sort(
      (left, right) =>
        new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime(),
    )
    .slice(0, 6);

  if (completedLogs.length === 0) {
    return null;
  }

  const minutes = completedLogs
    .map(getLogDurationMinutes)
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  if (minutes.length === 0) {
    return null;
  }

  return minutes[Math.floor(minutes.length / 2)] ?? null;
}

export function getRecommendedDurationCap(params: {
  compensationMode: TrainingDoseAdjustment["compensationMode"];
  baseDurationMinutes: number;
  typicalCompletedDurationMinutes: number | null;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  goal?: PlanningGoal | null;
  adherence14d?: number;
  minuteCompletionRatio30d?: number;
}) {
  if (params.compensationMode !== "reduce_ambition") {
    return undefined;
  }

  const veryLowAdherence =
    (params.adherence14d ?? 1) < 0.45 ||
    (params.minuteCompletionRatio30d ?? 1) < 0.5;
  const severeLowAdherence =
    (params.adherence14d ?? 1) < 0.35 ||
    (params.minuteCompletionRatio30d ?? 1) < 0.35;
  const fallbackCap = roundToFive(
    clamp(
      params.goal === "strength" && veryLowAdherence
        ? Math.min(
            severeLowAdherence ? 35 : 40,
            Math.max(params.minDurationMinutes, params.baseDurationMinutes * 0.85),
          )
        : Math.max(params.minDurationMinutes, params.baseDurationMinutes * 0.75),
      params.minDurationMinutes,
      params.maxDurationMinutes,
    ),
  );

  if (!params.typicalCompletedDurationMinutes) {
    return fallbackCap;
  }

  const realisticBuffer = params.goal === "strength" ? 8 : 10;
  const cappedDuration = roundToFive(
    clamp(
      Math.max(
        params.typicalCompletedDurationMinutes + realisticBuffer,
        params.typicalCompletedDurationMinutes * 1.35,
      ),
      params.minDurationMinutes,
      params.baseDurationMinutes,
    ),
  );

  if (params.goal === "strength" && veryLowAdherence) {
    const shortStrengthCap =
      severeLowAdherence
        ? params.typicalCompletedDurationMinutes <= 15
          ? 25
          : params.typicalCompletedDurationMinutes <= 22
            ? 30
            : 35
        : params.typicalCompletedDurationMinutes <= 15
          ? 30
          : params.typicalCompletedDurationMinutes <= 22
            ? 35
            : 40;

    return Math.min(
      params.maxDurationMinutes,
      Math.max(params.minDurationMinutes, Math.min(cappedDuration, shortStrengthCap)),
    );
  }

  return Math.min(
    params.maxDurationMinutes,
    Math.max(params.minDurationMinutes, cappedDuration),
  );
}

function getPriorityRank(priorityMuscles: MuscleBudgetGroup[], group: MuscleBudgetGroup) {
  const index = priorityMuscles.indexOf(group);
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
}

function buildPriorityMuscleBuckets(params: {
  muscleBudget: MuscleBudgetEntry[];
  nextFocus: WorkoutFocus;
  configuredPriorityMuscles: MuscleBudgetGroup[];
  goal?: PlanningGoal | null;
}) {
  const allowedGroups = new Set(FOCUS_GROUPS[params.nextFocus]);
  const sortableEntries = [...params.muscleBudget]
    .filter((entry) => entry.remainingSets > 0)
    .filter((entry) => entry.loadStatus !== "high_risk" && entry.loadStatus !== "over")
    .sort((left, right) => {
      const leftPriorityRank = getPriorityRank(params.configuredPriorityMuscles, left.group);
      const rightPriorityRank = getPriorityRank(params.configuredPriorityMuscles, right.group);

      if (leftPriorityRank !== rightPriorityRank) {
        return leftPriorityRank - rightPriorityRank;
      }

      if (right.remainingSets !== left.remainingSets) {
        return right.remainingSets - left.remainingSets;
      }

      return left.group.localeCompare(right.group);
    });

  const globalUndertrainedMuscles = sortableEntries.map((entry) => entry.group);
  const focusCompatiblePriorityMuscles = sortableEntries
    .filter((entry) => allowedGroups.has(entry.group))
    .filter((entry) =>
      params.goal === "strength"
        ? STRENGTH_PRIMARY_GROUPS.has(entry.group)
        : true,
    )
    .map((entry) => entry.group)
    .slice(0, params.goal === "strength" ? 2 : 3);
  const deferredMuscles = globalUndertrainedMuscles
    .filter((group) => !focusCompatiblePriorityMuscles.includes(group))
    .slice(0, 4);

  return {
    priorityMuscles: focusCompatiblePriorityMuscles,
    focusCompatiblePriorityMuscles,
    globalUndertrainedMuscles,
    deferredMuscles,
  };
}

function getBaseDurationMinutes(params: BuildTrainingDoseAdjustmentParams) {
  const fromPreferred = params.preferredSessionDurationMinutes ?? null;

  if (typeof fromPreferred === "number" && Number.isFinite(fromPreferred) && fromPreferred > 0) {
    return Math.round(fromPreferred);
  }

  if (params.trainingGap.plannedSessions > 0 && params.trainingGap.plannedMinutes > 0) {
    return Math.max(
      20,
      Math.round(params.trainingGap.plannedMinutes / params.trainingGap.plannedSessions),
    );
  }

  return 30;
}

function hasRecoveryFirstSignal(params: {
  goalTrajectory: GoalTrajectory;
  trainingGap: TrainingGap;
  muscleBudget: MuscleBudgetEntry[];
  nextFocus: WorkoutFocus;
  adherence14d: number;
  thirtyDayMinuteCompletionRatio: number;
  selectedPlanMode?: TrainingDoseAdjustmentPlanMode | null;
  recoveryOverrideApplied?: boolean;
}) {
  const focusGroups = new Set(FOCUS_GROUPS[params.nextFocus]);
  const focusHighRiskCount = params.muscleBudget.filter(
    (entry) =>
      focusGroups.has(entry.group) &&
      (entry.loadStatus === "high_risk" || entry.loadStatus === "over"),
  ).length;

  const totalDoseClearlyLow =
    params.thirtyDayMinuteCompletionRatio < 0.5 || params.adherence14d < 0.45;
  const localHighRisk = focusHighRiskCount >= 2;

  if (
    params.recoveryOverrideApplied === true ||
    params.selectedPlanMode === "recovery" ||
    params.selectedPlanMode === "recovery_mobility"
  ) {
    return {
      active: true,
      debugReasonCode: "recovery_first_local_high_risk" as const,
    };
  }

  // Vid låg total dos ska recovery-first bara vinna om risken är tydligt lokal.
  if (totalDoseClearlyLow) {
    if (localHighRisk) {
      return {
        active: true,
        debugReasonCode: "recovery_first_local_high_risk" as const,
      };
    }

    return {
      active: false,
      debugReasonCode: null,
    };
  }

  if (params.goalTrajectory.status === "too_aggressive") {
    return {
      active: true,
      debugReasonCode: "recovery_first_total_dose_high" as const,
    };
  }

  if (localHighRisk) {
    return {
      active: true,
      debugReasonCode: "recovery_first_local_high_risk" as const,
    };
  }

  return {
    active: false,
    debugReasonCode: null,
  };
}

function buildAdjustmentReason(params: {
  compensationMode: TrainingDoseAdjustment["compensationMode"];
  goal?: PlanningGoal | null;
  adherence14d: number;
  missedSessions14d: number;
  plannedMinutes14d: number;
  completedMinutes14d: number;
  insufficientHistory: boolean;
  totalDoseClearlyLow: boolean;
  spontaneousSessionsOffsetMissed: boolean;
  singleMissIgnoredForDuration: boolean;
}) {
  if (params.compensationMode === "recovery_first") {
    if (params.totalDoseClearlyLow) {
      return "Total träningsdos är låg, men några muskler är nyligen belastade. Vi håller därför nästa pass kort och fokuserat i stället för att försöka kompensera brett.";
    }

    return "Återhämtning väger tyngre än kompensation just nu, så nästa pass ska inte växa för att ta igen missad träning.";
  }

  if (params.compensationMode === "reduce_ambition") {
    if (params.insufficientHistory && params.missedSessions14d === 0) {
      return "Vi har ännu för lite historik för att justera träningsdosen aggressivt. Vi behåller därför en försiktig rekommendation tills vi har mer data.";
    }

    if (params.goal === "strength") {
      return `De senaste två veckorna har följsamheten varit låg (${Math.round(
        params.adherence14d * 100,
      )} %). Eftersom målet är styrka jagar vi inte missad volym, utan sänker dagens rekommenderade längd till ett kortare och mer genomförbart pass med tydliga huvudmönster.`;
    }

    return `De senaste två veckorna har följsamheten varit låg (${Math.round(
      params.adherence14d * 100,
    )} %) och ${params.missedSessions14d} planerade pass bedöms ha uteblivit. Vi sänker därför rekommenderad längd och fokuserar på ett mer genomförbart pass.`;
  }

  if (params.compensationMode === "moderate") {
    if (params.goal === "strength") {
      return "Det finns ett tydligt träningsgap, men eftersom målet är styrka gör vi bara en liten justering och behåller huvudmönstren.";
    }

    return `Du ligger efter planerad träningsdos (${params.completedMinutes14d}/${params.plannedMinutes14d} min senaste 14 dagarna), men följsamheten är fortfarande tillräcklig för en liten kontrollerad kompensation.`;
  }

  if (params.compensationMode === "small") {
    if (params.singleMissIgnoredForDuration) {
      return "Du missade ett pass, men det räcker att hålla planen stabil. Vi ändrar inte passlängden än.";
    }

    return "Ett planerat pass verkar ha glidit. Nästa pass kan bli lite längre eller mer fokuserat, men ökningen hålls liten.";
  }

  if (params.spontaneousSessionsOffsetMissed) {
    return "Du missade ett planerat pass men fick in ett spontant pass. Jag räknar in det och justerar fokus snarare än att korta ner kommande pass.";
  }

  if (params.insufficientHistory) {
    if (params.goal === "strength") {
      return "Jag har begränsad historik än så länge. Vi börjar med ett genomförbart styrkepass innan vi justerar träningsdosen mer aktivt.";
    }

    return "Jag har begränsad historik än så länge. Vi börjar med ett genomförbart pass innan vi justerar träningsdosen mer aktivt.";
  }

  return "Ingen säker dosjustering behövs just nu.";
}

export function buildTrainingDoseDurationAdjustment(params: {
  baseDurationMinutes: number;
  adjustment: TrainingDoseAdjustment;
  minDurationMinutes: number;
  maxDurationMinutes: number;
}): TrainingDoseDurationAdjustmentResult {
  const computed = computeAdjustedDuration({
    baseDurationMinutes: params.baseDurationMinutes,
    suggestedDurationDelta: params.adjustment.suggestedDurationDelta,
    recommendedDurationCapMinutes:
      params.adjustment.recommendedDurationCapMinutes,
    minDurationMinutes: params.minDurationMinutes,
    maxDurationMinutes: params.maxDurationMinutes,
    maxExtraDosePercent: params.adjustment.maxExtraDosePercent,
  });

  return {
    baseRecommendedDuration: Math.round(params.baseDurationMinutes),
    adjustedRecommendedDuration: computed.adjustedRecommendedDuration,
    recommendedDurationCapMinutes:
      params.adjustment.recommendedDurationCapMinutes,
    durationAdjustmentReason: params.adjustment.reason,
    durationDelta: computed.durationDelta,
    minDurationApplied: computed.minDurationApplied,
  };
}

export function applyTrainingDoseAdjustmentToDuration(params: {
  baseDurationMinutes: number;
  adjustment: TrainingDoseAdjustment;
  minDurationMinutes: number;
  maxDurationMinutes: number;
}) {
  return buildTrainingDoseDurationAdjustment(params).adjustedRecommendedDuration;
}

export function buildTrainingDoseAdjustment(
  params: BuildTrainingDoseAdjustmentParams,
): TrainingDoseAdjustment {
  const configuredPriorityMuscles = params.configuredPriorityMuscles ?? [];
  const completedHistoryCount = params.logs.filter(
    (log) => log.status === "completed" && !isWorkoutLogExcludedFromAnalysis(log),
  ).length;
  const thirtyDayEffect = params.trainingGap.thirtyDayEffect;
  const thirtyDayConfidence = thirtyDayEffect?.confidence ?? "low";
  // Undvik att tolka teoretiskt planerade pass som "missade" när historiken ännu är för tunn.
  const canEstimateMissesFromCadence =
    completedHistoryCount >= 2 || thirtyDayConfidence !== "low";
  const baseDurationMinutes = getBaseDurationMinutes(params);
  const minDurationMinutes = Math.max(
    15,
    Math.round(params.minSessionDurationMinutes ?? Math.max(20, baseDurationMinutes * 0.6)),
  );
  const maxDurationMinutes = Math.max(
    minDurationMinutes,
    Math.round(params.maxSessionDurationMinutes ?? Math.max(baseDurationMinutes, 60)),
  );
  const targetMinutesPerWeek = Math.max(
    params.trainingGap.plannedMinutes,
    params.goalTrajectory.weeklyFrequencyTarget * baseDurationMinutes,
  );
  const adherence7d = calculateAdherenceWindow({
    logs: params.logs,
    now: params.now,
    days: 7,
    plannedSessionsPerWeek: params.goalTrajectory.weeklyFrequencyTarget,
    plannedMinutesPerWeek: targetMinutesPerWeek,
    explicitMissedSessions: params.missedPlannedSessionsCount ?? 0,
    estimateMissedFromCadence: canEstimateMissesFromCadence,
  });
  const adherence14d = calculateAdherenceWindow({
    logs: params.logs,
    now: params.now,
    days: 14,
    plannedSessionsPerWeek: params.goalTrajectory.weeklyFrequencyTarget,
    plannedMinutesPerWeek: targetMinutesPerWeek,
    estimateMissedFromCadence: canEstimateMissesFromCadence,
  });
  const adherence30d = calculateAdherenceWindow({
    logs: params.logs,
    now: params.now,
    days: 30,
    plannedSessionsPerWeek: params.goalTrajectory.weeklyFrequencyTarget,
    plannedMinutesPerWeek: targetMinutesPerWeek,
    estimateMissedFromCadence: canEstimateMissesFromCadence,
  });
  const plannedMinutes30d =
    thirtyDayEffect?.plannedMinutes ?? adherence30d.plannedMinutes;
  const completedMinutes30d =
    thirtyDayEffect?.completedMinutes ?? adherence30d.completedMinutes;
  const plannedSessions30d =
    thirtyDayEffect?.plannedSessions ?? adherence30d.plannedSessions;
  const completedSessions30d =
    thirtyDayEffect?.completedSessions ?? adherence30d.completedSessions;
  const missedSessions30d = countMissedPlannedSessions({
    plannedSessions: plannedSessions30d,
    completedSessions: completedSessions30d,
    explicitMissedSessions: params.missedPlannedSessionsCount ?? 0,
    estimateFromCadence: canEstimateMissesFromCadence,
  });
  const adherence30dValue = clamp(
    Math.min(
      thirtyDayEffect?.sessionCompletionRatio ?? adherence30d.sessionCompletionRatio,
      thirtyDayEffect?.minuteCompletionRatio ?? adherence30d.minuteCompletionRatio,
    ),
    0,
    1.25,
  );
  const typicalCompletedDurationMinutes = getTypicalCompletedDuration({
    logs: params.logs,
    now: params.now,
  });
  const priorityBuckets = buildPriorityMuscleBuckets({
    muscleBudget: params.muscleBudget,
    nextFocus: params.nextFocus,
    configuredPriorityMuscles,
    goal: params.goal,
  });

  let compensationMode: TrainingDoseAdjustment["compensationMode"] = "none";
  let suggestedDurationDelta = 0;
  let maxExtraDosePercent = 0;
  let recommendedDurationCapMinutes: number | undefined;
  let debugReasonCode: TrainingDoseAdjustment["debugReasonCode"] = "on_track";
  let reductionTriggeredByTrend = false;
  let singleMissIgnoredForDuration = false;

  const hasMultipleMissesInRow =
    adherence7d.missedSessions >= 2 ||
    (adherence7d.completedSessions === 0 && adherence14d.missedSessions >= 2);
  const insufficientHistory =
    completedHistoryCount < 2 && thirtyDayConfidence === "low";
  const totalDoseClearlyLow =
    (thirtyDayEffect?.minuteCompletionRatio ?? adherence30d.minuteCompletionRatio) < 0.5 ||
    adherence14d.adherence < 0.45;
  const spontaneousSessionsOffsetMissed =
    adherence14d.spontaneousCompletedSessions > 0 &&
    adherence14d.completedSessions >= Math.max(1, adherence14d.missedSessions);
  const recoverySignal = hasRecoveryFirstSignal({
    goalTrajectory: params.goalTrajectory,
    trainingGap: params.trainingGap,
    muscleBudget: params.muscleBudget,
    nextFocus: params.nextFocus,
    adherence14d: adherence14d.adherence,
    thirtyDayMinuteCompletionRatio:
      thirtyDayEffect?.minuteCompletionRatio ?? adherence30d.minuteCompletionRatio,
    selectedPlanMode: params.selectedPlanMode,
    recoveryOverrideApplied: params.recoveryOverrideApplied,
  });

  if (insufficientHistory && adherence14d.missedSessions === 0) {
    compensationMode = "none";
    suggestedDurationDelta = 0;
    maxExtraDosePercent = 0;
    debugReasonCode = "insufficient_history_no_adjustment";
  } else if (recoverySignal.active) {
    compensationMode = "recovery_first";
    suggestedDurationDelta = 0;
    maxExtraDosePercent = 0;
    debugReasonCode =
      recoverySignal.debugReasonCode ?? "recovery_first_local_high_risk";
  } else if (
    !spontaneousSessionsOffsetMissed &&
    (adherence14d.adherence < 0.5 ||
      adherence14d.missedSessions >= 3 ||
      ((thirtyDayEffect?.minuteCompletionRatio ?? adherence14d.minuteCompletionRatio) < 0.5 &&
        thirtyDayConfidence !== "low") ||
      hasMultipleMissesInRow)
  ) {
    compensationMode = "reduce_ambition";
    debugReasonCode = "low_adherence_reduce_ambition";
    reductionTriggeredByTrend = true;
    suggestedDurationDelta =
      baseDurationMinutes >= 40 || adherence14d.adherence < 0.3 ? -10 : -5;
    maxExtraDosePercent = 0;
    recommendedDurationCapMinutes = getRecommendedDurationCap({
      compensationMode,
      baseDurationMinutes,
      typicalCompletedDurationMinutes,
      minDurationMinutes,
      maxDurationMinutes,
      goal: params.goal,
      adherence14d: adherence14d.adherence,
      minuteCompletionRatio30d:
        thirtyDayEffect?.minuteCompletionRatio ?? adherence14d.minuteCompletionRatio,
    });
  } else if (
    (params.goalTrajectory.status === "behind" ||
      params.trainingGap.status === "major_gap") &&
    adherence14d.adherence >= 0.45 &&
    adherence14d.adherence <= 0.75
  ) {
    compensationMode = "moderate";
    debugReasonCode = "moderate_gap_controlled_adjustment";
    suggestedDurationDelta =
      params.goal === "hypertrophy" && adherence14d.adherence >= 0.55 ? 10 : 5;
    if (params.goal === "strength") {
      suggestedDurationDelta = 5;
    }
    maxExtraDosePercent = 20;
  } else if (
    (adherence7d.missedSessions >= 1 || (params.missedPlannedSessionsCount ?? 0) >= 1) &&
    adherence14d.adherence >= 0.65
  ) {
    compensationMode = "small";
    debugReasonCode = "single_missed_small_adjustment";
    suggestedDurationDelta = 0;
    maxExtraDosePercent = 10;
    singleMissIgnoredForDuration = true;
  }

  if (compensationMode === "none" && debugReasonCode === "on_track" && insufficientHistory) {
    debugReasonCode = "insufficient_history_no_adjustment";
  }

  if (compensationMode === "none" && debugReasonCode === "on_track") {
    debugReasonCode = "on_track";
  }

  if (
    compensationMode === "reduce_ambition" &&
    typeof recommendedDurationCapMinutes !== "number"
  ) {
    debugReasonCode = "no_safe_adjustment";
  }

  const reason = buildAdjustmentReason({
    compensationMode,
    goal: params.goal,
    adherence14d: adherence14d.adherence,
    missedSessions14d: adherence14d.missedSessions,
    plannedMinutes14d: adherence14d.plannedMinutes,
    completedMinutes14d: adherence14d.completedMinutes,
    insufficientHistory,
    totalDoseClearlyLow,
    spontaneousSessionsOffsetMissed,
    singleMissIgnoredForDuration,
  });
  const durationPreview = computeAdjustedDuration({
    baseDurationMinutes,
    suggestedDurationDelta,
    recommendedDurationCapMinutes,
    minDurationMinutes,
    maxDurationMinutes,
    maxExtraDosePercent: Math.min(maxExtraDosePercent, 20),
  });

  return {
    compensationMode,
    adherence7d: adherence7d.adherence,
    adherence14d: adherence14d.adherence,
    adherence30d: adherence30dValue,
    plannedMinutes7d: adherence7d.plannedMinutes,
    completedMinutes7d: adherence7d.completedMinutes,
    plannedMinutes14d: adherence14d.plannedMinutes,
    completedMinutes14d: adherence14d.completedMinutes,
    plannedMinutes30d,
    completedMinutes30d,
    missedSessions7d: adherence7d.missedSessions,
    missedSessions14d: adherence14d.missedSessions,
    missedSessions30d,
    suggestedDurationDelta,
    recommendedDurationCapMinutes,
    maxExtraDosePercent: Math.min(maxExtraDosePercent, 20),
    priorityMuscles: priorityBuckets.priorityMuscles,
    focusCompatiblePriorityMuscles: priorityBuckets.focusCompatiblePriorityMuscles,
    globalUndertrainedMuscles: priorityBuckets.globalUndertrainedMuscles,
    deferredMuscles: priorityBuckets.deferredMuscles,
    durationReductionReason:
      durationPreview.durationDelta < 0 ? reason : null,
    reductionTriggeredByTrend,
    singleMissIgnoredForDuration,
    spontaneousSessionsOffsetMissed,
    previousRecommendedDuration: baseDurationMinutes,
    adjustedRecommendedDuration: durationPreview.adjustedRecommendedDuration,
    durationDelta: durationPreview.durationDelta,
    minDurationApplied: durationPreview.minDurationApplied,
    reason,
    debugReasonCode,
  };
}
