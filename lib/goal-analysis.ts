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

export type GoalBenchmarkProfile = {
  label: string;
  weeklyFrequencyMin: number;
  weeklyFrequencyIdeal: number;
  weeklyFrequencyTargetLabel: string;
  sets28dMin: number;
  sets28dIdeal: number;
  sets28dTargetLabel: string;
  varietyMin: number;
  varietyIdeal: number;
  varietyTargetLabel: string;
  averageWorkoutMinutesMin: number;
  averageWorkoutMinutesIdeal: number;
  primaryAdvice: string;
};

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
  frequencyVsGoalScore: number;
  volumeVsGoalScore: number;
  varietyVsGoalScore: number;
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
    benchmark: GoalBenchmarkProfile;
  };
};

const GOAL_BENCHMARKS: Record<GoalType, GoalBenchmarkProfile> = {
  strength: {
    label: "Styrka",
    weeklyFrequencyMin: 2,
    weeklyFrequencyIdeal: 3,
    weeklyFrequencyTargetLabel: "2–4 pass / vecka",
    sets28dMin: 32,
    sets28dIdeal: 48,
    sets28dTargetLabel: "32–64 set / 28 dagar",
    varietyMin: 4,
    varietyIdeal: 6,
    varietyTargetLabel: "måttlig variation",
    averageWorkoutMinutesMin: 20,
    averageWorkoutMinutesIdeal: 45,
    primaryAdvice:
      "För styrkemål behöver du regelbundna pass, tydliga huvudövningar och tillräcklig återhämtning mellan tyngre belastningar.",
  },
  hypertrophy: {
    label: "Muskelbyggnad",
    weeklyFrequencyMin: 3,
    weeklyFrequencyIdeal: 4,
    weeklyFrequencyTargetLabel: "3–5 pass / vecka",
    sets28dMin: 48,
    sets28dIdeal: 72,
    sets28dTargetLabel: "48–96 set / 28 dagar",
    varietyMin: 6,
    varietyIdeal: 8,
    varietyTargetLabel: "god övningsbredd",
    averageWorkoutMinutesMin: 25,
    averageWorkoutMinutesIdeal: 50,
    primaryAdvice:
      "För hypertrofi behöver du oftast både tillräcklig träningsfrekvens och tillräcklig total veckovolym. För lite pass eller för få set gör att muskelbyggnaden bromsas.",
  },
  health: {
    label: "Hälsa och funktion",
    weeklyFrequencyMin: 2,
    weeklyFrequencyIdeal: 3,
    weeklyFrequencyTargetLabel: "2–4 pass / vecka",
    sets28dMin: 28,
    sets28dIdeal: 44,
    sets28dTargetLabel: "28–64 set / 28 dagar",
    varietyMin: 6,
    varietyIdeal: 8,
    varietyTargetLabel: "bred helkroppstäckning",
    averageWorkoutMinutesMin: 20,
    averageWorkoutMinutesIdeal: 40,
    primaryAdvice:
      "För hälsomål är hållbar regelbundenhet och bred helkroppstäckning viktigare än maximal belastning i enskilda pass.",
  },
  body_composition: {
    label: "Kroppssammansättning",
    weeklyFrequencyMin: 3,
    weeklyFrequencyIdeal: 4,
    weeklyFrequencyTargetLabel: "3–5 pass / vecka",
    sets28dMin: 40,
    sets28dIdeal: 60,
    sets28dTargetLabel: "40–84 set / 28 dagar",
    varietyMin: 5,
    varietyIdeal: 7,
    varietyTargetLabel: "god övningsbredd",
    averageWorkoutMinutesMin: 20,
    averageWorkoutMinutesIdeal: 45,
    primaryAdvice:
      "För kroppssammansättning behöver du framför allt jämn träningsfrekvens och tillräcklig mängd arbete över tid, inte bara enstaka hårda pass.",
  },
};

/**
 * Publik benchmarkprofil så dashboard och andra delar använder samma målbild.
 */
