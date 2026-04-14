// lib/workout-log-storage.ts

import type { Exercise, Workout } from "../types/workout";
import type { TimedEffortOption } from "../types/exercise-feedback";

export type ExtraRepsOption = 0 | 2 | 4 | 6;

export type CompletedSet = {
  setNumber: number;
  plannedReps: number | null;
  plannedDuration: number | null;
  plannedWeight: number | null;
  actualReps: number | null;
  actualDuration: number | null;
  actualWeight: number | null;

  // För vanliga övningar.
  repsLeft: ExtraRepsOption | null;

  // För tidsstyrda övningar.
  timedEffort: TimedEffortOption | null;

  completedAt: string;
};

export type CompletedExercise = {
  exerciseId: string;
  exerciseName: string;
  plannedSets: number;
  plannedReps: number | null;
  plannedDuration: number | null;
  isNewExercise: boolean;
  rating: number | null;

  // För vanliga övningar.
  extraReps: ExtraRepsOption | null;

  // För tidsstyrda övningar.
  timedEffort: TimedEffortOption | null;

  sets: CompletedSet[];
};

export type WorkoutLog = {
  id: string;
  userId: string;

  // Workout-id kan saknas för vissa pass, därför tillåter vi null.
  workoutId: string | null;

  workoutName: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  status: "completed" | "aborted";
  exercises: CompletedExercise[];
};

const STORAGE_KEY = "workout_logs";

function getWorkoutLogsStorageKey(userId: string) {
  return `${STORAGE_KEY}:${userId}`;
}

export function getWorkoutLogs(userId: string): WorkoutLog[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(getWorkoutLogsStorageKey(userId));
    if (!raw) return [];
    return JSON.parse(raw) as WorkoutLog[];
  } catch {
    return [];
  }
}

export function saveWorkoutLog(log: WorkoutLog) {
  if (typeof window === "undefined") return;

  const current = getWorkoutLogs(log.userId);
  const updated = [log, ...current];

  localStorage.setItem(
    getWorkoutLogsStorageKey(log.userId),
    JSON.stringify(updated)
  );
}

export function replaceWorkoutLogs(userId: string, logs: WorkoutLog[]) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    getWorkoutLogsStorageKey(userId),
    JSON.stringify(logs)
  );
}

export function removeWorkoutLog(
  userId: string,
  matcher:
    | string
    | ((log: WorkoutLog) => boolean)
) {
  if (typeof window === "undefined") return [];

  const current = getWorkoutLogs(userId);
  const updated = current.filter((log) => {
    if (typeof matcher === "string") {
      return log.id !== matcher;
    }

    return !matcher(log);
  });

  replaceWorkoutLogs(userId, updated);
  return updated;
}

export function clearWorkoutLogs(userId: string) {
  replaceWorkoutLogs(userId, []);
}

export function createEmptyExerciseLog(
  exercise: Exercise,
  isNewExercise: boolean
): CompletedExercise {
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    plannedSets: exercise.sets,
    plannedReps: exercise.reps ?? null,
    plannedDuration: exercise.duration ?? null,
    isNewExercise,
    rating: null,
    extraReps: null,
    timedEffort: null,
    sets: [],
  };
}

export function createWorkoutLog(params: {
  userId: string;
  workout: Workout;
  startedAt: string;
  exercises: CompletedExercise[];
  status?: "completed" | "aborted";
}): WorkoutLog {
  const completedAt = new Date().toISOString();

  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`,
    userId: params.userId,

    // Workout.id är optional i Workout-typen, så vi fallbackar till null.
    workoutId: params.workout.id ?? null,

    workoutName: params.workout.name,
    startedAt: params.startedAt,
    completedAt,
    durationSeconds: Math.max(
      0,
      Math.round(
        (new Date(completedAt).getTime() -
          new Date(params.startedAt).getTime()) /
          1000
      )
    ),
    status: params.status ?? "completed",
    exercises: params.exercises,
  };
}
