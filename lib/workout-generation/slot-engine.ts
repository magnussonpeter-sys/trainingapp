import OpenAI from "openai";

import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  validateGeneratedWorkout,
  type AiGeneratedWorkoutCandidate,
  type GeneratedWorkoutValidationFocusContext,
} from "@/lib/workout-flow/validate-generated-workout";
import type { WorkoutFocus } from "@/types/workout";

import { buildWorkoutGenerationCoachContext } from "@/lib/workout-generation/coach-context";
import { attachWorkoutGenerationDebug } from "@/lib/workout-generation/debug";
import { getDefaultTrainingConstraints } from "@/lib/workout-generation/injury-constraints";
import { buildWorkoutSlotPlan } from "@/lib/workout-generation/slot-planner";
import { selectExercisesForSlots } from "@/lib/workout-generation/exercise-selector";
import { validateSlotWorkout } from "@/lib/workout-generation/slot-validator";
import type {
  SlotExerciseSelection,
  SlotWorkoutDebug,
  WorkoutSlotRole,
  WorkoutGenerationMode,
} from "@/lib/workout-generation/types";
import type {
  GenerateWorkoutWithAiCoreInput,
  GenerateWorkoutWithAiCoreResult,
  SupersetPreference,
} from "@/lib/workouts/generate-workout-core";

const slotClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

const SLOT_SELECTION_MODEL = "gpt-5.4-mini";

type SlotAiSelectionResponse = {
  coachText?: string;
  selections?: Array<{
    slotId?: string;
    exerciseId?: string;
    reason?: string;
  }>;
};

type SlotAiSelectionDebug = {
  requested: boolean;
  used: boolean;
  model: string | null;
  coachText: string | null;
  invalidChoices: Array<{
    slotId: string;
    exerciseId: string;
    reason: string;
  }>;
  error: string | null;
  prompt: string | null;
  rawText: string | null;
  parsedResponse: SlotAiSelectionResponse | null;
};

function getSportProtectedRoles(params: {
  sportFocus: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"]["sportFocus"];
}) {
  if (params.sportFocus === "cycling") {
    return ["main_squat", "main_hinge", "unilateral_lower", "calves", "core"] as WorkoutSlotRole[];
  }
  if (params.sportFocus === "alpine_skiing") {
    return [
      "main_squat",
      "main_hinge",
      "unilateral_lower",
      "calves",
      "core",
      "carry",
    ] as WorkoutSlotRole[];
  }
  if (params.sportFocus === "surf_sports") {
    return ["main_pull", "rear_delt_scapula", "core", "carry"] as WorkoutSlotRole[];
  }

  return [] as WorkoutSlotRole[];
}

function safeParseJSON(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        return null;
      }
    }

    return null;
  }
}

function buildValidationFocusContext(params: {
  input: GenerateWorkoutWithAiCoreInput;
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
}): GeneratedWorkoutValidationFocusContext {
  return {
    plannedFocus: params.coachContext.selectedFocus,
    goal: params.coachContext.goal,
    experienceLevel: params.coachContext.experienceLevel,
    durationMinutes: params.input.durationMinutes,
    priorityMuscles: params.coachContext.focusCompatiblePriorities,
    recoveryLimitedMuscles: params.coachContext.recoverySummary.recoverySeverityByMuscle
      .filter((entry) => entry.severity !== "none")
      .map((entry) => entry.muscle),
    availableEquipment: params.input.equipment,
    sportFocus: params.coachContext.sportFocus,
  };
}