export function getGoalBenchmarkProfile(goal: GoalType): GoalBenchmarkProfile {
  return GOAL_BENCHMARKS[goal];
}

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
        frequency: 0.16,
        consistency: 0.15,
        progression: 0.24,
        volume: 0.14,
        recovery: 0.19,
        variety: 0.06,
        goalAlignment: 0.06,
      };

    case "hypertrophy":
      return {
        frequency: 0.16,
        consistency: 0.14,
        progression: 0.16,
        volume: 0.24,
        recovery: 0.1,
        variety: 0.1,
        goalAlignment: 0.1,
      };

    case "health":
      return {
        frequency: 0.24,
        consistency: 0.2,
        progression: 0.08,
        volume: 0.1,
        recovery: 0.16,
        variety: 0.1,
        goalAlignment: 0.12,
      };

    case "body_composition":
      return {
        frequency: 0.22,
        consistency: 0.18,
        progression: 0.12,
        volume: 0.18,
        recovery: 0.08,
        variety: 0.08,
        goalAlignment: 0.14,
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
  const benchmark = getGoalBenchmarkProfile(goal);
  return clamp(uniqueExercises28d / benchmark.varietyIdeal);
}

/**
 * Hur väl passfrekvensen möter målets krav.
 */
function calculateFrequencyVsGoalScore(
  weeklyFrequency: number,
  goal: GoalType
) {
  const benchmark = getGoalBenchmarkProfile(goal);
  return clamp(weeklyFrequency / benchmark.weeklyFrequencyIdeal);
}

/**
 * Hur väl den totala mängden set möter målets krav.
 */
function calculateVolumeVsGoalScore(totalSets28d: number, goal: GoalType) {
  const benchmark = getGoalBenchmarkProfile(goal);
  return clamp(totalSets28d / benchmark.sets28dIdeal);
}

/**
 * Hur väl övningsbredden möter målets krav.
 */
function calculateVarietyVsGoalScore(
  uniqueExercises28d: number,
  goal: GoalType
) {
  const benchmark = getGoalBenchmarkProfile(goal);
  return clamp(uniqueExercises28d / benchmark.varietyIdeal);
}

/**
 * Styrkor för UI.
 */
function buildStrengths(metrics: TrainingMetrics, goal: GoalType): string[] {
  const strengths: string[] = [];
  const benchmark = getGoalBenchmarkProfile(goal);

  if (metrics.weeklyFrequency >= benchmark.weeklyFrequencyMin) {
    strengths.push("Du tränar tillräckligt ofta för att bygga vidare.");
  }

  if (metrics.consistencyScore >= 0.7) {
    strengths.push("Du har en ganska jämn träningsrytm.");
  }

  if (metrics.recoveryScore >= 0.7) {
    strengths.push("Balansen mellan pass och vila ser rimlig ut.");
  }

  if (metrics.totalSets28d >= benchmark.sets28dMin) {
    strengths.push("Du får in en träningsmängd som börjar räcka för målet.");
  }

  if (metrics.progressionScore >= 0.7) {
    strengths.push("Den senaste perioden ser stabil eller förbättrad ut.");
  }

  if (metrics.uniqueExercises28d >= benchmark.varietyMin) {
    strengths.push("Övningsbredden är tillräcklig för att ge bra stimulans.");
  }

  return strengths.slice(0, 3);
}

/**
 * Luckor för UI.
 */
function buildGaps(metrics: TrainingMetrics, goal: GoalType): string[] {
  const gaps: string[] = [];
  const benchmark = getGoalBenchmarkProfile(goal);

  if (metrics.weeklyFrequency < benchmark.weeklyFrequencyMin) {
    gaps.push(
      `Du ligger på ${metrics.weeklyFrequency.toFixed(
        1
      )} pass per vecka, vilket är för lågt för målet just nu.`
    );
  }

  if (metrics.consistencyScore < 0.5) {
    gaps.push("Passen kommer ganska ojämnt över veckorna.");
  }

  if (goal !== "health" && metrics.totalSets28d < benchmark.sets28dMin) {
    gaps.push(
      `Du får in ${metrics.totalSets28d} set på 28 dagar, men målet kräver ungefär minst ${benchmark.sets28dMin}.`
    );
  }

  if (goal === "health" && metrics.uniqueExercises28d < benchmark.varietyMin) {
    gaps.push("Helkroppstäckningen är lite för smal just nu.");
  }

  if (metrics.progressionScore < 0.5) {
    gaps.push("Senaste perioden visar inte ännu någon tydlig framåtrörelse.");
  }

  return gaps.slice(0, 4);
}

