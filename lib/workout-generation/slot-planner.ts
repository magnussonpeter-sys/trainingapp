import { getAvailableExercises } from "@/lib/exercise-catalog";
import { getEffectivePlanningDurationBucket } from "@/lib/workout-generation/coach-context";
import { getTrainingGoalConfig } from "@/lib/workout-generation/goal-config";
import { getExerciseRoleCandidates } from "@/lib/workout-generation/exercise-selector";
import type {
  SlotContractMode,
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
  if (goal === "strength" && durationMinutes <= 35) return 4;
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

function hasFeasibleRoleMatch(params: {
  availableExercises: ReturnType<typeof getAvailableExercises>;
  roles: WorkoutSlotRole[];
}) {
  if (params.roles.length === 0) {
    return false;
  }

  return params.availableExercises.some((exercise) => {
    const candidateRoles = getExerciseRoleCandidates(exercise);
    return candidateRoles.some((role) => params.roles.includes(role));
  });
}

function getFallbackRoleFamilies(params: {
  focus: WorkoutCoachContext["selectedFocus"];
  slotLabel: string;
}): WorkoutSlotRole[][] {
  if (params.focus === "upper_body") {
    if (params.slotLabel === "main_push") {
      return [
        ["main_push"],
        ["direct_triceps", "shoulder_accessory", "rear_delt_scapula"],
        ["core", "recovery_light"],
        ["optional_accessory"],
      ];
    }

    if (params.slotLabel === "main_pull") {
      return [
        ["main_pull"],
        ["rear_delt_scapula", "shoulder_accessory", "direct_biceps"],
        ["core", "recovery_light"],
        ["optional_accessory"],
      ];
    }

    return [
      ["direct_biceps", "direct_triceps", "shoulder_accessory", "rear_delt_scapula", "core"],
      ["main_push", "main_pull"],
      ["optional_accessory"],
    ];
  }

  if (params.focus === "lower_body") {
    if (params.slotLabel === "main_hinge") {
      return [
        ["main_hinge"],
        ["main_squat", "unilateral_lower"],
        ["core", "carry", "recovery_light"],
        ["calves"],
      ];
    }

    return [
      ["main_squat", "unilateral_lower"],
      ["main_hinge"],
      ["core", "carry", "recovery_light"],
      ["calves"],
    ];
  }

  if (params.focus === "recovery_strength") {
    if (params.slotLabel === "safe_pull_or_push") {
      return [
        ["main_pull", "main_push", "recovery_light"],
        ["rear_delt_scapula", "shoulder_accessory", "core"],
        ["carry", "rehab_control"],
      ];
    }

    if (params.slotLabel === "safe_glute_or_hinge_light") {
      return [
        ["recovery_light", "main_hinge", "main_squat", "unilateral_lower"],
        ["core", "carry", "rehab_control"],
      ];
    }

    return [
      ["core", "carry", "rehab_control"],
      ["rear_delt_scapula", "recovery_light"],
    ];
  }

  if (params.slotLabel === "main_pull") {
    return [
      ["main_pull"],
      ["rear_delt_scapula", "shoulder_accessory", "direct_biceps"],
      ["core", "carry", "recovery_light"],
    ];
  }

  if (params.slotLabel === "main_push") {
    return [
      ["main_push"],
      ["direct_triceps", "shoulder_accessory", "rear_delt_scapula"],
      ["core", "recovery_light"],
    ];
  }

  if (params.slotLabel === "main_lower" || params.slotLabel === "support_lower_or_core") {
    return [
      ["main_squat", "unilateral_lower", "main_hinge"],
      ["core", "carry", "recovery_light"],
    ];
  }

  return [
    ["main_hinge", "main_squat", "unilateral_lower"],
    ["core", "carry", "rear_delt_scapula", "recovery_light"],
  ];
}

function getFeasibleAllowedRoles(params: {
  slot: WorkoutSlot;
  coachContext: WorkoutCoachContext;
  availableExercises: ReturnType<typeof getAvailableExercises>;
}) {
  // Degraded/emergency contracts should stay focus-compatible, but must also
  // acknowledge when the selected equipment makes the original role impossible.
  if (
    hasFeasibleRoleMatch({
      availableExercises: params.availableExercises,
      roles: params.slot.allowedRoles,
    })
  ) {
    return params.slot.allowedRoles;
  }

  for (const roles of getFallbackRoleFamilies({
    focus: params.coachContext.selectedFocus,
    slotLabel: params.slot.label,
  })) {
    if (
      hasFeasibleRoleMatch({
        availableExercises: params.availableExercises,
        roles,
      })
    ) {
      return roles;
    }
  }

  return params.slot.allowedRoles;
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

  if (params.targetSlotCount >= 3 && params.targetSlotCount < 4) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "support_upper_short",
        role: "shoulder_accessory",
        allowedRoles: [
          "direct_biceps",
          "direct_triceps",
          "shoulder_accessory",
          "rear_delt_scapula",
          "core",
        ],
        required: true,
        priority: 84,
        minGoalSpecificity: 0,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: "maintenance",
        reason: "Korta överkroppspass behöver en tredje fokuskompatibel slot så passet inte blir för tunt.",
      }),
    );
  }

  if (params.targetSlotCount >= 4) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "secondary_push_or_pull",
        role: "main_pull",
        // Strength ska i första hand få en andra belastningsbar press- eller dragroll.
        allowedRoles: isStrength
          ? ["main_push", "main_pull"]
          : ["main_push", "main_pull", "rear_delt_scapula", "shoulder_accessory"],
        required: true,
        priority: 90,
        preferredMovementPatterns: ["horizontal_pull", "horizontal_push", "vertical_push"],
        minGoalSpecificity: isStrength ? 2 : 1,
        allowRecoveryLight: true,
        allowBodyweightFallback: !isStrength,
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

  if (params.targetSlotCount >= 3 && params.targetSlotCount < 4) {
    slots.push(
      createContractSlot({
        templateId: params.templateId,
        index: slots.length,
        label: "support_lower_short",
        role: "unilateral_lower",
        allowedRoles: ["unilateral_lower", "main_squat", "main_hinge", "core", "carry", "calves"],
        required: true,
        priority: 84,
        preferredMovementPatterns: ["lunge", "squat", "hinge", "core", "carry"],
        minGoalSpecificity: 0,
        allowRecoveryLight: true,
        allowBodyweightFallback: true,
        progressionHint: "maintenance",
        reason: "Korta underkroppspass behöver en tredje lower-kompatibel slot för att uppfylla minimum-kontraktet.",
      }),
    );
  }

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
        // Strength ska hålla kvar belastningsbara lower-varianter när hantlar finns.
        allowBodyweightFallback: !isStrength,
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
  planningDurationBucket: number;
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
        allowedRoles: isStrength
          ? ["main_hinge"]
          : ["main_hinge", "main_squat", "unilateral_lower"],
        // Full body strength behöver en tydlig hinge-roll även i kompakta 35-min-pass.
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
  mode?: SlotContractMode;
}): WorkoutSlotContract {
  const goalConfig = getTrainingGoalConfig(params.coachContext.goal);
  const contractMode = params.mode ?? "full";
  // Derive a stable bucket even if an older caller forgot to set it explicitly.
  const planningDurationBucket = getEffectivePlanningDurationBucket(
    params.coachContext,
  );
  const templateId = `${goalConfig.id}:${params.coachContext.selectedFocus}:${planningDurationBucket}:${contractMode}`;
  const targetSlotCount = clampSlotCount({
    durationMinutes: planningDurationBucket,
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
              planningDurationBucket,
              targetSlotCount,
            });

  const contract =
    contractMode === "full"
      ? ({
          templateId,
          goalConfigId: goalConfig.id,
          targetSlotCount,
          mode: contractMode,
          slots,
        } satisfies WorkoutSlotContract)
      : buildDegradedSlotContract({
          baseContract: {
            templateId,
            goalConfigId: goalConfig.id,
            targetSlotCount,
            mode: "full",
            slots,
          },
          coachContext: params.coachContext,
          mode: contractMode,
        });

  return contract;
}

