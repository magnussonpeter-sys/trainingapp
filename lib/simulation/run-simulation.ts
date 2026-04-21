import { shouldTrainToday } from "@/lib/simulation/adherence";
import { buildTimeSeries } from "@/lib/simulation/build-time-series";
import { toPlannerDebugExercise } from "@/lib/simulation/exercise-identity";
import {
  buildExerciseAggregates,
  evaluateSimulation,
} from "@/lib/simulation/evaluate-simulation";
import { getSimulationProfilePreset } from "@/lib/simulation/profile-presets";
import { createSeededRandom } from "@/lib/simulation/random";
import {
  applyMissedWorkoutState,
  applyRestDayRecovery,
  applyWorkoutFatigue,
  createInitialSimulationState,
  normalizeSimulationState,
} from "@/lib/simulation/state";
import {
  buildMissedWorkoutResult,
  simulateWorkout,
} from "@/lib/simulation/simulate-workout";
import type {
  SimulationConfig,
  SimulationDailySnapshot,
  SimulationDayPlan,
  SimulationPlannerDebugEntry,
  SimulationPlannerDebugExercise,
  SimulationReport,
  SimulationUserProfile,
} from "@/lib/simulation/types";

type GeneratedWorkoutSummary = NonNullable<SimulationDailySnapshot["generatedWorkoutSummary"]>;

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  totalDays: 56,
  startDate: new Date().toISOString().slice(0, 10),
  randomSeed: 42,
  plannerMode: "synthetic",
  enablePlannerDebug: false,
  enableMissedWorkouts: true,
  enableFatigueModel: true,
  enableWeightProgressionEstimate: true,
  enableDeloadDetection: true,
  minRestDayProbability: 0.08,
  maxFatigue: 100,
  maxSoreness: 100,
  deloadFatigueThreshold: 82,
  lowReadinessThreshold: 38,
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function getRecentExerciseDebug(
  snapshots: SimulationDailySnapshot[],
): SimulationPlannerDebugExercise[] {
  return snapshots.slice(-14).flatMap((snapshot) =>
    (snapshot.workoutResult?.exerciseResults ?? []).map((exercise) =>
      toPlannerDebugExercise(exercise),
    ),
  );
}

function findRepeatedKeys(params: {
  exercises: SimulationPlannerDebugExercise[];
  recentExercises: SimulationPlannerDebugExercise[];
}) {
  const seenKeys = new Set(params.recentExercises.map((exercise) => exercise.aggregationKey));

  return params.exercises
    .map((exercise) => exercise.aggregationKey)
    .filter((key) => seenKeys.has(key));
}

function normalizeConfig(config?: Partial<SimulationConfig>): SimulationConfig {
  const totalDays = Math.min(Math.max(Math.round(config?.totalDays ?? 56), 28), 84);

  return {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config,
    totalDays,
    randomSeed: Math.max(1, Math.round(config?.randomSeed ?? DEFAULT_SIMULATION_CONFIG.randomSeed)),
    startDate: config?.startDate?.trim() || DEFAULT_SIMULATION_CONFIG.startDate,
    minRestDayProbability: Math.min(Math.max(config?.minRestDayProbability ?? 0.08, 0), 0.6),
    maxFatigue: Math.max(60, config?.maxFatigue ?? 100),
    maxSoreness: Math.max(60, config?.maxSoreness ?? 100),
  };
}

function getPlannedWorkoutDays(profile: SimulationUserProfile, config: SimulationConfig) {
  if (config.plannedWorkoutDayIndices?.length) {
    return new Set(config.plannedWorkoutDayIndices.map((day) => day % 7));
  }

  const templates: Record<number, number[]> = {
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 6],
    5: [1, 2, 3, 5, 6],
    6: [0, 1, 2, 3, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };

  return new Set(templates[Math.min(Math.max(profile.preferredWorkoutDaysPerWeek, 1), 7)]);
}

function buildDayPlan(params: {
  config: SimulationConfig;
  dayIndex: number;
  plannedWeekDays: Set<number>;
  profile: SimulationUserProfile;
}) {
  const { config, dayIndex, plannedWeekDays, profile } = params;
  const date = addDays(config.startDate, dayIndex);
  const weekday = new Date(`${date}T00:00:00`).getDay();

  return {
    dayIndex,
    date,
    isPlannedTrainingDay: plannedWeekDays.has(weekday),
    targetDurationMin: profile.preferredSessionDurationMin,
  } satisfies SimulationDayPlan;
}

