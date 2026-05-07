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
import {
  buildSimulationWeekPlannedSessions,
  buildSimulationWeeklyPlanSettings,
  buildSimulationWorkoutLogsFromSnapshots,
  formatSimulationFocusLabel,
  getSimulationPriorityMuscles,
} from "@/lib/simulation/real-app-planner-helpers";
import { shouldTrainToday } from "@/lib/simulation/adherence";
import { buildTimeSeries } from "@/lib/simulation/build-time-series";
import {
  buildPromptContextSummary,
  buildPlannerDebugExercisesFromWorkout,
  buildSimulationSettingsSummary,
  buildWeeklyBudgetPromptItems,
  buildWeeklyPlanPromptItems,
  adaptNormalizedWorkoutToSimulationPlan,
  getScenarioSpontaneousFocus,
} from "@/lib/simulation/full-app-chain-helpers";
import { buildEffectiveSimulationUserProfile } from "@/lib/simulation/effective-user-profile";
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
  buildExerciseAggregates,
  evaluateSimulation,
} from "@/lib/simulation/evaluate-simulation";
import { toPlannerDebugExercise } from "@/lib/simulation/exercise-identity";
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
import { generateWorkoutWithAiCore } from "@/lib/workouts/generate-workout-core";
import type { WorkoutFocus } from "@/types/workout";

