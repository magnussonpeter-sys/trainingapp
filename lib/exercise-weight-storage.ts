const EXERCISE_LAST_WEIGHT_KEY = "exercise_last_weight";

function getStorageKey(userId: string) {
  return `${EXERCISE_LAST_WEIGHT_KEY}:${userId}`;
}

export function getLastWeightByExercise(
  userId: string
): Record<string, string> {
  if (typeof window === "undefined") return {};

  const raw = localStorage.getItem(getStorageKey(userId));
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getLastWeightForExercise(
  userId: string,
  exerciseId: string
): string {
  const allWeights = getLastWeightByExercise(userId);
  return allWeights[exerciseId] || "";
}

export function saveLastWeightForExercise(
  userId: string,
  exerciseId: string,
  weight: string
) {
  if (typeof window === "undefined") return;

  const trimmedWeight = weight.trim();
  if (!exerciseId || !trimmedWeight) return;

  const current = getLastWeightByExercise(userId);

  const next = {
    ...current,
    [exerciseId]: trimmedWeight,
  };

  localStorage.setItem(getStorageKey(userId), JSON.stringify(next));
}