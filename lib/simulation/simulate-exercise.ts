import { clamp, round, type SeededRandom } from "@/lib/simulation/random";
import type {
  SimulationExercisePerformance,
  SimulationUserProfile,
  SimulationUserState,
} from "@/lib/simulation/types";

export type SyntheticExercisePlan = {
  exerciseId: string;
  exerciseName: string;
  variantGroup?: string;
  difficulty: number;
  plannedSets: number;
  plannedReps?: number;
  plannedDurationSec?: number;
  plannedWeightKg?: number;
  baseLoadScore: number;
  category: "compound" | "accessory" | "core" | "conditioning";
};

export function simulateExercise(params: {
  exercise: SyntheticExercisePlan;
  profile: SimulationUserProfile;
  random: SeededRandom;
  state: SimulationUserState;
}) {
  const { exercise, random, state } = params;
  const capacity =
    state.strengthLevel * 0.48 +
    state.workCapacity * 0.27 +
    state.movementSkill * 0.2 +
    state.readiness * 0.25 -
    state.fatigue * 0.22 -
    state.soreness * 0.14;
  const capacityRatio = clamp(capacity / exercise.difficulty, 0.35, 1.45);
  const completionProbability = clamp(0.72 + (capacityRatio - 0.85) * 0.42, 0.25, 0.99);
  const completed = random.chance(completionProbability);
  const completedSets = completed
    ? exercise.plannedSets
    : Math.max(0, Math.round(exercise.plannedSets * random.between(0.25, 0.75)));

  const plannedReps = exercise.plannedReps;
  const actualAvgReps =
    plannedReps != null
      ? round(Math.max(1, plannedReps * clamp(capacityRatio + random.between(-0.08, 0.08), 0.55, 1.25)), 0)
      : undefined;
  const actualAvgDurationSec =
    exercise.plannedDurationSec != null
      ? round(
          Math.max(
            10,
            exercise.plannedDurationSec * clamp(capacityRatio + random.between(-0.06, 0.06), 0.6, 1.2),
          ),
          0,
        )
      : undefined;
  const actualAvgWeightKg =
    exercise.plannedWeightKg != null
      ? round(exercise.plannedWeightKg * clamp(capacityRatio + random.between(-0.05, 0.06), 0.65, 1.18), 1)
      : undefined;
  const extraRepsEstimate =
    plannedReps != null && actualAvgReps != null
      ? round(clamp(actualAvgReps - plannedReps, 0, 6), 0)
      : undefined;
  const effortScore = round(clamp(5.8 - capacityRatio * 2.2 + exercise.difficulty / 90, 1, 5), 1);
  const exerciseRating = round(
    clamp(4.4 - Math.abs(effortScore - 3.2) * 0.38 - (completed ? 0 : 1.2), 1, 5),
    1,
  );

  return {
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    variantGroup: exercise.variantGroup,
    plannedSets: exercise.plannedSets,
    plannedReps: exercise.plannedReps,
    plannedDurationSec: exercise.plannedDurationSec,
    plannedWeightKg: exercise.plannedWeightKg,
    completedSets,
    actualAvgReps,
    actualAvgDurationSec,
    actualAvgWeightKg,
    extraRepsEstimate,
    effortScore,
    exerciseRating,
    completed: completed && completedSets === exercise.plannedSets,
  } satisfies SimulationExercisePerformance;
}
