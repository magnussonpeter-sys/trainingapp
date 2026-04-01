// lib/goal-analysis.ts

import type { WorkoutLog } from "@/lib/workout-log-storage";

/**
 * Grundmål som redan används i appen.
 * Lätt att bygga ut senare med mer specifika mål.
 */
export type GoalType =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

export type GoalStatus = "on_track" | "steady" | "needs_attention";
export type FocusPriority = "high" | "medium" | "low";
export type RecommendationTimeframe =
  | "next_workout"
  | "next_7_days"
  | "next_14_days";

export type TrainingMetrics = {
  weeklyFrequency: number;
  consistencyScore: number;
  progressionScore: number;
  volumeScore: number;
  recoveryScore: number;
  exerciseVarietyScore: number;
  averageWorkoutMinutes: number;
  completedWorkouts28d: number;
  uniqueExercises28d: number;
  totalSets28d: number;
};

export type GoalEvaluation = {
  status: GoalStatus;
  overallScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
};

export type FocusArea = {
  id: string;
  title: string;
  reason: string;
  priority: FocusPriority;
  metric: string;
};

export type GoalRecommendation = {
  id: string;
  title: string;
  description: string;
  timeframe: RecommendationTimeframe;
};

export type GoalAnalysis = {
  goal: GoalType;
  metrics: TrainingMetrics;
  evaluation: GoalEvaluation;
  focusAreas: FocusArea[];
  recommendations: GoalRecommendation[];
  debug: {
    totalLogs: number;
    completedLogs: number;
    recentLogs28d: number;
    previousLogs28d: number;
    totalSets28d: number;
    uniqueExercises28d: number;
    averageGapDays: number | null;
    averageWorkoutMinutes: number;
    goalWeights: Record<string, number>;
  };
};

/**
 * Hjälpfunktion för att hålla värden inom ett intervall.
 */
function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Avrundning för UI/debug.
 */
function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Antal dagar mellan två datum.
 */
