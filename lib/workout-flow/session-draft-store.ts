import type {
  CompletedExercise,
  ExtraRepsOption,
} from "@/lib/workout-log-storage";
import type { TimedEffortOption } from "@/types/exercise-feedback";

// Fullt lokalt utkast av pågående pass.
// Detta är den viktigaste offline-kopian för exakt återställning av UI.
const SESSION_DRAFT_STORE_KEY = "workout_session_draft";
const SESSION_DRAFT_STORE_VERSION = 1;

export type SessionDraftTimerState = "idle" | "running" | "ready_to_save";

export type SessionDraft = {
  version: number;
  userId: string;
  workoutId: string | null;
  workoutName: string;
  sessionStartedAt: string;
  currentExerciseIndex: number;
  currentSet: number;
  reps: string;
  weight: string;
  elapsedSeconds: number;
  timerState: SessionDraftTimerState;
  showRestTimer: boolean;
  restTimerRunning: boolean;
  restDurationSeconds: number;
  restRemainingSeconds: number;
  showExerciseFeedback: boolean;
  selectedExtraReps: ExtraRepsOption | null;
  selectedTimedEffort: TimedEffortOption | null;
  selectedRating: 1 | 2 | 3 | 4 | 5 | null;
  lastWeightByExercise: Record<string, string>;
  completedExercises: CompletedExercise[];
  status: "active" | "finished" | "aborted";
  updatedAt: string;
};

function hasWindow() {
  return typeof window !== "undefined";
}

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

function getKey(userId: string) {
  return `${SESSION_DRAFT_STORE_KEY}:${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asArray<T>(value: unknown, fallback: T[] = []) {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function normalizeLastWeightByExercise(raw: unknown) {
  if (!isRecord(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      typeof value === "string" ? value : "",
    ]),
  );
}

function normalizeDraft(raw: unknown): SessionDraft | null {
  if (!isRecord(raw)) {
    return null;
  }

  const userId = asString(raw.userId);
  const workoutName = asString(raw.workoutName);

  if (!userId || !workoutName) {
    return null;
  }

  return {
    version: SESSION_DRAFT_STORE_VERSION,
    userId,
    workoutId:
      typeof raw.workoutId === "string" && raw.workoutId.trim()
        ? raw.workoutId
        : null,
    workoutName,
    sessionStartedAt: asString(raw.sessionStartedAt, new Date().toISOString()),
    currentExerciseIndex: Math.max(0, asNumber(raw.currentExerciseIndex, 0)),
    currentSet: Math.max(1, asNumber(raw.currentSet, 1)),
    reps: asString(raw.reps),
    weight: asString(raw.weight),
    elapsedSeconds: Math.max(0, asNumber(raw.elapsedSeconds, 0)),
    timerState:
      raw.timerState === "running" || raw.timerState === "ready_to_save"
        ? raw.timerState
        : "idle",
    showRestTimer: asBoolean(raw.showRestTimer, false),
    restTimerRunning: asBoolean(raw.restTimerRunning, false),
    restDurationSeconds: Math.max(0, asNumber(raw.restDurationSeconds, 0)),
    restRemainingSeconds: Math.max(0, asNumber(raw.restRemainingSeconds, 0)),
    showExerciseFeedback: asBoolean(raw.showExerciseFeedback, false),
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
    lastWeightByExercise: normalizeLastWeightByExercise(
      raw.lastWeightByExercise,
    ),
    completedExercises: asArray<CompletedExercise>(raw.completedExercises, []),
    status:
      raw.status === "finished" || raw.status === "aborted"
        ? raw.status
        : "active",
    updatedAt: asString(raw.updatedAt, new Date().toISOString()),
  };
}

export function saveSessionDraft(
  userId: string,
  draft: Omit<SessionDraft, "version" | "userId" | "updatedAt">,
) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  const payload: SessionDraft = {
    version: SESSION_DRAFT_STORE_VERSION,
    userId,
    updatedAt: new Date().toISOString(),
    ...draft,
  };

  try {
    storage.setItem(getKey(userId), JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to save session draft", error);
  }
}

export function getSessionDraft(userId: string): SessionDraft | null {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getKey(userId));

    if (!raw) {
      return null;
    }

    return normalizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSessionDraft(userId: string) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(getKey(userId));
  } catch (error) {
    console.error("Failed to clear session draft", error);
  }
}