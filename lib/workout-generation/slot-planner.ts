import { getTrainingGoalConfig } from "@/lib/workout-generation/goal-config";
import type {
  TrainingGoalConfig,
  WorkoutCoachContext,
  WorkoutSlot,
  WorkoutSlotRole,
} from "@/lib/workout-generation/types";

function clampSlotCount(params: {
  durationMinutes: number;
  goal: WorkoutCoachContext["goal"];
}) {
  const { durationMinutes, goal } = params;

  if (durationMinutes <= 20) {
    return goal === "strength" ? 3 : 3;
  }
  if (durationMinutes <= 30) {
    return goal === "strength" ? 4 : 4;
  }
  if (durationMinutes <= 40) {
    return goal === "strength" ? 5 : 5;
  }
  if (durationMinutes <= 50) {
    return goal === "strength" ? 6 : 6;
  }
  return goal === "strength" ? 7 : 8;
}

function createSlot(params: {
  templateId: string;
  index: number;
  role: WorkoutSlotRole;
  required: boolean;
  priority: number;
  reason: string;
  intensityHint?: WorkoutSlot["intensityHint"];
  progressionHint?: WorkoutSlot["progressionHint"];
}) {
  return {
    id: `${params.templateId}:${params.index}:${params.role}`,
    role: params.role,
    required: params.required,
    priority: params.priority,
    intensityHint: params.intensityHint,
    progressionHint: params.progressionHint,
    reason: params.reason,
  } satisfies WorkoutSlot;
}

function addRequiredBaseSlots(params: {
  templateId: string;
  focus: WorkoutCoachContext["selectedFocus"];
  goalConfig: TrainingGoalConfig;
}) {
  const slots: WorkoutSlot[] = [];

  if (params.focus === "upper_body") {
    slots.push(
      createSlot({
        templateId: params.templateId,
        index: 0,
        role: "main_push",
        required: true,
        priority: 100,
        progressionHint:
          params.goalConfig.progressionStyle === "load" ? "load" : "volume",
        reason: "Upper body behöver alltid en huvudpress.",
      }),
      createSlot({
        templateId: params.templateId,
        index: 1,
        role: "main_pull",
        required: true,
        priority: 100,
        progressionHint:
          params.goalConfig.progressionStyle === "load" ? "load" : "volume",
        reason: "Upper body behöver alltid ett huvuddrag.",
      }),
    );
  } else if (params.focus === "lower_body") {
    slots.push(
      createSlot({
        templateId: params.templateId,
        index: 0,
        role: "main_squat",
        required: true,
        priority: 100,
        progressionHint:
          params.goalConfig.progressionStyle === "load" ? "load" : "volume",
        reason: "Lower body behöver en knädominant eller tydligt enbensbaserad slot.",
      }),
      createSlot({
        templateId: params.templateId,
        index: 1,
        role: "main_hinge",
        required: true,
        priority: 100,
        progressionHint:
          params.goalConfig.progressionStyle === "load" ? "load" : "volume",
        reason: "Lower body behöver en hinge/glute/hamstring-slot.",
      }),
    );
  } else if (params.focus === "recovery_strength") {
    slots.push(
      createSlot({
        templateId: params.templateId,
        index: 0,
        role: "main_pull",
        required: true,
        priority: 100,
        intensityHint: "light",
        progressionHint: "maintenance",
        reason: "Recovery strength behöver ett lätt drag för cirkulation och teknik.",
      }),
      createSlot({
        templateId: params.templateId,
        index: 1,
        role: "recovery_light",
        required: true,
        priority: 95,
        intensityHint: "light",
        progressionHint: "maintenance",
        reason: "Recovery strength behöver lätt press eller lätt sätesdominant arbete.",
      }),
      createSlot({
        templateId: params.templateId,
        index: 2,
        role: "core",
        required: true,
        priority: 90,
        intensityHint: "light",
        progressionHint: "maintenance",
        reason: "Recovery strength behöver lätt bål/stabilitet.",
      }),
    );
  } else {
    slots.push(
      createSlot({
        templateId: params.templateId,
        index: 0,
        role: "main_squat",
        required: true,
        priority: 100,
        reason: "Full body behöver lower-body-bas.",
      }),
      createSlot({
        templateId: params.templateId,
        index: 1,
        role: "main_hinge",
        required: true,
        priority: 95,
        reason: "Full body behöver hinge/glute-komponent.",
      }),
      createSlot({
        templateId: params.templateId,
        index: 2,
        role: "main_push",
        required: true,
        priority: 95,
        reason: "Full body behöver press.",
      }),
      createSlot({
        templateId: params.templateId,
        index: 3,
        role: "main_pull",
        required: true,
        priority: 95,
        reason: "Full body behöver drag.",
      }),
    );
  }

  return slots;
}

