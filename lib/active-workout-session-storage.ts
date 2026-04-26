import type {
  CompletedExercise,
  ExtraRepsOption,
} from "@/lib/workout-log-storage";
import type { TimedEffortOption } from "@/types/exercise-feedback";
import type { Workout } from "@/types/workout";

// Lokal backup för ett pågående pass i /run.
// Viktigt mål:
// 1. ett pass per användare
// 2. tåligt mot trasig localStorage-data
// 3. bakåtkompatibelt med nuvarande /run-sida
// 4. sparar alltid lokalt även om nätet försvinner

const ACTIVE_WORKOUT_SESSION_KEY = "active_workout_session";
const ACTIVE_WORKOUT_SESSION_VERSION = 2;

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
  feedbackExerciseQueue: string[];
  feedbackExerciseIndex: number;
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

type LegacyActiveWorkoutSessionDraft = Partial<ActiveWorkoutSessionDraft> & {
  version?: number;
  userId?: string;
};

// Skydd så att vi inte kraschar på servern.
function hasWindow() {
  return typeof window !== "undefined";
}

// LocalStorage kan kasta i privata lägen eller om quota är full.
function getStorage(): Storage | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Primär nyckel per användare.
function getStorageKey(userId: string) {
  return `${ACTIVE_WORKOUT_SESSION_KEY}:${userId}`;
}

// Äldre generell nyckel, om sådan skulle finnas från tidigare versioner.
function getLegacyGlobalKey() {
  return ACTIVE_WORKOUT_SESSION_KEY;
}

// Typvakt för objektliknande värden.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Säker konvertering till sträng.
function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

// Säker konvertering till nummer.
function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Säker konvertering till boolean.
function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

// Säker konvertering till array.
function asArray<T>(value: unknown, fallback: T[] = []) {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

// Normaliserar ett draft-objekt så att /run inte kraschar om något fält saknas.
function normalizeDraft(
  raw: LegacyActiveWorkoutSessionDraft,
  fallbackUserId?: string,
): ActiveWorkoutSessionDraft | null {
  if (!isRecord(raw)) {
    return null;
  }

  const userId = asString(raw.userId, fallbackUserId ?? "");
  const workoutName = asString(raw.workoutName);

  if (!userId || !workoutName) {
    return null;
  }

  // Tydlig record-typ här så TypeScript vet att egenskaper kan läsas säkert.
  const setLogRaw: Record<string, unknown> = isRecord(raw.setLog)
    ? raw.setLog
    : {};

  const normalizedLastWeightByExercise: Record<string, string> = isRecord(
    raw.lastWeightByExercise,
  )
    ? Object.fromEntries(
        Object.entries(raw.lastWeightByExercise).map(([key, value]) => [
          key,
          typeof value === "string" ? value : "",
        ]),
      )
    : {};

  return {
    version: ACTIVE_WORKOUT_SESSION_VERSION,
    userId,
    workoutId:
      typeof raw.workoutId === "string" && raw.workoutId.trim()
        ? raw.workoutId
        : null,
    workoutName,
    sessionStartedAt: asString(raw.sessionStartedAt, new Date().toISOString()),
    currentExerciseIndex: asNumber(raw.currentExerciseIndex, 0),
    currentSet: Math.max(1, asNumber(raw.currentSet, 1)),
    lastWeightByExercise: normalizedLastWeightByExercise,
    setLog: {
      reps: asString(setLogRaw["reps"]),
      durationSeconds: asString(setLogRaw["durationSeconds"]),
      weight: asString(setLogRaw["weight"]),
      completed: asBoolean(setLogRaw["completed"], false),
    },
    completedExercises: asArray<CompletedExercise>(raw.completedExercises, []),
    showExerciseFeedback: asBoolean(raw.showExerciseFeedback, false),
    // Feedback-kön gör att superset kan betygsättas en övning i taget även efter restore.
    feedbackExerciseQueue: asArray<string>(raw.feedbackExerciseQueue, []).filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ),
    feedbackExerciseIndex: Math.max(0, asNumber(raw.feedbackExerciseIndex, 0)),
    selectedExtraReps:
      raw.selectedExtraReps === 0 ||
      raw.selectedExtraReps === 2 ||
      raw.selectedExtraReps === 4 ||
      raw.selectedExtraReps === 6
        ? raw.selectedExtraReps
        : null,
    selectedTimedEffort:
      raw.selectedTimedEffort === "light" ||
      raw.selectedTimedEffort === "just_right" ||
      raw.selectedTimedEffort === "tough"
        ? raw.selectedTimedEffort
        : null,
    selectedRating:
      raw.selectedRating === 1 ||
      raw.selectedRating === 2 ||
      raw.selectedRating === 3 ||
      raw.selectedRating === 4 ||
      raw.selectedRating === 5
        ? raw.selectedRating
        : null,
    exerciseTimerElapsedSeconds: Math.max(
      0,
      asNumber(raw.exerciseTimerElapsedSeconds, 0),
    ),
    exerciseTimerAlarmPlayed: asBoolean(raw.exerciseTimerAlarmPlayed, false),
    timedSetPhase:
      raw.timedSetPhase === "idle" ||
      raw.timedSetPhase === "running" ||
      raw.timedSetPhase === "ready_to_save"
        ? raw.timedSetPhase
        : "idle",
    showRestTimer: asBoolean(raw.showRestTimer, false),
    restTimerRunning: asBoolean(raw.restTimerRunning, false),
    restDurationSeconds: Math.max(0, asNumber(raw.restDurationSeconds, 0)),
    restRemainingSeconds: Math.max(0, asNumber(raw.restRemainingSeconds, 0)),
    savedAt: asString(raw.savedAt, new Date().toISOString()),
  };
}

