import { shouldTrainToday } from "@/lib/simulation/adherence";
import { buildTimeSeries } from "@/lib/simulation/build-time-series";
import { toPlannerDebugExercise } from "@/lib/simulation/exercise-identity";
import {
  addDays,
  adjustScenarioWorkoutDuration,
  applyScenarioProfileTweaks,
  buildPlannedWorkoutDaySet,
  buildScenarioNotes,
  getWeekdayIndexForDate,
  getWeekdayLabel,
  normalizeSimulationPlannerMode,
  normalizeSimulationScenario,
  shouldAddSpontaneousWorkout,
  shouldForceMissPlannedWorkout,
  formatPlannedWorkoutDayLabels,
  normalizePlannedWorkoutDayIndices,
} from "@/lib/simulation/scenario-helpers";
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
    plannerMode: normalizeSimulationPlannerMode(config?.plannerMode),
    scenario: normalizeSimulationScenario(config?.scenario),
    minRestDayProbability: Math.min(Math.max(config?.minRestDayProbability ?? 0.08, 0), 0.6),
    maxFatigue: Math.max(60, config?.maxFatigue ?? 100),
    maxSoreness: Math.max(60, config?.maxSoreness ?? 100),
    plannedWorkoutDayIndices: normalizePlannedWorkoutDayIndices(
      config?.plannedWorkoutDayIndices,
    ),
  };
}

function buildDayPlan(params: {
  config: SimulationConfig;
  dayIndex: number;
  plannedWeekDays: Set<number>;
  profile: SimulationUserProfile;
}) {
  const { config, dayIndex, plannedWeekDays, profile } = params;
  const date = addDays(config.startDate, dayIndex);
  const weekdayIndex = getWeekdayIndexForDate(date);

  return {
    dayIndex,
    date,
    weekdayIndex,
    weekday: getWeekdayLabel(weekdayIndex),
    isPlannedTrainingDay: plannedWeekDays.has(weekdayIndex),
    targetDurationMin: profile.preferredSessionDurationMin,
  } satisfies SimulationDayPlan;
}

export function runSimulation(params?: {
  config?: Partial<SimulationConfig>;
  profile?: SimulationUserProfile;
  profilePreset?: string;
}): SimulationReport {
  const config = normalizeConfig(params?.config);
  const profileSeed = params?.profile ?? getSimulationProfilePreset(params?.profilePreset);
  const scenarioProfile = applyScenarioProfileTweaks({
    profile: profileSeed,
    scenario: config.scenario ?? "normal",
  });
  const profile = scenarioProfile.profile;
  const random = createSeededRandom(config.randomSeed);
  const plannedWeekDays = buildPlannedWorkoutDaySet({ config, profile });
  const dailySnapshots: SimulationDailySnapshot[] = [];
  const plannerDebug: SimulationPlannerDebugEntry[] = [];
  const notes = [
    ...buildScenarioNotes({
      plannerMode: config.plannerMode ?? "synthetic",
      scenario: config.scenario ?? "normal",
    }),
    ...scenarioProfile.notes,
  ];
  let state = createInitialSimulationState(profile);
  let plannedWorkoutOrdinal = 0;

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
    let dayEvent: SimulationDailySnapshot["dayEvent"] = "rest";

    if (dayPlan.isPlannedTrainingDay) {
      const forcedMiss = shouldForceMissPlannedWorkout({
        scenario: config.scenario ?? "normal",
        plannedWorkoutOrdinal,
      });
      const adherence = forcedMiss
        ? { train: false, skipReason: "random" as const }
        : shouldTrainToday({ config, profile, random, state: stateBefore });
      plannedWorkoutOrdinal += 1;

      if (adherence.train) {
        const recentExercises = getRecentExerciseDebug(dailySnapshots);
        workoutResult = simulateWorkout({ dayPlan, profile, random, state: stateBefore });
        workoutResult = {
          ...workoutResult,
          actualDurationMin: adjustScenarioWorkoutDuration({
            scenario: config.scenario ?? "normal",
            plannedDurationMin: workoutResult.plannedDurationMin,
            actualDurationMin: workoutResult.actualDurationMin,
          }),
        };
        stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, profile, config);
        dayEvent = "planned_training";
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
            weekday: dayPlan.weekday,
            isPlannedTrainingDay: dayPlan.isPlannedTrainingDay,
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
        dayEvent = "missed_planned";
      }
    } else if (
      shouldAddSpontaneousWorkout({
        scenario: config.scenario ?? "normal",
        dayIndex,
        date: dayPlan.date,
        plannedWeekDays,
      })
    ) {
      const spontaneousPlan = {
        ...dayPlan,
        targetDurationMin: Math.max(20, Math.round(profile.preferredSessionDurationMin * 0.75)),
      };
      workoutResult = simulateWorkout({
        dayPlan: spontaneousPlan,
        profile,
        random,
        state: stateBefore,
      });
      workoutResult = {
        ...workoutResult,
        workoutName: "Spontant pass före planerad träningsdag",
      };
      stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, profile, config);
      dayEvent = "spontaneous_training";
      generatedWorkoutSummary = {
        workoutId: workoutResult.workoutId,
        workoutName: workoutResult.workoutName,
        blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
        exerciseCount: workoutResult.exerciseResults.length,
        estimatedVolumeScore: workoutResult.estimatedLoadScore,
        plannerSource: "synthetic",
        plannerNote: "Scenario lade in ett spontant pass på vilodag.",
      };
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
      dayEvent,
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
    plannedWorkoutDayIndices: Array.from(plannedWeekDays).sort((left, right) => left - right),
    plannedWorkoutDayLabels: formatPlannedWorkoutDayLabels(Array.from(plannedWeekDays)),
    notes,
    dailySnapshots,
    timeSeries,
    exerciseAggregates,
    evaluation,
    plannerDebug: config.enablePlannerDebug ? plannerDebug : undefined,
  };
}