function getOptionalRoleOrder(params: {
  focus: WorkoutCoachContext["selectedFocus"];
  coachContext: WorkoutCoachContext;
}) {
  const isStrength = params.coachContext.goal === "strength";
  const prioritizeCalves = params.coachContext.focusCompatiblePriorities.includes("calves");
  const prioritizeBiceps = params.coachContext.focusCompatiblePriorities.includes("biceps");
  const prioritizeTriceps = params.coachContext.focusCompatiblePriorities.includes("triceps");
  const cycling = params.coachContext.sportFocus === "cycling";
  const alpine = params.coachContext.sportFocus === "alpine_skiing";

  if (params.focus === "upper_body") {
    if (isStrength) {
      return [
        prioritizeTriceps ? "direct_triceps" : "direct_biceps",
        "shoulder_accessory",
        "rear_delt_scapula",
        "core",
        "carry",
      ] satisfies WorkoutSlotRole[];
    }

    return [
      prioritizeTriceps ? "direct_triceps" : "direct_biceps",
      "shoulder_accessory",
      params.coachContext.sportFocus === "surf_sports" ? "carry" : "rear_delt_scapula",
      "core",
      "optional_accessory",
    ] satisfies WorkoutSlotRole[];
  }

  if (params.focus === "lower_body") {
    if (isStrength) {
      return [
        "unilateral_lower",
        cycling || alpine ? "core" : prioritizeCalves ? "calves" : "core",
        prioritizeCalves ? "calves" : "carry",
        "optional_accessory",
      ] satisfies WorkoutSlotRole[];
    }

    return [
      "unilateral_lower",
      prioritizeCalves ? "calves" : cycling ? "core" : "core",
      alpine ? "carry" : "optional_accessory",
      "optional_accessory",
      "core",
    ] satisfies WorkoutSlotRole[];
  }

  if (params.focus === "recovery_strength") {
    return ["carry", "rehab_control", "core"] satisfies WorkoutSlotRole[];
  }

  if (isStrength) {
    return [
      "core",
      prioritizeBiceps ? "direct_biceps" : prioritizeTriceps ? "direct_triceps" : "carry",
      "carry",
      "rear_delt_scapula",
    ] satisfies WorkoutSlotRole[];
  }

  return [
    cycling || alpine || params.coachContext.sportFocus === "surf_sports" ? "core" : "carry",
    prioritizeBiceps ? "direct_biceps" : "direct_triceps",
    cycling || alpine ? "carry" : "rear_delt_scapula",
    "rear_delt_scapula",
    "optional_accessory",
  ] satisfies WorkoutSlotRole[];
}

export function buildWorkoutSlotPlan(params: {
  coachContext: WorkoutCoachContext;
}) {
  const goalConfig = getTrainingGoalConfig(params.coachContext.goal);
  const templateId = `${goalConfig.id}:${params.coachContext.selectedFocus}:${params.coachContext.durationMinutes}`;
  const targetSlotCount = clampSlotCount({
    durationMinutes: params.coachContext.durationMinutes,
    goal: params.coachContext.goal,
  });
  const requiredSlots = addRequiredBaseSlots({
    templateId,
    focus: params.coachContext.selectedFocus,
    goalConfig,
  });
  const optionalRoleOrder = getOptionalRoleOrder({
    focus: params.coachContext.selectedFocus,
    coachContext: params.coachContext,
  });
  const slots = [...requiredSlots];

  while (slots.length < targetSlotCount) {
    const nextRole = optionalRoleOrder[(slots.length - requiredSlots.length) % optionalRoleOrder.length];
    slots.push(
      createSlot({
        templateId,
        index: slots.length,
        role: nextRole,
        required: false,
        priority:
          70 + Math.round((goalConfig.slotWeights[nextRole] ?? 0.5) * 20),
        intensityHint:
          params.coachContext.selectedFocus === "recovery_strength"
            ? "light"
            : "moderate",
        progressionHint:
          params.coachContext.selectedFocus === "recovery_strength"
            ? "maintenance"
            : goalConfig.progressionStyle,
        reason: `Valdes som kompletterande slot utifrån mål ${goalConfig.id}, fokus ${params.coachContext.selectedFocus} och passlängd.`,
      }),
    );
  }

  return {
    goalConfig,
    templateId,
    targetSlotCount,
    slots,
  };
}
