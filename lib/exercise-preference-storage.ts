import type { CompletedExercise } from "@/lib/workout-log-storage";

export type ExercisePreferenceEntry = {
  exerciseId: string;
  exerciseName: string;
  preference: "less_often";
  updatedAt: string;
};

const EXERCISE_PREFERENCE_KEY = "exercise_preferences";

function getStorageKey(userId: string) {
  return `${EXERCISE_PREFERENCE_KEY}:${userId}`;
}

export function getExercisePreferences(userId: string): ExercisePreferenceEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(getStorageKey(userId));

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as ExercisePreferenceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setLessOftenPreference(params: {
  enabled: boolean;
  exercise: Pick<CompletedExercise, "exerciseId" | "exerciseName">;
  userId: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const current = getExercisePreferences(params.userId).filter(
    (entry) =>
      !(
        entry.exerciseId === params.exercise.exerciseId &&
        entry.preference === "less_often"
      ),
  );

  const next = params.enabled
    ? [
        {
          exerciseId: params.exercise.exerciseId,
          exerciseName: params.exercise.exerciseName,
          preference: "less_often" as const,
          updatedAt: new Date().toISOString(),
        },
        ...current,
      ]
    : current;

  localStorage.setItem(getStorageKey(params.userId), JSON.stringify(next));
}