function normalizeConfig(config?: Partial<SimulationConfig>): SimulationConfig {
  const totalDays = Math.min(Math.max(Math.round(config?.totalDays ?? 14), 7), 28);

  return {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config,
    plannerMode: "full_app_chain",
    scenario: normalizeSimulationScenario(config?.scenario),
    enablePlannerDebug: Boolean(config?.enablePlannerDebug),
    totalDays,
    randomSeed: Math.max(1, Math.round(config?.randomSeed ?? DEFAULT_SIMULATION_CONFIG.randomSeed)),
    startDate: config?.startDate?.trim() || DEFAULT_SIMULATION_CONFIG.startDate,
    plannedWorkoutDayIndices: normalizePlannedWorkoutDayIndices(
      config?.plannedWorkoutDayIndices,
    ),
    maxAiGeneratedWorkouts: Math.min(
      Math.max(Math.round(config?.maxAiGeneratedWorkouts ?? 4), 1),
      10,
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

function getRecentExerciseDebug(
  snapshots: SimulationDailySnapshot[],
) {
  return snapshots.slice(-14).flatMap((snapshot) =>
    (snapshot.workoutResult?.exerciseResults ?? []).map((exercise) =>
      toPlannerDebugExercise(exercise),
    ),
  );
}

function findRepeatedKeys(params: {
  recentExercises: ReturnType<typeof getRecentExerciseDebug>;
  afterNormalization: SimulationPlannerDebugEntry["afterNormalization"];
}) {
  const seenKeys = new Set(
    params.recentExercises.map((exercise) => exercise.aggregationKey),
  );

  return params.afterNormalization
    .map((exercise) => exercise.aggregationKey)
    .filter((key) => seenKeys.has(key));
}

function extractValidationDiagnostics(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    validation?: {
      focusIntegrityScore?: number;
      strengthSpecificityScore?: number;
      mustKeepViolations?: string[];
      offFocusWarnings?: string[];
      offFocusViolations?: string[];
      forbiddenExerciseViolations?: string[];
      lostMovementPatterns?: string[];
      lostPrimaryRoles?: string[];
      lostPriorityMuscles?: string[];
      deferredPriorityMuscles?: string[];
      removedPrimaryExercises?: string[];
      addedOffFocusExercises?: string[];
      removedBecauseOffFocus?: string[];
      removedBecauseRecovery?: string[];
      removedBecauseDuplicateRole?: string[];
      primaryLiftCount?: number;
      loadedProgressionExerciseCount?: number;
      bodyweightOnlyCount?: number;
      mainLiftMissingWarnings?: string[];
      repeatedPatternCount?: number;
      repeatedVariantGroups?: string[];
      plannedProgressionRepeats?: string[];
      fallbackRepeats?: string[];
      normalizationLossScore?: number;
      aiRawExercises?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        variantGroup?: string;
        movementPattern?: string;
        exerciseRole?: string;
      }>;
      afterCatalogMatch?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        variantGroup?: string;
        movementPattern?: string;
        exerciseRole?: string;
      }>;
      afterFocusRepair?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        variantGroup?: string;
        movementPattern?: string;
        exerciseRole?: string;
      }>;
      finalExercises?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        variantGroup?: string;
        movementPattern?: string;
        exerciseRole?: string;
      }>;
      rawToCatalogDiff?: Array<{
        type?: "removed" | "added";
        exerciseId?: string;
        exerciseName?: string;
        reason?: string;
      }>;
      catalogToFocusRepairDiff?: Array<{
        type?: "removed" | "added";
        exerciseId?: string;
        exerciseName?: string;
        reason?: string;
      }>;
      focusRepairToFinalDiff?: Array<{
        type?: "removed" | "added";
        exerciseId?: string;
        exerciseName?: string;
        reason?: string;
      }>;
      beforeAfterDiff?: Array<{
        type?: "removed" | "added";
        exerciseId?: string;
        exerciseName?: string;
        reason?: string;
      }>;
      validationContext?: {
        plannedFocus?: string | null;
        goal?: string;
        experienceLevel?: string | null;
        durationMinutes?: number;
        priorityMuscles?: string[];
        focusCompatiblePriorities?: string[];
        deferredPriorities?: string[];
        recoveryLimitedMuscles?: string[];
        availableEquipment?: string[];
      };
    };
  };

  const validation = record.validation;
  if (!validation) {
    return null;
  }

  return {
    focusIntegrityScore:
      typeof validation.focusIntegrityScore === "number"
        ? validation.focusIntegrityScore
        : 0,
    strengthSpecificityScore:
      typeof validation.strengthSpecificityScore === "number"
        ? validation.strengthSpecificityScore
        : 0,
    mustKeepViolations: Array.isArray(validation.mustKeepViolations)
      ? validation.mustKeepViolations
      : [],
    offFocusWarnings: Array.isArray(validation.offFocusWarnings)
      ? validation.offFocusWarnings
      : [],
    offFocusViolations: Array.isArray(validation.offFocusViolations)
      ? validation.offFocusViolations
      : [],
    forbiddenExerciseViolations: Array.isArray(
      validation.forbiddenExerciseViolations,
    )
      ? validation.forbiddenExerciseViolations
      : [],
    lostMovementPatterns: Array.isArray(validation.lostMovementPatterns)
      ? validation.lostMovementPatterns
      : [],
    lostPrimaryRoles: Array.isArray(validation.lostPrimaryRoles)
      ? validation.lostPrimaryRoles
      : [],
    lostPriorityMuscles: Array.isArray(validation.lostPriorityMuscles)
      ? validation.lostPriorityMuscles
      : [],
    deferredPriorityMuscles: Array.isArray(validation.deferredPriorityMuscles)
      ? validation.deferredPriorityMuscles
      : [],
    removedPrimaryExercises: Array.isArray(validation.removedPrimaryExercises)
      ? validation.removedPrimaryExercises
      : [],
    addedOffFocusExercises: Array.isArray(validation.addedOffFocusExercises)
      ? validation.addedOffFocusExercises
      : [],
    removedBecauseOffFocus: Array.isArray(validation.removedBecauseOffFocus)
      ? validation.removedBecauseOffFocus
      : [],
    removedBecauseRecovery: Array.isArray(validation.removedBecauseRecovery)
      ? validation.removedBecauseRecovery
      : [],
    removedBecauseDuplicateRole: Array.isArray(validation.removedBecauseDuplicateRole)
      ? validation.removedBecauseDuplicateRole
      : [],
    primaryLiftCount:
      typeof validation.primaryLiftCount === "number"
        ? validation.primaryLiftCount
        : 0,
    loadedProgressionExerciseCount:
      typeof validation.loadedProgressionExerciseCount === "number"
        ? validation.loadedProgressionExerciseCount
        : 0,
    bodyweightOnlyCount:
      typeof validation.bodyweightOnlyCount === "number"
        ? validation.bodyweightOnlyCount
        : 0,
    mainLiftMissingWarnings: Array.isArray(validation.mainLiftMissingWarnings)
      ? validation.mainLiftMissingWarnings
      : [],
    repeatedPatternCount:
      typeof validation.repeatedPatternCount === "number"
        ? validation.repeatedPatternCount
        : 0,
    repeatedVariantGroups: Array.isArray(validation.repeatedVariantGroups)
      ? validation.repeatedVariantGroups
      : [],
    plannedProgressionRepeats: Array.isArray(validation.plannedProgressionRepeats)
      ? validation.plannedProgressionRepeats
      : [],
    fallbackRepeats: Array.isArray(validation.fallbackRepeats)
      ? validation.fallbackRepeats
      : [],
    normalizationLossScore:
      typeof validation.normalizationLossScore === "number"
        ? validation.normalizationLossScore
        : 0,
    aiRawExercises: Array.isArray(validation.aiRawExercises)
      ? validation.aiRawExercises.filter(
          (entry): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["aiRawExercises"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.exerciseId === "string" &&
                typeof entry.exerciseName === "string" &&
                typeof entry.variantGroup === "string" &&
                typeof entry.movementPattern === "string" &&
                typeof entry.exerciseRole === "string",
            ),
        )
      : [],
    afterCatalogMatch: Array.isArray(validation.afterCatalogMatch)
      ? validation.afterCatalogMatch.filter(
          (entry): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["afterCatalogMatch"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.exerciseId === "string" &&
                typeof entry.exerciseName === "string" &&
                typeof entry.variantGroup === "string" &&
                typeof entry.movementPattern === "string" &&
                typeof entry.exerciseRole === "string",
            ),
        )
      : [],
    afterFocusRepair: Array.isArray(validation.afterFocusRepair)
      ? validation.afterFocusRepair.filter(
          (entry): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["afterFocusRepair"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.exerciseId === "string" &&
                typeof entry.exerciseName === "string" &&
                typeof entry.variantGroup === "string" &&
                typeof entry.movementPattern === "string" &&
                typeof entry.exerciseRole === "string",
            ),
        )
      : [],
    finalExercises: Array.isArray(validation.finalExercises)
      ? validation.finalExercises.filter(
          (entry): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["finalExercises"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.exerciseId === "string" &&
                typeof entry.exerciseName === "string" &&
                typeof entry.variantGroup === "string" &&
                typeof entry.movementPattern === "string" &&
                typeof entry.exerciseRole === "string",
            ),
        )
      : [],
    rawToCatalogDiff: Array.isArray(validation.rawToCatalogDiff)
      ? validation.rawToCatalogDiff.filter(
          (entry): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["rawToCatalogDiff"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.type === "string" &&
                typeof entry.exerciseId === "string" &&
                typeof entry.exerciseName === "string" &&
                typeof entry.reason === "string",
            ),
        )
      : [],
    catalogToFocusRepairDiff: Array.isArray(validation.catalogToFocusRepairDiff)
      ? validation.catalogToFocusRepairDiff.filter(
          (entry): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["catalogToFocusRepairDiff"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.type === "string" &&
                typeof entry.exerciseId === "string" &&
                typeof entry.exerciseName === "string" &&
                typeof entry.reason === "string",
            ),
        )
      : [],
    focusRepairToFinalDiff: Array.isArray(validation.focusRepairToFinalDiff)
      ? validation.focusRepairToFinalDiff.filter(
          (entry): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["focusRepairToFinalDiff"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.type === "string" &&
                typeof entry.exerciseId === "string" &&
                typeof entry.exerciseName === "string" &&
                typeof entry.reason === "string",
            ),
        )
      : [],
    beforeAfterDiff: Array.isArray(validation.beforeAfterDiff)
      ? validation.beforeAfterDiff
          .filter(
            (entry): entry is {
              type: "removed" | "added";
              exerciseId: string;
              exerciseName: string;
              reason: string;
            } =>
              Boolean(
                entry &&
                  typeof entry.type === "string" &&
                  typeof entry.exerciseId === "string" &&
                  typeof entry.exerciseName === "string" &&
                typeof entry.reason === "string",
              ),
          )
      : [],
    validationContext:
      validation.validationContext &&
      typeof validation.validationContext === "object"
        ? {
            plannedFocus:
              typeof validation.validationContext.plannedFocus === "string"
                ? validation.validationContext.plannedFocus
                : null,
            goal:
              typeof validation.validationContext.goal === "string"
                ? validation.validationContext.goal
                : "health",
            experienceLevel:
              typeof validation.validationContext.experienceLevel === "string"
                ? validation.validationContext.experienceLevel
                : null,
            durationMinutes:
              typeof validation.validationContext.durationMinutes === "number"
                ? validation.validationContext.durationMinutes
                : 0,
            priorityMuscles: Array.isArray(validation.validationContext.priorityMuscles)
              ? validation.validationContext.priorityMuscles
              : [],
            focusCompatiblePriorities: Array.isArray(
              validation.validationContext.focusCompatiblePriorities,
            )
              ? validation.validationContext.focusCompatiblePriorities
              : [],
            deferredPriorities: Array.isArray(
              validation.validationContext.deferredPriorities,
            )
              ? validation.validationContext.deferredPriorities
              : [],
            recoveryLimitedMuscles: Array.isArray(
              validation.validationContext.recoveryLimitedMuscles,
            )
              ? validation.validationContext.recoveryLimitedMuscles
              : [],
            availableEquipment: Array.isArray(
              validation.validationContext.availableEquipment,
            )
              ? validation.validationContext.availableEquipment
              : [],
          }
        : undefined,
  } satisfies NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>;
}

