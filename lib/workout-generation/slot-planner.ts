import { getTrainingGoalConfig } from "@/lib/workout-generation/goal-config";
import type {
  TrainingGoalConfig,
  WorkoutCoachContext,
  WorkoutSlot,
  WorkoutSlotContract,
  WorkoutSlotRole,
} from "@/lib/workout-generation/types";

function clampSlotCount(params: {
  durationMinutes: number;
  goal: WorkoutCoachContext["goal"];
}) {
  const { durationMinutes, goal } = params;

  if (durationMinutes <= 20) return 3;
  if (durationMinutes <= 30) return goal === "strength" ? 4 : 4;
  if (durationMinutes <= 40) return 5;
  if (durationMinutes <= 50) return goal === "strength" ? 6 : 6;
  return goal === "strength" ? 7 : 8;
}

function createContractSlot(params: {
  templateId: string;
  index: number;
  label: string;
  role: WorkoutSlotRole;
  allowedRoles: WorkoutSlotRole[];
  required: boolean;
  priority: number;
  reason: string;
  targetMuscles?: WorkoutSlot["targetMuscles"];
  preferredMovementPatterns?: WorkoutSlot["preferredMovementPatterns"];
  forbiddenMovementPatterns?: WorkoutSlot["forbiddenMovementPatterns"];
  minGoalSpecificity?: number;
  allowRecoveryLight?: boolean;
  allowBodyweightFallback?: boolean;
  intensityHint?: WorkoutSlot["intensityHint"];
  progressionHint?: WorkoutSlot["progressionHint"];
}) {
  return {
    id: `${params.templateId}:${params.index}:${params.label}`,
    label: params.label,
    role: params.role,
    allowedRoles: params.allowedRoles,
    required: params.required,
    priority: params.priority,
    targetMuscles: params.targetMuscles,
    preferredMovementPatterns: params.preferredMovementPatterns,
    forbiddenMovementPatterns: params.forbiddenMovementPatterns,
    minGoalSpecificity: params.minGoalSpecificity,
    allowRecoveryLight: params.allowRecoveryLight,
    allowBodyweightFallback: params.allowBodyweightFallback,
    intensityHint: params.intensityHint,
    progressionHint: params.progressionHint,
    reason: params.reason,
  } satisfies WorkoutSlot;
}

function buildUpperBodyContract(params: {
  templateId: string;
  goalConfig: TrainingGoalConfig;
  coachContext: WorkoutCoachContext;
  targetSlotCount: number;
}) {
  const isStrength = params.coachContext.goal === "strength";
  const slots: WorkoutSlot[] = [
    createContractSlot({
      templateId: params.templateId,
      index: 0,
      label: "main_push",
      role: "main_push",
      allowedRoles: ["main_push"],
      required: true,
      priority: 100,
      preferredMovementPatterns: ["horizontal_push", "vertical_push"],
      minGoalSpecificity: isStrength ? 2 : 1,
      allowRecoveryLight: true,
      allowBodyweightFallback: !isStrength,
      progressionHint: params.goalConfig.progressionStyle === "load" ? "load" : "volume",
      reason: "Överkroppspass behöver alltid en tydlig pressroll.",
    }),
    createContractSlot({
      templateId: params.templateId,
      index: 1,
      label: "main_pull",
      role: "main_pull",
      allowedRoles: ["main_pull"],
      required: true,
      priority: 100,
      preferredMovementPatterns: ["horizontal_pull", "vertical_pull"],
      minGoalSpecificity: isStrength ? 2 : 1,
      allowRecoveryLight: true,
      allowBodyweightFallback: !isStrength,
      progressionHint: params.goalConfig.progressionStyle === "load" ? "load" : "volume",
      reason: "Överkroppspass behöver alltid en tydlig dragroll.",
    }),
  ];

  if (params.targetSlotCount >= 4) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "secondary_push_or_pull",
        role: "main_pull",
        allowedRoles: ["main_push", "main_pull", "rear_delt_scapula", "shoulder_accessory"],
        required: true,
        priority: 90,
        preferredMovementPatterns: ["horizontal_pull", "horizontal_push", "vertical_push"],
        minGoalSpecificity: 1,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: params.goalConfig.progressionStyle,
        reason: "Längre överkroppspass behöver en extra överkroppsroll för balans eller progression.",
      }),
    );
  }

  if (params.targetSlotCount >= 5) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "arm_or_shoulder",
        role: "direct_triceps",
        allowedRoles: ["direct_biceps", "direct_triceps", "shoulder_accessory", "rear_delt_scapula"],
        required: false,
        priority: 78,
        minGoalSpecificity: 1,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: params.goalConfig.progressionStyle === "load" ? "load" : "volume",
        reason: "Arm/skuldra-slot samlar relevanta accessoarer utan att bryta passets huvudstruktur.",
      }),
    );
  }

  if (params.targetSlotCount >= 6) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "core_or_scapula",
        role: "core",
        allowedRoles: ["core", "rear_delt_scapula", "carry"],
        required: false,
        priority: 70,
        preferredMovementPatterns: ["core", "carry", "horizontal_pull"],
        minGoalSpecificity: 0,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: "maintenance",
        reason: "Core/scapula-slot ger plats för bål, scapulakontroll eller carry när passet är längre.",
      }),
    );
  }

  return slots;
}

