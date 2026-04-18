import {
  HYPERTROPHY_AVERAGE_WEEKS,
  HYPERTROPHY_TARGETS,
} from "@/lib/analysis/analysis-config";
import {
  calculateHypertrophyDose,
} from "@/lib/analysis/calculate-hypertrophy-dose";
import { calculateRecoverySignal } from "@/lib/analysis/calculate-recovery-signal";
import { calculateStrengthProgress } from "@/lib/analysis/calculate-strength-progress";
import {
  estimateExerciseStrengthScore,
  getCompletedWorkouts,
  getDoseGroupsForExercise,
  getWeekStart,
  formatWeekLabel,
  parseDateMs,
} from "@/lib/analysis/analysis-helpers";
import type {
  AnalysisData,
  AnalysisNextStep,
  AnalysisSummary,
  TrendPoint,
} from "@/lib/analysis/analysis-types";
import type { WorkoutLog } from "@/lib/workout-log-storage";

type UserSettingsSummary = {
  training_goal?: string | null;
};

function buildTrendData(logs: WorkoutLog[]): TrendPoint[] {
  const completedWorkouts = getCompletedWorkouts(logs);
  const weekly = new Map<string, TrendPoint>();

  for (const workout of completedWorkouts) {
    const weekStart = getWeekStart(parseDateMs(workout.completedAt));
    const weekKey = weekStart.toISOString().slice(0, 10);
    const current =
      weekly.get(weekKey) ?? {
        weekKey,
        weekLabel: formatWeekLabel(weekStart),
        strengthIndex: 0,
        hypertrophyDose: 0,
        load: 0,
      };

    let strengthSamples = 0;

    for (const exercise of workout.exercises) {
      const exerciseStrength = estimateExerciseStrengthScore(exercise);
      if (exerciseStrength) {
        current.strengthIndex += exerciseStrength;
        strengthSamples += 1;
      }

      current.load += exercise.sets.reduce((sum, set) => {
        if (set.actualWeight == null || set.actualReps == null) {
          return sum;
        }
        return sum + set.actualWeight * set.actualReps;
      }, 0);

      const groups = getDoseGroupsForExercise(exercise.exerciseId);
      if (groups.length > 0) {
        current.hypertrophyDose += exercise.sets.length;
      }
    }

    if (strengthSamples > 0) {
      current.strengthIndex = current.strengthIndex / strengthSamples;
    }

    weekly.set(weekKey, current);
  }

  return Array.from(weekly.values()).sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1));
}

function buildSummary(params: {
  strengthTitle: string;
  strengthStatus: string;
  hypertrophyBody: string;
  recoveryBody: string;
  hasEnoughData: boolean;
}): AnalysisSummary {
  const { strengthTitle, strengthStatus, hypertrophyBody, recoveryBody, hasEnoughData } = params;

  if (!hasEnoughData) {
    return {
      title: "Analysen är på väg att lära känna din träning",
      subtitle: "Mer data behövs för säkrare slutsatser, men du har redan en tydlig grund att bygga vidare på.",
      bullets: [
        "Fortsätt logga återkommande pass för tydligare styrketrend.",
        "Redan nu går det att följa frekvens, volym och grundläggande dos.",
      ],
      confidenceLabel: "Begränsad säkerhet",
    };
  }

  return {
    title: strengthStatus === "positive" ? "Din träning utvecklas stabilt" : "Du har en tydlig grund att bygga vidare på",
    subtitle: strengthTitle,
    bullets: [hypertrophyBody, recoveryBody].slice(0, 2),
    confidenceLabel: "MVP-bedömning med transparenta delsignaler",
  };
}

function buildNextSteps(params: {
  strengthStatus: string;
  lowDoseGroups: string[];
  highDoseGroups: string[];
  recoveryStatus: string;
  goal: string | null;
}): AnalysisNextStep[] {
  const nextSteps: AnalysisNextStep[] = [];

  if (params.lowDoseGroups.length > 0) {
    nextSteps.push({
      label: "Öka volym där du ligger lågt",
      detail: `Lägg 2–4 arbetsset extra i ${params.lowDoseGroups
        .slice(0, 2)
        .join(" och ")} nästa vecka.`,
    });
  }

  if (params.strengthStatus === "positive") {
    nextSteps.push({
      label: "Behåll progressionen",
      detail: "Fortsätt med små ökningar i återkommande huvudövningar i stället för stora hopp.",
    });
  } else if (params.strengthStatus === "watch") {
    nextSteps.push({
      label: "Förenkla nästa tunga pass",
      detail: "Sikta på bättre kvalitet i huvudlyften innan du höjer total belastning igen.",
    });
  }

  if (params.recoveryStatus === "watch") {
    nextSteps.push({
      label: "Bevaka återhämtningen",
      detail: "Lägg inte på mer total belastning nästa vecka utan att först se att prestationen stabiliseras.",
    });
  }

  if (params.highDoseGroups.length > 0) {
    nextSteps.push({
      label: "Behåll eller sänk högst belastade grupper",
      detail: `${params.highDoseGroups.slice(0, 2).join(" och ")} ligger redan högt, så där behövs inte mer volym just nu.`,
    });
  }

  if (nextSteps.length === 0) {
    nextSteps.push({
      label: "Fortsätt med kontinuitet",
      detail: "Behåll ungefär samma rytm nästa vecka och följ upp om huvudövningarna fortsätter röra sig framåt.",
    });
  }

  if ((params.goal ?? "").toLowerCase().includes("hypert")) {
    nextSteps.push({
      label: "Fokusera på jämn veckovolym",
      detail: `Sikta på att varje muskelgrupp får en jämn dos över veckan i stället för att pressa allt i ett enskilt pass.`,
    });
  }

  return nextSteps.slice(0, 4);
}

export function buildAnalysisData(params: {
  logs: WorkoutLog[];
  settings?: UserSettingsSummary | null;
}): AnalysisData {
  const completedWorkouts = getCompletedWorkouts(params.logs);
  const strengthProgress = calculateStrengthProgress(params.logs);
  const hypertrophyDose = calculateHypertrophyDose(params.logs);
  const recoverySignal = calculateRecoverySignal(params.logs, strengthProgress);
  const trends = buildTrendData(params.logs).slice(-HYPERTROPHY_AVERAGE_WEEKS);

  const lowDoseGroups = hypertrophyDose.groups
    .filter((group) => group.status === "under")
    .map((group) => group.label.toLowerCase());
  const highDoseGroups = hypertrophyDose.groups
    .filter((group) => group.status === "high")
    .map((group) => group.label.toLowerCase());

  const hasEnoughData = completedWorkouts.length >= 4;
  const summary = buildSummary({
    strengthTitle: strengthProgress.body,
    strengthStatus: strengthProgress.status,
    hypertrophyBody: hypertrophyDose.body,
    recoveryBody: recoverySignal.body,
    hasEnoughData,
  });
  const nextSteps = buildNextSteps({
    strengthStatus: strengthProgress.status,
    lowDoseGroups,
    highDoseGroups,
    recoveryStatus: recoverySignal.status,
    goal: params.settings?.training_goal ?? null,
  });

  return {
    summary,
    strengthProgress,
    hypertrophyDose,
    recoverySignal,
    trends,
    nextSteps,
    dataQuality: {
      workoutCount: params.logs.length,
      completedWorkoutCount: completedWorkouts.length,
      hasEnoughData,
      message: hasEnoughData
        ? null
        : "Mer data behövs för full analys. Vi behöver fler återkommande pass för säkrare trendbedömningar.",
    },
    sourceLogs: params.logs,
  };
}
