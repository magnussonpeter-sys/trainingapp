import { shouldTrainToday } from "@/lib/simulation/adherence";
import { planAiSimulationWorkout } from "@/lib/simulation/ai-workout-planner";
import { buildTimeSeries } from "@/lib/simulation/build-time-series";
import {
  toPlannerDebugExercise,
} from "@/lib/simulation/exercise-identity";
import {
  buildExerciseAggregates,
  evaluateSimulation,
} from "@/lib/simulation/evaluate-simulation";
import { getSimulationProfilePreset } from "@/lib/simulation/profile-presets";
import { createSeededRandom } from "@/lib/simulation/random";
import { DEFAULT_SIMULATION_CONFIG } from "@/lib/simulation/run-simulation";
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

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeConfig(config?: Partial<SimulationConfig>): SimulationConfig {
  const totalDays = Math.min(Math.max(Math.round(config?.totalDays ?? 56), 28), 84);

  return {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config,
    plannerMode: "hybrid_ai",
    enablePlannerDebug: Boolean(config?.enablePlannerDebug),
    totalDays,
    randomSeed: Math.max(1, Math.round(config?.randomSeed ?? DEFAULT_SIMULATION_CONFIG.randomSeed)),
    startDate: config?.startDate?.trim() || DEFAULT_SIMULATION_CONFIG.startDate,
  };
}

function getRecentExerciseDebug(
  snapshots: SimulationDailySnapshot[],
): SimulationPlannerDebugExercise[] {
  const recentSnapshots = snapshots.slice(-14);

  return recentSnapshots.flatMap((snapshot) =>
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
  const date = addDays(params.config.startDate, params.dayIndex);
  const weekday = new Date(`${date}T00:00:00`).getDay();

  return {
    dayIndex: params.dayIndex,
    date,
    isPlannedTrainingDay: params.plannedWeekDays.has(weekday),
    targetDurationMin: params.profile.preferredSessionDurationMin,
  } satisfies SimulationDayPlan;
}

export async function runHybridSimulation(params?: {
  config?: Partial<SimulationConfig>;
  profile?: SimulationUserProfile;
  profilePreset?: string;
}): Promise<SimulationReport> {
  const config = normalizeConfig(params?.config);
  const profile = params?.profile ?? getSimulationProfilePreset(params?.profilePreset);
  const random = createSeededRandom(config.randomSeed);
  const plannedWeekDays = getPlannedWorkoutDays(profile, config);
  const dailySnapshots: SimulationDailySnapshot[] = [];
  const plannerDebug: SimulationPlannerDebugEntry[] = [];
  let state = createInitialSimulationState(profile);

  for (let dayIndex = 0; dayIndex < config.totalDays; dayIndex += 1) {
    const dayPlan = buildDayPlan({ config, dayIndex, plannedWeekDays, profile });
    const stateBefore = normalizeSimulationState({ ...state, dayIndex }, profile, config);
    let stateAfter = stateBefore;
    let workoutResult;
    let generatedWorkoutSummary: GeneratedWorkoutSummary | undefined;

    if (dayPlan.isPlannedTrainingDay) {
      const adherence = shouldTrainToday({ config, profile, random, state: stateBefore });

      if (adherence.train) {
        // Hybrid: AI väljer pass, lokal modell simulerar utförandet.
        const recentExercises = getRecentExerciseDebug(dailySnapshots);
        const plannerResult = await planAiSimulationWorkout({
          dayPlan,
          profile,
          recentExercises,
          random,
          state: stateBefore,
        });

        const beforeNormalization =
          plannerResult.source === "ai" ? plannerResult.rawExercises : [];
        workoutResult = simulateWorkout({
          dayPlan,
          plannedExercises: plannerResult.exercises ?? undefined,
          profile,
          random,
          state: stateBefore,
        });
        stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, profile, config);
        generatedWorkoutSummary = {
          workoutId: workoutResult.workoutId,
          workoutName:
            plannerResult.source === "ai"
              ? `AI ${workoutResult.workoutName}`
              : workoutResult.workoutName,
          blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
          exerciseCount: workoutResult.exerciseResults.length,
          estimatedVolumeScore: workoutResult.estimatedLoadScore,
          plannerSource:
            plannerResult.source === "ai" ? "ai" : "ai_fallback",
          plannerNote: plannerResult.message,
        };

        if (config.enablePlannerDebug) {
          const afterNormalization = workoutResult.exerciseResults.map((exercise) =>
            toPlannerDebugExercise(exercise),
          );

          plannerDebug.push({
            dayIndex,
            date: dayPlan.date,
            plannerMode: "hybrid_ai",
            source: generatedWorkoutSummary.plannerSource ?? "ai_fallback",
            beforeNormalization:
              beforeNormalization.length > 0 ? beforeNormalization : afterNormalization,
            afterNormalization,
            repeatedAggregationKeys: findRepeatedKeys({
              exercises: afterNormalization,
              recentExercises,
            }),
            note: plannerResult.message,
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
