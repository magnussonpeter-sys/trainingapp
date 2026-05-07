// app/api/workouts/generate/route.ts

import { NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { normalizeEquipmentIdList } from "@/lib/equipment";
import { getWorkoutLogsByUser } from "@/lib/workout-log-repository";
import { getCurrentUser } from "@/lib/server-auth";
import type {
  ConfidenceScore,
  MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import type {
  FocusMuscle,
  GymEquipmentPromptItem,
  PlanModePromptItem,
  SupersetPreference,
  TrainingGapPromptItem,
  UserSettingsSummary,
  WeeklyBudgetPromptItem,
  WeeklyPlanContextPromptItem,
  WeeklyPlanPromptItem,
} from "@/lib/workouts/generate-workout-core";
import {
  generateWorkoutWithAiCore,
  normalizeFocusMuscles,
  normalizeSupersetPreference,
} from "@/lib/workouts/generate-workout-core";
import type { WorkoutFocus } from "@/types/workout";

function normalizeEquipmentList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return ["bodyweight"];
  }

  return normalizeEquipmentIdList(
    input.filter((item): item is string => typeof item === "string"),
    { includeBodyweightFallback: true },
  );
}

async function getUserSettingsSummary(userId: string) {
  const result = await pool.query<UserSettingsSummary>(
    `
      select
        sex,
        age,
        weight_kg,
        height_cm,
        experience_level,
        training_goal,
        sport_focus,
        avoid_supersets,
        superset_preference,
        primary_priority_muscle,
        secondary_priority_muscle,
        tertiary_priority_muscle
      from user_settings
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      goal?: string;
      durationMinutes?: number;
      equipment?: string[];
      gymEquipmentDetails?: GymEquipmentPromptItem[];
      gym?: string | null;
      gymLabel?: string | null;
      confidenceScore?: ConfidenceScore | null;
      nextFocus?: WorkoutFocus | null;
      splitStyle?: string | null;
      weeklyBudget?: WeeklyBudgetPromptItem[];
      weeklyPlan?: WeeklyPlanPromptItem[];
      selectedPlanMode?: PlanModePromptItem | null;
      focusIntent?: string | null;
      targetMuscles?: MuscleBudgetGroup[];
      avoidMuscles?: MuscleBudgetGroup[];
      limitedMuscles?: MuscleBudgetGroup[];
      weeklyPlanContext?: WeeklyPlanContextPromptItem | null;
      trainingGap?: TrainingGapPromptItem | null;
      lessOftenExerciseIds?: string[];
      focusMuscles?: FocusMuscle[];
      avoidSupersets?: boolean;
      supersetPreference?: SupersetPreference | null;
    };

    const goal =
      typeof body.goal === "string" && body.goal.trim()
        ? body.goal.trim()
        : "allmän styrka";
    const requestedUserId =
      typeof body.userId === "string" && body.userId.trim()
        ? body.userId.trim()
        : null;
    const currentUser = await getCurrentUser();

    if (requestedUserId && currentUser && requestedUserId !== currentUser.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ingen behörighet",
        },
        { status: 403 },
      );
    }

    const userId = currentUser?.id ?? requestedUserId;
    const durationMinutes =
      typeof body.durationMinutes === "number" &&
      Number.isFinite(body.durationMinutes)
        ? body.durationMinutes
        : 45;
    const equipment = normalizeEquipmentList(body.equipment);
    const gymEquipmentDetails = Array.isArray(body.gymEquipmentDetails)
      ? body.gymEquipmentDetails
      : [];
    const gym =
      typeof body.gym === "string" && body.gym.trim() ? body.gym.trim() : null;
    const gymLabel =
      typeof body.gymLabel === "string" && body.gymLabel.trim()
        ? body.gymLabel.trim()
        : null;
    const nextFocus =
      body.nextFocus === "upper_body" ||
      body.nextFocus === "lower_body" ||
      body.nextFocus === "core" ||
      body.nextFocus === "full_body"
        ? body.nextFocus
        : null;
    const requestedAvoidSupersets = body.avoidSupersets === true;
    const requestedSupersetPreference = normalizeSupersetPreference(
      body.supersetPreference,
    );
    const confidenceScore =
      body.confidenceScore === "high" ||
      body.confidenceScore === "medium" ||
      body.confidenceScore === "low"
        ? body.confidenceScore
        : null;
    const splitStyle =
      typeof body.splitStyle === "string" && body.splitStyle.trim()
        ? body.splitStyle.trim()
        : null;
    const weeklyBudget = Array.isArray(body.weeklyBudget) ? body.weeklyBudget : [];
    const weeklyPlan = Array.isArray(body.weeklyPlan) ? body.weeklyPlan : [];
    const trainingGap =
      body.trainingGap && typeof body.trainingGap === "object" ? body.trainingGap : null;
    const weeklyPlanContext =
      body.weeklyPlanContext && typeof body.weeklyPlanContext === "object"
        ? (body.weeklyPlanContext as WeeklyPlanContextPromptItem)
        : null;
    const lessOftenExerciseIds = Array.isArray(body.lessOftenExerciseIds)
      ? body.lessOftenExerciseIds.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];
    const focusMuscles = normalizeFocusMuscles(body.focusMuscles);
    const selectedPlanMode =
      body.selectedPlanMode === "normal_training" ||
      body.selectedPlanMode === "recovery" ||
      body.selectedPlanMode === "recovery_mobility" ||
      body.selectedPlanMode === "light_accessory" ||
      body.selectedPlanMode === "selective_priority_accessory"
        ? body.selectedPlanMode
        : null;
    const targetMuscles = normalizeFocusMuscles(body.targetMuscles);
    const avoidMuscles = normalizeFocusMuscles(body.avoidMuscles);
    const limitedMuscles = normalizeFocusMuscles(body.limitedMuscles);
    const focusIntent =
      typeof body.focusIntent === "string" && body.focusIntent.trim()
        ? body.focusIntent.trim()
        : null;

    const [settings, historyLogs] = userId
      ? await Promise.all([
          getUserSettingsSummary(userId),
          getWorkoutLogsByUser(userId, 80),
        ])
      : [null, []];

    const result = await generateWorkoutWithAiCore({
      goal,
      durationMinutes,
      equipment,
      gymEquipmentDetails,
      gym,
      gymLabel,
      confidenceScore,
      nextFocus,
      splitStyle,
      weeklyBudget,
      weeklyPlan,
      selectedPlanMode,
      focusIntent,
      targetMuscles,
      avoidMuscles,
      limitedMuscles,
      weeklyPlanContext,
      trainingGap,
      lessOftenExerciseIds,
      focusMuscles,
      avoidSupersets: requestedAvoidSupersets,
      supersetPreference: requestedSupersetPreference,
      settings,
      historyLogs,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
        },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      workout: result.workout,
    });
  } catch (error) {
    console.error("Workout generate error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Kunde inte generera pass",
      },
      { status: 500 },
    );
  }
}
