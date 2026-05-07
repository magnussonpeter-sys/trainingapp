import { getExerciseById } from "@/lib/exercise-catalog";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import {
  formatWeekdayLabel,
  type PlannedSession,
  type WeeklyPlanState,
} from "@/lib/planning/weekly-plan";
import type { SyntheticExercisePlan } from "@/lib/simulation/simulate-exercise";
import type { SimulationScenario, SimulationUserProfile } from "@/lib/simulation/types";
import type {
  UserSettingsSummary,
  WeeklyBudgetPromptItem,
  WeeklyPlanPromptItem,
} from "@/lib/workouts/generate-workout-core";
import type { Workout, WorkoutBlock } from "@/types/workout";

const MUSCLE_LABELS: Record<MuscleBudgetGroup, string> = {
  chest: "Bröst",
  back: "Rygg",
  quads: "Framlår",
  hamstrings: "Baksida lår",
  glutes: "Säte",
  shoulders: "Axlar",
  biceps: "Biceps",
  triceps: "Triceps",
  calves: "Vader",
  core: "Bål",
};

function getBlockExercises(blocks: WorkoutBlock[]) {
  return blocks.flatMap((block) => block.exercises);
}

function inferSimulationCategory(exerciseId: string): SyntheticExercisePlan["category"] {
  const catalogExercise = getExerciseById(exerciseId);
  const pattern = catalogExercise?.movementPattern;

  if (pattern === "core" || pattern === "carry") {
    return "core";
  }

  if (pattern === "lunge") {
    return "conditioning";
  }

  if (
    pattern === "squat" ||
    pattern === "hinge" ||
    pattern === "horizontal_push" ||
    pattern === "horizontal_pull" ||
    pattern === "vertical_push" ||
    pattern === "vertical_pull"
  ) {
    return "compound";
  }

  return "accessory";
}

function inferSimulationDifficulty(exerciseId: string) {
  const catalogExercise = getExerciseById(exerciseId);
  const riskBase =
    catalogExercise?.riskLevel === "high"
      ? 82
      : catalogExercise?.riskLevel === "medium"
        ? 68
        : 54;
  const pattern = catalogExercise?.movementPattern;

  if (
    pattern === "squat" ||
    pattern === "hinge" ||
    pattern === "horizontal_push" ||
    pattern === "horizontal_pull" ||
    pattern === "vertical_push" ||
    pattern === "vertical_pull"
  ) {
    return riskBase + 6;
  }

  return riskBase;
}

function inferBaseLoadScore(exerciseId: string) {
  const category = inferSimulationCategory(exerciseId);

  if (category === "compound") {
    return 16;
  }

  if (category === "conditioning") {
    return 12;
  }

  if (category === "core") {
    return 8;
  }

  return 10;
}

export function buildSimulationSettingsSummary(params: {
  profile: SimulationUserProfile;
  scenario: SimulationScenario;
  baseSettings?: UserSettingsSummary | null;
}) {
  const priorityMuscles =
    params.scenario === "priority_upper_body"
      ? (["chest", "triceps", "biceps"] satisfies MuscleBudgetGroup[])
      : [];

  return {
    ...(params.baseSettings ?? {
      sex: params.profile.sex,
      age: params.profile.age,
      weight_kg: params.profile.weightKg,
      height_cm: params.profile.heightCm,
      experience_level: params.profile.experienceLevel,
      training_goal: params.profile.goal,
      sport_focus: "none",
      avoid_supersets: false,
      superset_preference: "allowed",
    }),
    primary_priority_muscle: priorityMuscles[0] ?? null,
    secondary_priority_muscle: priorityMuscles[1] ?? null,
    tertiary_priority_muscle: priorityMuscles[2] ?? null,
  } satisfies UserSettingsSummary;
}