function buildLowerBodyContract(params: {
  templateId: string;
  goalConfig: TrainingGoalConfig;
  coachContext: WorkoutCoachContext;
  targetSlotCount: number;
}) {
  const isStrength = params.coachContext.goal === "strength";
  const slots: WorkoutSlot[] = [
    createContractSlot({
      templateId: params.templateId,
      index: 0,
      label: "main_squat_or_unilateral",
      role: "main_squat",
      allowedRoles: ["main_squat", "unilateral_lower"],
      required: true,
      priority: 100,
      preferredMovementPatterns: ["squat", "lunge"],
      minGoalSpecificity: isStrength ? 2 : 1,
      allowRecoveryLight: true,
      allowBodyweightFallback: !isStrength,
      progressionHint: params.goalConfig.progressionStyle === "load" ? "load" : "volume",
      reason: "Underkroppspass behöver en knädominant eller tydlig enbensbas som första roll.",
    }),
    createContractSlot({
      templateId: params.templateId,
      index: 1,
      label: "main_hinge",
      role: "main_hinge",
      allowedRoles: ["main_hinge"],
      required: true,
      priority: 98,
      preferredMovementPatterns: ["hinge"],
      minGoalSpecificity: isStrength ? 2 : 1,
      allowRecoveryLight: true,
      allowBodyweightFallback: !isStrength,
      progressionHint: params.goalConfig.progressionStyle === "load" ? "load" : "volume",
      reason: "Underkroppspass behöver alltid en hinge eller tydlig posterior-chain-roll.",
    }),
  ];

  if (params.targetSlotCount >= 4) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "secondary_lower",
        role: "unilateral_lower",
        allowedRoles: ["unilateral_lower", "main_squat", "main_hinge"],
        required: true,
        priority: 90,
        preferredMovementPatterns: ["lunge", "squat", "hinge"],
        minGoalSpecificity: 1,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: params.goalConfig.progressionStyle,
        reason: "Andra underkroppsrollen ska komplettera första lower-slots inom samma familj.",
      }),
    );
  }

  if (params.targetSlotCount >= 5) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "calves_or_posterior_chain",
        role: "calves",
        allowedRoles: ["calves", "main_hinge", "carry", "core"],
        required: false,
        priority: 74,
        preferredMovementPatterns: ["core", "carry", "hinge"],
        minGoalSpecificity: 0,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: "maintenance",
        reason: "Senare underkroppsslot kan ge calves, posterior-chain-stöd eller enkel lower-accessory.",
      }),
    );
  }

  if (params.targetSlotCount >= 6) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "core_or_carry",
        role: "core",
        allowedRoles: ["core", "carry", "rehab_control"],
        required: false,
        priority: 68,
        preferredMovementPatterns: ["core", "carry"],
        minGoalSpecificity: 0,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: "maintenance",
        reason: "Core/carry-slot samlar återhämtningsvänliga lower-komplement utan att dra in överkroppsaccessoarer.",
      }),
    );
  }

  return slots;
}

