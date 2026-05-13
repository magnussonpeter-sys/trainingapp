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
import {
  generateWorkoutForSpecificEngine,
  generateWorkoutWithMode,
} from "@/lib/workouts/generate-workout-with-mode";
import { generateSafeSlotTemplateWorkout } from "@/lib/workouts/generate-workout-slot-based-v1";
import {
  normalizeSimulationWorkoutGenerationMode,
  type WorkoutGenerationMode,
} from "@/lib/workout-generation/types";
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
    generationMode: normalizeSimulationWorkoutGenerationMode(config?.generationMode),
    plannedWorkoutDayIndices: normalizePlannedWorkoutDayIndices(
      config?.plannedWorkoutDayIndices,
    ),
    // Respect the user's chosen AI budget instead of silently capping at 10.
    maxAiGeneratedWorkouts: Math.max(
      Math.round(config?.maxAiGeneratedWorkouts ?? 4),
      1,
    ),
  };
}

function getGenerationEngineDebug(workout: {
  aiDebug?: {
    generationContext?: unknown;
    validation?: unknown;
  };
}) {
  const context =
    workout.aiDebug?.generationContext &&
    typeof workout.aiDebug.generationContext === "object"
      ? (workout.aiDebug.generationContext as Record<string, unknown>)
      : null;

  const derivedSlotModel =
    context &&
    typeof context === "object" &&
    (Array.isArray((context as Record<string, unknown>).contractSlots) ||
      typeof (context as Record<string, unknown>).contractGateTriggered === "boolean")
      ? {
          contractSlots: (context as Record<string, unknown>).contractSlots,
          requiredSlots: (context as Record<string, unknown>).requiredSlots,
          protectedSlots: (context as Record<string, unknown>).protectedSlots,
          selectedPerSlot:
            (context as Record<string, unknown>).selectedExercisePerSlot,
          selectedScorePerSlot:
            (context as Record<string, unknown>).selectedScorePerSlot,
          rejectedCandidatesTopReasons:
            (context as Record<string, unknown>).rejectedCandidatesTopReasons,
          contractViolations:
            (context as Record<string, unknown>).contractViolations,
          contractGateTriggered:
            (context as Record<string, unknown>).contractGateTriggered,
          contractGateReason:
            (context as Record<string, unknown>).contractGateReason,
          finalContractPassed:
            (context as Record<string, unknown>).finalContractPassed,
          fallbackMode: (context as Record<string, unknown>).fallbackMode,
          repairLog: (context as Record<string, unknown>).repairLog,
          safeTemplateUsed:
            (context as Record<string, unknown>).safeTemplateUsed,
          safeTemplateReason:
            (context as Record<string, unknown>).safeTemplateReason,
          degradedContractAttempted:
            (context as Record<string, unknown>).degradedContractAttempted,
          acceptedWithDegradedContract:
            (context as Record<string, unknown>).acceptedWithDegradedContract,
        }
      : null;

  return {
    generationModeRequested:
      context?.generationModeRequested === "legacy_ai_chain" ||
      context?.generationModeRequested === "slot_based_v1" ||
      context?.generationModeRequested === "hybrid"
        ? (context.generationModeRequested as WorkoutGenerationMode)
        : null,
    generationEngineUsed:
      context?.generationEngineUsed === "legacy_ai_chain" ||
      context?.generationEngineUsed === "slot_based_v1"
        ? (context.generationEngineUsed as "legacy_ai_chain" | "slot_based_v1")
        : null,
    generationFallbackUsed: context?.generationFallbackUsed === true,
    generationFallbackReason:
      typeof context?.generationFallbackReason === "string" &&
      context.generationFallbackReason.trim()
        ? context.generationFallbackReason
        : null,
    slotModel:
      workout.aiDebug?.validation &&
      typeof workout.aiDebug.validation === "object" &&
      "slotModel" in (workout.aiDebug.validation as Record<string, unknown>)
        ? ((workout.aiDebug.validation as Record<string, unknown>).slotModel as
            | Record<string, unknown>
            | null)
        : derivedSlotModel,
  };
}

