"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveWorkout } from "../../../lib/workout-storage";
import {
  hasExerciseBeenRated,
  saveExerciseFeedbackEntry,
} from "../../../lib/exercise-feedback-storage";
import {
  getLastWeightForExercise,
  saveLastWeightForExercise,
} from "../../../lib/exercise-weight-storage";
import {
  getLastRestForExercise,
  saveLastRestForExercise,
} from "../../../lib/exercise-rest-storage";
import {
  createEmptyExerciseLog,
  createWorkoutLog,
  saveWorkoutLog,
  type CompletedExercise,
  type CompletedSet,
  type WorkoutLog,
  type ExtraRepsOption,
} from "../../../lib/workout-log-storage";
import { saveWorkoutLogToApi } from "../../../lib/workout-log-api";
import type { Workout, Exercise } from "../../../types/workout";
import type { TimedEffortOption } from "../../../types/exercise-feedback";

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
};

type LoggedSet = {
  reps: string;
  durationSeconds: string;
  weight: string;
  completed: boolean;
};

type TimedSetPhase = "idle" | "running" | "ready_to_save";

const EXTRA_REP_OPTIONS: Array<{
  value: ExtraRepsOption;
  label: string;
  description: string;
}> = [
  { value: 0, label: "0", description: "Tungt – ungefär nära max för setet." },
  { value: 2, label: "2", description: "Lagom – bra arbetsnivå." },
  { value: 4, label: "4", description: "Lätt – tydlig marginal kvar." },
  { value: 6, label: "6+", description: "Mycket lätt – klart mer kvar." },
];

const TIMED_EFFORT_OPTIONS: Array<{
  value: TimedEffortOption;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Lätt",
    description: "Du hade tydlig marginal kvar.",
  },
  {
    value: "just_right",
    label: "Lagom",
    description: "Bra nivå för setet.",
  },
  {
    value: "tough",
    label: "Tungt",
    description: "Det var riktigt jobbigt.",
  },
];

const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function getDefaultRepsValue(reps: number | undefined) {
  return typeof reps === "number" && Number.isFinite(reps) ? String(reps) : "";
}

function getDefaultDurationValue(duration: number | undefined) {
  return typeof duration === "number" && Number.isFinite(duration)
    ? String(duration)
    : "";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) return `${remainingSeconds} s`;
  return `${minutes} min ${remainingSeconds} s`;
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatTimerClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function isTimedExercise(exercise: { duration?: number; reps?: number }) {
  return (
    typeof exercise.duration === "number" &&
    exercise.duration > 0 &&
    !(typeof exercise.reps === "number" && exercise.reps > 0)
  );
}

function getTimedEffortLabel(value: TimedEffortOption | null | undefined) {
  if (value === "light") return "Lätt";
  if (value === "just_right") return "Lagom";
  if (value === "tough") return "Tungt";
  return null;
}

// Säkerställ exakt union-typ för rating så TypeScript blir nöjd.
function normalizeRating(
  value: number | null | undefined
): 1 | 2 | 3 | 4 | 5 | null {
  return value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5
    ? value
    : null;
}

function playTone(params: {
  frequency: number;
  durationSeconds: number;
  gain?: number;
  type?: OscillatorType;
}) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      // @ts-expect-error Safari fallback
      window.webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = params.type ?? "sine";
    oscillator.frequency.value = params.frequency;
    gainNode.gain.value = params.gain ?? 0.09;

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const now = audioContext.currentTime;
    oscillator.start(now);
    oscillator.stop(now + params.durationSeconds);

    window.setTimeout(() => {
      void audioContext.close();
    }, Math.max(700, Math.round(params.durationSeconds * 1000) + 300));
  } catch (error) {
    console.error("Could not play timer sound", error);
  }
}

function playCountdownBeep() {
  playTone({
    frequency: 900,
    durationSeconds: 0.12,
    gain: 0.12,
    type: "square",
  });
}

function playFinishBeep() {
  playTone({
    frequency: 760,
    durationSeconds: 0.55,
    gain: 0.14,
    type: "square",
  });
}

function playRestFinishedBeep() {
  playTone({
    frequency: 640,
    durationSeconds: 0.3,
    gain: 0.12,
    type: "triangle",
  });
}

function getDisplayName(user: AuthUser | null) {
  if (!user) return "där";
  return (
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "där"
  );
}