export function buildWorkoutSlotPlan(params: {
  coachContext: WorkoutCoachContext;
  mode?: SlotContractMode;
}) {
  const contract = buildSlotContract(params);

  return {
    templateId: contract.templateId,
    targetSlotCount: contract.targetSlotCount,
    goalConfig: getTrainingGoalConfig(params.coachContext.goal),
    contractMode: contract.mode ?? params.mode ?? "full",
    slots: contract.slots,
  };
}

function buildDegradedSlotContract(params: {
  baseContract: WorkoutSlotContract;
  coachContext: WorkoutCoachContext;
  mode: Exclude<SlotContractMode, "full">;
}): WorkoutSlotContract {
  const { baseContract, coachContext, mode } = params;
  const availableExercises = getAvailableExercises(coachContext.selectedEquipment);
  const planningDurationBucket = getEffectivePlanningDurationBucket(coachContext);

  const cloneSlot = (
    slot: WorkoutSlot,
    overrides: Partial<WorkoutSlot> = {},
  ): WorkoutSlot => ({
    ...slot,
    ...overrides,
    minGoalSpecificity: overrides.minGoalSpecificity ?? 0,
    allowRecoveryLight: overrides.allowRecoveryLight ?? true,
    allowBodyweightFallback: overrides.allowBodyweightFallback ?? true,
  });

  const cloneRelaxedSlot = (
    slot: WorkoutSlot,
    overrides: Partial<WorkoutSlot> = {},
  ): WorkoutSlot => {
    const allowedRoles =
      overrides.allowedRoles ??
      getFeasibleAllowedRoles({
        slot: {
          ...slot,
          ...overrides,
          allowedRoles: overrides.allowedRoles ?? slot.allowedRoles,
        },
        coachContext,
        availableExercises,
      });

    return cloneSlot(slot, {
      ...overrides,
      allowedRoles,
      role: overrides.role ?? allowedRoles[0] ?? slot.role,
    });
  };

  const findSlot = (label: string) =>
    baseContract.slots.find((slot) => slot.label === label) ?? null;

  const degradedSlots: WorkoutSlot[] = [];

  // Degraded contracts keep the minimum slot structure, while dropping
  // optional protected roles that can make the full contract impossible.
  if (coachContext.selectedFocus === "full_body") {
    const lowerSlot = findSlot("main_lower");
    const pushSlot = findSlot("main_push");
    const pullSlot = findSlot("main_pull");
    const supportSlot = findSlot("secondary_lower") ?? findSlot("core_or_carry");
    const isCompactStrengthBucket =
      coachContext.goal === "strength" &&
      planningDurationBucket <= 35;

    if (lowerSlot) {
      degradedSlots.push(
        cloneRelaxedSlot(lowerSlot, {
          required: true,
          allowedRoles: ["main_squat", "unilateral_lower", "main_hinge"],
          preferredMovementPatterns: ["squat", "lunge", "hinge"],
        }),
      );
    }
    if (pushSlot) degradedSlots.push(cloneRelaxedSlot(pushSlot, { required: true }));
    if (pullSlot) degradedSlots.push(cloneRelaxedSlot(pullSlot, { required: true }));
    if (supportSlot) {
      degradedSlots.push(
        cloneRelaxedSlot(supportSlot, {
          label: "support_lower_or_core",
          role: "main_hinge",
          allowedRoles: ["main_hinge", "core", "carry", "rear_delt_scapula"],
          // Compact strength-pass ska kunna nöja sig med fyra huvudroller utan extra fatal secondary lower-slot.
          required: !isCompactStrengthBucket,
          preferredMovementPatterns: ["hinge", "core", "carry"],
        }),
      );
    }
  } else if (coachContext.selectedFocus === "lower_body") {
    const lowerSlot = findSlot("main_squat_or_unilateral");
    const hingeSlot = findSlot("main_hinge");
    const supportSlot = findSlot("secondary_lower") ?? findSlot("support_lower_short");
    const optionalSlot = findSlot("core_or_carry") ?? findSlot("calves_or_posterior_chain");

    if (lowerSlot) degradedSlots.push(cloneRelaxedSlot(lowerSlot, { required: true }));
    if (hingeSlot) degradedSlots.push(cloneRelaxedSlot(hingeSlot, { required: true }));
    if (supportSlot) {
      degradedSlots.push(
        cloneRelaxedSlot(supportSlot, {
          required: true,
          allowedRoles: ["unilateral_lower", "main_squat", "main_hinge", "recovery_light"],
        }),
      );
    }
    if (optionalSlot && mode === "emergency") {
      degradedSlots.push(
        cloneRelaxedSlot(optionalSlot, {
          required: false,
          allowedRoles: ["core", "carry", "calves", "main_hinge", "recovery_light"],
        }),
      );
    }
  } else if (coachContext.selectedFocus === "upper_body") {
    const pushSlot = findSlot("main_push");
    const pullSlot = findSlot("main_pull");
    const supportSlot =
      findSlot("secondary_push_or_pull") ??
      findSlot("arm_or_shoulder") ??
      findSlot("support_upper_short");

    if (pushSlot) degradedSlots.push(cloneRelaxedSlot(pushSlot, { required: true }));
    if (pullSlot) degradedSlots.push(cloneRelaxedSlot(pullSlot, { required: true }));
    if (supportSlot) {
      degradedSlots.push(
        cloneRelaxedSlot(supportSlot, {
          label: "support_upper",
          role: "direct_triceps",
          allowedRoles: [
            "direct_biceps",
            "direct_triceps",
            "shoulder_accessory",
            "rear_delt_scapula",
            "core",
          ],
          required: true,
        }),
      );
    }
  } else {
    const safeUpper = findSlot("safe_pull_or_push");
    const safeLower = findSlot("safe_glute_or_hinge_light");
    const safeSupport = findSlot("core_or_carry_or_control");

    if (safeUpper) degradedSlots.push(cloneRelaxedSlot(safeUpper, { required: true }));
    if (safeLower) degradedSlots.push(cloneRelaxedSlot(safeLower, { required: true }));
    if (safeSupport) {
      degradedSlots.push(
        cloneRelaxedSlot(safeSupport, {
          required: mode !== "emergency",
          allowedRoles: ["core", "carry", "rehab_control", "rear_delt_scapula"],
        }),
      );
    }
  }

  const finalSlots =
    degradedSlots.length > 0
      ? degradedSlots
      : baseContract.slots.map((slot) =>
          cloneSlot(slot, {
            required: slot.required,
          }),
        );

  // Minimum contract still needs enough slots to build a meaningful short session.
  if (planningDurationBucket >= 15 && finalSlots.length < 3) {
    for (const slot of baseContract.slots) {
      if (finalSlots.some((existing) => existing.label === slot.label)) {
        continue;
      }

      finalSlots.push(
        cloneSlot(slot, {
          required: true,
        }),
      );

      if (finalSlots.length >= 3) {
        break;
      }
    }
  }

  return {
    templateId: baseContract.templateId,
    goalConfigId: baseContract.goalConfigId,
    targetSlotCount: finalSlots.length,
    mode,
    slots: finalSlots,
  };
}