export function runSimulation(params?: {
  config?: Partial<SimulationConfig>;
  profile?: SimulationUserProfile;
  profilePreset?: string;
}): SimulationReport {
  const config = normalizeConfig(params?.config);
  const profile = params?.profile ?? getSimulationProfilePreset(params?.profilePreset);
  const random = createSeededRandom(config.randomSeed);
  const plannedWeekDays = getPlannedWorkoutDays(profile, config);
  const dailySnapshots: SimulationDailySnapshot[] = [];
  const plannerDebug: SimulationPlannerDebugEntry[] = [];
  let state = createInitialSimulationState(profile);

  for (let dayIndex = 0; dayIndex < config.totalDays; dayIndex += 1) {
    const dayPlan = buildDayPlan({ config, dayIndex, plannedWeekDays, profile });
    const stateBefore = normalizeSimulationState(
      { ...state, dayIndex },
      profile,
      config,
    );
    let stateAfter = stateBefore;
    let workoutResult;
    let generatedWorkoutSummary: GeneratedWorkoutSummary | undefined;

    if (dayPlan.isPlannedTrainingDay) {
      const adherence = shouldTrainToday({ config, profile, random, state: stateBefore });

      if (adherence.train) {
        const recentExercises = getRecentExerciseDebug(dailySnapshots);
        workoutResult = simulateWorkout({ dayPlan, profile, random, state: stateBefore });
        stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, profile, config);
        generatedWorkoutSummary = {
          workoutId: workoutResult.workoutId,
          workoutName: workoutResult.workoutName,
          blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
          exerciseCount: workoutResult.exerciseResults.length,
          estimatedVolumeScore: workoutResult.estimatedLoadScore,
          plannerSource: "synthetic",
          plannerNote: "Syntetisk snabbmodell användes.",
        };

        if (config.enablePlannerDebug) {
          const afterNormalization = workoutResult.exerciseResults.map((exercise) =>
            toPlannerDebugExercise(exercise),
          );

          plannerDebug.push({
            dayIndex,
            date: dayPlan.date,
            plannerMode: "synthetic",
            source: "synthetic",
            // Syntetisk modell skapar redan simulatornormaliserade övningar.
            beforeNormalization: afterNormalization,
            afterNormalization,
            repeatedAggregationKeys: findRepeatedKeys({
              exercises: afterNormalization,
              recentExercises,
            }),
            note: generatedWorkoutSummary.plannerNote,
          });
        }
      } else {
        workoutResult = buildMissedWorkoutResult({
          dayPlan,
          profile,
          skipReason: adherence.skipReason ?? "random",
        });
        stateAfter = applyMissedWorkoutState(stateBefore, profile, config);
      }
    } else {
      stateAfter = applyRestDayRecovery(stateBefore, profile, config);
    }

    if (
      config.enableDeloadDetection &&
      stateAfter.fatigue >= config.deloadFatigueThreshold &&
      dayIndex - (stateAfter.lastDeloadDayIndex ?? -99) > 7
    ) {
      // Deload representeras i första versionen som extra återhämtningsdag i state.
      stateAfter = normalizeSimulationState(
        {
          ...stateAfter,
          fatigue: stateAfter.fatigue - 14,
          soreness: stateAfter.soreness - 10,
          motivation: stateAfter.motivation + 4,
          lastDeloadDayIndex: dayIndex,
        },
        profile,
        config,
      );
    }

    dailySnapshots.push({
      dayIndex,
      date: dayPlan.date,
      stateBefore,
      plannedTraining: dayPlan,
      generatedWorkoutSummary,
      workoutResult,
      stateAfter,
    });

    state = stateAfter;
  }

  const timeSeries = buildTimeSeries(dailySnapshots);
  const exerciseAggregates = buildExerciseAggregates(dailySnapshots);
  const evaluation = evaluateSimulation({ dailySnapshots, profile });

  return {
    config,
    profile,
    dailySnapshots,
    timeSeries,
    exerciseAggregates,
    evaluation,
    plannerDebug: config.enablePlannerDebug ? plannerDebug : undefined,
  };
}