function getSlotModelDebugFromWorkout(workout: {
  aiDebug?: {
    generationContext?: unknown;
    validation?: unknown;
  };
}) {
  const validation =
    workout.aiDebug?.validation && typeof workout.aiDebug.validation === "object"
      ? (workout.aiDebug.validation as Record<string, unknown>)
      : null;

  if (validation?.slotModel && typeof validation.slotModel === "object") {
    return validation.slotModel as Record<string, unknown>;
  }

  const context =
    workout.aiDebug?.generationContext &&
    typeof workout.aiDebug.generationContext === "object"
      ? (workout.aiDebug.generationContext as Record<string, unknown>)
      : null;

  if (!context) {
    return null;
  }

  if (!Array.isArray(context.contractSlots) && typeof context.contractGateTriggered !== "boolean") {
    return null;
  }

  return {
    contractSlots: context.contractSlots,
    requiredSlots: context.requiredSlots,
    protectedSlots: context.protectedSlots,
    selectedPerSlot: context.selectedExercisePerSlot,
    selectedScorePerSlot: context.selectedScorePerSlot,
    rejectedCandidatesTopReasons: context.rejectedCandidatesTopReasons,
    contractViolations: context.contractViolations,
    contractGateTriggered: context.contractGateTriggered,
    contractGateReason: context.contractGateReason,
    finalContractPassed: context.finalContractPassed,
    fallbackMode: context.fallbackMode,
    repairLog: context.repairLog,
    safeTemplateUsed: context.safeTemplateUsed,
    safeTemplateReason: context.safeTemplateReason,
    degradedContractAttempted: context.degradedContractAttempted,
    acceptedWithDegradedContract: context.acceptedWithDegradedContract,
  } satisfies Record<string, unknown>;
}

function getWorkoutExerciseCount(workout: {
  blocks: Array<{ exercises: unknown[] }>;
}) {
  return workout.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
}