function diffDays(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Bara completed-pass ska räknas.
 */
function getCompletedLogs(logs: WorkoutLog[]) {
  return logs
    .filter((log) => log.status === "completed")
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
}

/**
 * Enkel proxy för träningsvolym: antal set.
 */
function countSets(logs: WorkoutLog[]) {
  let totalSets = 0;

  for (const log of logs) {
    for (const exercise of log.exercises) {
      totalSets += exercise.sets.length;
    }
  }

  return totalSets;
}

/**
 * Räknar unika övningar senaste perioden.
 */
function countUniqueExercises(logs: WorkoutLog[]) {
  const ids = new Set<string>();

  for (const log of logs) {
    for (const exercise of log.exercises) {
      ids.add(exercise.exerciseId);
    }
  }

  return ids.size;
}

/**
 * Snittdagar mellan pass.
 */
function getAverageGapDays(logs: WorkoutLog[]) {
  if (logs.length < 2) {
    return null;
  }

  const gaps: number[] = [];

  for (let index = 1; index < logs.length; index += 1) {
    const previous = new Date(logs[index - 1].startedAt);
    const current = new Date(logs[index].startedAt);

    gaps.push(diffDays(previous, current));
  }

  const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

  return average;
}

/**
 * Snittlängd på pass i minuter.
 */
function getAverageWorkoutMinutes(logs: WorkoutLog[]) {
  if (logs.length === 0) {
    return 0;
  }

  const totalSeconds = logs.reduce(
    (sum, log) => sum + Math.max(0, log.durationSeconds),
    0
  );

  return round(totalSeconds / logs.length / 60, 1);
}

/**
 * Målvikter för totalbedömningen.
 */
function getGoalWeights(goal: GoalType) {
  switch (goal) {
    case "strength":
      return {
        frequency: 0.18,
        consistency: 0.16,
        progression: 0.26,
        volume: 0.14,
        recovery: 0.18,
        variety: 0.08,
      };

    case "hypertrophy":
      return {
        frequency: 0.18,
        consistency: 0.16,
        progression: 0.18,
        volume: 0.26,
        recovery: 0.1,
        variety: 0.12,
      };

    case "health":
      return {
        frequency: 0.28,
        consistency: 0.22,
        progression: 0.1,
        volume: 0.1,
        recovery: 0.18,
        variety: 0.12,
      };

    case "body_composition":
      return {
        frequency: 0.26,
        consistency: 0.2,
        progression: 0.14,
        volume: 0.18,
        recovery: 0.1,
        variety: 0.12,
      };
  }
}

/**
 * Enkel trendmodell mellan två 28-dagarsperioder.
 */
function calculateProgressionScore(
  recent28dCount: number,
  previous28dCount: number
) {
  if (recent28dCount === 0) {
    return 0;
  }

  if (previous28dCount === 0) {
    return 0.65;
  }

  const ratio = recent28dCount / previous28dCount;

  if (ratio >= 1.1) return 0.9;
  if (ratio >= 0.9) return 0.75;
  if (ratio >= 0.7) return 0.55;

  return 0.3;
}

/**
 * Enkel variationssignal.
 */
function calculateExerciseVarietyScore(
  uniqueExercises28d: number,
  goal: GoalType
) {
  switch (goal) {
    case "strength":
      return clamp(uniqueExercises28d / 8);
    case "hypertrophy":
      return clamp(uniqueExercises28d / 10);
    case "health":
      return clamp(uniqueExercises28d / 10);
    case "body_composition":
      return clamp(uniqueExercises28d / 9);
  }
}

/**
 * Styrkor för UI.
 */
function buildStrengths(metrics: TrainingMetrics): string[] {
  const strengths: string[] = [];

  if (metrics.weeklyFrequency >= 2) {
    strengths.push("Du tränar tillräckligt ofta för att bygga vidare.");
  }

  if (metrics.consistencyScore >= 0.7) {
    strengths.push("Du har en ganska jämn träningsrytm.");
  }

  if (metrics.recoveryScore >= 0.7) {
    strengths.push("Balansen mellan pass och vila ser rimlig ut.");
  }

  if (metrics.volumeScore >= 0.65) {
    strengths.push("Du får in en bra total träningsmängd.");
  }

  if (metrics.progressionScore >= 0.7) {
    strengths.push("Den senaste perioden ser stabil eller förbättrad ut.");
  }

  if (metrics.exerciseVarietyScore >= 0.7) {
    strengths.push("Du får in en bra bredd i övningsvalet.");
  }

  return strengths.slice(0, 3);
}

/**
 * Luckor för UI.
 */
function buildGaps(metrics: TrainingMetrics): string[] {
  const gaps: string[] = [];

  if (metrics.weeklyFrequency < 1.5) {
    gaps.push("Träningsfrekvensen är lite för låg just nu.");
  }

  if (metrics.consistencyScore < 0.5) {
    gaps.push("Passen kommer ganska ojämnt över veckorna.");
  }

  if (metrics.recoveryScore < 0.45) {
    gaps.push("Återhämtningen mellan passen verkar mindre optimal.");
  }

  if (metrics.volumeScore < 0.4) {
    gaps.push("Den totala träningsmängden senaste tiden är ganska låg.");
  }

  if (metrics.progressionScore < 0.5) {
    gaps.push("Senaste perioden visar inte ännu någon tydlig framåtrörelse.");
  }

  if (metrics.exerciseVarietyScore < 0.35) {
    gaps.push("Övningsbredden är låg och kan begränsa utvecklingen.");
  }

  return gaps.slice(0, 3);
}

/**
 * Kort sammanfattning.
 */
function buildSummary(status: GoalStatus, goal: GoalType) {
  const goalTextMap: Record<GoalType, string> = {
    strength: "styrka",
    hypertrophy: "muskelbyggnad",
    health: "hälsa och funktion",
    body_composition: "kroppssammansättning",
  };

  const goalText = goalTextMap[goal];

  switch (status) {
    case "on_track":
      return `Du ligger bra till i din träning mot målet ${goalText}. Fortsätt bygga vidare med jämn belastning och små steg framåt.`;
    case "needs_attention":
      return `Just nu är träningen lite för ojämn eller låg i förhållande till målet ${goalText}. Fokus bör vara att skapa mer regelbundenhet först.`;
    case "steady":
    default:
      return `Du har en stabil grund mot målet ${goalText}, men det finns tydlig potential att förbättra kontinuitet och progression.`;
  }
}

function getPriorityFromScore(value: number): FocusPriority {
  if (value < 0.45) return "high";
  if (value < 0.65) return "medium";
  return "low";
}

/**
 * Fokusområden som kan visas utan AI.
 */
function buildFocusAreas(goal: GoalType, metrics: TrainingMetrics): FocusArea[] {
  const areas: FocusArea[] = [];

  if (metrics.weeklyFrequency < 2) {
    areas.push({
      id: "frequency",
      title: "Öka träningsfrekvensen",
      reason:
        "Du får just nu in för få pass per vecka för att skapa tydlig utveckling.",
      priority: getPriorityFromScore(metrics.weeklyFrequency / 2),
      metric: "weeklyFrequency",
    });
  }

  if (metrics.consistencyScore < 0.65) {
    areas.push({
      id: "consistency",
      title: "Jämnare träningsrytm",
      reason:
        "Passen är ojämnt fördelade, vilket gör progressionen mindre stabil.",
      priority: getPriorityFromScore(metrics.consistencyScore),
      metric: "consistencyScore",
    });
  }

  if (metrics.progressionScore < 0.6) {
    areas.push({
      id: "progression",
      title: "Tydligare framåtrörelse",
      reason:
        "Den senaste perioden visar ännu inte en tydlig positiv trend.",
      priority: getPriorityFromScore(metrics.progressionScore),
      metric: "progressionScore",
    });
  }

  if (goal === "hypertrophy" || goal === "body_composition") {
    if (metrics.volumeScore < 0.65) {
      areas.push({
        id: "volume",
        title: "Mer total träningsmängd",
        reason:
          "För ditt mål behövs oftast lite högre träningsvolym över veckan.",
        priority: getPriorityFromScore(metrics.volumeScore),
        metric: "volumeScore",
      });
    }
  }

  if (goal === "strength" && metrics.recoveryScore < 0.6) {
    areas.push({
      id: "recovery",
      title: "Bättre återhämtning mellan tunga pass",
      reason:
        "För styrkemål behöver belastningen spridas så att kvaliteten i passen hålls hög.",
      priority: getPriorityFromScore(metrics.recoveryScore),
      metric: "recoveryScore",
    });
  }

  if (goal === "health" && metrics.exerciseVarietyScore < 0.55) {
    areas.push({
      id: "variety",
      title: "Bredda övningsvalet",
      reason:
        "Lite större variation kan förbättra funktion, motivation och helkroppstäckning.",
      priority: getPriorityFromScore(metrics.exerciseVarietyScore),
      metric: "exerciseVarietyScore",
    });
  }

  const priorityRank: Record<FocusPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return areas
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 4);
}

