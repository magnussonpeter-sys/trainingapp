import { evaluateGoalAlignment } from "@/lib/simulation/evaluate-goal-alignment";
import {
  getSimulationExerciseAggregationKey,
  normalizeSimulationExerciseDisplayName,
} from "@/lib/simulation/exercise-identity";
import { clamp, round } from "@/lib/simulation/random";
import type {
  SimulationDailySnapshot,
  SimulationEvaluation,
  SimulationExerciseAggregate,
  SimulationUserProfile,
} from "@/lib/simulation/types";

function avg(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trend(first: number, last: number) {
  return round(last - first, 2);
}

export function buildExerciseAggregates(
  dailySnapshots: SimulationDailySnapshot[],
): SimulationExerciseAggregate[] {
  const map = new Map<string, {
    exerciseName: string;
    selected: number;
    completed: number;
    efforts: number[];
    ratings: number[];
    extraReps: number[];
    plannedWeights: number[];
    actualWeights: number[];
  }>();

  for (const snapshot of dailySnapshots) {
    for (const exercise of snapshot.workoutResult?.exerciseResults ?? []) {
      const aggregationKey = getSimulationExerciseAggregationKey(exercise);
      const current = map.get(aggregationKey) ?? {
        exerciseName: normalizeSimulationExerciseDisplayName(exercise.exerciseName),
        selected: 0,
        completed: 0,
        efforts: [],
        ratings: [],
        extraReps: [],
        plannedWeights: [],
        actualWeights: [],
      };

      current.selected += 1;
      if (exercise.completed) current.completed += 1;
      current.efforts.push(exercise.effortScore);
      current.ratings.push(exercise.exerciseRating);
      if (exercise.extraRepsEstimate != null) current.extraReps.push(exercise.extraRepsEstimate);
      if (exercise.plannedWeightKg != null) current.plannedWeights.push(exercise.plannedWeightKg);
      if (exercise.actualAvgWeightKg != null) current.actualWeights.push(exercise.actualAvgWeightKg);
      map.set(aggregationKey, current);
    }
  }

  return Array.from(map.entries())
    .map(([exerciseId, item]) => ({
      exerciseId,
      exerciseName: item.exerciseName,
      timesSelected: item.selected,
      timesCompleted: item.completed,
      avgEffortScore: round(avg(item.efforts), 1),
      avgExerciseRating: round(avg(item.ratings), 1),
      avgExtraRepsEstimate: round(avg(item.extraReps), 1),
      avgPlannedWeightKg: item.plannedWeights.length > 0 ? round(avg(item.plannedWeights), 1) : undefined,
      avgActualWeightKg: item.actualWeights.length > 0 ? round(avg(item.actualWeights), 1) : undefined,
    }))
    .sort((left, right) => right.timesSelected - left.timesSelected);
}

export function evaluateSimulation(params: {
  dailySnapshots: SimulationDailySnapshot[];
  profile: SimulationUserProfile;
}) {
  const { dailySnapshots, profile } = params;
  const plannedDays = dailySnapshots.filter((snapshot) => snapshot.plannedTraining.isPlannedTrainingDay);
  const workoutResults = dailySnapshots
    .map((snapshot) => snapshot.workoutResult)
    .filter((workout) => workout !== undefined);
  const completedWorkouts = workoutResults.filter((workout) => workout.completed);
  const first = dailySnapshots[0]?.stateBefore;
  const last = dailySnapshots[dailySnapshots.length - 1]?.stateAfter;
  const avgReadiness = round(avg(dailySnapshots.map((snapshot) => snapshot.stateAfter.readiness)), 1);
  const avgFatigue = round(avg(dailySnapshots.map((snapshot) => snapshot.stateAfter.fatigue)), 1);
  const strengthTrend = first && last ? trend(first.strengthLevel, last.strengthLevel) : 0;
  const workCapacityTrend = first && last ? trend(first.workCapacity, last.workCapacity) : 0;
  const uniqueExercises = new Set(
    completedWorkouts.flatMap((workout) =>
      workout.exerciseResults.map((exercise) => getSimulationExerciseAggregationKey(exercise)),
    ),
  ).size;
  const exerciseVariationScore = round(clamp(uniqueExercises * 8, 0, 100), 1);
  const goalAlignmentScore = evaluateGoalAlignment({ goal: profile.goal, dailySnapshots });
  const overloadRiskScore = round(clamp(avgFatigue + Math.max(0, 55 - avgReadiness) * 0.8, 0, 100), 1);
  const stagnationRiskScore = round(clamp(70 - strengthTrend * 6 - workCapacityTrend * 4, 0, 100), 1);
  const progressionQualityScore = round(
    clamp(goalAlignmentScore * 0.42 + (100 - overloadRiskScore) * 0.26 + (100 - stagnationRiskScore) * 0.18 + avgReadiness * 0.14, 0, 100),
    1,
  );
  const flags: string[] = [];

  if (plannedDays.length > 0 && completedWorkouts.length / plannedDays.length < 0.65) {
    flags.push("Låg följsamhet: användaren missar många planerade pass.");
  }
  if (overloadRiskScore > 70) {
    flags.push("Hög belastningsrisk: fatigue/readiness blir ogynnsam över tid.");
  }
  if (stagnationRiskScore > 65) {
    flags.push("Stagnationsrisk: progressionen ser svag ut i simuleringen.");
  }
  if (exerciseVariationScore < 35) {
    flags.push("Låg övningsvariation: modellen väljer få återkommande övningar.");
  }

  const evaluation: SimulationEvaluation = {
    adherenceRate: round(plannedDays.length > 0 ? completedWorkouts.length / plannedDays.length : 0, 2),
    completionRate: round(workoutResults.length > 0 ? completedWorkouts.length / workoutResults.length : 0, 2),
    avgSessionDifficulty: round(avg(completedWorkouts.map((workout) => workout.sessionDifficultyScore)), 1),
    avgSessionSatisfaction: round(avg(completedWorkouts.map((workout) => workout.sessionSatisfactionScore)), 1),
    avgReadiness,
    avgFatigue,
    strengthTrend,
    workCapacityTrend,
    exerciseVariationScore,
    goalAlignmentScore,
    overloadRiskScore,
    stagnationRiskScore,
    progressionQualityScore,
    flags,
    summary:
      progressionQualityScore >= 75
        ? "Simuleringen ser balanserad ut: progression, följsamhet och återhämtning samspelar rimligt."
        : progressionQualityScore >= 55
          ? "Simuleringen är användbar men visar några områden att bevaka innan modellen pressas hårdare."
          : "Simuleringen signalerar att modellen bör bli mer konservativ eller bättre anpassad till användarens vardag.",
  };

  return evaluation;
}
