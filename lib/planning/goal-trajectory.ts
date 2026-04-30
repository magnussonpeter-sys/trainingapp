import type { MuscleBudgetEntry } from "@/lib/planning/muscle-budget";
import type { WorkoutLog } from "@/lib/workout-log-storage";

export type GoalTrajectoryStatus =
  | "on_track"
  | "slightly_behind"
  | "behind"
  | "too_aggressive"
  | "insufficient_data";

export type GoalTrajectory = {
  status: GoalTrajectoryStatus;
  message: string;
  weeklyFrequencyTarget: number;
  recentFrequency: number;
  suggestedWeeklySessions?: number;
  suggestedExtraSession?: boolean;
  limitingFactors: string[];
};

type PlanningGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

type Params = {
  logs: WorkoutLog[];
  goal?: PlanningGoal | null;
  experienceLevel?: string | null;
  muscleBudget: MuscleBudgetEntry[];
  completedLast7Days: number;
  passCount: number;
  now?: Date;
};

function getCompletedLogs(logs: WorkoutLog[]) {
  return logs.filter((log) => log.status === "completed");
}

function getCompletedLogsWithinDays(logs: WorkoutLog[], now: Date, days: number) {
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  return getCompletedLogs(logs).filter((log) => {
    const completedAtMs = new Date(log.completedAt).getTime();
    return Number.isFinite(completedAtMs) && now.getTime() - completedAtMs <= thresholdMs;
  });
}

function getWeeklyFrequencyTarget(params: {
  goal?: PlanningGoal | null;
  experienceLevel?: string | null;
}) {
  let weeklyTarget = 3;

  if (params.goal === "health") {
    weeklyTarget = 2;
  } else if (params.goal === "hypertrophy" || params.goal === "body_composition") {
    weeklyTarget = 4;
  }

  if (params.experienceLevel === "beginner" || params.experienceLevel === "novice") {
    weeklyTarget = Math.max(2, weeklyTarget - 1);
  }

  if (params.experienceLevel === "advanced" && params.goal !== "health") {
    weeklyTarget += 1;
  }

  return weeklyTarget;
}

export function buildGoalTrajectory(params: Params): GoalTrajectory {
  const now = params.now ?? new Date();
  const completedLogs = getCompletedLogs(params.logs);
  const recent14DayLogs = getCompletedLogsWithinDays(params.logs, now, 14);
  const weeklyFrequencyTarget = getWeeklyFrequencyTarget({
    goal: params.goal,
    experienceLevel: params.experienceLevel,
  });
  const recentFrequency =
    recent14DayLogs.length >= 2
      ? Math.round((recent14DayLogs.length / 2) * 10) / 10
      : params.completedLast7Days;

  // För lite data ska ge försiktig återkoppling, inte falsk precision.
  if (completedLogs.length < 3) {
    return {
      status: "insufficient_data",
      message:
        "Fortsätt träna så lär jag känna din rytm bättre – sedan kan jag ge mer precisa råd.",
      weeklyFrequencyTarget,
      recentFrequency: params.completedLast7Days,
      limitingFactors: ["low_data"],
    };
  }

  const highRisk = params.muscleBudget.some(
    (entry) => entry.loadStatus === "high_risk",
  );
  const remainingSets = params.muscleBudget.reduce(
    (sum, entry) => sum + (entry.remainingSets || 0),
    0,
  );
  const underTargetGroups = params.muscleBudget.filter(
    (entry) => entry.remainingSets > 1.5 && entry.loadStatus === "under",
  );

  if (highRisk) {
    return {
      status: "too_aggressive",
      message:
        "Du har tränat hårt nog nyligen – återhämtning nu ger bättre effekt än att pressa in mer volym.",
      weeklyFrequencyTarget,
      recentFrequency,
      limitingFactors: ["recovery"],
    };
  }

  if (recentFrequency >= weeklyFrequencyTarget) {
    return {
      status: "on_track",
      message:
        "Du ligger bra till för ditt mål just nu. Fortsätt hålla jämn kvalitet och låt återhämtningen stötta progressionen.",
      weeklyFrequencyTarget,
      recentFrequency,
      limitingFactors: [],
    };
  }

  if (recentFrequency >= weeklyFrequencyTarget - 1) {
    return {
      status: "slightly_behind",
      message:
        "Du är nära rätt nivå. Ett kort extrapass eller lite mer träningstid denna vecka skulle sannolikt räcka.",
      weeklyFrequencyTarget,
      recentFrequency,
      suggestedExtraSession: remainingSets > 4 || underTargetGroups.length >= 2,
      limitingFactors: ["frequency"],
    };
  }

  return {
    status: "behind",
    message:
      "Nuvarande träningsfrekvens är lite låg för målet. Fler korta, genomförbara pass skulle troligen hjälpa mer än ett enstaka långt pass.",
    weeklyFrequencyTarget,
    recentFrequency,
    suggestedWeeklySessions: Math.max(weeklyFrequencyTarget, params.passCount),
    suggestedExtraSession: remainingSets > 5,
    limitingFactors: remainingSets > 5 ? ["frequency", "volume"] : ["frequency"],
  };
}
