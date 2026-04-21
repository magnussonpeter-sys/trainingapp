import { clamp, round } from "@/lib/simulation/random";
import type {
  SimulationDailySnapshot,
  SimulationGoal,
  SimulationWorkoutResult,
} from "@/lib/simulation/types";

function isCompletedWorkout(
  workout: SimulationWorkoutResult | undefined,
): workout is SimulationWorkoutResult {
  return Boolean(workout?.completed);
}

export function evaluateGoalAlignment(params: {
  goal: SimulationGoal;
  dailySnapshots: SimulationDailySnapshot[];
}) {
  const workouts = params.dailySnapshots
    .map((snapshot) => snapshot.workoutResult)
    .filter(isCompletedWorkout);
  const avgLoad =
    workouts.reduce((sum, workout) => sum + workout.estimatedLoadScore, 0) /
    Math.max(1, workouts.length);
  const avgExerciseCount =
    workouts.reduce((sum, workout) => sum + workout.exerciseResults.length, 0) /
    Math.max(1, workouts.length);
  const avgDuration =
    workouts.reduce((sum, workout) => sum + workout.actualDurationMin, 0) /
    Math.max(1, workouts.length);

  if (workouts.length === 0) {
    return 0;
  }

  if (params.goal === "strength") {
    return round(clamp(74 + avgLoad * 0.2 - Math.max(0, avgExerciseCount - 4) * 5, 0, 100), 1);
  }

  if (params.goal === "hypertrophy") {
    return round(clamp(58 + avgExerciseCount * 6 + avgLoad * 0.12, 0, 100), 1);
  }

  if (params.goal === "body_composition") {
    return round(clamp(62 + avgDuration * 0.42 + avgLoad * 0.1, 0, 100), 1);
  }

  return round(clamp(72 + Math.min(avgExerciseCount, 5) * 4 - Math.max(0, avgLoad - 90) * 0.25, 0, 100), 1);
}
