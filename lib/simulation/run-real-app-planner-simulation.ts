import { shouldTrainToday } from "@/lib/simulation/adherence";
import { buildTimeSeries } from "@/lib/simulation/build-time-series";
import { buildExerciseAggregates, evaluateSimulation } from "@/lib/simulation/evaluate-simulation";
import { getSimulationProfilePreset } from "@/lib/simulation/profile-presets";
import { createSeededRandom } from "@/lib/simulation/random";
import { DEFAULT_SIMULATION_CONFIG } from "@/lib/simulation/run-simulation";
import { buildEffectiveSimulationUserProfile } from "@/lib/simulation/effective-user-profile";
import { getPlanningDurationBucket } from "@/lib/workout-generation/coach-context";
import {
  addDays,
  adjustScenarioWorkoutDuration,
  applyScenarioProfileTweaks,
  buildPlannedWorkoutDaySet,
  buildScenarioNotes,
  deriveSimulationPlannedWorkoutDayIndices,
  formatPlannedWorkoutDayLabels,
  getWeekdayIndexForDate,
  getWeekdayLabel,
  normalizeAvailableTrainingDayIndices,
  normalizePlannedWorkoutDayIndices,
  normalizeSimulationScenario,
  shouldAddSpontaneousWorkout,
  shouldForceMissPlannedWorkout,
} from "@/lib/simulation/scenario-helpers";
import {
  applyMissedWorkoutState,
  applyRestDayRecovery,
  applyWorkoutFatigue,
  createInitialSimulationState,
  normalizeSimulationState,
} from "@/lib/simulation/state";
import {
  buildMissedWorkoutResult,
  buildSyntheticWorkoutPlan,
  simulateWorkout,
} from "@/lib/simulation/simulate-workout";
import type {
  SimulationConfig,
  SimulationDailySnapshot,
  SimulationDayPlan,
  SimulationPlannerDebugEntry,
  SimulationReport,
  SimulationUserProfile,
} from "@/lib/simulation/types";
import {
  buildTrainingHistoryContext,
} from "@/lib/planning/training-history-context";
import {
  buildWeeklyPlanContext,
  buildWeeklyPlanStatus,
  deriveWeeklyPlanState,
  getWeekStartDate,
  type WeeklyPlanSettings,
} from "@/lib/planning/weekly-plan";
import { buildWeeklyWorkoutStructure } from "@/lib/weekly-workout-structure";
import {
  applyTrainingDoseAdjustmentToDuration,
  buildSimulationWeekPlannedSessions,
  buildSimulationWeeklyPlanSettings,
  buildSimulationWorkoutLogsFromSnapshots,
  formatSimulationFocusLabel,
  getSimulationPriorityMuscles,
} from "@/lib/simulation/real-app-planner-helpers";
import type { WorkoutFocus } from "@/types/workout";