/**
 * Kort sammanfattning.
 */
function buildSummary(
  status: GoalStatus,
  goal: GoalType,
  metrics: TrainingMetrics
) {
  const benchmark = getGoalBenchmarkProfile(goal);
  const goalText = benchmark.label.toLowerCase();

  if (status === "on_track") {
    return `Du ligger bra till i din träning mot målet ${goalText}. Fortsätt bygga vidare med jämn belastning och små steg framåt.`;
  }

  if (status === "needs_attention") {
    return `Just nu matchar träningen inte målet ${goalText} tillräckligt bra. Du ligger på ${metrics.weeklyFrequency.toFixed(
      1
    )} pass per vecka och ${metrics.totalSets28d} set senaste 28 dagarna, så första steget är att höja regelbundenhet och total mängd.`;
  }

  return `Du har en stabil grund mot målet ${goalText}, men för att ta nästa steg behöver träningen bli lite mer konsekvent eller lite bättre anpassad till målets krav.`;
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
  const benchmark = getGoalBenchmarkProfile(goal);

  if (metrics.weeklyFrequency < benchmark.weeklyFrequencyMin) {
    areas.push({
      id: "frequency",
      title: "Öka träningsfrekvensen",
      reason: `Du ligger på ${metrics.weeklyFrequency.toFixed(
        1
      )} pass per vecka, men för målet behövs ungefär ${benchmark.weeklyFrequencyTargetLabel}.`,
      priority: getPriorityFromScore(metrics.frequencyVsGoalScore),
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

  if (goal === "hypertrophy" || goal === "body_composition") {
    if (metrics.totalSets28d < benchmark.sets28dMin) {
      areas.push({
        id: "volume",
        title: "Mer total träningsmängd",
        reason: `Du får in ${metrics.totalSets28d} set på 28 dagar, men för målet behövs ungefär minst ${benchmark.sets28dMin}.`,
        priority: getPriorityFromScore(metrics.volumeVsGoalScore),
        metric: "volumeVsGoalScore",
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

  if (goal === "health" && metrics.uniqueExercises28d < benchmark.varietyMin) {
    areas.push({
      id: "variety",
      title: "Bredda övningsvalet",
      reason: `Du ligger på ${metrics.uniqueExercises28d} unika övningar senaste 28 dagarna. För målet behövs ungefär ${benchmark.varietyTargetLabel}.`,
      priority: getPriorityFromScore(metrics.varietyVsGoalScore),
      metric: "exerciseVarietyScore",
    });
  }

  if (metrics.progressionScore < 0.6) {
    areas.push({
      id: "progression",
      title: "Tydligare framåtrörelse",
      reason:
        "Den senaste perioden visar ännu inte en tydlig positiv trend, så du behöver bygga mer stabil kontinuitet eller lite högre träningsmängd.",
      priority: getPriorityFromScore(metrics.progressionScore),
      metric: "progressionScore",
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
  const benchmark = getGoalBenchmarkProfile(goal);

  if (metrics.weeklyFrequency < benchmark.weeklyFrequencyMin) {
    recommendations.push({
      id: "raise-frequency",
      title: "Höj veckofrekvensen direkt",
      description: `Du ligger nu på ${metrics.weeklyFrequency.toFixed(
        1
      )} pass per vecka. Sikta först på minst ${benchmark.weeklyFrequencyMin} pass per vecka innan du försöker optimera detaljer.`,
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

    if (metrics.recoveryScore < 0.6) {
      recommendations.push({
        id: "strength-recovery",
        title: "Lägg de tyngsta passen glesare",
        description:
          "För styrka blir kvaliteten ofta bättre om de mest belastande passen inte ligger för tätt. Försök få minst en lugnare dag mellan tyngre pass.",
        timeframe: "next_7_days",
      });
    }
  }

  if (goal === "hypertrophy") {
    if (metrics.totalSets28d < benchmark.sets28dMin) {
      recommendations.push({
        id: "hypertrophy-volume",
        title: "Öka antalet arbetsset",
        description: `Du ligger på ${metrics.totalSets28d} set senaste 28 dagarna. För muskelbyggnad behöver du komma närmare minst ${benchmark.sets28dMin} set på 28 dagar.`,
        timeframe: "next_7_days",
      });
    }

    recommendations.push({
      id: "hypertrophy-repeat-muscles",
      title: "Låt större muskelgrupper återkomma oftare",
      description:
        "Se till att samma större muskelgrupper stimuleras flera gånger under veckan, inte bara i enstaka pass.",
      timeframe: "next_14_days",
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
    if (metrics.totalSets28d < benchmark.sets28dMin) {
      recommendations.push({
        id: "body-comp-volume",
        title: "Öka träningsmängden något",
        description: `Du behöver sannolikt lite fler arbetsset över veckan. Sikta mot minst ${benchmark.sets28dMin} set på 28 dagar som första nivå.`,
        timeframe: "next_7_days",
      });
    }

    recommendations.push({
      id: "body-comp-density",
      title: "Behåll styrkan men håll tempot uppe",
      description:
        "Fortsätt prioritera styrkeövningar men undvik onödigt långa pauser i hela passet när målet är kroppssammansättning.",
      timeframe: "next_workout",
    });
  }

  if (goal !== "strength" && metrics.uniqueExercises28d < benchmark.varietyMin) {
    recommendations.push({
      id: "add-one-exercise",
      title: "Lägg till en kompletterande övning",
      description:
        "Nästa pass kan gärna innehålla en övning du använder mer sällan för att bredda stimulansen och förbättra balansen.",
      timeframe: "next_workout",
    });
  }

  return recommendations.slice(0, 6);
}

/**
 * Huvudfunktion.
 */
export function analyzeTraining(logs: WorkoutLog[], goal: GoalType): GoalAnalysis {
  const completedLogs = getCompletedLogs(logs);
  const now = new Date();
  const benchmark = getGoalBenchmarkProfile(goal);

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
  const frequencyVsGoalScore = calculateFrequencyVsGoalScore(weeklyFrequency, goal);
  const volumeVsGoalScore = calculateVolumeVsGoalScore(totalSets28d, goal);
  const varietyVsGoalScore = calculateVarietyVsGoalScore(uniqueExercises28d, goal);

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
    frequencyVsGoalScore: round(frequencyVsGoalScore, 2),
    volumeVsGoalScore: round(volumeVsGoalScore, 2),
    varietyVsGoalScore: round(varietyVsGoalScore, 2),
  };

  const weights = getGoalWeights(goal);
  const goalAlignmentScore = round(
    (frequencyVsGoalScore + volumeVsGoalScore + varietyVsGoalScore) / 3,
    2
  );

  const overallScore = round(
    metrics.frequencyVsGoalScore * weights.frequency +
      metrics.consistencyScore * weights.consistency +
      metrics.progressionScore * weights.progression +
      metrics.volumeScore * weights.volume +
      metrics.recoveryScore * weights.recovery +
      metrics.exerciseVarietyScore * weights.variety +
      goalAlignmentScore * weights.goalAlignment,
    2
  );

  let status: GoalStatus = "steady";
  if (
    overallScore >= 0.72 &&
    metrics.weeklyFrequency >= benchmark.weeklyFrequencyMin &&
    metrics.totalSets28d >= benchmark.sets28dMin
  ) {
    status = "on_track";
  } else if (
    overallScore < 0.45 ||
    metrics.weeklyFrequency < benchmark.weeklyFrequencyMin * 0.8 ||
    metrics.totalSets28d < benchmark.sets28dMin * 0.65
  ) {
    status = "needs_attention";
  }

  return {
    goal,
    metrics,
    evaluation: {
      status,
      overallScore,
      summary: buildSummary(status, goal, metrics),
      strengths: buildStrengths(metrics, goal),
      gaps: buildGaps(metrics, goal),
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
      benchmark,
    },
  };
}