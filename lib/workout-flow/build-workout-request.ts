import type { Workout } from "@/types/workout";

// Målkategorier som home använder just nu.
export type WorkoutGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

// Enkel gymtyp för request-byggaren.
export type WorkoutFlowGym = {
  id: string | number;
  name: string;
  equipment: string[];
};

type BuildWorkoutRequestParams = {
  userId: string;
  goal?: WorkoutGoal | null;
  durationMinutes: number;
  selectedGymId: string;
  selectedGymName?: string | null;
  bodyweightGymId: string;
  bodyweightLabel: string;
  gymDetail?: WorkoutFlowGym | null;
};

export type BuiltWorkoutRequest = {
  userId: string;
  goal: WorkoutGoal;
  durationMinutes: number;
  equipment: string[];
  gymLabel: string;
};

// Bygger ett stabilt request-objekt från home-valen.
export function buildWorkoutRequest({
  userId,
  goal,
  durationMinutes,
  selectedGymId,
  selectedGymName,
  bodyweightGymId,
  bodyweightLabel,
  gymDetail,
}: BuildWorkoutRequestParams): BuiltWorkoutRequest {
  const safeGoal: WorkoutGoal = goal ?? "strength";

  // Kroppsviktsläge ska alltid fungera utan extra data.
  if (selectedGymId === bodyweightGymId) {
    return {
      userId,
      goal: safeGoal,
      durationMinutes,
      equipment: ["bodyweight"],
      gymLabel: bodyweightLabel,
    };
  }

  const equipment =
    gymDetail && gymDetail.equipment.length > 0
      ? gymDetail.equipment
      : ["bodyweight"];

  const gymLabel =
    gymDetail?.name?.trim() || selectedGymName?.trim() || bodyweightLabel;

  return {
    userId,
    goal: safeGoal,
    durationMinutes,
    equipment,
    gymLabel,
  };
}

// Hjälper vid typer när workout-generatorn svarar.
export type GeneratedWorkoutResult = {
  workout: Workout;
};