export function buildWeeklyPlanPromptItems(plannedSessions: PlannedSession[]) {
  return plannedSessions.map(
    (session) =>
      ({
        date: session.plannedDate,
        dayLabel: formatWeekdayLabel(session.weekday),
        focus:
          session.focus === "upper" ||
          session.focus === "push" ||
          session.focus === "pull"
            ? "upper_body"
            : session.focus === "lower"
              ? "lower_body"
              : session.focus === "core" || session.focus === "mobility"
                ? "core"
                : "full_body",
        type: session.focus === "mobility" ? "recovery" : "training",
      }) satisfies WeeklyPlanPromptItem,
  );
}

export function buildWeeklyBudgetPromptItems(planState: WeeklyPlanState) {
  return (Object.entries(
    planState.remainingTrainingNeed.muscleSetDeficits,
  ) as Array<[MuscleBudgetGroup, number]>).map(
    ([group, remainingSets]) =>
      ({
        group,
        label: MUSCLE_LABELS[group],
        priority: planState.profilePriorityMuscles.includes(group) ? "high" : "medium",
        targetSets: Math.max(remainingSets, 0),
        completedSets: 0,
        effectiveSets: 0,
        remainingSets,
        recent4WeekAvgSets: 0,
        loadStatus: planState.remainingTrainingNeed.recoveryLimitedMuscles.includes(group)
          ? "high_risk"
          : "on_target",
      }) satisfies WeeklyBudgetPromptItem,
  );
}

export function adaptNormalizedWorkoutToSimulationPlan(workout: Workout) {
  return getBlockExercises(workout.blocks).map(
    (exercise) =>
      ({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        variantGroup: getExerciseById(exercise.id)?.variantGroup,
        difficulty: inferSimulationDifficulty(exercise.id),
        plannedSets: Math.max(1, exercise.sets),
        plannedReps:
          typeof exercise.reps === "number" && exercise.reps > 0 ? exercise.reps : undefined,
        plannedDurationSec:
          typeof exercise.duration === "number" && exercise.duration > 0
            ? exercise.duration
            : undefined,
        plannedWeightKg:
          typeof exercise.suggestedWeight === "number"
            ? exercise.suggestedWeight
            : undefined,
        baseLoadScore: inferBaseLoadScore(exercise.id),
        category: inferSimulationCategory(exercise.id),
      }) satisfies SyntheticExercisePlan,
  );
}

export function buildPlannerDebugExercisesFromWorkout(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as {
    blocks?: Array<{ exercises?: Array<{ id?: string; name?: string }> }>;
    exercises?: Array<{ id?: string; name?: string }>;
  };
  const exercises =
    record.blocks?.flatMap((block) => block.exercises ?? []) ??
    record.exercises ??
    [];

  return exercises.map((exercise) => {
    const variantGroup = typeof exercise.id === "string" ? getExerciseById(exercise.id)?.variantGroup : undefined;
    return {
      exerciseId: typeof exercise.id === "string" ? exercise.id : exercise.name ?? "unknown",
      exerciseName: exercise.name ?? "Okänd övning",
      variantGroup: variantGroup ?? undefined,
      aggregationKey: variantGroup ?? (exercise.name ?? "unknown").toLowerCase(),
    };
  });
}

export function buildPromptContextSummary(params: {
  suggestedFocus: string;
  suggestedDurationMinutes: number;
  priorityMuscles: string[];
  recoveryLimitedMuscles: string[];
  typicalWorkoutDurationMinutes: number | null;
}) {
  return `Fokus ${params.suggestedFocus}, cirka ${params.suggestedDurationMinutes} min, prioritet ${params.priorityMuscles.join(", ") || "inga"}, begränsa ${params.recoveryLimitedMuscles.join(", ") || "inga"}${typeof params.typicalWorkoutDurationMinutes === "number" ? `, typisk längd ${params.typicalWorkoutDurationMinutes} min` : ""}.`;
}

export function getScenarioSpontaneousFocus() {
  return undefined;
}