export default function WorkoutRunPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sessionStartedAt] = useState(() => new Date().toISOString());

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);

  const [lastWeightByExercise, setLastWeightByExercise] = useState<
    Record<string, string>
  >({});

  const [setLog, setSetLog] = useState<LoggedSet>({
    reps: "",
    durationSeconds: "",
    weight: "",
    completed: false,
  });

  const [completedExercises, setCompletedExercises] = useState<
    CompletedExercise[]
  >([]);
  const [savedWorkoutLog, setSavedWorkoutLog] = useState<WorkoutLog | null>(
    null
  );
  const [workoutFinished, setWorkoutFinished] = useState(false);

  const [showExerciseFeedback, setShowExerciseFeedback] = useState(false);
  const [selectedExtraReps, setSelectedExtraReps] =
    useState<ExtraRepsOption | null>(null);
  const [selectedTimedEffort, setSelectedTimedEffort] =
    useState<TimedEffortOption | null>(null);
  const [selectedRating, setSelectedRating] = useState<
    1 | 2 | 3 | 4 | 5 | null
  >(null);
  const [showExerciseDescription, setShowExerciseDescription] = useState(false);

  const [pageError, setPageError] = useState<string | null>(null);
  const [isFinishingWorkout, setIsFinishingWorkout] = useState(false);

  // Timer för tidsstyrda övningar.
  const [exerciseTimerElapsedSeconds, setExerciseTimerElapsedSeconds] =
    useState(0);
  const [exerciseTimerAlarmPlayed, setExerciseTimerAlarmPlayed] =
    useState(false);
  const [timedSetPhase, setTimedSetPhase] = useState<TimedSetPhase>("idle");

  // Vilotimer mellan set.
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerRunning, setRestTimerRunning] = useState(false);
  const [restDurationSeconds, setRestDurationSeconds] = useState(0);
  const [restRemainingSeconds, setRestRemainingSeconds] = useState(0);

  // Hindrar upprepade countdown-pip.
  const lastCountdownSecondRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setPageError(null);

        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        let authData: unknown = null;
        try {
          authData = await authRes.json();
        } catch {
          authData = null;
        }

        if (
          !authRes.ok ||
          !authData ||
          typeof authData !== "object" ||
          !("user" in authData) ||
          !(authData as { user?: unknown }).user
        ) {
          router.replace("/");
          return;
        }

        const user = (authData as { user: AuthUser }).user;
        const userId = String(user.id);
        const activeWorkout = getActiveWorkout(userId);

        if (!isMounted) return;

        setAuthUser(user);
        setAuthChecked(true);

        if (!activeWorkout) {
          setWorkout(null);
          return;
        }

        setWorkout(activeWorkout);

        const initialWeights: Record<string, string> = {};
        activeWorkout.exercises.forEach((exerciseItem) => {
          const savedWeight = getLastWeightForExercise(userId, exerciseItem.id);
          if (savedWeight) {
            initialWeights[exerciseItem.id] = savedWeight;
          }
        });

        setLastWeightByExercise(initialWeights);

        const firstExercise = activeWorkout.exercises[0];
        const initialWeight = firstExercise
          ? getLastWeightForExercise(userId, firstExercise.id)
          : "";

        setSetLog({
          reps: firstExercise ? getDefaultRepsValue(firstExercise.reps) : "",
          durationSeconds: firstExercise
            ? getDefaultDurationValue(firstExercise.duration)
            : "",
          weight: initialWeight,
          completed: false,
        });

        setExerciseTimerElapsedSeconds(0);
        setExerciseTimerAlarmPlayed(false);
        setTimedSetPhase("idle");
        lastCountdownSecondRef.current = null;
      } catch (error) {
        console.error("Could not load run page", error);
        router.replace("/");
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (timedSetPhase !== "running") return;

    const timeout = window.setTimeout(() => {
      setExerciseTimerElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [timedSetPhase, exerciseTimerElapsedSeconds]);

  useEffect(() => {
    if (!showRestTimer || !restTimerRunning || restRemainingSeconds <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRestRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [showRestTimer, restTimerRunning, restRemainingSeconds]);

  useEffect(() => {
    if (!showRestTimer || !restTimerRunning || restRemainingSeconds > 0) {
      return;
    }

    setRestTimerRunning(false);
    playRestFinishedBeep();
  }, [showRestTimer, restTimerRunning, restRemainingSeconds]);

  const userId = authUser ? String(authUser.id) : null;
  const exercises = workout?.exercises ?? [];

  const safeExercise: Exercise = exercises[currentExerciseIndex] ?? {
    id: "placeholder",
    name: "Övning",
    sets: 1,
    reps: 10,
    rest: 60,
  };

  const exercise = safeExercise;
  const timedExercise = isTimedExercise(exercise);
  const isLastExercise = currentExerciseIndex === exercises.length - 1;
  const isLastSet = currentSet === exercise.sets;
  const isNewExerciseForRating = userId
    ? !hasExerciseBeenRated(userId, exercise.id)
    : false;

  const targetDurationSeconds =
    timedExercise && typeof exercise.duration === "number"
      ? exercise.duration
      : 0;

  const timedSecondsRemaining =
    timedExercise && targetDurationSeconds > 0
      ? Math.max(0, targetDurationSeconds - exerciseTimerElapsedSeconds)
      : 0;

  const timedSecondsOver =
    timedExercise && targetDurationSeconds > 0
      ? Math.max(0, exerciseTimerElapsedSeconds - targetDurationSeconds)
      : 0;

  useEffect(() => {
    if (!timedExercise || timedSetPhase !== "running" || targetDurationSeconds <= 0) {
      return;
    }

    const remaining = targetDurationSeconds - exerciseTimerElapsedSeconds;

    if (remaining <= 3 && remaining >= 1) {
      if (lastCountdownSecondRef.current !== remaining) {
        playCountdownBeep();
        lastCountdownSecondRef.current = remaining;
      }
    }

    if (
      !exerciseTimerAlarmPlayed &&
      exerciseTimerElapsedSeconds >= targetDurationSeconds
    ) {
      playFinishBeep();
      setExerciseTimerAlarmPlayed(true);
      lastCountdownSecondRef.current = null;
    }
  }, [
    timedExercise,
    timedSetPhase,
    targetDurationSeconds,
    exerciseTimerElapsedSeconds,
    exerciseTimerAlarmPlayed,
  ]);

  useEffect(() => {
    if (!workout || !timedExercise) return;

    setSetLog((prev) => ({
      ...prev,
      durationSeconds: String(exerciseTimerElapsedSeconds),
    }));
  }, [exerciseTimerElapsedSeconds, workout, timedExercise]);

  const currentExerciseSummary = useMemo(() => {
    return (
      completedExercises.find((item) => item.exerciseId === exercise.id) ?? null
    );
  }, [completedExercises, exercise.id]);

  const completedSetsForCurrentExercise = currentExerciseSummary?.sets.length ?? 0;

  const totalSetsCompleted = savedWorkoutLog
    ? savedWorkoutLog.exercises.reduce((sum, item) => sum + item.sets.length, 0)
    : completedExercises.reduce((sum, item) => sum + item.sets.length, 0);

  const totalVolume = savedWorkoutLog
    ? savedWorkoutLog.exercises.reduce((sum, item) => {
        return (
          sum +
          item.sets.reduce((setSum, set) => {
            if (set.actualWeight == null || set.actualReps == null) {
              return setSum;
            }
            return setSum + set.actualWeight * set.actualReps;
          }, 0)
        );
      }, 0)
    : completedExercises.reduce((sum, item) => {
        return (
          sum +
          item.sets.reduce((setSum, set) => {
            if (set.actualWeight == null || set.actualReps == null) {
              return setSum;
            }
            return setSum + set.actualWeight * set.actualReps;
          }, 0)
        );
      }, 0);

  const disableFeedbackContinue = timedExercise
    ? selectedTimedEffort === null ||
      (isNewExerciseForRating && selectedRating === null)
    : selectedExtraReps === null ||
      (isNewExerciseForRating && selectedRating === null);

  const canSaveTimedSet =
    timedExercise &&
    timedSetPhase === "ready_to_save" &&
    toNullableNumber(setLog.durationSeconds) !== null &&
    !setLog.completed;

  const canSaveRepSet =
    !timedExercise && !setLog.completed && !!setLog.reps.trim();

  function getPreferredRestSeconds(exerciseId: string, defaultRest: number) {
    if (!userId) return defaultRest;
    return getLastRestForExercise(userId, exerciseId) ?? defaultRest;
  }

  function startRestTimer(seconds: number, exerciseId?: string) {
    const safeSeconds = Math.max(0, Math.round(seconds));

    if (userId && exerciseId) {
      saveLastRestForExercise(userId, exerciseId, safeSeconds);
    }

    if (safeSeconds <= 0) {
      setShowRestTimer(false);
      setRestTimerRunning(false);
      setRestDurationSeconds(0);
      setRestRemainingSeconds(0);
      return;
    }

    setShowRestTimer(true);
    setRestTimerRunning(true);
    setRestDurationSeconds(safeSeconds);
    setRestRemainingSeconds(safeSeconds);
  }

  function stopRestTimer() {
    setShowRestTimer(false);
    setRestTimerRunning(false);
    setRestDurationSeconds(0);
    setRestRemainingSeconds(0);
  }

  function adjustRestTimer(deltaSeconds: number) {
    const nextDuration = Math.max(5, restDurationSeconds + deltaSeconds);
    const nextRemaining = Math.max(5, restRemainingSeconds + deltaSeconds);

    setShowRestTimer(true);
    setRestDurationSeconds(nextDuration);
    setRestRemainingSeconds(nextRemaining);

    if (userId) {
      saveLastRestForExercise(userId, exercise.id, nextDuration);
    }
  }

  function toggleRestTimer() {
    if (!showRestTimer) return;
    setRestTimerRunning((prev) => !prev);
  }

  function resetRestTimerToPreferred() {
    const preferredRest = getPreferredRestSeconds(exercise.id, exercise.rest);
    startRestTimer(preferredRest, exercise.id);
  }

  function resetCurrentSetUi(nextExercise: Exercise) {
    setSetLog({
      reps: getDefaultRepsValue(nextExercise.reps),
      durationSeconds: getDefaultDurationValue(nextExercise.duration),
      weight: lastWeightByExercise[nextExercise.id] ?? "",
      completed: false,
    });

    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    setTimedSetPhase("idle");
    lastCountdownSecondRef.current = null;
    stopRestTimer();
    setShowExerciseDescription(false);
  }

  function startTimedSet() {
    stopRestTimer();
    lastCountdownSecondRef.current = null;
    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    setSetLog((prev) => ({
      ...prev,
      durationSeconds: "0",
      completed: false,
    }));
    setTimedSetPhase("running");
  }

  function stopTimedSet() {
    if (timedSetPhase !== "running") return;

    setTimedSetPhase("ready_to_save");
    setSetLog((prev) => ({
      ...prev,
      durationSeconds: String(exerciseTimerElapsedSeconds),
    }));
  }

  function startNextSet() {
    const nextSetNumber = currentSet + 1;

    setCurrentSet(nextSetNumber);
    resetCurrentSetUi(exercise);
  }

  function goToNextExercise() {
    const nextExerciseIndex = currentExerciseIndex + 1;

    if (nextExerciseIndex >= exercises.length) {
      void finishWorkout("completed");
      return;
    }

    const nextExercise = exercises[nextExerciseIndex];
    const savedWeight = userId
      ? getLastWeightForExercise(userId, nextExercise.id)
      : "";

    setCurrentExerciseIndex(nextExerciseIndex);
    setCurrentSet(1);
    setSetLog({
      reps: getDefaultRepsValue(nextExercise.reps),
      durationSeconds: getDefaultDurationValue(nextExercise.duration),
      weight: savedWeight,
      completed: false,
    });

    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    setTimedSetPhase("idle");
    lastCountdownSecondRef.current = null;
    stopRestTimer();
    setShowExerciseDescription(false);
  }

  function openFeedbackForExerciseSummary(summary: CompletedExercise) {
    setSelectedExtraReps(summary.extraReps ?? null);
    setSelectedTimedEffort(summary.timedEffort ?? null);
    setSelectedRating(normalizeRating(summary.rating));
    setShowExerciseFeedback(true);
    stopRestTimer();
  }

  function openFeedbackForCompletedExercise() {
    const summary =
      completedExercises.find((item) => item.exerciseId === exercise.id) ?? null;

    if (!summary) return;
    openFeedbackForExerciseSummary(summary);
  }

  function completeSet() {
    if (!userId) return;
    if (!exercise) return;
    if (setLog.completed) return;

    if (!timedExercise && !setLog.reps.trim()) {
      return;
    }

    if (timedExercise && timedSetPhase !== "ready_to_save") {
      return;
    }

    if (timedExercise && !setLog.durationSeconds.trim()) {
      return;
    }

    const existingLog =
      completedExercises.find((item) => item.exerciseId === exercise.id) ??
      createEmptyExerciseLog(exercise, isNewExerciseForRating);

    const actualReps = timedExercise ? null : toNullableNumber(setLog.reps);
    const actualDuration = timedExercise
      ? toNullableNumber(setLog.durationSeconds)
      : null;
    const actualWeight = toNullableNumber(setLog.weight);

    const newSet: CompletedSet = {
      setNumber: currentSet,
      plannedReps: exercise.reps ?? null,
      plannedDuration: exercise.duration ?? null,
      plannedWeight: toNullableNumber(lastWeightByExercise[exercise.id] ?? ""),
      actualReps,
      actualDuration,
      actualWeight,
      repsLeft: null,
      timedEffort: null,
      completedAt: new Date().toISOString(),
    };

    if (actualWeight !== null) {
      saveLastWeightForExercise(userId, exercise.id, String(actualWeight));
      setLastWeightByExercise((prev) => ({
        ...prev,
        [exercise.id]: String(actualWeight),
      }));
    }

    const updatedExerciseLog: CompletedExercise = {
      ...existingLog,
      sets: [...existingLog.sets, newSet],
    };

    setCompletedExercises((prev) => {
      const exists = prev.some((item) => item.exerciseId === exercise.id);

      if (!exists) {
        return [...prev, updatedExerciseLog];
      }

      return prev.map((item) =>
        item.exerciseId === exercise.id ? updatedExerciseLog : item
      );
    });

    setSetLog((prev) => ({
      ...prev,
      completed: true,
    }));

    // Tidsstyrda övningar ska direkt vidare när setet sparas.
    if (timedExercise) {
      if (isLastSet) {
        openFeedbackForExerciseSummary(updatedExerciseLog);
        return;
      }

      const preferredRest = getPreferredRestSeconds(exercise.id, exercise.rest);
      if (preferredRest > 0) {
        startRestTimer(preferredRest, exercise.id);
      }

      startNextSet();
      return;
    }

    // Reps-övningar visar vila men väntar på nästa klick.
    if (!isLastSet) {
      const preferredRest = getPreferredRestSeconds(exercise.id, exercise.rest);
      startRestTimer(preferredRest, exercise.id);
      return;
    }

    openFeedbackForExerciseSummary(updatedExerciseLog);
  }

  function continueAfterSavedRepSet() {
    if (!setLog.completed) return;

    if (isLastSet) {
      openFeedbackForCompletedExercise();
      return;
    }

    startNextSet();
  }

  function skipExercise() {
    stopRestTimer();

    if (isLastExercise) {
      void finishWorkout("completed");
      return;
    }

    goToNextExercise();
  }

  async function completeExerciseFeedback() {
    setCompletedExercises((prev) =>
      prev.map((item) => {
        if (item.exerciseId !== exercise.id) return item;

        const updatedSets = item.sets.map((set, index) => {
          if (index !== item.sets.length - 1) return set;

          return {
            ...set,
            repsLeft: timedExercise ? null : selectedExtraReps,
            timedEffort: timedExercise ? selectedTimedEffort : null,
          };
        });

        return {
          ...item,
          extraReps: timedExercise ? null : selectedExtraReps,
          timedEffort: timedExercise ? selectedTimedEffort : null,
          rating: isNewExerciseForRating ? selectedRating : item.rating,
          sets: updatedSets,
        };
      })
    );

    if (userId) {
      saveExerciseFeedbackEntry(userId, exercise.id, {
        extraReps: timedExercise ? null : selectedExtraReps,
        timedEffort: timedExercise ? selectedTimedEffort : null,
        rating: isNewExerciseForRating ? selectedRating : null,
      });
    }

    setShowExerciseFeedback(false);
    setSelectedExtraReps(null);
    setSelectedTimedEffort(null);
    setSelectedRating(null);

    if (isLastExercise) {
      await finishWorkout("completed");
      return;
    }

    goToNextExercise();
  }

  async function finishWorkout(status: "completed" | "aborted") {
    if (!workout || !userId || isFinishingWorkout) return;

    try {
      setIsFinishingWorkout(true);
      setPageError(null);

      const workoutLog = createWorkoutLog({
        userId,
        workout,
        startedAt: sessionStartedAt,
        exercises: completedExercises,
        status,
      });

      saveWorkoutLog(workoutLog);

      try {
        await saveWorkoutLogToApi(workoutLog);
      } catch (error) {
        console.error("Could not save workout log to API", error);
      }

      setSavedWorkoutLog(workoutLog);
      setWorkoutFinished(true);
      stopRestTimer();
    } catch (error) {
      console.error("Could not finish workout", error);
      setPageError("Kunde inte avsluta passet korrekt.");
    } finally {
      setIsFinishingWorkout(false);
    }
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-[var(--app-page-bg)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-[var(--app-border)] bg-[var(--app-surface)] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-medium text-[var(--app-text-muted)]">
            Kontrollerar inloggning...
          </p>
        </div>
      </main>
    );
  }

  if (!workout || !userId) {
    return (
      <main className="min-h-screen bg-[var(--app-page-bg)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-[var(--app-border)] bg-[var(--app-surface)] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--app-text-strong)]">
            Inget aktivt pass
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">
            Det finns inget pass att köra just nu.
          </p>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="mt-6 inline-flex rounded-2xl bg-[var(--app-accent)] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-strong)]"
          >
            Till startsidan
          </button>
        </div>
      </main>
    );
  }

  if (workoutFinished && savedWorkoutLog) {
    return (
      <main className="min-h-screen bg-[var(--app-page-bg)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-[32px] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
              <section className="border-b border-[var(--app-border)] bg-[linear-gradient(180deg,#f8fbff_0%,#f4f7fb_100%)] p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong)]">
                  Pass slutfört
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--app-text-strong)] sm:text-4xl">
                  Bra jobbat
                </h1>
                <p className="mt-3 text-base leading-7 text-[var(--app-text)]">
                  Ditt pass har sparats. Här ser du en snabb sammanfattning av
                  resultatet.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                    <p className="text-sm text-[var(--app-text-muted)]">Tid</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                      {formatDuration(savedWorkoutLog.durationSeconds)}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                    <p className="text-sm text-[var(--app-text-muted)]">Övningar</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                      {savedWorkoutLog.exercises.length}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                    <p className="text-sm text-[var(--app-text-muted)]">Set</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                      {totalSetsCompleted}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                    <p className="text-sm text-[var(--app-text-muted)]">Volym</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                      {Math.round(totalVolume)} kg
                    </p>
                  </div>
                </div>

                <div className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm">
                  <p className="text-sm font-medium text-[var(--app-text-muted)]">
                    Slutfört
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--app-text-strong)]">
                    {formatDateTime(savedWorkoutLog.completedAt)}
                  </p>
                </div>
              </section>

              <aside className="bg-[var(--app-surface)] p-6 sm:p-8 lg:p-10">
                <div className="space-y-6">
                  <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                      Klar
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                      Passet är sparat
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">
                      Du kan nu gå tillbaka till hem, se historik eller starta ett
                      nytt pass.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push("/home")}
                    className="w-full rounded-2xl bg-[var(--app-accent)] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-strong)]"
                  >
                    Till startsidan
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push("/history")}
                    className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-5 py-3.5 text-sm font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                  >
                    Se historik
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const displayName = getDisplayName(authUser);

  return (
    <main className="min-h-screen bg-[var(--app-page-bg)] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="overflow-hidden rounded-[32px] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <section className="border-b border-[var(--app-border)] bg-[linear-gradient(180deg,#f8fbff_0%,#f4f7fb_100%)] p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong)]">
                    Aktivt pass
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--app-text-strong)] sm:text-4xl">
                    {exercise.name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--app-text)]">
                    Hej {displayName}. Följ passet steg för steg och logga seten
                    direkt här.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void finishWorkout("aborted")}
                  disabled={isFinishingWorkout}
                  className="inline-flex rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFinishingWorkout ? "Avslutar..." : "Avsluta pass"}
                </button>
              </div>

              {pageError ? (
                <div className="mt-6 rounded-2xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] px-4 py-3 text-sm text-[var(--app-danger-text)]">
                  {pageError}
                </div>
              ) : null}

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                  <p className="text-sm text-[var(--app-text-muted)]">Övning</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                    {currentExerciseIndex + 1}/{exercises.length}
                  </p>
                </div>

                <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                  <p className="text-sm text-[var(--app-text-muted)]">Set</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                    {currentSet}/{exercise.sets}
                  </p>
                </div>

                <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                  <p className="text-sm text-[var(--app-text-muted)]">Klara set</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                    {completedSetsForCurrentExercise}
                  </p>
                </div>
              </div>

              {exercise.description ? (
                <div className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setShowExerciseDescription((prev) => !prev)}
                    className="text-sm font-semibold text-[var(--app-text-strong)]"
                  >
                    {showExerciseDescription
                      ? "Dölj beskrivning"
                      : "Visa beskrivning"}
                  </button>

                  {showExerciseDescription ? (
                    <p className="mt-4 text-sm leading-6 text-[var(--app-text)]">
                      {exercise.description}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <section className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                  Pågående set
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                  {timedExercise ? "Tidsstyrd övning" : "Reps och vikt"}
                </h2>

                {timedExercise ? (
                  <>
                    <div className="mt-6 rounded-[24px] bg-[var(--app-surface-muted)] px-5 py-5">
                      <p className="text-sm text-[var(--app-text-muted)]">
                        Måltid
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                        {targetDurationSeconds} sekunder
                      </p>

                      <p className="mt-5 text-5xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                        {formatTimerClock(exerciseTimerElapsedSeconds)}
                      </p>

                      {targetDurationSeconds > 0 ? (
                        <div className="mt-4 space-y-1 text-sm">
                          <p className="text-[var(--app-text)]">
                            Kvar: {formatTimerClock(timedSecondsRemaining)}
                          </p>

                          {timedSecondsOver > 0 ? (
                            <p className="text-amber-700">
                              Övertid: {formatTimerClock(timedSecondsOver)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={startTimedSet}
                        disabled={timedSetPhase === "running"}
                        className="rounded-2xl bg-green-600 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Starta
                      </button>

                      <button
                        type="button"
                        onClick={stopTimedSet}
                        disabled={timedSetPhase !== "running"}
                        className="rounded-2xl bg-red-600 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Stoppa
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[var(--app-text-strong)]">
                        Reps
                      </label>
                      <input
                        value={setLog.reps}
                        onChange={(e) =>
                          setSetLog((prev) => ({ ...prev, reps: e.target.value }))
                        }
                        inputMode="numeric"
                        className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none transition focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[var(--app-text-strong)]">
                        Vikt (kg)
                      </label>
                      <input
                        value={setLog.weight}
                        onChange={(e) =>
                          setSetLog((prev) => ({ ...prev, weight: e.target.value }))
                        }
                        inputMode="decimal"
                        className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none transition focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                      />
                    </div>
                  </div>
                )}

                {timedExercise ? (
                  <div className="mt-6">
                    <label className="mb-2 block text-sm font-semibold text-[var(--app-text-strong)]">
                      Utförd tid (sek)
                    </label>
                    <input
                      value={setLog.durationSeconds}
                      onChange={(e) =>
                        setSetLog((prev) => ({
                          ...prev,
                          durationSeconds: e.target.value,
                        }))
                      }
                      inputMode="numeric"
                      className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none transition focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                    />
                  </div>
                ) : null}

                {!showExerciseFeedback ? (
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    {timedExercise ? (
                      <>
                        <button
                          type="button"
                          onClick={completeSet}
                          disabled={!canSaveTimedSet}
                          className="rounded-2xl bg-[var(--app-accent)] px-4 py-3.5 text-base font-semibold text-white transition hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Spara set
                        </button>

                        <button
                          type="button"
                          onClick={skipExercise}
                          className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3.5 text-base font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                        >
                          Hoppa över övning
                        </button>
                      </>
                    ) : (
                      <>
                        {!setLog.completed ? (
                          <button
                            type="button"
                            onClick={completeSet}
                            disabled={!canSaveRepSet}
                            className="rounded-2xl bg-[var(--app-accent)] px-4 py-3.5 text-base font-semibold text-white transition hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Spara set
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={continueAfterSavedRepSet}
                            className="rounded-2xl bg-[var(--app-accent)] px-4 py-3.5 text-base font-semibold text-white transition hover:bg-[var(--app-accent-strong)]"
                          >
                            {isLastSet ? "Avsluta övning" : "Nästa set"}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={skipExercise}
                          className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3.5 text-base font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                        >
                          Hoppa över övning
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowExerciseFeedback(false);
                        setSelectedExtraReps(null);
                        setSelectedTimedEffort(null);
                        setSelectedRating(null);
                      }}
                      className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3.5 text-base font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Tillbaka
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void completeExerciseFeedback();
                      }}
                      disabled={disableFeedbackContinue}
                      className="rounded-2xl bg-[var(--app-accent)] px-4 py-3.5 text-base font-semibold text-white transition hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLastExercise ? "Avsluta pass" : "Nästa övning"}
                    </button>
                  </div>
                )}
              </section>

              {/* Vilotimern visas inte medan tidsstyrt arbetsset pågår */}
              {showRestTimer && timedSetPhase !== "running" ? (
                <section className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-7">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                    Vila
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                    Vilotimer
                  </h2>

                  <p className="mt-5 text-5xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                    {formatTimerClock(restRemainingSeconds)}
                  </p>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={toggleRestTimer}
                      className="rounded-2xl bg-[var(--app-accent)] px-4 py-3.5 font-semibold text-white transition hover:bg-[var(--app-accent-strong)]"
                    >
                      {restTimerRunning ? "Pausa" : "Starta"}
                    </button>

                    <button
                      type="button"
                      onClick={resetRestTimerToPreferred}
                      className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3.5 font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Återställ
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => adjustRestTimer(-15)}
                      className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3.5 font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      -15 s
                    </button>

                    <button
                      type="button"
                      onClick={() => adjustRestTimer(15)}
                      className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3.5 font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      +15 s
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                  Logg
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                  Loggade set för övningen
                </h2>

                {currentExerciseSummary?.sets?.length ? (
                  <div className="mt-5 space-y-3">
                    {currentExerciseSummary.sets.map((set) => (
                      <div
                        key={`${set.setNumber}-${set.completedAt}`}
                        className="rounded-2xl bg-[var(--app-surface-muted)] px-4 py-4 text-sm text-[var(--app-text-strong)]"
                      >
                        Set {set.setNumber}
                        {set.actualReps !== null ? ` • ${set.actualReps} reps` : ""}
                        {set.actualDuration !== null
                          ? ` • ${set.actualDuration} sek`
                          : ""}
                        {set.actualWeight !== null ? ` • ${set.actualWeight} kg` : ""}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[var(--app-text)]">
                    Inga set sparade ännu.
                  </p>
                )}

                <p className="mt-4 text-sm text-[var(--app-text-muted)]">
                  Klara set i denna övning: {completedSetsForCurrentExercise} /{" "}
                  {exercise.sets}
                </p>
              </section>

              {showExerciseFeedback ? (
                <section className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-7">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                    Utvärdering
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                    Hur gick övningen?
                  </h2>

                  {timedExercise ? (
                    <div className="mt-5">
                      <p className="text-sm font-semibold text-[var(--app-text-strong)]">
                        Ansträngning
                      </p>
                      <div className="mt-3 grid gap-3">
                        {TIMED_EFFORT_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setSelectedTimedEffort(option.value)}
                            className={`rounded-2xl border px-4 py-4 text-left transition ${
                              selectedTimedEffort === option.value
                                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                                : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-strong)] hover:border-[var(--app-accent)]"
                            }`}
                          >
                            <div className="font-semibold">{option.label}</div>
                            <div className="mt-1 text-sm">{option.description}</div>
                          </button>
                        ))}
                      </div>

                      {selectedTimedEffort ? (
                        <p className="mt-3 text-sm text-[var(--app-text-muted)]">
                          Vald nivå: {getTimedEffortLabel(selectedTimedEffort)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-5">
                      <p className="text-sm font-semibold text-[var(--app-text-strong)]">
                        Extra reps
                      </p>
                      <div className="mt-3 grid gap-3">
                        {EXTRA_REP_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setSelectedExtraReps(option.value)}
                            className={`rounded-2xl border px-4 py-4 text-left transition ${
                              selectedExtraReps === option.value
                                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                                : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-strong)] hover:border-[var(--app-accent)]"
                            }`}
                          >
                            <div className="font-semibold">{option.label}</div>
                            <div className="mt-1 text-sm">{option.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isNewExerciseForRating ? (
                    <div className="mt-6">
                      <p className="text-sm font-semibold text-[var(--app-text-strong)]">
                        Betyg
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {RATING_OPTIONS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setSelectedRating(option)}
                            className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                              selectedRating === option
                                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                                : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-strong)] hover:border-[var(--app-accent)]"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </section>

            <aside className="bg-[var(--app-surface)] p-6 sm:p-8 lg:p-10">
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                    Passöversikt
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                    {workout.name}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">
                    Total övningar: {exercises.length}. Nu kör du{" "}
                    <span className="font-semibold">{exercise.name}</span>.
                  </p>
                </div>

                <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-[var(--app-text-strong)]">
                    Just nu
                  </h3>

                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-[var(--app-border)] px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                        Övning
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--app-text-strong)]">
                        {exercise.name}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--app-border)] px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                        Setstatus
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--app-text-strong)]">
                        Set {currentSet} av {exercise.sets}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--app-border)] px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                        Typ
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--app-text-strong)]">
                        {timedExercise ? "Tidsstyrd övning" : "Repsbaserad övning"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-[var(--app-text-strong)]">
                    Snabbnavigering
                  </h3>

                  <div className="mt-5 grid gap-3">
                    <button
                      type="button"
                      onClick={() => router.push("/home")}
                      className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Till hem
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push("/history")}
                      className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Historik
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-[var(--app-border)] bg-[linear-gradient(180deg,#ecfdf5_0%,#f8fafc_100%)] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                    Tips
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--app-text-strong)]">
                    Arbetsflöde
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">
                    Spara set direkt efter utförande. För tidsövningar: starta,
                    stoppa och spara. För repsövningar: logga reps och vikt innan
                    du går vidare.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}