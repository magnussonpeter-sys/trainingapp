import { saveActiveWorkout, saveGeneratedWorkout } from "@/lib/workout-storage";
import type { Workout } from "@/types/workout";

type SaveWorkoutDraftParams = {
  userId: string;
  workout: Workout;
};

// Samlar draft-lagring på ett ställe.
export function saveWorkoutDraft({
  userId,
  workout,
}: SaveWorkoutDraftParams): void {
  // Preview använder generated_workout.
  saveGeneratedWorkout(userId, workout);

  // Run använder active_workout.
  saveActiveWorkout(userId, workout);
}