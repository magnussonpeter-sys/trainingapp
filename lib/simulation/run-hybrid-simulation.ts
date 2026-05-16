import { shouldTrainToday } from "@/lib/simulation/adherence";
import { planAiSimulationWorkout } from "@/lib/simulation/ai-workout-planner";
import { buildTimeSeries } from "@/lib/simulation/build-time-series";
import {
  addDays,
  adjustScenarioWorkoutDuration,
  applyScenarioProfileTweaks,
  buildPlannedWorkoutDaySet,
  buildScenarioNotes,
  formatPlannedWorkoutDayLabels,
  getWeekdayIndexForDate,
  getWeekdayLabel,
  normalizePlannedWorkoutDayIndices,
  normalizeSimulationScenario,
  shouldAddSpontaneousWorkout,
  shouldForceMissPlannedWorkout,
} from "@/lib/simulation/scenario-helpers";
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

function normalizeConfig(config?: Partial<SimulationConfig>): SimulationConfig {
  const totalDays = Math.min(Math.max(Math.round(config?.totalDays ?? 56), 28), 84);

  return {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config,
    plannerMode: config?.plannerMode === "real_app_planner" ? "real_app_planner" : "hybrid_ai",
    scenario: normalizeSimulationScenario(config?.scenario),
    enablePlannerDebug: Boolean(config?.enablePlannerDebug),
    totalDays,
    randomSeed: Math.max(1, Math.round(config?.randomSeed ?? DEFAULT_SIMULATION_CONFIG.randomSeed)),
    startDate: config?.startDate?.trim() || DEFAULT_SIMULATION_CONFIG.startDate,
    plannedWorkoutDayIndices: normalizePlannedWorkoutDayIndices(
      config?.plannedWorkoutDayIndices,
    ),
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

function buildDayPlan(params: {
  config: SimulationConfig;
  dayIndex: number;
  plannedWeekDays: Set<number>;
  profile: SimulationUserProfile;
}) {
  const date = addDays(params.config.startDate, params.dayIndex);
  const weekdayIndex = getWeekdayIndexForDate(date);

  return {
    dayIndex: params.dayIndex,
    date,
    weekdayIndex,
    weekday: getWeekdayLabel(weekdayIndex),
    isPlannedTrainingDay: params.plannedWeekDays.has(weekdayIndex),
    targetDurationMin: params.profile.preferredSessionDurationMin,
  } satisfies SimulationDayPlan;
}

export async function runHybridSimulation(params?: {
  config?: Partial<SimulationConfig>;
  profile?: SimulationUserProfile;
  profilePreset?: string;
}): Promise<SimulationReport> {
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
      plannerMode: config.plannerMode ?? "hybrid_ai",
      scenario: config.scenario ?? "normal",
    }),
    ...scenarioProfile.notes,
  ];
  let state = createInitialSimulationState(profile);
  let plannedWorkoutOrdinal = 0;

  for (let dayIndex = 0; dayIndex < config.totalDays; dayIndex += 1) {
    const dayPlan = buildDayPlan({ config, dayIndex, plannedWeekDays, profile });
    const stateBefore = normalizeSimulationState({ ...state, dayIndex }, profile, config);
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
        : shouldTrainToday({
            config,
            profile,
            random,
            state: stateBefore,
            scenario: config.scenario ?? "normal",
          });
      plannedWorkoutOrdinal += 1;

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
        workoutResult = {
          ...workoutResult,
          actualDurationMin: adjustScenarioWorkoutDuration({
            scenario: config.scenario ?? "normal",
            plannedDurationMin: workoutResult.plannedDurationMin,
            actualDurationMin: workoutResult.actualDurationMin,
            random,
          }),
        };
        stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, profile, config);
        dayEvent = "planned_training";
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
            weekday: dayPlan.weekday,
            isPlannedTrainingDay: dayPlan.isPlannedTrainingDay,
            plannerMode: config.plannerMode ?? "hybrid_ai",
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
        dayEvent = "missed_planned";
      }
    } else if (
      shouldAddSpontaneousWorkout({
        scenario: config.scenario ?? "normal",
        date: dayPlan.date,
        plannedWeekDays,
        random,
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
        actualDurationMin: adjustScenarioWorkoutDuration({
          scenario: config.scenario ?? "normal",
          plannedDurationMin: workoutResult.plannedDurationMin,
          actualDurationMin: workoutResult.actualDurationMin,
          random,
        }),
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

    dailySnapshots.push({
      dayIndex,
      date: dayPlan.date,
      dayEvent,
      plannedByScenario: dayPlan.isPlannedTrainingDay,
      userOutcome:
        dayEvent === "planned_training" || dayEvent === "spontaneous_training"
          ? "completed"
          : dayEvent === "missed_planned"
            ? "user_missed"
            : "skipped",
      generationStatus:
        generatedWorkoutSummary?.passGenerationMode === "real_ai"
          ? "real_ai"
          : generatedWorkoutSummary?.passGenerationMode === "fallback_mock"
            ? "fallback_mock"
            : generatedWorkoutSummary?.passGenerationMode === "failed_generation"
              ? "generation_failed"
              : "not_attempted",
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