export async function runFullAppChainSimulation(params?: {
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
  const plannedWeekDays = buildPlannedWorkoutDaySet({
    config,
    profile: scenarioProfile.profile,
  });
  const plannedWorkoutDayIndices = Array.from(plannedWeekDays).sort(
    (left, right) => left - right,
  );
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
      plannerMode: "full_app_chain",
      scenario: config.scenario ?? "normal",
    }),
    ...scenarioProfile.notes,
    "full_app_chain använder riktig veckoplanering, training history context och den delade AI-genereringskärnan. Själva passutförandet simuleras lokalt.",
    ...effectiveProfileBundle.effectiveUserProfile.warnings,
  ];
  let state = createInitialSimulationState(effectiveSimulationProfile);
  let plannedWorkoutOrdinal = 0;
  let aiGeneratedWorkoutCount = 0;
  let aiFallbackWorkoutCount = 0;
  let aiLimitReached = false;

  for (let dayIndex = 0; dayIndex < config.totalDays; dayIndex += 1) {
    const dayPlan = buildDayPlan({ config, dayIndex, plannedWeekDays, profile: effectiveSimulationProfile });
    const stateBefore = normalizeSimulationState({ ...state, dayIndex }, effectiveSimulationProfile, config);
    const workoutLogs = buildSimulationWorkoutLogsFromSnapshots({
      profile: effectiveSimulationProfile,
      snapshots: dailySnapshots,
    });
    let stateAfter = stateBefore;
    let workoutResult;
    let generatedWorkoutSummary: SimulationDailySnapshot["generatedWorkoutSummary"] | undefined;
    let dayEvent: SimulationDailySnapshot["dayEvent"] = "rest";

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
            profile.preferredSessionDurationMin,
          availableEquipmentIds:
            effectiveProfileBundle.effectiveUserProfile.effectiveEquipment,
        },
        plannedWorkoutDayIndices,
        priorityMuscles: simulationPriorityMuscles,
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
        : shouldTrainToday({ config, profile: effectiveSimulationProfile, random, state: stateBefore });
      plannedWorkoutOrdinal += 1;

      if (adherence.train) {
        const plannerDayPlan = {
          ...dayPlan,
          targetDurationMin: weeklyPlanStatus.suggestedNextDurationMinutes,
        };
        const selectedPlanMode =
          weeklyPlanStatus.suggestedNextWorkoutFocus === "recovery_strength"
            ? "recovery"
            : null;
        const aiWorkoutFocus: WorkoutFocus =
          weeklyPlanStatus.suggestedNextWorkoutFocus === "recovery_strength"
            ? "full_body"
            : weeklyPlanStatus.suggestedNextWorkoutFocus;
        const recentExercises = getRecentExerciseDebug(dailySnapshots);
        const promptContextSummary = buildPromptContextSummary({
          suggestedFocus: weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
          suggestedDurationMinutes: weeklyPlanStatus.suggestedNextDurationMinutes,
          priorityMuscles: weeklyPlanContext.priorityMuscles,
          recoveryLimitedMuscles: weeklyPlanContext.recoveryLimitedMuscles,
          typicalWorkoutDurationMinutes:
            trainingHistoryContext.mediumTermTrainingSummary.typicalWorkoutDurationMinutes,
        });
        const settingsSummary = buildSimulationSettingsSummary({
          profile: effectiveSimulationProfile,
          scenario: config.scenario ?? "normal",
          baseSettings: effectiveProfileBundle.settingsSummary,
        });
        const canUseRealAi =
          aiGeneratedWorkoutCount < (config.maxAiGeneratedWorkouts ?? 4);

        if (canUseRealAi) {
          const generatedWorkout = await generateWorkoutWithAiCore({
            goal: effectiveSimulationProfile.goal,
            durationMinutes: weeklyPlanStatus.suggestedNextDurationMinutes,
            equipment: effectiveSimulationProfile.availableEquipmentIds,
            gymEquipmentDetails: [],
            gym:
              typeof effectiveSimulationProfile.availableGymId === "number"
                ? String(effectiveSimulationProfile.availableGymId)
                : null,
            gymLabel: null,
            confidenceScore: null,
            nextFocus: aiWorkoutFocus,
            splitStyle: null,
            weeklyBudget: buildWeeklyBudgetPromptItems(weeklyPlanState),
            weeklyPlan: buildWeeklyPlanPromptItems(plannedSessions),
            selectedPlanMode,
            focusIntent: weeklyPlanContext.coachText,
            targetMuscles: weeklyPlanContext.priorityMuscles,
            avoidMuscles: weeklyPlanContext.recoveryLimitedMuscles,
            limitedMuscles: [],
            weeklyPlanContext,
            trainingGap: null,
            lessOftenExerciseIds: [],
            focusMuscles: [],
            avoidSupersets: false,
            supersetPreference: null,
            settings: settingsSummary,
            historyLogs: workoutLogs,
          });

          if (generatedWorkout.ok) {
            aiGeneratedWorkoutCount += 1;
            const normalizedWorkout = generatedWorkout.workout;
            const plannedExercises = adaptNormalizedWorkoutToSimulationPlan(
              normalizedWorkout,
            );
            workoutResult = simulateWorkout({
              dayPlan: plannerDayPlan,
              plannedExercises,
              profile: effectiveSimulationProfile,
              random,
              state: stateBefore,
            });
            workoutResult = {
              ...workoutResult,
              workoutName: normalizedWorkout.name,
              actualDurationMin: adjustScenarioWorkoutDuration({
                scenario: config.scenario ?? "normal",
                plannedDurationMin: workoutResult.plannedDurationMin,
                actualDurationMin: workoutResult.actualDurationMin,
                random,
              }),
            };
            stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, effectiveSimulationProfile, config);
            dayEvent = "planned_training";
            generatedWorkoutSummary = {
              workoutId: workoutResult.workoutId,
              workoutName: normalizedWorkout.name,
              blockCount: normalizedWorkout.blocks.length,
              exerciseCount: normalizedWorkout.blocks.reduce(
                (sum, block) => sum + block.exercises.length,
                0,
              ),
              estimatedVolumeScore: workoutResult.estimatedLoadScore,
              plannerSource: "full_app_chain",
              plannerNote: "Riktig veckoplanering och riktig AI-generering användes.",
              passGenerationMode: "real_ai",
            };

            if (config.enablePlannerDebug) {
              const beforeNormalization = buildPlannerDebugExercisesFromWorkout(
                normalizedWorkout.aiDebug?.parsedAiResponse,
              );
              const afterNormalization = buildPlannerDebugExercisesFromWorkout(
                normalizedWorkout,
              );
              const validationDiagnostics = extractValidationDiagnostics(
                normalizedWorkout.aiDebug?.validatedWorkout,
              );

              plannerDebug.push({
                dayIndex,
                date: dayPlan.date,
                weekday: dayPlan.weekday,
                isPlannedTrainingDay: true,
                plannerMode: "full_app_chain",
                source: "full_app_chain",
                beforeNormalization:
                  beforeNormalization.length > 0
                    ? beforeNormalization
                    : afterNormalization,
                afterNormalization,
                repeatedAggregationKeys: findRepeatedKeys({
                  recentExercises,
                  afterNormalization,
                }),
                note: generatedWorkoutSummary.plannerNote,
                realAppPlanner: {
                  weekStartDate,
                  suggestedNextFocus:
                    weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
                  suggestedNextWorkoutFocus:
                    weeklyPlanStatus.suggestedNextWorkoutFocus,
                  suggestedNextDurationMinutes:
                    weeklyPlanStatus.suggestedNextDurationMinutes,
                  coachText: weeklyPlanContext.coachText,
                  goalReached: weeklyPlanStatus.goalReached,
                  priorityMuscles: weeklyPlanContext.priorityMuscles,
                  recoveryLimitedMuscles:
                    weeklyPlanContext.recoveryLimitedMuscles,
                  muscleSetDeficits: weeklyPlanContext.muscleSetDeficits,
                  passGenerationMode: "real_ai",
                  aiRequestUsed: true,
                  promptContextSummary,
                },
                trainingHistoryContextSummary: {
                  recentWorkoutsCount: trainingHistoryContext.recentWorkouts.length,
                  progressionMemoryExerciseCount:
                    trainingHistoryContext.exerciseProgressionMemory.length,
                  mediumTermWindowDays:
                    trainingHistoryContext.mediumTermTrainingSummary.windowDays,
                  dataQuality: trainingHistoryContext.dataQuality,
                  typicalWorkoutDurationMinutes:
                    trainingHistoryContext.mediumTermTrainingSummary
                      .typicalWorkoutDurationMinutes,
                },
                validationDiagnostics: validationDiagnostics ?? undefined,
              });
            }
          } else {
            aiFallbackWorkoutCount += 1;
            const plannedExercises = buildSyntheticWorkoutPlan({
              dayPlan: plannerDayPlan,
              profile: effectiveSimulationProfile,
              random,
              state: stateBefore,
              focusHint: aiWorkoutFocus,
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
              workoutName: `Fallback ${formatSimulationFocusLabel(
                weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
              )}`,
              actualDurationMin: adjustScenarioWorkoutDuration({
                scenario: config.scenario ?? "normal",
                plannedDurationMin: workoutResult.plannedDurationMin,
                actualDurationMin: workoutResult.actualDurationMin,
                random,
              }),
            };
            stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, effectiveSimulationProfile, config);
            dayEvent = "planned_training";
            generatedWorkoutSummary = {
              workoutId: workoutResult.workoutId,
              workoutName: workoutResult.workoutName,
              blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
              exerciseCount: workoutResult.exerciseResults.length,
              estimatedVolumeScore: workoutResult.estimatedLoadScore,
              plannerSource: "ai_fallback",
              plannerNote: `AI-genereringen misslyckades och simulationen föll tillbaka till mockat pass: ${generatedWorkout.error}.`,
              passGenerationMode: "fallback_mock",
            };

            if (config.enablePlannerDebug) {
              const afterNormalization = workoutResult.exerciseResults.map((exercise) =>
                toPlannerDebugExercise(exercise),
              );

              plannerDebug.push({
                dayIndex,
                date: dayPlan.date,
                weekday: dayPlan.weekday,
                isPlannedTrainingDay: true,
                plannerMode: "full_app_chain",
                source: "ai_fallback",
                beforeNormalization: afterNormalization,
                afterNormalization,
                repeatedAggregationKeys: findRepeatedKeys({
                  recentExercises,
                  afterNormalization,
                }),
                note: generatedWorkoutSummary.plannerNote,
                realAppPlanner: {
                  weekStartDate,
                  suggestedNextFocus:
                    weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
                  suggestedNextWorkoutFocus:
                    weeklyPlanStatus.suggestedNextWorkoutFocus,
                  suggestedNextDurationMinutes:
                    weeklyPlanStatus.suggestedNextDurationMinutes,
                  coachText: weeklyPlanContext.coachText,
                  goalReached: weeklyPlanStatus.goalReached,
                  priorityMuscles: weeklyPlanContext.priorityMuscles,
                  recoveryLimitedMuscles:
                    weeklyPlanContext.recoveryLimitedMuscles,
                  muscleSetDeficits: weeklyPlanContext.muscleSetDeficits,
                  passGenerationMode: "fallback_mock",
                  aiRequestUsed: true,
                  promptContextSummary,
                },
                trainingHistoryContextSummary: {
                  recentWorkoutsCount: trainingHistoryContext.recentWorkouts.length,
                  progressionMemoryExerciseCount:
                    trainingHistoryContext.exerciseProgressionMemory.length,
                  mediumTermWindowDays:
                    trainingHistoryContext.mediumTermTrainingSummary.windowDays,
                  dataQuality: trainingHistoryContext.dataQuality,
                  typicalWorkoutDurationMinutes:
                    trainingHistoryContext.mediumTermTrainingSummary
                      .typicalWorkoutDurationMinutes,
                },
              });
            }
          }
        } else {
          aiLimitReached = true;
          aiFallbackWorkoutCount += 1;
          const plannedExercises = buildSyntheticWorkoutPlan({
            dayPlan: plannerDayPlan,
            profile: effectiveSimulationProfile,
            random,
            state: stateBefore,
            focusHint: aiWorkoutFocus,
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
            workoutName: `Fallback ${formatSimulationFocusLabel(
              weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
            )}`,
            actualDurationMin: adjustScenarioWorkoutDuration({
              scenario: config.scenario ?? "normal",
              plannedDurationMin: workoutResult.plannedDurationMin,
              actualDurationMin: workoutResult.actualDurationMin,
              random,
            }),
          };
          stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, effectiveSimulationProfile, config);
          dayEvent = "planned_training";
          generatedWorkoutSummary = {
            workoutId: workoutResult.workoutId,
            workoutName: workoutResult.workoutName,
            blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
            exerciseCount: workoutResult.exerciseResults.length,
            estimatedVolumeScore: workoutResult.estimatedLoadScore,
            plannerSource: "ai_fallback",
            plannerNote: `Maxgränsen för AI-pass (${config.maxAiGeneratedWorkouts}) nåddes. Resterande pass mockas syntetiskt.`,
            passGenerationMode: "fallback_mock",
          };

          if (config.enablePlannerDebug) {
            const afterNormalization = workoutResult.exerciseResults.map((exercise) =>
              toPlannerDebugExercise(exercise),
            );

            plannerDebug.push({
              dayIndex,
              date: dayPlan.date,
              weekday: dayPlan.weekday,
              isPlannedTrainingDay: true,
              plannerMode: "full_app_chain",
              source: "ai_fallback",
              beforeNormalization: afterNormalization,
              afterNormalization,
              repeatedAggregationKeys: findRepeatedKeys({
                recentExercises,
                afterNormalization,
              }),
              note: generatedWorkoutSummary.plannerNote,
              realAppPlanner: {
                weekStartDate,
                suggestedNextFocus:
                  weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
                suggestedNextWorkoutFocus:
                  weeklyPlanStatus.suggestedNextWorkoutFocus,
                suggestedNextDurationMinutes:
                  weeklyPlanStatus.suggestedNextDurationMinutes,
                coachText: weeklyPlanContext.coachText,
                goalReached: weeklyPlanStatus.goalReached,
                priorityMuscles: weeklyPlanContext.priorityMuscles,
                recoveryLimitedMuscles: weeklyPlanContext.recoveryLimitedMuscles,
                muscleSetDeficits: weeklyPlanContext.muscleSetDeficits,
                passGenerationMode: "fallback_mock",
                aiRequestUsed: false,
                promptContextSummary,
              },
              trainingHistoryContextSummary: {
                recentWorkoutsCount: trainingHistoryContext.recentWorkouts.length,
                progressionMemoryExerciseCount:
                  trainingHistoryContext.exerciseProgressionMemory.length,
                mediumTermWindowDays:
                  trainingHistoryContext.mediumTermTrainingSummary.windowDays,
                dataQuality: trainingHistoryContext.dataQuality,
                typicalWorkoutDurationMinutes:
                  trainingHistoryContext.mediumTermTrainingSummary
                    .typicalWorkoutDurationMinutes,
              },
            });
          }
        }
      } else {
        workoutResult = buildMissedWorkoutResult({
          dayPlan: {
            ...dayPlan,
            targetDurationMin: weeklyPlanStatus.suggestedNextDurationMinutes,
          },
          profile: effectiveSimulationProfile,
          skipReason: adherence.skipReason ?? "random",
        });
        stateAfter = applyMissedWorkoutState(stateBefore, effectiveSimulationProfile, config);
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
        targetDurationMin: Math.max(
          20,
          Math.round(
            effectiveSimulationProfile.preferredSessionDurationMin * 0.75,
          ),
        ),
      };
      const spontaneousExercises = buildSyntheticWorkoutPlan({
        dayPlan: spontaneousPlan,
        profile: effectiveSimulationProfile,
        random,
        state: stateBefore,
        focusHint: getScenarioSpontaneousFocus(),
      });
      workoutResult = simulateWorkout({
        dayPlan: spontaneousPlan,
        plannedExercises: spontaneousExercises,
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
      stateAfter = applyWorkoutFatigue(stateBefore, workoutResult, effectiveSimulationProfile, config);
      dayEvent = "spontaneous_training";
      generatedWorkoutSummary = {
        workoutId: workoutResult.workoutId,
        workoutName: workoutResult.workoutName,
        blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
        exerciseCount: workoutResult.exerciseResults.length,
        estimatedVolumeScore: workoutResult.estimatedLoadScore,
        plannerSource: "synthetic",
        plannerNote: "Scenario lade in ett spontant pass som påverkar nästa veckoplanbeslut.",
        passGenerationMode: "mock_synthetic",
      };
    } else {
      stateAfter = applyRestDayRecovery(stateBefore, effectiveSimulationProfile, config);
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

  if (aiLimitReached) {
    notes.push(
      `AI-gränsen nåddes efter ${aiGeneratedWorkoutCount} riktiga AI-pass. Resterande planerade pass mockades syntetiskt.`,
    );
  }

  const timeSeries = buildTimeSeries(dailySnapshots);
  const exerciseAggregates = buildExerciseAggregates(dailySnapshots);
  const evaluation = evaluateSimulation({ dailySnapshots, profile: effectiveSimulationProfile });

  return {
    config,
    profile,
    effectiveUserProfile: effectiveProfileBundle.effectiveUserProfile,
    plannedWorkoutDayIndices,
    plannedWorkoutDayLabels: formatPlannedWorkoutDayLabels(plannedWorkoutDayIndices),
    aiGeneratedWorkoutCount,
    aiFallbackWorkoutCount,
    notes,
    dailySnapshots,
    timeSeries,
    exerciseAggregates,
    evaluation,
    plannerDebug: config.enablePlannerDebug ? plannerDebug : undefined,
  };
}
