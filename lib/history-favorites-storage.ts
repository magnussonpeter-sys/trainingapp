// Lokal favoritlagring för historiska pass.
// Håller funktionen enkel och per användare tills vi vill synka till databasen.

const HISTORY_FAVORITES_KEY_PREFIX = "history_favorites:";

function getKey(userId: string) {
  return `${HISTORY_FAVORITES_KEY_PREFIX}${userId}`;
}

export function getFavoriteWorkoutIds(userId: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(getKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(
        parsed.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        ),
      ),
    );
  } catch {
    return [];
  }
}

export function saveFavoriteWorkoutIds(userId: string, workoutIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(getKey(userId), JSON.stringify(Array.from(new Set(workoutIds))));
  } catch (error) {
    console.error("Failed to save history favorites", error);
  }
}

export function clearFavoriteWorkoutIds(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(getKey(userId));
  } catch (error) {
    console.error("Failed to clear history favorites", error);
  }
}

export function setWorkoutFavorite(userId: string, workoutId: string, isFavorite: boolean) {
  const current = new Set(getFavoriteWorkoutIds(userId));

  if (isFavorite) {
    current.add(workoutId);
  } else {
    current.delete(workoutId);
  }

  saveFavoriteWorkoutIds(userId, Array.from(current));
}

export function toggleWorkoutFavorite(userId: string, workoutId: string) {
  const current = new Set(getFavoriteWorkoutIds(userId));
  const nextValue = !current.has(workoutId);

  if (nextValue) {
    current.add(workoutId);
  } else {
    current.delete(workoutId);
  }

  saveFavoriteWorkoutIds(userId, Array.from(current));
  return nextValue;
}

export function removeWorkoutFavorite(userId: string, workoutId: string) {
  setWorkoutFavorite(userId, workoutId, false);
}
