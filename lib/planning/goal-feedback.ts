import type { GoalTrajectory } from "@/lib/planning/goal-trajectory";
import type { MuscleBudgetEntry, MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { TrainingGap } from "@/lib/planning/training-gap";
import {
  isWorkoutLogExcludedFromAnalysis,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import { getExerciseById } from "@/lib/exercise-catalog";
import type { SportFocus, TrainingGoal } from "@/types/training-profile";

export type GoalFeedbackStatus =
  | "too_low"
  | "slightly_low"
  | "on_track"
  | "high"
  | "recovery_risk"
  | "insufficient_data";

export type GoalFeedbackLimitingFactor =
  | "frequency"
  | "volume"
  | "intensity"
  | "specificity"
  | "recovery"
  | "consistency"
  | "none";

export type GoalFeedback = {
  score: number;
  status: GoalFeedbackStatus;
  headline: string;
  summary: string;
  mainAdvice: string;
  concreteChange: {
    type: "increase" | "decrease" | "maintain";
    sessionsDelta: number;
    minutesDeltaPerWeek: number;
    minutesRangeLabel: string;
    setDeltaPerWeek?: number;
    focusLabels: string[];
  };
  limitingFactor: GoalFeedbackLimitingFactor;
  chips: Array<{
    label: string;
    status: "good" | "warning" | "low" | "neutral";
    value: string;
  }>;
  confidence: "low" | "medium" | "high";
};

export type GoalFeedbackInput = {
  logs: WorkoutLog[];
  goal?: TrainingGoal | null;
  experienceLevel?: string | null;
  sportFocus?: SportFocus | null;
  trainingGap: TrainingGap;
  goalTrajectory: GoalTrajectory;
  muscleBudget: MuscleBudgetEntry[];
  plannedSessionsThisWeek?: number | null;
  completedSessionsThisWeek?: number | null;
  missedSessionsThisWeek?: number | null;
  plannedMinutesThisWeek?: number | null;
  completedMinutesThisWeek?: number | null;
  now?: Date;
};

type GoalReference = {
  minimumSessions: number;
  targetSessions: number;
  minimumMinutes: number;
  targetMinutes: number;
  targetSetsPerLargeMuscle: [number, number];
};

type FrequencyMetrics = {
  completedSessions7d: number;
  completedSessions30d: number;
  completedMinutes7d: number;
  completedMinutes30d: number;
  averageCompletedDuration30d: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function formatMuscleGroup(group: MuscleBudgetGroup) {
  if (group === "chest") return "bröst";
  if (group === "back") return "rygg";
  if (group === "quads") return "framsida lår";
  if (group === "hamstrings") return "baksida lår";
  if (group === "glutes") return "säte";
  if (group === "shoulders") return "axlar";
  if (group === "biceps") return "biceps";
  if (group === "triceps") return "triceps";
  if (group === "calves") return "vader";
  return "bål";
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

function getGoalReference(goal: TrainingGoal | null | undefined, experienceLevel?: string | null): GoalReference {
  const isBeginner = experienceLevel === "beginner" || experienceLevel === "novice";
  const isIntermediateOrAbove =
    experienceLevel === "intermediate" || experienceLevel === "advanced";

  if (goal === "hypertrophy") {
    return isBeginner
      ? {
          minimumSessions: 2,
          targetSessions: 3,
          minimumMinutes: 55,
          targetMinutes: 100,
          targetSetsPerLargeMuscle: [6, 10],
        }
      : {
          minimumSessions: 3,
          targetSessions: isIntermediateOrAbove ? 4 : 3,
          minimumMinutes: 80,
          targetMinutes: 140,
          targetSetsPerLargeMuscle: [8, 16],
        };
  }

  if (goal === "strength") {
    return isBeginner
      ? {
          minimumSessions: 2,
          targetSessions: 3,
          minimumMinutes: 60,
          targetMinutes: 105,
          targetSetsPerLargeMuscle: [5, 8],
        }
      : {
          minimumSessions: 3,
          targetSessions: 4,
          minimumMinutes: 80,
          targetMinutes: 130,
          targetSetsPerLargeMuscle: [6, 10],
        };
  }

  if (goal === "body_composition") {
    return {
      minimumSessions: 2,
      targetSessions: 4,
      minimumMinutes: 60,
      targetMinutes: 135,
      targetSetsPerLargeMuscle: [5, 10],
    };
  }

  return {
    minimumSessions: 2,
    targetSessions: 3,
    minimumMinutes: 50,
    targetMinutes: 100,
    targetSetsPerLargeMuscle: [4, 8],
  };
}

function getFrequencyMetrics(logs: WorkoutLog[], now: Date): FrequencyMetrics {
  const logs7d = getCompletedLogsWithinDays(logs, now, 7);
  const logs30d = getCompletedLogsWithinDays(logs, now, 30);
  const completedMinutes7d = logs7d.reduce(
    (sum, log) => sum + Math.max(0, Math.round((log.durationSeconds ?? 0) / 60)),
    0,
  );
  const completedMinutes30d = logs30d.reduce(
    (sum, log) => sum + Math.max(0, Math.round((log.durationSeconds ?? 0) / 60)),
    0,
  );

  return {
    completedSessions7d: logs7d.length,
    completedSessions30d: logs30d.length,
    completedMinutes7d,
    completedMinutes30d,
    averageCompletedDuration30d:
      logs30d.length > 0 ? roundToSingleDecimal(completedMinutes30d / logs30d.length) : null,
  };
}

function getLargeMuscleVolumeRatio(muscleBudget: MuscleBudgetEntry[]) {
  const largeGroups = muscleBudget.filter((entry) =>
    ["chest", "back", "quads", "hamstrings", "glutes", "shoulders"].includes(entry.group),
  );

  if (largeGroups.length === 0) {
    return 0;
  }

  const ratios = largeGroups.map((entry) =>
    entry.targetSets > 0 ? clamp(entry.completedSets / entry.targetSets, 0, 1.4) : 0,
  );

  return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
}

function getStrengthSpecificityScore(logs: WorkoutLog[], now: Date) {
  const recentLogs = getCompletedLogsWithinDays(logs, now, 30);

  if (recentLogs.length === 0) {
    return 0;
  }

  let mainPatternHits = 0;
  let loadedMainPatternHits = 0;

  for (const log of recentLogs) {
    for (const exercise of log.exercises) {
      const catalogExercise = getExerciseById(exercise.exerciseId);
      const pattern = catalogExercise?.movementPattern ?? null;

      if (
        pattern !== "squat" &&
        pattern !== "hinge" &&
        pattern !== "horizontal_push" &&
        pattern !== "horizontal_pull" &&
        pattern !== "vertical_push" &&
        pattern !== "vertical_pull" &&
        pattern !== "lunge"
      ) {
        continue;
      }

      mainPatternHits += 1;

      const usedExternalLoad = exercise.sets.some((set) => (set.actualWeight ?? 0) > 0);
      const equipmentSuggestsLoad = (catalogExercise?.requiredEquipment ?? []).some(
        (item) => item !== "bodyweight" && item !== "rings",
      );

      if (usedExternalLoad || equipmentSuggestsLoad) {
        loadedMainPatternHits += 1;
      }
    }
  }

  if (mainPatternHits === 0) {
    return 0;
  }

  return clamp((loadedMainPatternHits / mainPatternHits) * 100, 0, 100);
}

function toChipStatus(score: number): "good" | "warning" | "low" | "neutral" {
  if (score >= 80) return "good";
  if (score >= 60) return "warning";
  if (score > 0) return "low";
  return "neutral";
}

function getConfidence(logs30d: number, trainingGap: TrainingGap): GoalFeedback["confidence"] {
  if (trainingGap.thirtyDayEffect?.confidence === "high" && logs30d >= 6) {
    return "high";
  }

  if (logs30d >= 3) {
    return "medium";
  }

  return "low";
}

function getTopMissingMuscles(muscleBudget: MuscleBudgetEntry[]) {
  return muscleBudget
    .filter((entry) => entry.remainingSets > 0.5)
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 2)
    .map((entry) => formatMuscleGroup(entry.group));
}

function buildMinutesRangeLabel(deltaMinutes: number, mode: "increase" | "decrease" | "maintain") {
  if (mode === "maintain" || deltaMinutes === 0) {
    return "Behåll nivån";
  }

  const absolute = Math.abs(deltaMinutes);
  const lower = Math.max(10, Math.round(absolute / 5) * 5);
  const upper = lower + 10;
  const prefix = mode === "increase" ? "+" : "-";
  return `${prefix}${lower}–${upper} min/vecka`;
}

function buildStatusHeadline(status: GoalFeedbackStatus, score: number) {
  if (status === "too_low") return "Tydligt under målet";
  if (status === "slightly_low") return "Lite under målet";
  if (status === "high") return "På rätt nivå";
  if (status === "recovery_risk") return "Prioritera återhämtning";
  if (status === "insufficient_data") return "För lite data ännu";
  return score >= 85 ? "På rätt nivå" : "På god väg";
}

function buildSummary(params: {
  goal: TrainingGoal | null | undefined;
  status: GoalFeedbackStatus;
  limitingFactor: GoalFeedbackLimitingFactor;
}) {
  const goalLabel =
    params.goal === "hypertrophy"
      ? "muskeltillväxt"
      : params.goal === "strength"
        ? "styrkeutveckling"
        : params.goal === "body_composition"
          ? "kroppssammansättning"
          : "allmän form";

  if (params.status === "insufficient_data") {
    return "Genomför några pass till så blir bedömningen säkrare.";
  }

  if (params.status === "recovery_risk") {
    return `Du tränar tillräckligt för ${goalLabel}, men återhämtningen verkar vara den tydligaste begränsningen just nu.`;
  }

  if (params.status === "high") {
    return `Du ligger redan ganska högt för ${goalLabel}. Mer mängd ser inte ut att vara det snabbaste sättet framåt nu.`;
  }

  if (params.status === "on_track") {
    return `Du ligger bra till för ${goalLabel}. Det viktigaste nu är jämn kvalitet och att låta återhämtningen stödja nästa pass.`;
  }

  if (params.limitingFactor === "consistency") {
    return "Du får till pass ibland, men rytmen är fortfarande lite ojämn för att ge full effekt.";
  }

  if (params.limitingFactor === "volume") {
    return `Du tränar regelbundet, men den totala veckovolymen är något låg för ${goalLabel}.`;
  }

  if (params.limitingFactor === "specificity") {
    return "Du har fått in träningstid, men passen är inte helt tillräckligt riktade mot målet ännu.";
  }

  return params.status === "too_low"
    ? `Du ligger tydligt under nivån som oftast krävs för tydlig utveckling mot ${goalLabel}.`
    : `Du ligger lite under nivån som oftast krävs för tydlig utveckling mot ${goalLabel}.`;
}

function buildMainAdvice(params: {
  status: GoalFeedbackStatus;
  limitingFactor: GoalFeedbackLimitingFactor;
  concreteChange: GoalFeedback["concreteChange"];
  goal: TrainingGoal | null | undefined;
}) {
  if (params.status === "insufficient_data") {
    return "Genomför några pass till så kan vi ge säkrare råd om rätt nivå för dig.";
  }

  if (params.status === "on_track") {
    if (params.goal === "strength") {
      return "Behåll ungefär samma mängd och fokusera på progression, teknik och återhämtning i huvudlyften.";
    }

    return "Behåll ungefär samma nivå och lägg energin på kvalitet, progression och att passen faktiskt blir av.";
  }

  if (params.status === "high" || params.status === "recovery_risk") {
    return `Bästa justering: ${params.concreteChange.minutesRangeLabel.toLowerCase()} eller byt ett hårt pass mot ett lättare återhämtningspass.`;
  }

  if (params.concreteChange.sessionsDelta > 0) {
    return `Bästa justering: +${params.concreteChange.sessionsDelta} kort pass eller ${params.concreteChange.minutesRangeLabel.toLowerCase()} denna vecka.`;
  }

  return `Bästa justering: ${params.concreteChange.minutesRangeLabel.toLowerCase()} med fokus på ${params.concreteChange.focusLabels.join(" och ")}.`;
}

function buildConcreteChange(params: {
  status: GoalFeedbackStatus;
  limitingFactor: GoalFeedbackLimitingFactor;
  reference: GoalReference;
  metrics: FrequencyMetrics;
  trainingGap: TrainingGap;
  muscleBudget: MuscleBudgetEntry[];
}) {
  const missingMinutesToTarget = Math.max(
    0,
    params.reference.targetMinutes - params.metrics.completedMinutes7d,
  );
  const focusLabels = getTopMissingMuscles(params.muscleBudget);

  if (params.status === "insufficient_data" || params.status === "on_track") {
    return {
      type: "maintain" as const,
      sessionsDelta: 0,
      minutesDeltaPerWeek: 0,
      minutesRangeLabel: "Behåll nivån",
      focusLabels,
    };
  }

  if (params.status === "high" || params.status === "recovery_risk") {
    const reduceMinutes = Math.max(20, Math.min(40, params.metrics.completedMinutes7d - params.reference.targetMinutes));
    return {
      type: "decrease" as const,
      sessionsDelta: params.limitingFactor === "recovery" ? -1 : 0,
      minutesDeltaPerWeek: -reduceMinutes,
      minutesRangeLabel: buildMinutesRangeLabel(-reduceMinutes, "decrease"),
      focusLabels,
    };
  }

  const needsMoreFrequency =
    params.metrics.completedSessions7d < params.reference.minimumSessions ||
    params.limitingFactor === "frequency" ||
    params.limitingFactor === "consistency";
  const sessionsDelta = needsMoreFrequency ? 1 : 0;
  const increaseMinutes = clamp(
    missingMinutesToTarget > 0 ? missingMinutesToTarget : params.trainingGap.missingMinutes,
    20,
    45,
  );

  return {
    type: "increase" as const,
    sessionsDelta,
    minutesDeltaPerWeek: increaseMinutes,
    minutesRangeLabel: buildMinutesRangeLabel(increaseMinutes, "increase"),
    setDeltaPerWeek:
      params.trainingGap.missingSets > 0 ? Math.round(params.trainingGap.missingSets) : undefined,
    focusLabels,
  };
}

export function buildGoalFeedback(input: GoalFeedbackInput): GoalFeedback {
  const now = input.now ?? new Date();
  const metrics = getFrequencyMetrics(input.logs, now);
  const reference = getGoalReference(input.goal, input.experienceLevel);
  const logs30d = metrics.completedSessions30d;
  const confidence = getConfidence(logs30d, input.trainingGap);

  if (logs30d < 2) {
    const chips: GoalFeedback["chips"] = [
      { label: "Frekvens", status: "neutral", value: "För lite data" },
      { label: "Volym", status: "neutral", value: "För lite data" },
      { label: "Återhämtning", status: "neutral", value: "Bedöms senare" },
    ];

    return {
      score: 0,
      status: "insufficient_data",
      headline: buildStatusHeadline("insufficient_data", 0),
      summary: "Genomför några pass till så blir bedömningen säkrare.",
      mainAdvice: "Fokusera först på att få in några jämna pass, så kan vi sedan justera mängden bättre.",
      concreteChange: {
        type: "maintain",
        sessionsDelta: 0,
        minutesDeltaPerWeek: 0,
        minutesRangeLabel: "Behåll nivån tills mer data finns",
        focusLabels: [],
      },
      limitingFactor: "none",
      chips,
      confidence,
    };
  }

  const frequencyRatio = clamp(metrics.completedSessions7d / reference.targetSessions, 0, 1.15);
  const planMinuteRatio =
    input.plannedMinutesThisWeek && input.plannedMinutesThisWeek > 0
      ? clamp((input.completedMinutesThisWeek ?? 0) / input.plannedMinutesThisWeek, 0, 1.15)
      : null;
  const volumeRatio = clamp(
    (metrics.completedMinutes7d / reference.targetMinutes + (planMinuteRatio ?? 0)) /
      (planMinuteRatio === null ? 1 : 2),
    0,
    1.15,
  );
  const muscleVolumeRatio = getLargeMuscleVolumeRatio(input.muscleBudget);
  const missedSessionPenalty =
    input.plannedSessionsThisWeek && input.plannedSessionsThisWeek > 0
      ? clamp((input.missedSessionsThisWeek ?? 0) / input.plannedSessionsThisWeek, 0, 0.35)
      : 0;
  const consistencyPenalty =
    (input.missedSessionsThisWeek ?? 0) > 0
      ? clamp((input.missedSessionsThisWeek ?? 0) * 0.18 + missedSessionPenalty, 0, 0.4)
      : input.goalTrajectory.status === "behind"
        ? 0.12
        : input.goalTrajectory.status === "slightly_behind"
          ? 0.06
          : 0;
  const recoveryPenalty =
    input.trainingGap.status === "recovery_first"
      ? 0.45
      : input.muscleBudget.some((entry) => entry.loadStatus === "high_risk")
        ? 0.3
        : input.muscleBudget.some((entry) => entry.loadStatus === "over")
          ? 0.15
          : 0;
  const strengthSpecificity =
    input.goal === "strength" ? getStrengthSpecificityScore(input.logs, now) / 100 : 0.72;
  const specificityRatio =
    input.goal === "strength"
      ? strengthSpecificity
      : input.goal === "hypertrophy"
        ? clamp((muscleVolumeRatio + frequencyRatio) / 2, 0, 1.05)
        : clamp((frequencyRatio + volumeRatio) / 2, 0, 1.05);

  const weights =
    input.goal === "strength"
      ? { frequency: 0.24, volume: 0.18, consistency: 0.14, recovery: 0.18, specificity: 0.26 }
      : input.goal === "body_composition"
        ? { frequency: 0.28, volume: 0.24, consistency: 0.22, recovery: 0.12, specificity: 0.14 }
        : input.goal === "hypertrophy"
          ? { frequency: 0.28, volume: 0.28, consistency: 0.16, recovery: 0.12, specificity: 0.16 }
          : { frequency: 0.3, volume: 0.22, consistency: 0.22, recovery: 0.14, specificity: 0.12 };

  const frequencyScore = clamp(frequencyRatio * 100, 0, 100);
  const volumeScore = clamp(((volumeRatio + muscleVolumeRatio) / 2) * 100, 0, 100);
  const consistencyScore = clamp((1 - consistencyPenalty) * 100, 0, 100);
  const recoveryScore = clamp((1 - recoveryPenalty) * 100, 0, 100);
  const specificityScore = clamp(specificityRatio * 100, 0, 100);

  const score = Math.round(
    frequencyScore * weights.frequency +
      volumeScore * weights.volume +
      consistencyScore * weights.consistency +
      recoveryScore * weights.recovery +
      specificityScore * weights.specificity,
  );

  let limitingFactor: GoalFeedbackLimitingFactor = "none";
  const scoredFactors: Array<[GoalFeedbackLimitingFactor, number]> = [
    ["frequency", frequencyScore],
    ["volume", volumeScore],
    ["consistency", consistencyScore],
    ["recovery", recoveryScore],
    ["specificity", specificityScore],
  ];
  const lowestFactor = scoredFactors.sort((left, right) => left[1] - right[1])[0];
  if (lowestFactor) {
    limitingFactor = lowestFactor[0];
  }

  let status: GoalFeedbackStatus = "on_track";
  if (recoveryScore < 55) {
    status = "recovery_risk";
  } else if (score >= 85 && frequencyRatio > 1 && volumeRatio > 1.05) {
    status = "high";
  } else if (score < 40) {
    status = "too_low";
  } else if (score < 65) {
    status = "slightly_low";
  }

  const concreteChange = buildConcreteChange({
    status,
    limitingFactor,
    reference,
    metrics,
    trainingGap: input.trainingGap,
    muscleBudget: input.muscleBudget,
  });

  const summary = buildSummary({
    goal: input.goal,
    status,
    limitingFactor,
  });
  const mainAdvice = buildMainAdvice({
    status,
    limitingFactor,
    concreteChange,
    goal: input.goal,
  });

  const recoveryChipLabel =
    input.trainingGap.status === "recovery_first"
      ? "Behöver lugnare vecka"
      : recoveryScore >= 80
        ? "Okej"
        : "Lite ansträngt";

  const specificityChipLabel =
    input.goal === "strength"
      ? `${Math.round(specificityScore)}%`
      : input.goal === "hypertrophy"
        ? `${Math.round(muscleVolumeRatio * 100)}%`
        : "Balanserad";

  return {
    score,
    status,
    headline: buildStatusHeadline(status, score),
    summary,
    mainAdvice,
    concreteChange,
    limitingFactor,
    chips: [
      {
        label: "Frekvens",
        status: toChipStatus(frequencyScore),
        value: `${metrics.completedSessions7d}/${reference.targetSessions} pass`,
      },
      {
        label: input.goal === "strength" ? "Specificitet" : "Volym",
        status: toChipStatus(input.goal === "strength" ? specificityScore : volumeScore),
        value:
          input.goal === "strength"
            ? specificityChipLabel
            : `${metrics.completedMinutes7d}/${reference.targetMinutes} min`,
      },
      {
        label: "Återhämtning",
        status: toChipStatus(recoveryScore),
        value: recoveryChipLabel,
      },
    ],
    confidence,
  };
}