// Läser och parsear säkert från en specifik nyckel.
function readDraftFromKey(
  storage: Storage,
  key: string,
  fallbackUserId?: string,
): ActiveWorkoutSessionDraft | null {
  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as LegacyActiveWorkoutSessionDraft;
    return normalizeDraft(parsed, fallbackUserId);
  } catch {
    return null;
  }
}

// Spara utkast lokalt. Detta är kärnan för att inte tappa data vid tappad uppkoppling.
export function saveActiveWorkoutSessionDraft(
  userId: string,
  draft: Omit<ActiveWorkoutSessionDraft, "version" | "userId" | "savedAt">,
) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const payload: ActiveWorkoutSessionDraft = {
    version: ACTIVE_WORKOUT_SESSION_VERSION,
    userId,
    savedAt: new Date().toISOString(),
    ...draft,
  };

  try {
    storage.setItem(getStorageKey(userId), JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to save active workout session draft", error);
  }
}

// Hämta utkast för användaren.
// Försöker först med användarspecifik nyckel.
// Därefter försöker den en äldre generell nyckel och migrerar upp den.
export function getActiveWorkoutSessionDraft(
  userId: string,
): ActiveWorkoutSessionDraft | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const userKey = getStorageKey(userId);
  const directHit = readDraftFromKey(storage, userKey, userId);

  if (directHit) {
    return directHit;
  }

  const legacyHit = readDraftFromKey(storage, getLegacyGlobalKey(), userId);

  if (legacyHit && legacyHit.userId === userId) {
    try {
      storage.setItem(userKey, JSON.stringify(legacyHit));
      storage.removeItem(getLegacyGlobalKey());
    } catch {
      // Tyst fallback. Det viktigaste är att vi kan återställa passet.
    }

    return legacyHit;
  }

  return null;
}

// Hjälpfunktion för att rensa draft när passet är klart eller avbrutet.
export function clearActiveWorkoutSessionDraft(userId: string) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(getStorageKey(userId));
  } catch (error) {
    console.error("Failed to clear active workout session draft", error);
  }
}

// Matchar utkastet mot aktuellt pass.
// Id i första hand, namn som fallback om workout.id saknas.
export function isDraftForWorkout(
  draft: ActiveWorkoutSessionDraft | null,
  workout: Workout | null,
) {
  if (!draft || !workout) {
    return false;
  }

  const workoutId = workout.id ?? null;

  if (draft.workoutId && workoutId) {
    return draft.workoutId === workoutId;
  }

  return draft.workoutName.trim() === workout.name.trim();
}
