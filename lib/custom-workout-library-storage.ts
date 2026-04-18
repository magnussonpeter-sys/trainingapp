import type { WorkoutBlock } from "@/types/workout";

// Sparade egna pass hålls separat från builder-utkastet.
// Då kan användaren både ha ett pågående utkast och en liten passbank lokalt.

const CUSTOM_WORKOUT_LIBRARY_KEY_PREFIX = "custom_workout_library:";

export type SavedCustomWorkout = {
  id: string;
  name: string;
  targetDurationMinutes: number | null;
  gymId: string;
  gymName: string | null;
  blocks: WorkoutBlock[];
  createdAt: string;
  updatedAt: string;
};

function getKey(userId: string) {
  return `${CUSTOM_WORKOUT_LIBRARY_KEY_PREFIX}${userId}`;
}

export function getSavedCustomWorkouts(userId: string) {
  try {
    const raw = localStorage.getItem(getKey(userId));
    if (!raw) {
      return [] as SavedCustomWorkout[];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as SavedCustomWorkout[];
    }

    return parsed
      .filter((item): item is SavedCustomWorkout => {
        return (
          !!item &&
          typeof item === "object" &&
          typeof (item as SavedCustomWorkout).id === "string" &&
          typeof (item as SavedCustomWorkout).name === "string" &&
          typeof (item as SavedCustomWorkout).gymId === "string" &&
          Array.isArray((item as SavedCustomWorkout).blocks)
        );
      })
      .sort((a, b) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  } catch (error) {
    console.error("Failed to load saved custom workouts", error);
    return [] as SavedCustomWorkout[];
  }
}

export function saveSavedCustomWorkouts(userId: string, workouts: SavedCustomWorkout[]) {
  try {
    localStorage.setItem(getKey(userId), JSON.stringify(workouts));
  } catch (error) {
    console.error("Failed to save custom workout library", error);
  }
}

export function upsertSavedCustomWorkout(userId: string, workout: SavedCustomWorkout) {
  const current = getSavedCustomWorkouts(userId);
  const next = [
    workout,
    ...current.filter((item) => item.id !== workout.id),
  ].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  saveSavedCustomWorkouts(userId, next);
  return next;
}

export function removeSavedCustomWorkout(userId: string, workoutId: string) {
  const next = getSavedCustomWorkouts(userId).filter((item) => item.id !== workoutId);
  saveSavedCustomWorkouts(userId, next);
  return next;
}
