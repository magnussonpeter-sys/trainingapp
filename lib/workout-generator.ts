// lib/workout-generator.ts
import type { Workout, WorkoutFocus } from "@/types/workout";
import type {
  ConfidenceScore,
  MuscleBudgetEntry,
  MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import type { TrainingGap } from "@/lib/planning/training-gap";
import type { PlannedTrainingMode } from "@/lib/weekly-workout-structure";
import type { WeeklyPlanContext } from "@/lib/planning/weekly-plan";

export async function generateWorkout(params: {
  userId: string;
  goal: string;
  durationMinutes: number;
  equipment: string[];
  gym?: string | null;
  gymLabel?: string | null;
  gymEquipmentDetails?: Array<{
    equipment_type?: string | null;
    equipmentType?: string | null;
    label?: string | null;
    weights_kg?: number[] | null;
    quantity?: number | null;
  }>;
  confidenceScore?: ConfidenceScore | null;
  nextFocus?: WorkoutFocus | null;
  splitStyle?: string | null;
  weeklyBudget?: Array<
    Pick<
      MuscleBudgetEntry,
      | "group"
      | "label"
      | "priority"
      | "targetSets"
      | "completedSets"
      | "effectiveSets"
      | "remainingSets"
      | "recent4WeekAvgSets"
      | "loadStatus"
    >
  >;
  weeklyPlan?: Array<{
    date: string;
    dayLabel: string;
    focus: WorkoutFocus | null;
    type: "training" | "recovery";
  }>;
  selectedPlanMode?: PlannedTrainingMode | null;
  focusIntent?: string | null;
  targetMuscles?: MuscleBudgetGroup[];
  avoidMuscles?: MuscleBudgetGroup[];
  limitedMuscles?: MuscleBudgetGroup[];
  focusMuscles?: MuscleBudgetGroup[];
  weeklyPlanContext?: WeeklyPlanContext | null;
  trainingGap?: TrainingGap | null;
  lessOftenExerciseIds?: string[];
  avoidSupersets?: boolean | null;
  supersetPreference?: "allowed" | "avoid_all" | "avoid_all_dumbbell" | null;
}) {
  const res = await fetch("/api/workouts/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data?.error || "Failed to generate workout");
  }

  return {
    // Typa workout så att resten av appen får rätt fält direkt.
    workout: data.workout as Workout,
  };
}