function buildSlotCandidate(params: {
  selectedFocus: WorkoutFocus | "recovery_strength";
  durationMinutes: number;
  selections: ReturnType<typeof selectExercisesForSlots>["selections"];
  coachText?: string | null;
}) {
  const exercises = params.selections.map((selection, index) => ({
    id: selection.exerciseId,
    name: selection.exerciseName,
    role: selection.role,
    priorityRank: index + 1,
    canDropIfShort: index >= Math.max(2, params.selections.length - 2),
    reason: selection.reason,
  }));

  return {
    name:
      params.selectedFocus === "lower_body"
        ? "Underkroppspass"
        : params.selectedFocus === "upper_body"
          ? "Överkroppspass"
          : params.selectedFocus === "recovery_strength"
            ? "Lätt återhämtningspass"
            : "Helkroppspass",
    duration: params.durationMinutes,
    rationale:
      params.coachText?.trim() ||
      "Slot-baserad generator skapade passet från required slots, målconfig och träningshistorik.",
    blocks: [
      {
        type: "straight_sets",
        title: "Huvuddel",
        exercises,
      },
    ],
  } satisfies AiGeneratedWorkoutCandidate;
}

function buildSlotDebug(params: {
  goalConfigId: string;
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selection: ReturnType<typeof selectExercisesForSlots>;
  slotValidation: ReturnType<typeof validateSlotWorkout>;
  safeTemplateUsed?: boolean;
  safeTemplateReason?: string | null;
  slotFailureReasons?: string[];
  aiSelectionDebug: SlotAiSelectionDebug;
}) {
  return {
    selectedGoalConfig: params.goalConfigId,
    coachDecision: {
      reason: params.coachContext.coachDecisionReason,
      selectedFocus: params.coachContext.selectedFocus,
      selectedFocusReason: params.coachContext.selectedFocusReason,
      durationReason: params.coachContext.durationReason,
      trainingGapSummary: params.coachContext.trainingGapSummary,
      focusCompatiblePriorities: params.coachContext.focusCompatiblePriorities,
      deferredPriorities: params.coachContext.deferredPriorities,
      recoverySummary: params.coachContext.recoverySummary,
    },
    slotTemplateId: params.slotPlan.templateId,
    plannedSlots: params.slotPlan.slots,
    slotReasons: params.slotPlan.slots.map((slot) => ({
      slotId: slot.id,
      role: slot.role,
      reason: slot.reason,
    })),
    candidatesPerSlot: params.selection.candidatesPerSlot,
    selectedExercisePerSlot: params.selection.selections,
    rejectedCandidates: params.selection.rejectedCandidates,
    slotCandidateCounts: Object.fromEntries(
      Object.entries(params.selection.candidatesPerSlot).map(([slotId, candidates]) => [
        slotId,
        candidates.length,
      ]),
    ),
    rejectedCandidatesBySlot: Object.fromEntries(
      Object.entries(params.selection.rejectedCandidates).map(([slotId, candidates]) => [
        slotId,
        candidates
          .flatMap((candidate) => candidate.rejectedReasons)
          .filter((reason, index, values) => values.indexOf(reason) === index),
      ]),
    ),
    slotValidationPassed: params.slotValidation.slotValidationPassed,
    missingRequiredSlots: params.slotValidation.missingRequiredSlots,
    invalidSlotExercises: params.slotValidation.invalidSlotExercises,
    slotFailureReasons: params.slotFailureReasons ?? params.slotValidation.safetyGateReasons,
    safeTemplateUsed: params.safeTemplateUsed ?? false,
    safeTemplateReason: params.safeTemplateReason ?? null,
    slotAiRequested: params.aiSelectionDebug.requested,
    slotAiUsed: params.aiSelectionDebug.used,
    slotAiModel: params.aiSelectionDebug.model,
    slotAiCoachText: params.aiSelectionDebug.coachText,
    slotAiInvalidChoices: params.aiSelectionDebug.invalidChoices,
    slotAiError: params.aiSelectionDebug.error,
    recentVariantGroups: params.coachContext.recentVariantGroups,
    sportFocusRelevantRoles: getSportProtectedRoles({
      sportFocus: params.coachContext.sportFocus,
    }),
    sportFocusProtectedRoles: getSportProtectedRoles({
      sportFocus: params.coachContext.sportFocus,
    }),
    slotRecoveryModificationSummary:
      params.coachContext.recoverySummary.recoverySeverityByMuscle
        .filter((entry) => entry.severity !== "none")
        .map((entry) => `${entry.muscle}: ${entry.severity} (${entry.reason})`),
    safetyGateReasons: params.slotValidation.safetyGateReasons,
    finalSlotCoverage: params.slotValidation.finalSlotCoverage,
    finalWorkoutQualityScore: params.slotValidation.finalWorkoutQualityScore,
  } satisfies SlotWorkoutDebug;
}