async function generateWorkoutForSimulationMode(params: {
  generationMode: SimulationConfig["generationMode"];
  input: Parameters<typeof generateWorkoutWithMode>[0];
}) {
  if (params.generationMode !== "compare_legacy_vs_slot") {
    const generatedWorkout = await generateWorkoutWithMode(params.input);

    return {
      generatedWorkout,
      generationEngineDebug:
        generatedWorkout.ok
          ? getGenerationEngineDebug(generatedWorkout.workout)
          : {
              generationModeRequested: null,
              generationEngineUsed: null,
              generationFallbackUsed: false,
              generationFallbackReason: null,
              slotModel: null,
            },
      generationComparison: null,
    };
  }

  // Compare-mode runs both engines on the same context, then keeps the safest result.
  const [slotRun, legacyRun] = await Promise.all([
    generateWorkoutForSpecificEngine({
      engine: "slot_based_v1",
      input: {
        ...params.input,
        generationMode: "slot_based_v1",
      },
    }),
    generateWorkoutForSpecificEngine({
      engine: "legacy_ai_chain",
      input: {
        ...params.input,
        generationMode: "legacy_ai_chain",
      },
    }),
  ]);

  const slotPassed = slotRun.result.ok && (slotRun.safety?.passed ?? false);
  const legacyPassed = legacyRun.result.ok && (legacyRun.safety?.passed ?? false);
  const slotExerciseCount = slotRun.result.ok
    ? getWorkoutExerciseCount(slotRun.result.workout)
    : null;
  const legacyExerciseCount = legacyRun.result.ok
    ? getWorkoutExerciseCount(legacyRun.result.workout)
    : null;

  if (slotPassed) {
    return {
      generatedWorkout: slotRun.result,
      generationEngineDebug: {
        generationModeRequested: "slot_based_v1" as WorkoutGenerationMode,
        generationEngineUsed: "slot_based_v1" as const,
        generationFallbackUsed: false,
        generationFallbackReason: null,
        slotModel: slotRun.result.ok
          ? getGenerationEngineDebug(slotRun.result.workout).slotModel
          : null,
      },
      generationComparison: {
        selectedEngine: "slot_based_v1" as const,
        legacyPassed,
        slotPassed,
        legacyExerciseCount,
        slotExerciseCount,
        slotSafetyReasons: slotRun.safety?.reasons ?? [],
        selectedBecause: "slot_validation_passed",
      },
    };
  }

  if (legacyPassed) {
    const fallbackReason = slotRun.result.ok
      ? slotRun.safety?.reasons.join(", ") || "slot_validation_failed"
      : slotRun.result.error;

    return {
      generatedWorkout: legacyRun.result,
      generationEngineDebug: {
        generationModeRequested: "hybrid" as WorkoutGenerationMode,
        generationEngineUsed: "legacy_ai_chain" as const,
        generationFallbackUsed: true,
        generationFallbackReason: fallbackReason,
        slotModel: legacyRun.result.ok
          ? getGenerationEngineDebug(legacyRun.result.workout).slotModel
          : null,
      },
      generationComparison: {
        selectedEngine: "legacy_ai_chain" as const,
        legacyPassed,
        slotPassed,
        legacyExerciseCount,
        slotExerciseCount,
        slotSafetyReasons: slotRun.safety?.reasons ?? [],
        selectedBecause: fallbackReason,
      },
    };
  }

  const safeTemplateRun = await generateSafeSlotTemplateWorkout({
    ...params.input,
    generationMode: "slot_based_v1",
  });

  if (safeTemplateRun.ok) {
    return {
      generatedWorkout: safeTemplateRun,
      generationEngineDebug: {
        generationModeRequested: "hybrid" as WorkoutGenerationMode,
        generationEngineUsed: "slot_based_v1" as const,
        generationFallbackUsed: true,
        generationFallbackReason: "both_slot_and_legacy_failed_safe_template_used",
        slotModel: safeTemplateRun.ok
          ? getGenerationEngineDebug(safeTemplateRun.workout).slotModel
          : null,
      },
      generationComparison: {
        selectedEngine: "safe_slot_template" as const,
        legacyPassed,
        slotPassed,
        legacyExerciseCount,
        slotExerciseCount,
        slotSafetyReasons: slotRun.safety?.reasons ?? [],
        selectedBecause: "both_engines_failed_safe_template_used",
      },
    };
  }

  return {
    generatedWorkout: slotRun.result.ok ? slotRun.result : legacyRun.result,
    generationEngineDebug: {
      generationModeRequested: null,
      generationEngineUsed: null,
      generationFallbackUsed: false,
      generationFallbackReason: slotRun.result.ok ? null : slotRun.result.error,
      slotModel: slotRun.result.ok
        ? getGenerationEngineDebug(slotRun.result.workout).slotModel
        : legacyRun.result.ok
          ? getGenerationEngineDebug(legacyRun.result.workout).slotModel
          : null,
    },
    generationComparison: {
      selectedEngine: (slotRun.result.ok
        ? "slot_based_v1"
        : "legacy_ai_chain") as "slot_based_v1" | "legacy_ai_chain",
      legacyPassed,
      slotPassed,
      legacyExerciseCount,
      slotExerciseCount,
      slotSafetyReasons: slotRun.safety?.reasons ?? [],
      selectedBecause: "both_engines_failed_no_safe_template",
    },
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
    targetMainExerciseCount?: number;
    actualMainExerciseCountFromAi?: number;
    finalMainExerciseCount?: number;
    optionalBonusExerciseCount?: number;
    bonusExercisesUsed?: number;
    bonusExercisesRejectedReason?: string[];
    trimmedBecauseTooManyExercises?: boolean;
    trimmedExercises?: Array<{
      name?: string;
      role?: string | null;
      priorityRank?: number;
      canDropIfShort?: boolean;
      reason?: string | null;
      trimReason?: string;
    }>;
    keptExerciseRoles?: string[];
    lostExerciseRoles?: string[];
    fallbackAddedDespiteEnoughAiExercises?: boolean;
    durationTrimWarnings?: string[];
    validation?: {
      focusIntegrityScore?: number;
      strengthSpecificityScore?: number;
      qualityPreservationScore?: number;
      goalSpecificityLoss?: number;
      sportSpecificityLoss?: number;
      catalogResolutionLoss?: number;
      mustKeepViolations?: string[];
      offFocusWarnings?: string[];
      offFocusViolations?: string[];
      forbiddenExerciseViolations?: string[];
      lostMovementPatterns?: string[];
      lostPrimaryRoles?: string[];
      lostPriorityMuscles?: string[];
      lostUsefulRoles?: string[];
      lostPrimaryOrHighValueExercises?: string[];
      lostSportRelevantExercises?: string[];
      sportRelevantExercisesKept?: string[];
      sportRelevantExercisesLost?: string[];
      deferredPriorityMuscles?: string[];
      removedPrimaryExercises?: string[];
      addedOffFocusExercises?: string[];
      removedBecauseOffFocus?: string[];
      removedBecauseRecovery?: string[];
      removedBecauseDuplicateRole?: string[];
      fallbackExercisesAdded?: string[];
      normalizationWarnings?: string[];
      fallbackBiasWarning?: string | null;
      durationTrimReason?: string | null;
      roleTrimReason?: string | null;
      compatibleExercisesRejectedWithReason?: Array<{
        exerciseName?: string;
        stage?: "raw_to_catalog" | "catalog_to_focus_repair" | "focus_repair_to_final";
        reason?: string;
      }>;
      priorityMuscleResolutionStatus?: Array<{
        muscle?: string;
        status?:
          | "addressed_primary"
          | "addressed_secondary"
          | "partially_addressed"
          | "deferred_due_to_focus"
          | "deferred_due_to_recovery"
          | "dropped_by_catalog_resolution"
          | "dropped_by_focus_repair"
          | "dropped_by_duration_trim"
          | "not_relevant_for_today";
        reason?: string;
      }>;
      qualityPenaltyBreakdown?: Array<{
        code?: string;
        amount?: number;
        reason?: string;
      }>;
      droppedHighValueExercises?: string[];
      roleMismatchReplacements?: string[];
      genericFallbacksAdded?: string[];
      finalQualityWarnings?: string[];
      safetyGateTriggered?: boolean;
      safetyGateReasons?: string[];
      safetyGateRecoveryMode?:
        | "none"
        | "restore_raw_success"
        | "restore_raw_failed_safe_template_used"
        | "safe_template_success"
        | "failed"
        | null;
      recoveryLimitedSeverityByMuscle?: Array<{
        muscle?: string;
        severity?: "hard_blocked" | "avoid_heavy_loading" | "allow_light_recovery";
      }>;
      blockedByRecoveryHard?: string[];
      allowedAsLightRecovery?: string[];
      rejectedDueToRecoveryReason?: Array<{
        exerciseName?: string;
        reason?: string;
      }>;
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
        qualityRoles?: string[];
      }>;
      afterCatalogMatch?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        variantGroup?: string;
        movementPattern?: string;
        exerciseRole?: string;
        qualityRoles?: string[];
      }>;
      afterFocusRepair?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        variantGroup?: string;
        movementPattern?: string;
        exerciseRole?: string;
        qualityRoles?: string[];
      }>;
      finalExercises?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        variantGroup?: string;
        movementPattern?: string;
        exerciseRole?: string;
        qualityRoles?: string[];
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
        sportFocus?: string | null;
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
    qualityPreservationScore:
      typeof validation.qualityPreservationScore === "number"
        ? validation.qualityPreservationScore
        : 0,
    goalSpecificityLoss:
      typeof validation.goalSpecificityLoss === "number"
        ? validation.goalSpecificityLoss
        : 0,
    sportSpecificityLoss:
      typeof validation.sportSpecificityLoss === "number"
        ? validation.sportSpecificityLoss
        : 0,
    catalogResolutionLoss:
      typeof validation.catalogResolutionLoss === "number"
        ? validation.catalogResolutionLoss
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
    lostUsefulRoles: Array.isArray(validation.lostUsefulRoles)
      ? validation.lostUsefulRoles
      : [],
    lostPrimaryOrHighValueExercises: Array.isArray(
      validation.lostPrimaryOrHighValueExercises,
    )
      ? validation.lostPrimaryOrHighValueExercises
      : [],
    lostSportRelevantExercises: Array.isArray(validation.lostSportRelevantExercises)
      ? validation.lostSportRelevantExercises
      : [],
    sportRelevantExercisesKept: Array.isArray(validation.sportRelevantExercisesKept)
      ? validation.sportRelevantExercisesKept
      : [],
    sportRelevantExercisesLost: Array.isArray(validation.sportRelevantExercisesLost)
      ? validation.sportRelevantExercisesLost
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
    fallbackExercisesAdded: Array.isArray(validation.fallbackExercisesAdded)
      ? validation.fallbackExercisesAdded
      : [],
    normalizationWarnings: Array.isArray(validation.normalizationWarnings)
      ? validation.normalizationWarnings
      : [],
    fallbackBiasWarning:
      typeof validation.fallbackBiasWarning === "string"
        ? validation.fallbackBiasWarning
        : null,
    durationTrimReason:
      typeof validation.durationTrimReason === "string"
        ? validation.durationTrimReason
        : null,
    roleTrimReason:
      typeof validation.roleTrimReason === "string"
        ? validation.roleTrimReason
        : null,
    compatibleExercisesRejectedWithReason: Array.isArray(
      validation.compatibleExercisesRejectedWithReason,
    )
      ? validation.compatibleExercisesRejectedWithReason.filter(
          (
            entry,
          ): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["compatibleExercisesRejectedWithReason"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.exerciseName === "string" &&
                typeof entry.stage === "string" &&
                typeof entry.reason === "string",
            ),
        )
      : [],
    priorityMuscleResolutionStatus: Array.isArray(
      validation.priorityMuscleResolutionStatus,
    )
      ? validation.priorityMuscleResolutionStatus.filter(
          (
            entry,
          ): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["priorityMuscleResolutionStatus"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.muscle === "string" &&
                typeof entry.status === "string" &&
                typeof entry.reason === "string",
            ),
        )
      : [],
    qualityPenaltyBreakdown: Array.isArray(validation.qualityPenaltyBreakdown)
      ? validation.qualityPenaltyBreakdown.filter(
          (
            entry,
          ): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["qualityPenaltyBreakdown"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.code === "string" &&
                typeof entry.amount === "number" &&
                typeof entry.reason === "string",
            ),
        )
      : [],
    droppedHighValueExercises: Array.isArray(validation.droppedHighValueExercises)
      ? validation.droppedHighValueExercises
      : [],
    roleMismatchReplacements: Array.isArray(validation.roleMismatchReplacements)
      ? validation.roleMismatchReplacements
      : [],
    genericFallbacksAdded: Array.isArray(validation.genericFallbacksAdded)
      ? validation.genericFallbacksAdded
      : [],
    finalQualityWarnings: Array.isArray(validation.finalQualityWarnings)
      ? validation.finalQualityWarnings
      : [],
    safetyGateTriggered: validation.safetyGateTriggered === true,
    safetyGateReasons: Array.isArray(validation.safetyGateReasons)
      ? validation.safetyGateReasons
      : [],
    safetyGateRecoveryMode:
      validation.safetyGateRecoveryMode === "none" ||
      validation.safetyGateRecoveryMode === "restore_raw_success" ||
      validation.safetyGateRecoveryMode === "restore_raw_failed_safe_template_used" ||
      validation.safetyGateRecoveryMode === "safe_template_success" ||
      validation.safetyGateRecoveryMode === "failed"
        ? validation.safetyGateRecoveryMode
        : null,
    recoveryLimitedSeverityByMuscle: Array.isArray(validation.recoveryLimitedSeverityByMuscle)
      ? validation.recoveryLimitedSeverityByMuscle.filter(
          (
            entry,
          ): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["recoveryLimitedSeverityByMuscle"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.muscle === "string" &&
                typeof entry.severity === "string",
            ),
        )
      : [],
    blockedByRecoveryHard: Array.isArray(validation.blockedByRecoveryHard)
      ? validation.blockedByRecoveryHard
      : [],
    allowedAsLightRecovery: Array.isArray(validation.allowedAsLightRecovery)
      ? validation.allowedAsLightRecovery
      : [],
    rejectedDueToRecoveryReason: Array.isArray(validation.rejectedDueToRecoveryReason)
      ? validation.rejectedDueToRecoveryReason.filter(
          (
            entry,
          ): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["rejectedDueToRecoveryReason"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.exerciseName === "string" &&
                typeof entry.reason === "string",
            ),
        )
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
                typeof entry.exerciseRole === "string" &&
                Array.isArray(entry.qualityRoles),
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
                typeof entry.exerciseRole === "string" &&
                Array.isArray(entry.qualityRoles),
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
                typeof entry.exerciseRole === "string" &&
                Array.isArray(entry.qualityRoles),
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
                typeof entry.exerciseRole === "string" &&
                Array.isArray(entry.qualityRoles),
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
            sportFocus:
              typeof validation.validationContext.sportFocus === "string"
                ? validation.validationContext.sportFocus
                : null,
          }
        : undefined,
    // These fields come from validateGeneratedWorkout's outer debug layer and
    // help us see whether AI already targeted the right pass size.
    targetMainExerciseCount:
      typeof record.targetMainExerciseCount === "number"
        ? record.targetMainExerciseCount
        : undefined,
    actualMainExerciseCountFromAi:
      typeof record.actualMainExerciseCountFromAi === "number"
        ? record.actualMainExerciseCountFromAi
        : undefined,
    finalMainExerciseCount:
      typeof record.finalMainExerciseCount === "number"
        ? record.finalMainExerciseCount
        : undefined,
    optionalBonusExerciseCount:
      typeof record.optionalBonusExerciseCount === "number"
        ? record.optionalBonusExerciseCount
        : undefined,
    bonusExercisesUsed:
      typeof record.bonusExercisesUsed === "number"
        ? record.bonusExercisesUsed
        : undefined,
    bonusExercisesRejectedReason: Array.isArray(record.bonusExercisesRejectedReason)
      ? record.bonusExercisesRejectedReason.filter(
          (entry): entry is string => typeof entry === "string" && entry.length > 0,
        )
      : undefined,
    trimmedBecauseTooManyExercises:
      typeof record.trimmedBecauseTooManyExercises === "boolean"
        ? record.trimmedBecauseTooManyExercises
        : undefined,
    trimmedExercises: Array.isArray(record.trimmedExercises)
      ? record.trimmedExercises.filter(
          (
            entry,
          ): entry is NonNullable<
            NonNullable<SimulationPlannerDebugEntry["validationDiagnostics"]>["trimmedExercises"]
          >[number] =>
            Boolean(
              entry &&
                typeof entry.name === "string" &&
                typeof entry.priorityRank === "number" &&
                typeof entry.canDropIfShort === "boolean" &&
                typeof entry.trimReason === "string",
            ),
        )
      : undefined,
    keptExerciseRoles: Array.isArray(record.keptExerciseRoles)
      ? record.keptExerciseRoles.filter(
          (entry): entry is string => typeof entry === "string" && entry.length > 0,
        )
      : undefined,
    lostExerciseRoles: Array.isArray(record.lostExerciseRoles)
      ? record.lostExerciseRoles.filter(
          (entry): entry is string => typeof entry === "string" && entry.length > 0,
        )
      : undefined,
    fallbackAddedDespiteEnoughAiExercises:
      typeof record.fallbackAddedDespiteEnoughAiExercises === "boolean"
        ? record.fallbackAddedDespiteEnoughAiExercises
        : undefined,
    durationTrimWarnings: Array.isArray(record.durationTrimWarnings)
      ? record.durationTrimWarnings.filter(
          (entry): entry is string => typeof entry === "string" && entry.length > 0,
        )
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
        : shouldTrainToday({
            config,
            profile: effectiveSimulationProfile,
            random,
            state: stateBefore,
            scenario: config.scenario ?? "normal",
          });
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
          const generationRun = await generateWorkoutForSimulationMode({
            generationMode: config.generationMode,
            input: {
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
            generationMode:
              config.generationMode === "compare_legacy_vs_slot"
                ? "hybrid"
                : config.generationMode,
            },
          });
          const generatedWorkout = generationRun.generatedWorkout;

          if (generatedWorkout.ok) {
            aiGeneratedWorkoutCount += 1;
            const normalizedWorkout = generatedWorkout.workout;
            const generationEngineDebug = generationRun.generationEngineDebug;
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
              plannerNote:
                generationRun.generationComparison
                  ? `Jämförelse kördes mellan slot och legacy. Vald motor: ${generationRun.generationComparison.selectedEngine}.`
                  : generationEngineDebug.generationFallbackUsed
                  ? `Riktig veckoplanering användes. Slot-motorn underkändes och passet genererades med legacy fallback (${generationEngineDebug.generationFallbackReason ?? "okänd orsak"}).`
                  : `Riktig veckoplanering och AI-generering användes via ${generationEngineDebug.generationEngineUsed ?? "legacy_ai_chain"}.`,
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
                  generationModeRequested:
                    generationEngineDebug.generationModeRequested ?? undefined,
                  generationEngineUsed:
                    generationEngineDebug.generationEngineUsed ?? null,
                  generationFallbackUsed:
                    generationEngineDebug.generationFallbackUsed,
                  generationFallbackReason:
                    generationEngineDebug.generationFallbackReason,
                  slotModel:
                    getSlotModelDebugFromWorkout(generatedWorkout.workout) ??
                    undefined,
                  generationComparison:
                    generationRun.generationComparison ?? undefined,
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
                  generationFallbackReason: generatedWorkout.error,
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
      const spontaneousPlan = {
        ...dayPlan,
        targetDurationMin: Math.max(
          20,
          Math.round(
            effectiveSimulationProfile.preferredSessionDurationMin * 0.75,
          ),
        ),
      };
      const scenarioSpontaneousFocus = getScenarioSpontaneousFocus();
      const spontaneousWorkoutFocus: WorkoutFocus =
        weeklyPlanStatus.suggestedNextWorkoutFocus === "recovery_strength"
          ? "full_body"
          : weeklyPlanStatus.suggestedNextWorkoutFocus;
      const aiSpontaneousFocus = scenarioSpontaneousFocus ?? spontaneousWorkoutFocus;
      const selectedPlanMode =
        weeklyPlanStatus.suggestedNextWorkoutFocus === "recovery_strength"
          ? "recovery"
          : null;
      const recentExercises = getRecentExerciseDebug(dailySnapshots);
      const promptContextSummary = buildPromptContextSummary({
        suggestedFocus:
          scenarioSpontaneousFocus ??
          weeklyPlanState.remainingTrainingNeed.suggestedNextFocus,
        suggestedDurationMinutes: spontaneousPlan.targetDurationMin,
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
        const generationRun = await generateWorkoutForSimulationMode({
          generationMode: config.generationMode,
          input: {
          goal: effectiveSimulationProfile.goal,
          durationMinutes: spontaneousPlan.targetDurationMin,
          equipment: effectiveSimulationProfile.availableEquipmentIds,
          gymEquipmentDetails: [],
          gym:
            typeof effectiveSimulationProfile.availableGymId === "number"
              ? String(effectiveSimulationProfile.availableGymId)
              : null,
          gymLabel: null,
          confidenceScore: null,
          nextFocus: aiSpontaneousFocus,
          splitStyle: null,
          weeklyBudget: buildWeeklyBudgetPromptItems(weeklyPlanState),
          weeklyPlan: buildWeeklyPlanPromptItems(plannedSessions),
          selectedPlanMode,
          focusIntent: `${weeklyPlanContext.coachText} Spontant extrapass på vilodag.`,
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
          generationMode:
            config.generationMode === "compare_legacy_vs_slot"
              ? "hybrid"
              : config.generationMode,
          },
        });
        const generatedWorkout = generationRun.generatedWorkout;

        if (generatedWorkout.ok) {
          aiGeneratedWorkoutCount += 1;
          const normalizedWorkout = generatedWorkout.workout;
          const generationEngineDebug = generationRun.generationEngineDebug;
          const plannedExercises = adaptNormalizedWorkoutToSimulationPlan(
            normalizedWorkout,
          );
          workoutResult = simulateWorkout({
            dayPlan: spontaneousPlan,
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
          stateAfter = applyWorkoutFatigue(
            stateBefore,
            workoutResult,
            effectiveSimulationProfile,
            config,
          );
          dayEvent = "spontaneous_training";
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
            plannerNote:
              generationRun.generationComparison
                ? `Scenario lade in ett spontant pass och jämförde slot mot legacy. Vald motor: ${generationRun.generationComparison.selectedEngine}.`
                : generationEngineDebug.generationFallbackUsed
                ? `Scenario lade in ett spontant pass. Slot-motorn underkändes och legacy användes som fallback (${generationEngineDebug.generationFallbackReason ?? "okänd orsak"}).`
                : `Scenario lade in ett spontant pass som genererades via ${generationEngineDebug.generationEngineUsed ?? "legacy_ai_chain"} och påverkar nästa veckoplanbeslut.`,
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
              isPlannedTrainingDay: false,
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
                suggestedNextDurationMinutes: spontaneousPlan.targetDurationMin,
                coachText: weeklyPlanContext.coachText,
                goalReached: weeklyPlanStatus.goalReached,
                priorityMuscles: weeklyPlanContext.priorityMuscles,
                recoveryLimitedMuscles:
                  weeklyPlanContext.recoveryLimitedMuscles,
                muscleSetDeficits: weeklyPlanContext.muscleSetDeficits,
                passGenerationMode: "real_ai",
                aiRequestUsed: true,
                promptContextSummary,
                generationModeRequested:
                  generationEngineDebug.generationModeRequested ?? undefined,
                generationEngineUsed:
                  generationEngineDebug.generationEngineUsed ?? null,
                generationFallbackUsed:
                  generationEngineDebug.generationFallbackUsed,
                generationFallbackReason:
                  generationEngineDebug.generationFallbackReason,
                slotModel:
                  getSlotModelDebugFromWorkout(generatedWorkout.workout) ??
                  undefined,
                generationComparison:
                  generationRun.generationComparison ?? undefined,
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
          const spontaneousExercises = buildSyntheticWorkoutPlan({
            dayPlan: spontaneousPlan,
            profile: effectiveSimulationProfile,
            random,
            state: stateBefore,
            focusHint: aiSpontaneousFocus,
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
            workoutName: "Spontant extrapass",
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
          generatedWorkoutSummary = {
            workoutId: workoutResult.workoutId,
            workoutName: workoutResult.workoutName,
            blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
            exerciseCount: workoutResult.exerciseResults.length,
            estimatedVolumeScore: workoutResult.estimatedLoadScore,
            plannerSource: "ai_fallback",
            plannerNote: `Spontant pass föll tillbaka till mockat pass eftersom AI-genereringen misslyckades: ${generatedWorkout.error}.`,
            passGenerationMode: "fallback_mock",
          };
        }
      } else {
        aiLimitReached = true;
        aiFallbackWorkoutCount += 1;
        const spontaneousExercises = buildSyntheticWorkoutPlan({
          dayPlan: spontaneousPlan,
          profile: effectiveSimulationProfile,
          random,
          state: stateBefore,
          focusHint: aiSpontaneousFocus,
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
          workoutName: "Spontant extrapass",
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
        generatedWorkoutSummary = {
          workoutId: workoutResult.workoutId,
          workoutName: workoutResult.workoutName,
          blockCount: workoutResult.exerciseResults.length > 3 ? 2 : 1,
          exerciseCount: workoutResult.exerciseResults.length,
          estimatedVolumeScore: workoutResult.estimatedLoadScore,
          plannerSource: "ai_fallback",
          plannerNote: `Maxgränsen för AI-pass (${config.maxAiGeneratedWorkouts}) nåddes. Det spontana passet mockades syntetiskt.`,
          passGenerationMode: "fallback_mock",
        };
      }
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
      `AI-gränsen nåddes efter ${aiGeneratedWorkoutCount} riktiga AI-pass. Resterande pass, inklusive spontana extrapass, mockades syntetiskt.`,
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