function normalizeConfig(config?: Partial<SimulationConfig>): SimulationConfig {
  const totalDays = Math.min(Math.max(Math.round(config?.totalDays ?? 56), 28), 84);

  return {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config,
    plannerMode: "real_app_planner",
    trainingDoseMode: config?.trainingDoseMode === "manual" ? "manual" : "recommended",
    scenario: normalizeSimulationScenario(config?.scenario),
    enablePlannerDebug: Boolean(config?.enablePlannerDebug),
    totalDays,
    randomSeed: Math.max(1, Math.round(config?.randomSeed ?? DEFAULT_SIMULATION_CONFIG.randomSeed)),
    startDate: config?.startDate?.trim() || DEFAULT_SIMULATION_CONFIG.startDate,
    availableTrainingDayIndices: normalizeAvailableTrainingDayIndices(
      config?.availableTrainingDayIndices,
    ),
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

function buildSuggestedSyntheticExercises(params: {
  dayPlan: SimulationDayPlan;
  profile: SimulationUserProfile;
  random: ReturnType<typeof createSeededRandom>;
  state: ReturnType<typeof createInitialSimulationState>;
  focus: WorkoutFocus | "recovery_strength";
}) {
  const plannerDayPlan = {
    ...params.dayPlan,
    targetDurationMin:
      params.focus === "recovery_strength"
        ? Math.max(15, Math.round(params.dayPlan.targetDurationMin * 0.65))
        : params.dayPlan.targetDurationMin,
  };

  return buildSyntheticWorkoutPlan({
    dayPlan: plannerDayPlan,
    profile: params.profile,
    random: params.random,
    state: params.state,
    focusHint: params.focus === "recovery_strength" ? undefined : params.focus,
  });
}

export async function runRealAppPlannerSimulation(params?: {
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
  const availableTrainingDayIndices =
    normalizeAvailableTrainingDayIndices(config.availableTrainingDayIndices).length > 0
      ? normalizeAvailableTrainingDayIndices(config.availableTrainingDayIndices)
      : normalizePlannedWorkoutDayIndices(config.plannedWorkoutDayIndices);
  const plannedWeekDays = buildPlannedWorkoutDaySet({ config, profile });
  const plannedWorkoutDayIndices = deriveSimulationPlannedWorkoutDayIndices({
    availableTrainingDayIndices,
    plannedWorkoutDayIndices: config.plannedWorkoutDayIndices,
    preferredWorkoutDaysPerWeek: profile.preferredWorkoutDaysPerWeek,
  });
  const effectiveProfileBundle = buildEffectiveSimulationUserProfile({
    profile,
    plannedWorkoutDayIndices,
    profilePresetId: params?.profilePreset ?? profile.id,
  });
  const effectiveSimulationProfile: SimulationUserProfile = {
    ...profile,
    age: effectiveProfileBundle.effectiveUserProfile.effectiveAge ?? profile.age,
    heightCm:
      effectiveProfileBundle.effectiveUserProfile.effectiveHeightCm ?? profile.heightCm,
    weightKg:
      effectiveProfileBundle.effectiveUserProfile.effectiveWeightKg ?? profile.weightKg,
    goal: effectiveProfileBundle.effectiveUserProfile.effectiveGoal,
    experienceLevel:
      effectiveProfileBundle.effectiveUserProfile.effectiveExperienceLevel,
    preferredSessionDurationMin:
      effectiveProfileBundle.effectiveUserProfile
        .effectivePreferredDurationMinutes ?? profile.preferredSessionDurationMin,
    availableEquipmentIds:
      effectiveProfileBundle.effectiveUserProfile.effectiveEquipment,
  };
  const dailySnapshots: SimulationDailySnapshot[] = [];
  const plannerDebug: SimulationPlannerDebugEntry[] = [];
  const notes = [
    ...buildScenarioNotes({
      plannerMode: "real_app_planner",
      scenario: config.scenario ?? "normal",
    }),
    ...scenarioProfile.notes,
    "real_app_planner använder riktiga weekly-plan-helpers dag för dag. Själva passutförandet är tills vidare syntetiskt mockat.",
    ...effectiveProfileBundle.effectiveUserProfile.warnings,
  ];
  let state = createInitialSimulationState(effectiveSimulationProfile);
  let plannedWorkoutOrdinal = 0;

  for (let dayIndex = 0; dayIndex < config.totalDays; dayIndex += 1) {
    const dayPlan = buildDayPlan({
      config,
      dayIndex,
      plannedWeekDays,
      profile: effectiveSimulationProfile,
    });
    const stateBefore = normalizeSimulationState(
      { ...state, dayIndex },
      effectiveSimulationProfile,
      config,
    );
    const workoutLogs = buildSimulationWorkoutLogsFromSnapshots({
      profile: effectiveSimulationProfile,
      snapshots: dailySnapshots,
    });
    let stateAfter = stateBefore;
    let workoutResult;
    let generatedWorkoutSummary: SimulationDailySnapshot["generatedWorkoutSummary"] | undefined;
    let dayEvent: SimulationDailySnapshot["dayEvent"] = "rest";
    let userOutcome: SimulationDailySnapshot["userOutcome"] = "skipped";
    let generationStatus: SimulationDailySnapshot["generationStatus"] = "not_attempted";

    if (dayPlan.isPlannedTrainingDay) {
      const currentDate = new Date(`${dayPlan.date}T12:00:00`);
      const weekStartDate = getWeekStartDate(currentDate);
      const simulationPriorityMuscles = getSimulationPriorityMuscles(
        config.scenario ?? "normal",
      );
      const weeklySettings: WeeklyPlanSettings = buildSimulationWeeklyPlanSettings({
        profile: {
          ...effectiveSimulationProfile,
          goal: effectiveProfileBundle.effectiveUserProfile.effectiveGoal,
          experienceLevel:
            effectiveProfileBundle.effectiveUserProfile.effectiveExperienceLevel,
          preferredSessionDurationMin:
            effectiveProfileBundle.effectiveUserProfile
              .effectivePreferredDurationMinutes ??
            effectiveSimulationProfile.preferredSessionDurationMin,
          availableEquipmentIds:
            effectiveProfileBundle.effectiveUserProfile.effectiveEquipment,
        },
        availableTrainingDayIndices:
          availableTrainingDayIndices.length > 0
            ? availableTrainingDayIndices
            : plannedWorkoutDayIndices,
        priorityMuscles: simulationPriorityMuscles,
        trainingDoseMode: config.trainingDoseMode,
        nowIso: dayPlan.date,
      });
      const plannedSessions = buildSimulationWeekPlannedSessions({
        settings: weeklySettings,
        weekStartDate,
      });
      const weeklyPlanState = deriveWeeklyPlanState({
        settings: weeklySettings,
        plannedSessions,
        workoutLogs,
        now: currentDate,
        goal: effectiveSimulationProfile.goal,
        priorityMuscles: simulationPriorityMuscles,
      });
      const weeklyPlanStatus = buildWeeklyPlanStatus(weeklyPlanState);
      const weeklyPlanContext = buildWeeklyPlanContext(weeklyPlanState);
      const weeklyStructure = buildWeeklyWorkoutStructure({
        logs: workoutLogs,
        now: currentDate,
        settings: {
          experience_level: effectiveSimulationProfile.experienceLevel,
          training_goal: effectiveSimulationProfile.goal,
          sport_focus: effectiveSimulationProfile.sportFocus ?? "none",
          primary_priority_muscle: simulationPriorityMuscles[0] ?? null,
          secondary_priority_muscle: simulationPriorityMuscles[1] ?? null,
          tertiary_priority_muscle: simulationPriorityMuscles[2] ?? null,
          preferred_session_duration_minutes: weeklySettings.defaultDurationMinutes,
          min_session_duration_minutes: weeklySettings.minDurationMinutes,
          max_session_duration_minutes: weeklySettings.maxDurationMinutes,
        },
        missedPlannedSessionsCount: weeklyPlanState.missedSessions.length,
        preferredSessionDurationMinutes: weeklySettings.defaultDurationMinutes,
        minSessionDurationMinutes: weeklySettings.minDurationMinutes,
        maxSessionDurationMinutes: weeklySettings.maxDurationMinutes,
      });
      const adjustedSuggestedDurationMinutes = applyTrainingDoseAdjustmentToDuration({
        baseDurationMinutes: weeklyPlanStatus.suggestedNextDurationMinutes,
        adjustment: weeklyStructure.trainingDoseAdjustment,
        minDurationMinutes: weeklySettings.minDurationMinutes,
        maxDurationMinutes: weeklySettings.maxDurationMinutes,
      });
      const plannerCoachText = weeklyStructure.optimalPlanText;
      const trainingHistoryContext = buildTrainingHistoryContext({
        workoutLogs,
        now: currentDate,
        weeklyPlanPriorityMuscles: weeklyPlanContext.priorityMuscles,
        weeklyPlanDeficits: weeklyPlanContext.muscleSetDeficits,
        adherenceEstimate:
          weeklyPlanContext.sessionsPerWeek > 0
            ? weeklyPlanContext.completedSessionCreditThisWeek /
              weeklyPlanContext.sessionsPerWeek
            : null,
      });

      const forcedMiss = shouldForceMissPlannedWorkout({
        scenario: config.scenario ?? "normal",
        plannedWorkoutOrdinal,
      });
      const adherence = forcedMiss
        ? { train: false, skipReason: "random" as const }
        : shouldTrainToday({
            config,
            profile: effectiveSimulationProfile,
            random,
            state: stateBefore,
            scenario: config.scenario ?? "normal",
          });
      plannedWorkoutOrdinal += 1;

      if (adherence.train) {
        const plannedFocus = weeklyPlanStatus.suggestedNextWorkoutFocus;
        const plannerDayPlan = {
          ...dayPlan,
          targetDurationMin: adjustedSuggestedDurationMinutes,
        };
        const plannedExercises = buildSuggestedSyntheticExercises({
          dayPlan: plannerDayPlan,
          profile: effectiveSimulationProfile,
          random,
          state: stateBefore,
          focus: plannedFocus,
        });
        workoutResult = simulateWorkout({
          dayPlan: plannerDayPlan,
          plannedExercises,
          profile: effectiveSimulationProfile,
          random,
          state: stateBefore,
        });
        workoutResult = {
          ...workoutResult,
          workoutName: `Real planner ${formatSimulationFocusLabel(
            weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
          )}`,
          actualDurationMin: adjustScenarioWorkoutDuration({
            scenario: config.scenario ?? "normal",
            plannedDurationMin: workoutResult.plannedDurationMin,
            actualDurationMin: workoutResult.actualDurationMin,
            random,
          }),
        };
        stateAfter = applyWorkoutFatigue(
          stateBefore,
          workoutResult,
          effectiveSimulationProfile,
          config,
        );
        dayEvent = "planned_training";
        userOutcome = "completed";
        generationStatus = "not_attempted";
        generatedWorkoutSummary = {
          workoutId: workoutResult.workoutId,
          workoutName: workoutResult.workoutName,
          blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
          exerciseCount: workoutResult.exerciseResults.length,
          estimatedVolumeScore: workoutResult.estimatedLoadScore,
          plannerSource: "real_app_planner",
          plannerNote: `Verklig planner valde ${plannedFocus}. Passet är syntetiskt mockat för simulationen.`,
        };
      } else {
        workoutResult = buildMissedWorkoutResult({
          dayPlan: {
            ...dayPlan,
            targetDurationMin: adjustedSuggestedDurationMinutes,
          },
          profile: effectiveSimulationProfile,
          skipReason: adherence.skipReason ?? "random",
        });
        stateAfter = applyMissedWorkoutState(
          stateBefore,
          effectiveSimulationProfile,
          config,
        );
        dayEvent = "missed_planned";
        userOutcome = "user_missed";
        generationStatus = "not_attempted";
      }

      if (config.enablePlannerDebug) {
        plannerDebug.push({
          dayIndex,
          date: dayPlan.date,
          weekday: dayPlan.weekday,
          isPlannedTrainingDay: true,
          plannerMode: "real_app_planner",
          source: "real_app_planner",
          // real_app_planner fokuserar på veckoplanbeslutet; passet är mockat och har ingen AI-normalisering.
          beforeNormalization: [],
          afterNormalization: [],
          repeatedAggregationKeys: [],
          note: generatedWorkoutSummary?.plannerNote ?? weeklyPlanStatus.message,
          realAppPlanner: {
            weekStartDate,
            suggestedNextFocus: weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
            suggestedNextWorkoutFocus: weeklyPlanStatus.suggestedNextWorkoutFocus,
            suggestedNextDurationMinutes: adjustedSuggestedDurationMinutes,
            displayDurationMinutes: adjustedSuggestedDurationMinutes,
            planningDurationBucket: getPlanningDurationBucket(
              adjustedSuggestedDurationMinutes,
            ),
            timeBudgetMinutes: adjustedSuggestedDurationMinutes,
            durationBucketReason:
              getPlanningDurationBucket(adjustedSuggestedDurationMinutes) ===
              adjustedSuggestedDurationMinutes
                ? "requested_duration_matches_bucket"
                : `requested_${adjustedSuggestedDurationMinutes}_uses_${getPlanningDurationBucket(
                    adjustedSuggestedDurationMinutes,
                  )}_minute_bucket`,
            actualRecommendedDurationBeforeAdjustment:
              weeklyPlanStatus.suggestedNextDurationMinutes,
            actualRecommendedDurationAfterAdjustment: adjustedSuggestedDurationMinutes,
            durationAdjustmentReason: weeklyStructure.trainingDoseAdjustment.reason,
            coachText: plannerCoachText,
            goalReached: weeklyPlanStatus.goalReached,
            priorityMuscles: weeklyPlanContext.priorityMuscles,
            recoveryLimitedMuscles: weeklyPlanContext.recoveryLimitedMuscles,
            muscleSetDeficits: weeklyPlanContext.muscleSetDeficits,
            trainingDoseAdjustment: weeklyStructure.trainingDoseAdjustment,
            passGenerationMode: "mock_synthetic",
          },
          trainingHistoryContextSummary: {
            recentWorkoutsCount: trainingHistoryContext.recentWorkouts.length,
            progressionMemoryExerciseCount:
              trainingHistoryContext.exerciseProgressionMemory.length,
            mediumTermWindowDays:
              trainingHistoryContext.mediumTermTrainingSummary.windowDays,
            dataQuality: trainingHistoryContext.dataQuality,
            typicalWorkoutDurationMinutes:
              trainingHistoryContext.mediumTermTrainingSummary.typicalWorkoutDurationMinutes,
          },
        });
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
        targetDurationMin: Math.max(
          20,
          Math.round(effectiveSimulationProfile.preferredSessionDurationMin * 0.75),
        ),
      };
      workoutResult = simulateWorkout({
        dayPlan: spontaneousPlan,
        profile: effectiveSimulationProfile,
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
      stateAfter = applyWorkoutFatigue(
        stateBefore,
        workoutResult,
        effectiveSimulationProfile,
        config,
      );
      dayEvent = "spontaneous_training";
      userOutcome = "completed";
      generationStatus = "not_attempted";
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
      stateAfter = applyRestDayRecovery(
        stateBefore,
        effectiveSimulationProfile,
        config,
      );
      userOutcome = "skipped";
      generationStatus = "not_attempted";
    }

    dailySnapshots.push({
      dayIndex,
      date: dayPlan.date,
      dayEvent,
      plannedByScenario: dayPlan.isPlannedTrainingDay,
      userOutcome,
      generationStatus,
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
  const evaluation = evaluateSimulation({
    dailySnapshots,
    profile: effectiveSimulationProfile,
  });

  return {
    config,
    profile,
    effectiveUserProfile: effectiveProfileBundle.effectiveUserProfile,
    trainingDoseMode: config.trainingDoseMode,
    targetSessionsPerWeek: effectiveSimulationProfile.preferredWorkoutDaysPerWeek,
    availableTrainingDayIndices,
    availableTrainingDayLabels: formatPlannedWorkoutDayLabels(availableTrainingDayIndices),
    plannedWorkoutDayIndices,
    plannedWorkoutDayLabels: formatPlannedWorkoutDayLabels(plannedWorkoutDayIndices),
    preferredDaysWereUsedAsAvailability: availableTrainingDayIndices.length > 0,
    plannedDaysWereClampedToTargetSessions:
      availableTrainingDayIndices.length > plannedWorkoutDayIndices.length,
    highFrequencyWarningShown:
      config.trainingDoseMode === "manual" &&
      effectiveSimulationProfile.preferredWorkoutDaysPerWeek >= 6,
    notes,
    dailySnapshots,
    timeSeries,
    exerciseAggregates,
    evaluation,
    plannerDebug: config.enablePlannerDebug ? plannerDebug : undefined,
  };
}