function buildSlotAiPrompt(params: {
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selection: ReturnType<typeof selectExercisesForSlots>;
}) {
  const payload = {
    goal: params.coachContext.goal,
    focus: params.coachContext.selectedFocus,
    durationMinutes: params.coachContext.durationMinutes,
    experienceLevel: params.coachContext.experienceLevel,
    sportFocus: params.coachContext.sportFocus,
    trainingGapSummary: params.coachContext.trainingGapSummary,
    adherenceSessionsRatio: params.coachContext.adherenceSessionsRatio,
    adherenceMinutesRatio: params.coachContext.adherenceMinutesRatio,
    completedSessions7d: params.coachContext.completedSessions7d,
    plannedSessions7d: params.coachContext.plannedSessions7d,
    hasSpontaneousWorkoutThisWeek: params.coachContext.hasSpontaneousWorkoutThisWeek,
    slotTemplateId: params.slotPlan.templateId,
    rules: [
      "Returnera endast strikt JSON.",
      "Välj bara exerciseId som redan finns i candidates för varje slot.",
      "Välj exakt en exerciseId per required slot.",
      "Hoppa över optional slots endast om ingen kandidat tillför något tydligt.",
      "Ändra inte passets struktur. Slots är redan låsta av regelmotorn.",
      "Prioritera återhämtningskompatibla varianter när recovery verkar begränsad.",
      "CoachText ska vara kort, konkret och anpassad till mål, adherence och eventuell extra träning.",
    ],
    slots: params.slotPlan.slots.map((slot) => ({
      slotId: slot.id,
      role: slot.role,
      required: slot.required,
      priority: slot.priority,
      reason: slot.reason,
      intensityHint: slot.intensityHint ?? null,
      candidates: (params.selection.candidatesPerSlot[slot.id] ?? []).slice(0, 5).map(
        (candidate) => ({
          exerciseId: candidate.exerciseId,
          exerciseName: candidate.exerciseName,
          score: candidate.score,
          scoreBreakdown: candidate.scoreBreakdown.slice(0, 3),
        }),
      ),
    })),
  };

  return [
    "Du väljer övningar inom redan säkra tränings-slots.",
    "Svara med JSON i formatet:",
    '{"coachText":"kort svensk coachtext","selections":[{"slotId":"...","exerciseId":"...","reason":"kort motivering"}]}',
    "Välj aldrig en övning som inte finns bland slotens candidates.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

async function requestAiSlotSelections(params: {
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selection: ReturnType<typeof selectExercisesForSlots>;
}): Promise<SlotAiSelectionDebug> {
  if (!slotClient) {
    return {
      requested: false,
      used: false,
      model: null,
      coachText: null,
      invalidChoices: [],
      error: "openai_api_key_missing",
      prompt: null,
      rawText: null,
      parsedResponse: null,
    };
  }

  const prompt = buildSlotAiPrompt(params);

  try {
    const response = await slotClient.chat.completions.create({
      model: SLOT_SELECTION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Du är en erfaren personlig tränare. Du väljer endast mellan redan godkända kandidater och svarar med strikt JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const rawText = response.choices?.[0]?.message?.content ?? "";
    const parsedResponse = safeParseJSON(rawText) as SlotAiSelectionResponse | null;

    if (!parsedResponse || !Array.isArray(parsedResponse.selections)) {
      return {
        requested: true,
        used: false,
        model: SLOT_SELECTION_MODEL,
        coachText: null,
        invalidChoices: [],
        error: "slot_ai_response_unparseable",
        prompt,
        rawText,
        parsedResponse,
      };
    }

    return {
      requested: true,
      used: true,
      model: SLOT_SELECTION_MODEL,
      coachText:
        typeof parsedResponse.coachText === "string"
          ? parsedResponse.coachText.trim() || null
          : null,
      invalidChoices: [],
      error: null,
      prompt,
      rawText,
      parsedResponse,
    };
  } catch (error) {
    return {
      requested: true,
      used: false,
      model: SLOT_SELECTION_MODEL,
      coachText: null,
      invalidChoices: [],
      error: error instanceof Error ? error.message : "slot_ai_request_failed",
      prompt,
      rawText: null,
      parsedResponse: null,
    };
  }
}

function mergeAiSelections(params: {
  slotPlan: ReturnType<typeof buildWorkoutSlotPlan>;
  selection: ReturnType<typeof selectExercisesForSlots>;
  aiSelectionDebug: SlotAiSelectionDebug;
}) {
  const localSelectionBySlot = new Map(
    params.selection.selections.map((selection) => [selection.slotId, selection]),
  );
  const usedExerciseIds = new Set<string>();
  const invalidChoices = [...params.aiSelectionDebug.invalidChoices];
  const aiSelections = Array.isArray(params.aiSelectionDebug.parsedResponse?.selections)
    ? params.aiSelectionDebug.parsedResponse.selections
    : [];
  const aiSelectionBySlot = new Map(
    aiSelections
      .filter(
        (selection): selection is { slotId: string; exerciseId: string; reason?: string } =>
          typeof selection?.slotId === "string" && typeof selection?.exerciseId === "string",
      )
      .map((selection) => [selection.slotId, selection]),
  );

  const mergedSelections: SlotExerciseSelection[] = [];

  for (const slot of params.slotPlan.slots) {
    const localSelection = localSelectionBySlot.get(slot.id);
    const aiSelection = aiSelectionBySlot.get(slot.id);
    const validCandidate = aiSelection
      ? (params.selection.candidatesPerSlot[slot.id] ?? []).find(
          (candidate) => candidate.exerciseId === aiSelection.exerciseId,
        )
      : null;

    if (aiSelection && validCandidate && !usedExerciseIds.has(validCandidate.exerciseId)) {
      usedExerciseIds.add(validCandidate.exerciseId);
      mergedSelections.push({
        slotId: slot.id,
        role: slot.role,
        exerciseId: validCandidate.exerciseId,
        exerciseName: validCandidate.exerciseName,
        reason:
          aiSelection.reason?.trim() ||
          localSelection?.reason ||
          "AI valde denna kandidat inom den fördefinierade sloten.",
        selectionSource: "ai_rank",
        candidates: params.selection.candidatesPerSlot[slot.id] ?? [],
      });
      continue;
    }

    if (aiSelection && !validCandidate) {
      invalidChoices.push({
        slotId: slot.id,
        exerciseId: aiSelection.exerciseId,
        reason: "exercise_not_in_allowed_slot_candidates",
      });
    } else if (aiSelection && validCandidate && usedExerciseIds.has(validCandidate.exerciseId)) {
      invalidChoices.push({
        slotId: slot.id,
        exerciseId: aiSelection.exerciseId,
        reason: "duplicate_exercise_choice",
      });
    }

    if (!localSelection || usedExerciseIds.has(localSelection.exerciseId)) {
      continue;
    }

    usedExerciseIds.add(localSelection.exerciseId);
    mergedSelections.push(localSelection);
  }

  return {
    selection: {
      ...params.selection,
      selections: mergedSelections,
    },
    aiSelectionDebug: {
      ...params.aiSelectionDebug,
      invalidChoices,
      used:
        params.aiSelectionDebug.used &&
        mergedSelections.some((selection) => selection.selectionSource === "ai_rank"),
    },
  };
}

async function runSlotPlanningPass(params: {
  coachContext: ReturnType<typeof buildWorkoutGenerationCoachContext>["coachContext"];
  safeTemplateMode?: boolean;
}) {
  const slotPlan = buildWorkoutSlotPlan({ coachContext: params.coachContext });
  const localSelection = selectExercisesForSlots({
    slots: slotPlan.slots,
    coachContext: params.coachContext,
    allowSafeTemplateFallback: params.safeTemplateMode,
  });
  const aiSelectionDebug = await requestAiSlotSelections({
    coachContext: params.coachContext,
    slotPlan,
    selection: localSelection,
  });
  const { selection, aiSelectionDebug: mergedAiSelectionDebug } = mergeAiSelections({
    slotPlan,
    selection: localSelection,
    aiSelectionDebug,
  });
  const slotValidation = validateSlotWorkout({
    slots: slotPlan.slots,
    selections: selection.selections,
    coachContext: params.coachContext,
  });

  return {
    slotPlan,
    selection,
    aiSelectionDebug: mergedAiSelectionDebug,
    slotValidation,
  };
}

export async function generateWorkoutWithSlotBasedV1(
  input: GenerateWorkoutWithAiCoreInput & {
    generationMode?: WorkoutGenerationMode | null;
  },
): Promise<GenerateWorkoutWithAiCoreResult> {
  const constraints = getDefaultTrainingConstraints();
  const { coachContext, trainingHistoryContext } = buildWorkoutGenerationCoachContext({
    input,
    constraints,
  });
  const initialPass = await runSlotPlanningPass({
    coachContext,
  });
  const safeTemplatePass = initialPass.slotValidation.slotValidationPassed
    ? null
    : await runSlotPlanningPass({
        coachContext,
        safeTemplateMode: true,
      });
  const activePass =
    safeTemplatePass?.slotValidation.slotValidationPassed ? safeTemplatePass : initialPass;
  const slotDebug = buildSlotDebug({
    goalConfigId: activePass.slotPlan.goalConfig.id,
    coachContext,
    slotPlan: activePass.slotPlan,
    selection: activePass.selection,
    slotValidation: activePass.slotValidation,
    safeTemplateUsed: Boolean(safeTemplatePass?.slotValidation.slotValidationPassed),
    safeTemplateReason:
      safeTemplatePass?.slotValidation.slotValidationPassed
        ? initialPass.slotValidation.safetyGateReasons.join(", ") ||
          "required_slots_missing"
        : null,
    slotFailureReasons: initialPass.slotValidation.safetyGateReasons,
    aiSelectionDebug: activePass.aiSelectionDebug,
  });

  if (!activePass.slotValidation.slotValidationPassed) {
    return {
      ok: false,
      status: 500,
      error: `slot_based_v1 kunde inte fylla required slots: ${activePass.slotValidation.safetyGateReasons.join(", ")}`,
    };
  }

  const candidate = buildSlotCandidate({
    selectedFocus: coachContext.selectedFocus,
    durationMinutes: input.durationMinutes,
    selections: activePass.selection.selections,
    coachText: activePass.aiSelectionDebug.coachText,
  });
  const focusContext = buildValidationFocusContext({
    input,
    coachContext,
  });
  const validated = validateGeneratedWorkout({
    focusContext,
    availableEquipment: input.equipment,
    candidate,
    durationMinutes: input.durationMinutes,
    goal: coachContext.goal,
    gym: input.gym,
    gymLabel: input.gymLabel,
    recentExerciseIds: coachContext.recentExerciseIds,
    recentVariantGroups: coachContext.recentVariantGroups,
    weeklyBudget: input.weeklyBudget,
    lessOftenExerciseIds: input.lessOftenExerciseIds,
    avoidSupersets: input.avoidSupersets,
    supersetPreference:
      input.supersetPreference ??
      (input.avoidSupersets ? "avoid_all" : ("allowed" satisfies SupersetPreference)),
  });

  const parsedWithContext = {
    ...validated.workout,
    goal: input.goal,
    duration: validated.workout.duration ?? input.durationMinutes,
    gym: input.gym,
    gymLabel: input.gymLabel,
    plannedFocus:
      input.selectedPlanMode === "recovery" ? "full_body" : input.nextFocus,
    availableEquipment: input.equipment,
    aiDebug: {
      request: {
        goal: input.goal,
        durationMinutes: input.durationMinutes,
        nextFocus: input.nextFocus,
        selectedPlanMode: input.selectedPlanMode,
        focusIntent: input.focusIntent,
      },
      generationContext: {
        generationModeRequested: input.generationMode ?? "slot_based_v1",
        selectedGoalConfig: slotDebug.selectedGoalConfig,
        coachDecision: slotDebug.coachDecision,
        selectedFocus: slotDebug.coachDecision.selectedFocus,
        slotTemplateId: slotDebug.slotTemplateId,
        plannedSlots: slotDebug.plannedSlots,
        slotReasons: slotDebug.slotReasons,
        candidatesPerSlot: slotDebug.candidatesPerSlot,
        selectedExercisePerSlot: slotDebug.selectedExercisePerSlot,
        rejectedCandidates: slotDebug.rejectedCandidates,
        slotValidationDebug: {
          slotValidationPassed: slotDebug.slotValidationPassed,
          missingRequiredSlots: slotDebug.missingRequiredSlots,
          invalidSlotExercises: slotDebug.invalidSlotExercises,
          safetyGateReasons: slotDebug.safetyGateReasons,
          finalSlotCoverage: slotDebug.finalSlotCoverage,
          finalWorkoutQualityScore: slotDebug.finalWorkoutQualityScore,
        },
        slotAiRequested: slotDebug.slotAiRequested,
        slotAiUsed: slotDebug.slotAiUsed,
        slotAiModel: slotDebug.slotAiModel,
        slotAiCoachText: slotDebug.slotAiCoachText,
        slotAiInvalidChoices: slotDebug.slotAiInvalidChoices,
        slotAiError: slotDebug.slotAiError,
        recentVariantGroups: slotDebug.recentVariantGroups,
        sportFocusRelevantRoles: slotDebug.sportFocusRelevantRoles,
        sportFocusProtectedRoles: slotDebug.sportFocusProtectedRoles,
        recentWorkoutsSummary: trainingHistoryContext.recentWorkouts,
      },
      prompt:
        activePass.aiSelectionDebug.prompt ??
        "slot_based_v1 generated locally from goal config, coach context and slots.",
      rawAiText:
        activePass.aiSelectionDebug.rawText ?? JSON.stringify(candidate, null, 2),
      parsedAiResponse:
        activePass.aiSelectionDebug.parsedResponse ?? candidate,
      validatedWorkout: validated.debug,
    },
  };
  const normalizedWorkout = normalizePreviewWorkout(parsedWithContext);

  if (!normalizedWorkout) {
    return {
      ok: false,
      status: 500,
      error: "Kunde inte normalisera slot-baserat träningspass",
    };
  }

  return {
    ok: true,
    workout: attachWorkoutGenerationDebug({
      workout: {
        ...normalizedWorkout,
        aiDebug: {
          ...normalizedWorkout.aiDebug,
          normalizedWorkout,
        },
      },
      generationModeRequested: input.generationMode ?? "slot_based_v1",
      generationEngineUsed: "slot_based_v1",
      generationFallbackUsed: false,
      generationFallbackReason: null,
      slotValidationPassed: activePass.slotValidation.slotValidationPassed,
      legacyValidationPassed: null,
      finalSafetyGateReasons: activePass.slotValidation.safetyGateReasons,
      slotDebug,
    }),
  };
}

export async function generateSafeSlotTemplateWorkout(
  input: GenerateWorkoutWithAiCoreInput & {
    generationMode?: WorkoutGenerationMode | null;
  },
): Promise<GenerateWorkoutWithAiCoreResult> {
  // Reuse the slot engine's safe-template pass as a last-resort rescue path.
  return generateWorkoutWithSlotBasedV1({
    ...input,
    generationMode: input.generationMode ?? "slot_based_v1",
  });
}