/**
 * Konkreta råd.
 */
function buildRecommendations(
  goal: GoalType,
  metrics: TrainingMetrics
): GoalRecommendation[] {
  const recommendations: GoalRecommendation[] = [];

  if (metrics.weeklyFrequency < 2) {
    recommendations.push({
      id: "add-one-session",
      title: "Planera in ett extra pass denna vecka",
      description:
        "Försök få in minst ett extra kort pass de kommande 7 dagarna. Regelbundenhet är just nu den viktigaste förbättringen.",
      timeframe: "next_7_days",
    });
  }

  if (metrics.consistencyScore < 0.65) {
    recommendations.push({
      id: "spread-training",
      title: "Sprid ut passen jämnare",
      description:
        "Försök undvika att samla flera pass för tätt och sedan få långa uppehåll. En jämn rytm ger bättre effekt.",
      timeframe: "next_14_days",
    });
  }

  if (goal === "strength") {
    recommendations.push({
      id: "strength-next-workout",
      title: "Låt nästa pass ha tydlig huvudövning",
      description:
        "Välj en huvudövning där kvalitet och fokus är hög, och håll resten av passet lite enklare så att progressionen blir tydligare.",
      timeframe: "next_workout",
    });
  }

  if (goal === "hypertrophy") {
    recommendations.push({
      id: "hypertrophy-volume",
      title: "Höj veckovolymen något",
      description:
        "Lägg gärna till några extra arbetsset i 1–2 övningar under veckan för att öka stimulansen för muskelbyggnad.",
      timeframe: "next_7_days",
    });
  }

  if (goal === "health") {
    recommendations.push({
      id: "health-full-body",
      title: "Sikta på helkroppstäckning",
      description:
        "Försök få med ben, drag, press och bål över veckan. Det ger en mer hållbar och funktionell träningsbas.",
      timeframe: "next_7_days",
    });
  }

  if (goal === "body_composition") {
    recommendations.push({
      id: "body-comp-density",
      title: "Behåll styrkan men håll tempot uppe",
      description:
        "Fortsätt prioritera styrkeövningar men undvik onödigt långa pauser i hela passet när målet är kroppssammansättning.",
      timeframe: "next_workout",
    });
  }

  if (metrics.exerciseVarietyScore < 0.45) {
    recommendations.push({
      id: "add-one-exercise",
      title: "Lägg till en kompletterande övning",
      description:
        "Nästa pass kan gärna innehålla en övning du använder mer sällan för att bredda stimulansen och förbättra balansen.",
      timeframe: "next_workout",
    });
  }

  if (metrics.recoveryScore < 0.5) {
    recommendations.push({
      id: "protect-recovery",
      title: "Skydda återhämtningen",
      description:
        "Planera så att de lite tyngre passen inte hamnar för tätt. Det ökar chansen att nästa pass håller bättre kvalitet.",
      timeframe: "next_7_days",
    });
  }

  return recommendations.slice(0, 5);
}

