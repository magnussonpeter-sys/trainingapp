import { getExerciseById } from "@/lib/exercise-catalog";
import type { MuscleBudgetEntry, MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { WorkoutLog } from "@/lib/workout-log-storage";

export type TrainingGapStatus =
  | "on_track"
  | "minor_gap"
  | "major_gap"
  | "recovery_first"
  | "insufficient_data";

export type CatchUpOption = {
  id: "one_normal_session" | "two_short_sessions" | "accept_light_week";
  label: string;
  description: string;
  sessions: number;
  minutesPerSession: number;
  focusMuscles: MuscleBudgetGroup[];
};

export type ThirtyDayTrainingEffectStatus =
  | "insufficient_data"
  | "below_maintenance"
  | "maintenance"
  | "small_positive"
  | "productive"
  | "high_but_recovery_limited";

export type MuscleEffectEstimate = {
  muscle: MuscleBudgetGroup;
  plannedSets: number;
  completedSets: number;
  completionRatio: number;
  estimatedEffect:
    | "below_maintenance"
    | "maintenance"
    | "small_positive"
    | "productive"
    | "possibly_excessive";
  message: string;
};

export type ThirtyDayTrainingEffect = {
  status: ThirtyDayTrainingEffectStatus;
  plannedSessions: number;
  completedSessions: number;
  sessionCompletionRatio: number;
  plannedMinutes: number;
  completedMinutes: number;
  minuteCompletionRatio: number;
  plannedSets: number;
  completedSets: number;
  setCompletionRatio: number;
  estimatedEffectLabel: string;
  estimatedEffectMessage: string;
  muscleEstimates: MuscleEffectEstimate[];
  limitingFactors: string[];
  positiveSignals: string[];
  confidence: "low" | "medium" | "high";
};

export type TrainingGap = {
  status: TrainingGapStatus;
  completionRatio: number;
  plannedSessions: number;
  completedSessions: number;
  plannedMinutes: number;
  completedMinutes: number;
  missingMinutes: number;
  missingSets: number;
  missingMuscles: MuscleBudgetGroup[];
  suggestedCatchUpOptions: CatchUpOption[];
  message: string;
  thirtyDayEffect?: ThirtyDayTrainingEffect;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function createEmptyMuscleTotals() {
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

function getStartOfWeek(value: Date) {
  const start = new Date(value);
  const weekday = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - weekday);
  return start;
}

function getCompletedLogs(logs: WorkoutLog[]) {
  return logs.filter((log) => log.status === "completed");
}

function filterCompletedLogsWithinDays(logs: WorkoutLog[], now: Date, days: number) {
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  return getCompletedLogs(logs).filter((log) => {
    const completedAtMs = new Date(log.completedAt).getTime();
    return Number.isFinite(completedAtMs) && now.getTime() - completedAtMs <= thresholdMs;
  });
}

function getCompletedLogsThisWeek(logs: WorkoutLog[], now: Date) {
  const weekStart = getStartOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  return getCompletedLogs(logs).filter((log) => {
    const completedAt = new Date(log.completedAt);
    return Number.isFinite(completedAt.getTime()) && completedAt >= weekStart && completedAt < weekEnd;
  });
}

function getSetCountForExercise(logExercise: WorkoutLog["exercises"][number]) {
  return logExercise.sets.length > 0
    ? logExercise.sets.length
    : Math.max(0, logExercise.plannedSets ?? 0);
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

function summarizeThirtyDayMuscleSets(logs: WorkoutLog[]) {
  const totals = createEmptyMuscleTotals();

  for (const log of logs) {
    for (const exercise of log.exercises) {
      const catalogExercise = getExerciseById(exercise.exerciseId);

      if (!catalogExercise) {
        continue;
      }

      const setCount = getSetCountForExercise(exercise);

      addStimulus(totals, catalogExercise.primaryMuscles, setCount, 1);
      addStimulus(totals, catalogExercise.secondaryMuscles, setCount, 0.5);
    }
  }

  return totals;
}

function getThirtyDayStatusCopy(status: ThirtyDayTrainingEffectStatus) {
  if (status === "below_maintenance") {
    return {
      label: "Troligen under mål",
      message:
        "Senaste 30 dagarna verkar träningsmängden vara för låg för tydlig utveckling. Den kan möjligen räcka för viss bibehållen vana, men inte optimalt för målet.",
    };
  }

  if (status === "maintenance") {
    return {
      label: "Främst underhåll",
      message:
        "Senaste 30 dagarna motsvarar ungefär en underhållsdos. Du har sannolikt gjort tillräckligt för att behålla mycket av styrkan, men för tydligare utveckling behövs lite mer regelbunden volym.",
    };
  }

  if (status === "small_positive") {
    return {
      label: "Liten positiv effekt",
      message:
        "Senaste 30 dagarna ger troligen en liten positiv träningsstimulus. För att närma dig målet snabbare kan kommande pass fylla på de muskler som fått minst volym.",
    };
  }

  if (status === "productive") {
    return {
      label: "Bra utvecklingszon",
      message:
        "Senaste 30 dagarna ligger nära en produktiv träningsmängd. Fortsätt med jämn volym och progression snarare än att pressa allt hårdare.",
    };
  }

  if (status === "high_but_recovery_limited") {
    return {
      label: "Hög volym – följ återhämtning",
      message:
        "Du har gjort mycket träning senaste 30 dagarna. Effekten kan bli god, men bara om återhämtningen hänger med.",
    };
  }

  return {
    label: "För lite data",
    message:
      "Jag behöver fler sparade pass innan jag kan uppskatta träningseffekten på ett meningsfullt sätt.",
  };
}

function getMuscleEstimateMessage(params: {
  effect: MuscleEffectEstimate["estimatedEffect"];
  averageSetsPerWeek: number;
}) {
  if (params.effect === "below_maintenance") {
    return `Cirka ${roundToSingleDecimal(params.averageSetsPerWeek)} set/vecka är sannolikt för lite för tydlig utveckling.`;
  }

  if (params.effect === "maintenance") {
    return `Cirka ${roundToSingleDecimal(params.averageSetsPerWeek)} set/vecka räcker troligen främst för underhåll.`;
  }

  if (params.effect === "small_positive") {
    return `Cirka ${roundToSingleDecimal(params.averageSetsPerWeek)} set/vecka ger troligen en liten positiv träningsstimulus.`;
  }

  if (params.effect === "productive") {
    return `Cirka ${roundToSingleDecimal(params.averageSetsPerWeek)} set/vecka ligger ofta i en produktiv zon.`;
  }

  return `Cirka ${roundToSingleDecimal(params.averageSetsPerWeek)} set/vecka är högt, så återhämtningen blir extra viktig.`;
}

function getMuscleEstimatedEffect(params: {
  averageSetsPerWeek: number;
  experienceLevel?: string | null;
}) {
  const thresholdAdjustment =
    params.experienceLevel === "advanced"
      ? 1
      : params.experienceLevel === "beginner" || params.experienceLevel === "novice"
        ? -1
        : 0;
  const averageSetsPerWeek = params.averageSetsPerWeek;

  // Volymzonerna är medvetet breda för att undvika falsk precision.
  if (averageSetsPerWeek < Math.max(1, 2 + thresholdAdjustment)) {
    return "below_maintenance" as const;
  }

  if (averageSetsPerWeek < 5 + thresholdAdjustment) {
    return "maintenance" as const;
  }

  if (averageSetsPerWeek < 10 + thresholdAdjustment) {
    return "small_positive" as const;
  }

  if (averageSetsPerWeek <= 18 + thresholdAdjustment) {
    return "productive" as const;
  }

  return "possibly_excessive" as const;
}

function buildThirtyDayTrainingEffect(params: {
  logs: WorkoutLog[];
  muscleBudget: MuscleBudgetEntry[];
  goal?: string | null;
  experienceLevel?: string | null;
  targetSessionsPerWeek: number;
  targetMinutesPerWeek?: number;
  now?: Date;
}): ThirtyDayTrainingEffect {
  const now = params.now ?? new Date();
  const recentLogs = filterCompletedLogsWithinDays(params.logs, now, 30);
  const completedSessions = recentLogs.length;
  const completedMinutes = recentLogs.reduce((sum, log) => {
    // durationSeconds finns i loggen; saknas det använder vi 0 som säker fallback.
    return sum + Math.max(0, Math.round((log.durationSeconds ?? 0) / 60));
  }, 0);
  const completedMuscleSets = summarizeThirtyDayMuscleSets(recentLogs);
  const completedSets = roundToSingleDecimal(
    Object.values(completedMuscleSets).reduce((sum, value) => sum + value, 0),
  );
  const thirtyDayMultiplier = 30 / 7;
  const plannedSessions = roundToSingleDecimal(
    Math.max(1, params.targetSessionsPerWeek) * thirtyDayMultiplier,
  );
  const plannedMinutes = roundToSingleDecimal(
    Math.max(
      20,
      (params.targetMinutesPerWeek ?? params.targetSessionsPerWeek * 30) * thirtyDayMultiplier,
    ),
  );
  const plannedSets = roundToSingleDecimal(
    params.muscleBudget.reduce((sum, entry) => sum + entry.targetSets, 0) * thirtyDayMultiplier,
  );
  const sessionCompletionRatio = clamp(
    plannedSessions > 0 ? completedSessions / plannedSessions : 0,
    0,
    1.5,
  );
  const minuteCompletionRatio = clamp(
    plannedMinutes > 0 ? completedMinutes / plannedMinutes : 0,
    0,
    1.5,
  );
  const setCompletionRatio = clamp(
    plannedSets > 0 ? completedSets / plannedSets : 0,
    0,
    1.5,
  );
  const highRiskGroups = params.muscleBudget.filter(
    (entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over",
  );
  const muscleEstimates = params.muscleBudget.map((entry) => {
    const plannedMuscleSets = roundToSingleDecimal(entry.targetSets * thirtyDayMultiplier);
    const completedMuscleSetsValue = roundToSingleDecimal(completedMuscleSets[entry.group] ?? 0);
    const completionRatio = clamp(
      plannedMuscleSets > 0 ? completedMuscleSetsValue / plannedMuscleSets : 0,
      0,
      1.5,
    );
    const averageSetsPerWeek = completedMuscleSetsValue / thirtyDayMultiplier;
    const estimatedEffect = getMuscleEstimatedEffect({
      averageSetsPerWeek,
      experienceLevel: params.experienceLevel,
    });

    return {
      muscle: entry.group,
      plannedSets: plannedMuscleSets,
      completedSets: completedMuscleSetsValue,
      completionRatio,
      estimatedEffect,
      message: getMuscleEstimateMessage({
        effect: estimatedEffect,
        averageSetsPerWeek,
      }),
    } satisfies MuscleEffectEstimate;
  });

  if (completedSessions < 3) {
    const copy = getThirtyDayStatusCopy("insufficient_data");

    return {
      status: "insufficient_data",
      plannedSessions,
      completedSessions,
      sessionCompletionRatio,
      plannedMinutes,
      completedMinutes,
      minuteCompletionRatio,
      plannedSets,
      completedSets,
      setCompletionRatio,
      estimatedEffectLabel: copy.label,
      estimatedEffectMessage: copy.message,
      muscleEstimates,
      limitingFactors: ["low_data"],
      positiveSignals: [],
      confidence: "low",
    };
  }

  let status: ThirtyDayTrainingEffectStatus;

  if (setCompletionRatio < 0.35) {
    status = "below_maintenance";
  } else if (setCompletionRatio < 0.6) {
    status = "maintenance";
  } else if (setCompletionRatio < 0.85) {
    status = "small_positive";
  } else if (setCompletionRatio <= 1.15) {
    status = "productive";
  } else if (highRiskGroups.length > 0) {
    status = "high_but_recovery_limited";
  } else {
    status = "productive";
  }

  const limitingFactors: string[] = [];
  const positiveSignals: string[] = [];

  if (sessionCompletionRatio < 0.85) {
    limitingFactors.push("frequency");
  } else {
    positiveSignals.push("frekvensen har varit ganska jämn");
  }

  if (minuteCompletionRatio < 0.75) {
    limitingFactors.push("volume");
  } else {
    positiveSignals.push("du har fått ihop en bra mängd träningstid");
  }

  if (highRiskGroups.length > 0) {
    limitingFactors.push("recovery");
  }

  if (muscleEstimates.some((estimate) => estimate.estimatedEffect === "productive")) {
    positiveSignals.push("minst några muskler ligger i en produktiv volymzon");
  }

  const copy = getThirtyDayStatusCopy(status);
  const confidence =
    completedSessions >= 8 && recentLogs.some((log) => log.exercises.some((exercise) => exercise.sets.length > 0))
      ? "high"
      : completedSessions >= 4
        ? "medium"
        : "low";

  return {
    status,
    plannedSessions,
    completedSessions,
    sessionCompletionRatio,
    plannedMinutes,
    completedMinutes,
    minuteCompletionRatio,
    plannedSets,
    completedSets,
    setCompletionRatio,
    estimatedEffectLabel: copy.label,
    estimatedEffectMessage: copy.message,
    muscleEstimates,
    limitingFactors,
    positiveSignals,
    confidence,
  };
}

export function buildTrainingGap(params: {
  logs: WorkoutLog[];
  muscleBudget: MuscleBudgetEntry[];
  goal?: string | null;
  experienceLevel?: string | null;
  targetSessionsPerWeek: number;
  targetMinutesPerWeek?: number;
  now?: Date;
}): TrainingGap {
  const now = params.now ?? new Date();
  const completedHistory = getCompletedLogs(params.logs);
  const weeklyCompletedLogs = getCompletedLogsThisWeek(params.logs, now);
  const completedSessions = weeklyCompletedLogs.length;
  const completedMinutes = weeklyCompletedLogs.reduce((sum, log) => {
    return sum + Math.max(0, Math.round(log.durationSeconds / 60));
  }, 0);
  const plannedSessions = Math.max(1, params.targetSessionsPerWeek);
  const plannedMinutes = Math.max(
    20,
    params.targetMinutesPerWeek ?? plannedSessions * 30,
  );
  const missingMinutes = Math.max(0, plannedMinutes - completedMinutes);
  const missingSets = Math.max(
    0,
    roundToSingleDecimal(
      params.muscleBudget.reduce((sum, entry) => sum + (entry.remainingSets ?? 0), 0),
    ),
  );
  const missingMuscles = params.muscleBudget
    .filter((entry) => (entry.remainingSets ?? 0) > 0)
    .sort((left, right) => (right.remainingSets ?? 0) - (left.remainingSets ?? 0))
    .slice(0, 3)
    .map((entry) => entry.group);
  const completionRatio =
    plannedMinutes > 0 ? clamp(completedMinutes / plannedMinutes, 0, 1) : 0;
  const hasHighRisk = params.muscleBudget.some(
    (entry) => entry.loadStatus === "high_risk",
  );
  const thirtyDayEffect = buildThirtyDayTrainingEffect({
    logs: params.logs,
    muscleBudget: params.muscleBudget,
    goal: params.goal,
    experienceLevel: params.experienceLevel,
    targetSessionsPerWeek: params.targetSessionsPerWeek,
    targetMinutesPerWeek: params.targetMinutesPerWeek,
    now,
  });

  // För lite historik ska ge mjuk vägledning, inte falsk precision.
  if (completedHistory.length < 2) {
    return {
      status: "insufficient_data",
      completionRatio,
      plannedSessions,
      completedSessions,
      plannedMinutes,
      completedMinutes,
      missingMinutes,
      missingSets,
      missingMuscles,
      suggestedCatchUpOptions: [],
      message:
        "Fortsätt träna så lär jag känna din rytm bättre – sedan kan jag ge mer precisa råd.",
      thirtyDayEffect,
    };
  }

  if (hasHighRisk) {
    return {
      status: "recovery_first",
      completionRatio,
      plannedSessions,
      completedSessions,
      plannedMinutes,
      completedMinutes,
      missingMinutes,
      missingSets,
      missingMuscles,
      suggestedCatchUpOptions: [
        {
          id: "accept_light_week",
          label: "Ta det lugnt",
          description: "Kroppen verkar behöva återhämtning just nu.",
          sessions: 0,
          minutesPerSession: 0,
          focusMuscles: [],
        },
      ],
      message:
        "Kroppen verkar behöva återhämtning just nu – mer träning hjälper inte lika mycket som vila i detta läge.",
      thirtyDayEffect,
    };
  }

  let status: TrainingGapStatus;

  if (completionRatio >= 0.85 && missingSets <= 3) {
    status = "on_track";
  } else if (completionRatio >= 0.6) {
    status = "minor_gap";
  } else {
    status = "major_gap";
  }

  const suggestedCatchUpOptions: CatchUpOption[] = [];

  if (status === "minor_gap" || status === "major_gap") {
    suggestedCatchUpOptions.push({
      id: "one_normal_session",
      label: "Ett vanligt pass",
      description: "Samla återstående riktning i ett lugnt, fokuserat pass.",
      sessions: 1,
      minutesPerSession: clamp(missingMinutes, 20, 45),
      focusMuscles: missingMuscles,
    });
    suggestedCatchUpOptions.push({
      id: "two_short_sessions",
      label: "Två korta pass",
      description: "Dela upp veckan i två enklare träningsfönster.",
      sessions: 2,
      minutesPerSession: clamp(Math.ceil(missingMinutes / 2), 12, 25),
      focusMuscles: missingMuscles,
    });
    suggestedCatchUpOptions.push({
      id: "accept_light_week",
      label: "Acceptera lättare vecka",
      description: "Helt okej om veckan blev lugnare än planerat.",
      sessions: 0,
      minutesPerSession: 0,
      focusMuscles: [],
    });
  }

  const message =
    status === "on_track"
      ? "Du ligger bra till mot veckans riktning."
      : status === "minor_gap"
        ? "Detta återstår för veckans riktning – ett kort pass räcker ofta långt."
        : "Det finns fortfarande träning kvar att hämta hem denna vecka. Mindre pass kan vara enklare än ett långt.";

  return {
    status,
    completionRatio,
    plannedSessions,
    completedSessions,
    plannedMinutes,
    completedMinutes,
    missingMinutes,
    missingSets,
    missingMuscles,
    suggestedCatchUpOptions,
    message,
    thirtyDayEffect,
  };
}
