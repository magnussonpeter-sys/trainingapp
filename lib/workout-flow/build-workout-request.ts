// Bygger request till workout-generatorn från home-valen.

export type WorkoutGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

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

  // Kroppsviktsläge ska alltid fungera direkt.
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