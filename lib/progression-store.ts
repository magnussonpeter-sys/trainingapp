// lib/progression-store.ts
// Sparar enkel progression per övning per användare
// Sprint 1 version – enkel men kraftfull

type ExerciseProgression = {
  lastWeight: number | null;
  lastReps: number | null;
  lastExtraReps: number | null; // 0,2,4,6
  lastTimedEffort: "easy" | "moderate" | "hard" | null;
  updatedAt: string;
};

function getKey(userId: string) {
  return `exercise_progression:${userId}`;
}

function loadAll(userId: string): Record<string, ExerciseProgression> {
  try {
    const raw = localStorage.getItem(getKey(userId));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAll(userId: string, data: Record<string, ExerciseProgression>) {
  localStorage.setItem(getKey(userId), JSON.stringify(data));
}

// =========================
// PUBLIC API
// =========================

export function saveExerciseProgression(
  userId: string,
  exerciseId: string,
  data: Partial<ExerciseProgression>,
) {
  const all = loadAll(userId);

  all[exerciseId] = {
    lastWeight: data.lastWeight ?? all[exerciseId]?.lastWeight ?? null,
    lastReps: data.lastReps ?? all[exerciseId]?.lastReps ?? null,
    lastExtraReps: data.lastExtraReps ?? null,
    lastTimedEffort: data.lastTimedEffort ?? null,
    updatedAt: new Date().toISOString(),
  };

  saveAll(userId, all);
}

export function getExerciseProgression(
  userId: string,
  exerciseId: string,
): ExerciseProgression | null {
  const all = loadAll(userId);
  return all[exerciseId] ?? null;
}