function buildFullBodyContract(params: {
  templateId: string;
  goalConfig: TrainingGoalConfig;
  coachContext: WorkoutCoachContext;
  targetSlotCount: number;
}) {
  const isStrength = params.coachContext.goal === "strength";
  const slots: WorkoutSlot[] = [
    createContractSlot({
      templateId: params.templateId,
      index: 0,
      label: "main_lower",
      role: "main_squat",
      allowedRoles: ["main_squat", "unilateral_lower"],
      required: true,
      priority: 100,
      preferredMovementPatterns: ["squat", "lunge"],
      minGoalSpecificity: isStrength ? 2 : 1,
      allowRecoveryLight: true,
      allowBodyweightFallback: !isStrength,
      progressionHint: params.goalConfig.progressionStyle,
      reason: "Helkroppspass behöver alltid en lägre kroppsbas från squat- eller unilateral-familjen.",
    }),
    createContractSlot({
      templateId: params.templateId,
      index: 1,
      label: "main_push",
      role: "main_push",
      allowedRoles: ["main_push"],
      required: true,
      priority: 95,
      preferredMovementPatterns: ["horizontal_push", "vertical_push"],
      minGoalSpecificity: isStrength ? 2 : 1,
      allowRecoveryLight: true,
      allowBodyweightFallback: !isStrength,
      progressionHint: params.goalConfig.progressionStyle,
      reason: "Helkroppspass behöver en tydlig pressroll.",
    }),
    createContractSlot({
      templateId: params.templateId,
      index: 2,
      label: "main_pull",
      role: "main_pull",
      allowedRoles: ["main_pull"],
      required: true,
      priority: 95,
      preferredMovementPatterns: ["horizontal_pull", "vertical_pull"],
      minGoalSpecificity: isStrength ? 2 : 1,
      allowRecoveryLight: true,
      allowBodyweightFallback: !isStrength,
      progressionHint: params.goalConfig.progressionStyle,
      reason: "Helkroppspass behöver en tydlig dragroll.",
    }),
  ];

  if (params.targetSlotCount >= 4) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "secondary_lower",
        role: "main_hinge",
        allowedRoles: ["main_hinge", "main_squat", "unilateral_lower"],
        required: true,
        priority: isStrength ? 96 : 88,
        preferredMovementPatterns: ["hinge", "squat", "lunge"],
        minGoalSpecificity: isStrength ? 2 : 1,
        allowRecoveryLight: true,
        allowBodyweightFallback: !isStrength,
        progressionHint: params.goalConfig.progressionStyle,
        reason: "Helkroppspass behöver en andra lower-roll för att inte tappa hinge eller sekundär lower-belastning.",
      }),
    );
  }

  if (params.targetSlotCount >= 5) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "core_or_carry",
        role: "core",
        allowedRoles: ["core", "carry", "rear_delt_scapula", "direct_biceps", "direct_triceps"],
        required: false,
        priority: 72,
        preferredMovementPatterns: ["core", "carry"],
        minGoalSpecificity: 0,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: "maintenance",
        reason: "Femte sloten samlar bål, carry eller mindre fokuskompatibel accessoar utan att ta över strukturen.",
      }),
    );
  }

  if (params.targetSlotCount >= 6) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "optional_accessory",
        role: "optional_accessory",
        allowedRoles: ["direct_biceps", "direct_triceps", "calves", "core", "carry", "rear_delt_scapula"],
        required: false,
        priority: 66,
        preferredMovementPatterns: ["core", "carry", "horizontal_pull"],
        minGoalSpecificity: 0,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: "maintenance",
        reason: "Längre helkroppspass kan bära en mindre accessory-slot när basstrukturen redan är uppfylld.",
      }),
    );
  }

  return slots;
}

