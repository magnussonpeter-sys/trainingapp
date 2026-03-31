// Sparar senast använd vilotid per användare och övning.
const STORAGE_KEY = "exercise_last_rest_seconds";

function getStorageKey(userId: string) {
  return `${STORAGE_KEY}:${userId}`;
}

type RestByExercise = Record<string, number>;

export function getLastRestForExercise(
  userId: string,
  exerciseId: string
): number | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as RestByExercise;
    const value = parsed[exerciseId];

    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return null;
    }

    return Math.round(value);
  } catch {
    return null;
  }
}

export function saveLastRestForExercise(
  userId: string,
  exerciseId: string,
  restSeconds: number
) {
  if (typeof window === "undefined") return;

  const safeRest = Math.max(0, Math.round(restSeconds));

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    const current = raw ? (JSON.parse(raw) as RestByExercise) : {};

    const updated: RestByExercise = {
      ...current,
      [exerciseId]: safeRest,
    };

    localStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
  } catch {
    // Ignorera lokala lagringsfel.
  }
}