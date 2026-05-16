import type { GoalTrajectory } from "@/lib/planning/goal-trajectory";
import type { MuscleBudgetEntry, MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { TrainingGap } from "@/lib/planning/training-gap";
import type { WorkoutFocus } from "@/types/workout";

export type TrainingDoseAdjustment = {
  compensationMode:
    | "none"
    | "small"
    | "moderate"
    | "reduce_ambition"
    | "recovery_first";
  suggestedDurationDelta: number;
  maxExtraDosePercent: number;
  priorityMuscles: MuscleBudgetGroup[];
  reason: string;
};

type BuildTrainingDoseAdjustmentParams = {
  trainingGap: TrainingGap;
  goalTrajectory: GoalTrajectory;
  muscleBudget: MuscleBudgetEntry[];
  nextFocus: WorkoutFocus;
  configuredPriorityMuscles?: MuscleBudgetGroup[];
  missedPlannedSessionsCount?: number | null;
};

const FOCUS_GROUPS: Record<WorkoutFocus, MuscleBudgetGroup[]> = {
  full_body: ["quads", "hamstrings", "glutes", "back", "chest", "core"],
  upper_body: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower_body: ["quads", "hamstrings", "glutes", "calves", "core"],
  core: ["core", "glutes"],
};

function getCompletionRatio(trainingGap: TrainingGap) {
  if (trainingGap.completionRatio > 0) {
    return trainingGap.completionRatio;
  }

  if (trainingGap.plannedMinutes > 0) {
    return trainingGap.completedMinutes / trainingGap.plannedMinutes;
  }

  if (trainingGap.plannedSessions > 0) {
    return trainingGap.completedSessions / trainingGap.plannedSessions;
  }

  return 1;
}

function getThirtyDayAdherence(trainingGap: TrainingGap) {
  return Math.min(
    trainingGap.thirtyDayEffect?.sessionCompletionRatio ?? 1,
    trainingGap.thirtyDayEffect?.minuteCompletionRatio ?? 1,
  );
}

function getPriorityRank(priorityMuscles: MuscleBudgetGroup[], group: MuscleBudgetGroup) {
  const index = priorityMuscles.indexOf(group);
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
}

function buildPriorityMuscles(params: {
  muscleBudget: MuscleBudgetEntry[];
  missingMuscles: MuscleBudgetGroup[];
  nextFocus: WorkoutFocus;
  configuredPriorityMuscles: MuscleBudgetGroup[];
}) {
  const allowedGroups = new Set(FOCUS_GROUPS[params.nextFocus]);
  const missingGroups = new Set(params.missingMuscles);

  return [...params.muscleBudget]
    .filter((entry) => allowedGroups.has(entry.group))
    .filter((entry) => entry.remainingSets > 0)
    .filter((entry) => entry.loadStatus !== "high_risk" && entry.loadStatus !== "over")
    .sort((left, right) => {
      const leftMissingBonus = missingGroups.has(left.group) ? 1 : 0;
      const rightMissingBonus = missingGroups.has(right.group) ? 1 : 0;

      if (leftMissingBonus !== rightMissingBonus) {
        return rightMissingBonus - leftMissingBonus;
      }

      const leftPriorityRank = getPriorityRank(params.configuredPriorityMuscles, left.group);
      const rightPriorityRank = getPriorityRank(params.configuredPriorityMuscles, right.group);
      if (leftPriorityRank !== rightPriorityRank) {
        return leftPriorityRank - rightPriorityRank;
      }

      return right.remainingSets - left.remainingSets;
    })
    .map((entry) => entry.group)
    .slice(0, 3);
}

export function buildTrainingDoseAdjustment(
  params: BuildTrainingDoseAdjustmentParams,
): TrainingDoseAdjustment {
  const configuredPriorityMuscles = params.configuredPriorityMuscles ?? [];
  const missedPlannedSessionsCount = params.missedPlannedSessionsCount ?? 0;
  const completionRatio = getCompletionRatio(params.trainingGap);
  const thirtyDayAdherence = getThirtyDayAdherence(params.trainingGap);
  const hasHighRisk = params.muscleBudget.some(
    (entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over",
  );
  const priorityMuscles = buildPriorityMuscles({
    muscleBudget: params.muscleBudget,
    missingMuscles: params.trainingGap.missingMuscles,
    nextFocus: params.nextFocus,
    configuredPriorityMuscles,
  });

  if (
    params.trainingGap.status === "recovery_first" ||
    params.goalTrajectory.status === "too_aggressive" ||
    hasHighRisk
  ) {
    return {
      compensationMode: "recovery_first",
      suggestedDurationDelta: 0,
      maxExtraDosePercent: 0,
      priorityMuscles: [],
      reason:
        "Återhämtning väger tyngre än kompensation just nu. Nästa pass ska inte växa för att ta igen missad träning.",
    };
  }

  if (
    params.goalTrajectory.status === "behind" &&
    (thirtyDayAdherence < 0.6 || missedPlannedSessionsCount >= 3)
  ) {
    return {
      compensationMode: "reduce_ambition",
      suggestedDurationDelta: -5,
      maxExtraDosePercent: 0,
      priorityMuscles,
      reason:
        "Träningsmängden har varit svår att hålla över flera veckor. Sänk ambitionsnivån något och gör nästa pass mer genomförbart.",
    };
  }

  if (completionRatio >= 0.95 || params.trainingGap.status === "on_track") {
    if (missedPlannedSessionsCount >= 1 && thirtyDayAdherence >= 0.6) {
      return {
        compensationMode: "small",
        suggestedDurationDelta: 5,
        maxExtraDosePercent: 10,
        priorityMuscles,
        reason:
          "Ett planerat pass missades nyligen. Nästa pass kan få en liten, kontrollerad dosökning utan att bli orimligt.",
      };
    }

    return {
      compensationMode: "none",
      suggestedDurationDelta: 0,
      maxExtraDosePercent: 0,
      priorityMuscles: [],
      reason: "Veckan ligger nära planen, så ingen extra kompensation behövs.",
    };
  }

  if (
    params.trainingGap.status === "minor_gap" ||
    missedPlannedSessionsCount === 1 ||
    (completionRatio >= 0.75 && params.trainingGap.missingMinutes <= 30)
  ) {
    return {
      compensationMode: "small",
      suggestedDurationDelta: 5,
      maxExtraDosePercent: 10,
      priorityMuscles,
      reason:
        "Ett planerat pass verkar ha glidit. Nästa pass kan få en liten dosökning utan att bli ett straffpass.",
    };
  }

  if (
    (params.trainingGap.status === "major_gap" || missedPlannedSessionsCount >= 2) &&
    thirtyDayAdherence >= 0.6
  ) {
    return {
      compensationMode: "moderate",
      suggestedDurationDelta: completionRatio < 0.5 ? 10 : 5,
      maxExtraDosePercent: 20,
      priorityMuscles,
      reason:
        "Det finns ett tydligt träningsgap, men adherencen är fortfarande tillräcklig för en liten kontrollerad kompensation i nästa pass.",
    };
  }

  return {
    compensationMode: "none",
    suggestedDurationDelta: 0,
    maxExtraDosePercent: 0,
    priorityMuscles,
    reason: "Ingen säker dosjustering behövs just nu.",
  };
}