function buildRecoveryStrengthContract(params: {
  templateId: string;
  targetSlotCount: number;
}) {
  const slots: WorkoutSlot[] = [
    createContractSlot({
      templateId: params.templateId,
      index: 0,
      label: "safe_pull_or_push",
      role: "main_pull",
      allowedRoles: ["main_pull", "main_push", "recovery_light"],
      required: true,
      priority: 100,
      preferredMovementPatterns: ["horizontal_pull", "horizontal_push", "vertical_pull"],
      minGoalSpecificity: 0,
      allowRecoveryLight: true,
      allowBodyweightFallback: true,
      intensityHint: "light",
      progressionHint: "maintenance",
      reason: "Recovery-pass behöver en lätt överkroppsroll för cirkulation och teknik.",
    }),
    createContractSlot({
      templateId: params.templateId,
      index: 1,
      label: "safe_glute_or_hinge_light",
      role: "recovery_light",
      allowedRoles: ["recovery_light", "main_hinge", "main_squat", "unilateral_lower"],
      required: true,
      priority: 95,
      preferredMovementPatterns: ["hinge", "squat", "lunge"],
      minGoalSpecificity: 0,
      allowRecoveryLight: true,
      allowBodyweightFallback: true,
      intensityHint: "light",
      progressionHint: "maintenance",
      reason: "Recovery-pass behöver en lätt lower/glute-roll utan att bli ett vanligt tungt pass.",
    }),
    createContractSlot({
      templateId: params.templateId,
      index: 2,
      label: "core_or_carry_or_control",
      role: "core",
      allowedRoles: ["core", "carry", "rehab_control"],
      required: true,
      priority: 90,
      preferredMovementPatterns: ["core", "carry"],
      minGoalSpecificity: 0,
      allowRecoveryLight: true,
      allowBodyweightFallback: true,
      intensityHint: "light",
      progressionHint: "maintenance",
      reason: "Recovery-pass behöver bål, kontroll eller carry för att bli meningsfullt men lätt.",
    }),
  ];

  if (params.targetSlotCount >= 4) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "optional_recovery_control",
        role: "rehab_control",
        allowedRoles: ["rehab_control", "core", "carry", "recovery_light"],
        required: false,
        priority: 65,
        minGoalSpecificity: 0,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        intensityHint: "light",
        progressionHint: "maintenance",
        reason: "Längre recovery-pass kan lägga till en extra lätt kontroll- eller mobilitetsroll.",
      }),
    );
  }

  return slots;
}

export function buildSlotContract(params: {
  coachContext: WorkoutCoachContext;
}): WorkoutSlotContract {
  const goalConfig = getTrainingGoalConfig(params.coachContext.goal);
  const templateId = `${goalConfig.id}:${params.coachContext.selectedFocus}:${params.coachContext.durationMinutes}`;
  const targetSlotCount = clampSlotCount({
    durationMinutes: params.coachContext.durationMinutes,
    goal: params.coachContext.goal,
  });

  const slots =
    params.coachContext.selectedFocus === "upper_body"
      ? buildUpperBodyContract({
          templateId,
          goalConfig,
          coachContext: params.coachContext,
          targetSlotCount,
        })
      : params.coachContext.selectedFocus === "lower_body"
        ? buildLowerBodyContract({
            templateId,
            goalConfig,
            coachContext: params.coachContext,
            targetSlotCount,
          })
        : params.coachContext.selectedFocus === "recovery_strength"
          ? buildRecoveryStrengthContract({
              templateId,
              targetSlotCount,
            })
          : buildFullBodyContract({
              templateId,
              goalConfig,
              coachContext: params.coachContext,
              targetSlotCount,
            });

  return {
    templateId,
    goalConfigId: goalConfig.id,
    targetSlotCount,
    slots,
  };
}

export function buildWorkoutSlotPlan(params: {
  coachContext: WorkoutCoachContext;
}) {
  const contract = buildSlotContract(params);

  return {
    templateId: contract.templateId,
    targetSlotCount: contract.targetSlotCount,
    goalConfig: getTrainingGoalConfig(params.coachContext.goal),
    slots: contract.slots,
  };
}
