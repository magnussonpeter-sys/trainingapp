import type { CompletedExercise, ExtraRepsOption } from "@/lib/workout-log-storage";
import type { TimedEffortOption } from "@/types/exercise-feedback";
import type { Workout } from "@/types/workout";

// Lokal backup för ett pågående pass i /run.
const ACTIVE_WORKOUT_SESSION_KEY = "active_workout_session";
const ACTIVE_WORKOUT_SESSION_VERSION = 1;

export type LoggedSetDraft = {
  reps: string;
  durationSeconds: string;
  weight: string;
  completed: boolean;
};

export type TimedSetPhaseDraft = "idle" | "running" | "ready_to_save";

export type ActiveWorkoutSessionDraft = {
  version: number;
  userId: string;
  workoutId: string | null;
  workoutName: string;
  sessionStartedAt: string;
  currentExerciseIndex: number;
  currentSet: number;
  lastWeightByExercise: Record<string, string>;
  setLog: LoggedSetDraft;
  completedExercises: CompletedExercise[];
  showExerciseFeedback: boolean;
  selectedExtraReps: ExtraRepsOption | null;
  selectedTimedEffort: TimedEffortOption | null;
  selectedRating: 1 | 2 | 3 | 4 | 5 | null;
  exerciseTimerElapsedSeconds: number;
  exerciseTimerAlarmPlayed: boolean;
  timedSetPhase: TimedSetPhaseDraft;
  showRestTimer: boolean;
  restTimerRunning: boolean;
  restDurationSeconds: number;
  restRemainingSeconds: number;
  savedAt: string;
};

function getStorageKey(userId: string) {
  return `${ACTIVE_WORKOUT_SESSION_KEY}:${userId}`;
}

export function saveActiveWorkoutSessionDraft(
  userId: string,
  draft: Omit<ActiveWorkoutSessionDraft, "version" | "userId" | "savedAt">
) {
  if (typeof window === "undefined") return;

  const payload: ActiveWorkoutSessionDraft = {
    version: ACTIVE_WORKOUT_SESSION_VERSION,
    userId,
    savedAt: new Date().toISOString(),
    ...draft,
  };

  localStorage.setItem(getStorageKey(userId), JSON.stringify(payload));
}

export function getActiveWorkoutSessionDraft(
  userId: string
): ActiveWorkoutSessionDraft | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(getStorageKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ActiveWorkoutSessionDraft;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== ACTIVE_WORKOUT_SESSION_VERSION
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveWorkoutSessionDraft(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getStorageKey(userId));
}

export function isDraftForWorkout(
  draft: ActiveWorkoutSessionDraft | null,
  workout: Workout | null
) {
  if (!draft || !workout) return false;

  const workoutId = workout.id ?? null;

  // Matcha i första hand på id om det finns.
  if (draft.workoutId && workoutId) {
    return draft.workoutId === workoutId;
  }

  // Fallback om passet saknar id.
  return draft.workoutName.trim() === workout.name.trim();
}