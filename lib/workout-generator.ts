// lib/workout-generator.ts
import type { Workout, WorkoutFocus } from "@/types/workout";
import type {
  ConfidenceScore,
  MuscleBudgetEntry,
} from "@/lib/planning/muscle-budget";

export type GenerateWorkoutDebug = {
  request?: unknown;
  generationContext?: unknown;
  prompt?: string;
  rawAiText?: string;
  parsedAiResponse?: unknown;
  validatedWorkout?: unknown;
  normalizedWorkout?: unknown;
};

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
    >
  >;
  weeklyPlan?: Array<{
    date: string;
    dayLabel: string;
    focus: WorkoutFocus | null;
    type: "training" | "recovery";
  }>;
  lessOftenExerciseIds?: string[];
  avoidSupersets?: boolean | null;
}) {
  const res = await fetch("/api/workouts/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...params,
      includeDebug: true,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data?.error || "Failed to generate workout");
  }

  return {
    // Typa workout så att resten av appen får rätt fält direkt.
    workout: data.workout as Workout,
    debug: (data.debug ?? null) as GenerateWorkoutDebug | null,
  };
}
