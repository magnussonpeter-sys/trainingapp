import type { ExerciseFeedbackEntry } from "../types/exercise-feedback";

const EXERCISE_FEEDBACK_KEY = "exercise_feedback";

function getStorageKey(userId: string) {
  return `${EXERCISE_FEEDBACK_KEY}:${userId}`;
}

export function getExerciseFeedback(userId: string): ExerciseFeedbackEntry[] {
  if (typeof window === "undefined") return [];

  const raw = localStorage.getItem(getStorageKey(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as ExerciseFeedbackEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveExerciseFeedbackEntry(
  userId: string,
  entry: ExerciseFeedbackEntry
) {
  if (typeof window === "undefined") return;

  const current = getExerciseFeedback(userId);
  const next = [...current, entry];

  localStorage.setItem(getStorageKey(userId), JSON.stringify(next));
}

export function hasExerciseBeenRated(
  userId: string,
  exerciseId: string
): boolean {
  const feedback = getExerciseFeedback(userId);

  return feedback.some(
    (item) => item.exerciseId === exerciseId && typeof item.rating === "number"
  );
}