import { calculateReadiness } from "@/lib/simulation/readiness";
import { clamp, round } from "@/lib/simulation/random";
import type {
  SimulationConfig,
  SimulationUserProfile,
  SimulationUserState,
  SimulationWorkoutResult,
} from "@/lib/simulation/types";

function recoveryMultiplier(profile: SimulationUserProfile) {
  if (profile.recoveryProfile === "good") return 1.25;
  if (profile.recoveryProfile === "poor") return 0.72;
  return 1;
}

function energyTrendDelta(profile: SimulationUserProfile) {
  if (profile.energyTrend === "improving") return 0.18;
  if (profile.energyTrend === "declining") return -0.22;
  return 0;
}

export function normalizeSimulationState(
  state: SimulationUserState,
  profile: SimulationUserProfile,
  config: SimulationConfig,
): SimulationUserState {
  const normalized = {
    ...state,
    fatigue: round(clamp(state.fatigue, 0, config.maxFatigue), 1),
    motivation: round(clamp(state.motivation, 0, 100), 1),
    soreness: round(clamp(state.soreness, 0, config.maxSoreness), 1),
    lifeStress: round(clamp(state.lifeStress, 0, 100), 1),
    strengthLevel: round(clamp(state.strengthLevel, 1, 160), 2),
    workCapacity: round(clamp(state.workCapacity, 1, 160), 2),
    movementSkill: round(clamp(state.movementSkill, 1, 160), 2),
    bodyWeightKg: round(clamp(state.bodyWeightKg, 35, 180), 2),
  };

  return {
    ...normalized,
    readiness: calculateReadiness(normalized, profile),
  };
}

export function createInitialSimulationState(profile: SimulationUserProfile) {
  const state: SimulationUserState = {
    dayIndex: 0,
    readiness: 70,
    fatigue: 16 + (100 - profile.recoveryCapacity) * 0.08,
    motivation: profile.motivationBase,
    soreness: 12,
    lifeStress: profile.lifeStressBase,
    strengthLevel: profile.strengthBase,
    workCapacity: 48 + profile.recoveryCapacity * 0.3,
    movementSkill: 45 + profile.skillLearningRate * 0.35,
    bodyWeightKg: profile.weightKg,
    completedWorkouts: 0,
    skippedWorkouts: 0,
    consecutiveTrainingDays: 0,
    consecutiveMissedPlannedDays: 0,
    lastDeloadDayIndex: null,
  };

  return normalizeSimulationState(state, profile, {
    totalDays: 56,
    startDate: new Date().toISOString().slice(0, 10),
    randomSeed: 1,
    enableMissedWorkouts: true,
    enableFatigueModel: true,
    enableWeightProgressionEstimate: true,
    enableDeloadDetection: true,
    minRestDayProbability: 0.08,
    maxFatigue: 100,
    maxSoreness: 100,
    deloadFatigueThreshold: 82,
    lowReadinessThreshold: 38,
  });
}

export function applyRestDayRecovery(
  state: SimulationUserState,
  profile: SimulationUserProfile,
  config: SimulationConfig,
) {
  const multiplier = recoveryMultiplier(profile);
  const next = {
    ...state,
    fatigue: state.fatigue - 10 * multiplier,
    soreness: state.soreness - 12 * multiplier,
    motivation: state.motivation + 2 + energyTrendDelta(profile),
    lifeStress: state.lifeStress + energyTrendDelta(profile) - 1.2 * multiplier,
    consecutiveTrainingDays: 0,
  };

  return normalizeSimulationState(next, profile, config);
}

export function applyMissedWorkoutState(
  state: SimulationUserState,
  profile: SimulationUserProfile,
  config: SimulationConfig,
) {
  const next = {
    ...state,
    skippedWorkouts: state.skippedWorkouts + 1,
    fatigue: state.fatigue - 5 * recoveryMultiplier(profile),
    soreness: state.soreness - 6 * recoveryMultiplier(profile),
    motivation: state.motivation - 3,
    lifeStress: state.lifeStress + 1.5,
    consecutiveTrainingDays: 0,
    consecutiveMissedPlannedDays: state.consecutiveMissedPlannedDays + 1,
  };

  return normalizeSimulationState(next, profile, config);
}

export function applyWorkoutFatigue(
  state: SimulationUserState,
  workoutResult: SimulationWorkoutResult,
  profile: SimulationUserProfile,
  config: SimulationConfig,
) {
  const loadFactor = workoutResult.estimatedLoadScore / 100;
  const difficultyFactor = workoutResult.sessionDifficultyScore / 5;
  const progressionGain = workoutResult.completed
    ? loadFactor * (profile.experienceLevel === "beginner" ? 0.52 : 0.32)
    : 0;

  const next = {
    ...state,
    fatigue: config.enableFatigueModel
      ? state.fatigue + 16 * loadFactor + 7 * difficultyFactor
      : state.fatigue,
    soreness: state.soreness + 13 * loadFactor,
    motivation:
      state.motivation +
      (workoutResult.sessionSatisfactionScore - 3) * 2.4 +
      energyTrendDelta(profile),
    lifeStress: state.lifeStress - 1.5,
    strengthLevel:
      state.strengthLevel +
      progressionGain * (profile.goal === "strength" ? 1.25 : 0.85),
    workCapacity:
      state.workCapacity +
      progressionGain * (profile.goal === "body_composition" ? 1.25 : 0.9),
    movementSkill: state.movementSkill + profile.skillLearningRate * 0.015,
    bodyWeightKg:
      profile.goal === "body_composition"
        ? state.bodyWeightKg - 0.025
        : profile.goal === "hypertrophy"
          ? state.bodyWeightKg + 0.012
          : state.bodyWeightKg,
    completedWorkouts: state.completedWorkouts + 1,
    consecutiveTrainingDays: state.consecutiveTrainingDays + 1,
    consecutiveMissedPlannedDays: 0,
    lastWorkoutDate: workoutResult.date,
  };

  return normalizeSimulationState(next, profile, config);
}