/**
 * Huvudfunktion.
 */
export function analyzeTraining(logs: WorkoutLog[], goal: GoalType): GoalAnalysis {
  const completedLogs = getCompletedLogs(logs);
  const now = new Date();

  const recent28d = completedLogs.filter(
    (log) => diffDays(new Date(log.startedAt), now) <= 28
  );

  const previous28d = completedLogs.filter((log) => {
    const days = diffDays(new Date(log.startedAt), now);
    return days > 28 && days <= 56;
  });

  const weeklyFrequency = round(recent28d.length / 4, 2);
  const averageGapDays = getAverageGapDays(recent28d);

  let consistencyScore = 0;

  if (averageGapDays !== null) {
    const distanceFromIdeal = Math.abs(averageGapDays - 3);
    consistencyScore = clamp(1 - distanceFromIdeal / 5);
  } else if (recent28d.length === 1) {
    consistencyScore = 0.3;
  }

  const totalSets28d = countSets(recent28d);
  const volumeScore = clamp(totalSets28d / 90);

  let recoveryScore = 0.5;

  if (averageGapDays !== null) {
    if (averageGapDays >= 1.5 && averageGapDays <= 4) {
      recoveryScore = 0.85;
    } else if (averageGapDays >= 1 && averageGapDays <= 5) {
      recoveryScore = 0.65;
    } else {
      recoveryScore = 0.35;
    }
  } else if (recent28d.length <= 1) {
    recoveryScore = 0.45;
  }

  const progressionScore = calculateProgressionScore(
    recent28d.length,
    previous28d.length
  );

  const uniqueExercises28d = countUniqueExercises(recent28d);
  const exerciseVarietyScore = calculateExerciseVarietyScore(
    uniqueExercises28d,
    goal
  );
  const averageWorkoutMinutes = getAverageWorkoutMinutes(recent28d);

  const metrics: TrainingMetrics = {
    weeklyFrequency,
    consistencyScore: round(consistencyScore, 2),
    progressionScore: round(progressionScore, 2),
    volumeScore: round(volumeScore, 2),
    recoveryScore: round(recoveryScore, 2),
    exerciseVarietyScore: round(exerciseVarietyScore, 2),
    averageWorkoutMinutes,
    completedWorkouts28d: recent28d.length,
    uniqueExercises28d,
    totalSets28d,
  };

  const weights = getGoalWeights(goal);
  const normalizedFrequencyScore = clamp(weeklyFrequency / 3);

  const overallScore = round(
    normalizedFrequencyScore * weights.frequency +
      metrics.consistencyScore * weights.consistency +
      metrics.progressionScore * weights.progression +
      metrics.volumeScore * weights.volume +
      metrics.recoveryScore * weights.recovery +
      metrics.exerciseVarietyScore * weights.variety,
    2
  );

  let status: GoalStatus = "steady";

  if (overallScore >= 0.72) {
    status = "on_track";
  } else if (overallScore < 0.45) {
    status = "needs_attention";
  }

  return {
    goal,
    metrics,
    evaluation: {
      status,
      overallScore,
      summary: buildSummary(status, goal),
      strengths: buildStrengths(metrics),
      gaps: buildGaps(metrics),
    },
    focusAreas: buildFocusAreas(goal, metrics),
    recommendations: buildRecommendations(goal, metrics),
    debug: {
      totalLogs: logs.length,
      completedLogs: completedLogs.length,
      recentLogs28d: recent28d.length,
      previousLogs28d: previous28d.length,
      totalSets28d,
      uniqueExercises28d,
      averageGapDays: averageGapDays === null ? null : round(averageGapDays, 2),
      averageWorkoutMinutes,
      goalWeights: weights,
    },
  };
}