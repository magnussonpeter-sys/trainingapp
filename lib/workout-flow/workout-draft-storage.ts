import { saveActiveWorkout, saveGeneratedWorkout } from "@/lib/workout-storage";
import type { Workout } from "@/types/workout";

type SaveWorkoutDraftParams = {
  userId: string;
  workout: Workout;
};

// Samlar lagring av draft/preview på ett ställe.
export function saveWorkoutDraft({
  userId,
  workout,
}: SaveWorkoutDraftParams): void {
  // Preview-versionen används av preview-flödet.
  saveGeneratedWorkout(userId, workout);

  // Active-versionen används av run-flödet.
  saveActiveWorkout(userId, workout);
}