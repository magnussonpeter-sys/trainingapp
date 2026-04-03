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
import type {
  TimedEffortOption,
  ExerciseFeedbackEntry,
} from "../../../types/exercise-feedback";

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
  displayName?: string | null;
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
    user.displayName?.trim() ||
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "där"
  );
}

// Enkel badge-styling för små informationschips.
function getBadgeClasses(variant: "accent" | "neutral" | "warning" | "danger") {
  switch (variant) {
    case "accent":
      return "border-indigo-100 bg-indigo-50 text-indigo-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
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
        const nextUserId = String(user.id);
        const activeWorkout = getActiveWorkout(nextUserId);

        if (!isMounted) return;

        setAuthUser(user);
        setAuthChecked(true);

        if (!activeWorkout) {
          setWorkout(null);
          return;
        }

        setWorkout(activeWorkout);

        // Hämta sparade vikter för alla övningar i passet.
        const initialWeights: Record<string, string> = {};
        activeWorkout.exercises.forEach((exerciseItem) => {
          const savedWeight = getLastWeightForExercise(nextUserId, exerciseItem.id);
          if (savedWeight) {
            initialWeights[exerciseItem.id] = savedWeight;
          }
        });

        setLastWeightByExercise(initialWeights);

        const firstExercise = activeWorkout.exercises[0];
        const initialWeight = firstExercise
          ? getLastWeightForExercise(nextUserId, firstExercise.id)
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
    if (
      !timedExercise ||
      timedSetPhase !== "running" ||
      targetDurationSeconds <= 0
    ) {
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
    setSetLog({
      reps: getDefaultRepsValue(exercise.reps),
      durationSeconds: getDefaultDurationValue(exercise.duration),
      weight: lastWeightByExercise[exercise.id] ?? "",
      completed: false,
    });

    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    setTimedSetPhase("idle");
    lastCountdownSecondRef.current = null;
    stopRestTimer();
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
  }

  function openFeedbackFromSummary(summary: CompletedExercise) {
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
    openFeedbackFromSummary(summary);
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

    // Tidsstyrda övningar går direkt vidare när setet sparas.
    if (timedExercise) {
      if (isLastSet) {
        openFeedbackFromSummary(updatedExerciseLog);
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

    openFeedbackFromSummary(updatedExerciseLog);
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
    const ratingToSave = isNewExerciseForRating ? selectedRating : null;

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
          rating: ratingToSave ?? item.rating,
          sets: updatedSets,
        };
      })
    );

    if (userId) {
      const entry: ExerciseFeedbackEntry = {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        completedAt: new Date().toISOString(),
        extraReps: timedExercise ? undefined : selectedExtraReps ?? undefined,
        timedEffort: timedExercise
          ? selectedTimedEffort ?? undefined
          : undefined,
        rating: ratingToSave ?? undefined,
      };

      saveExerciseFeedbackEntry(userId, entry);
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

  async function handleAbortWorkout() {
    if (!workout || !userId || isFinishingWorkout) return;

    // Bekräftelse om passet inte är färdigt ännu.
    if (!workoutFinished) {
      const confirmed = window.confirm(
        "Är du säker på att du vill avsluta passet? Det aktuella passet är inte färdigt ännu."
      );

      if (!confirmed) {
        return;
      }
    }

    await finishWorkout("aborted");
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
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#eef3f9_100%)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[32px] border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
              Träningsapp
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Laddar aktivt pass...
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Kontrollerar inloggning och hämtar ditt pågående pass.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!workout || !userId) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#eef3f9_100%)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Aktivt pass
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Inget aktivt pass
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Det finns inget pass att köra just nu.
          </p>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="mt-6 inline-flex rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Till dashboard
          </button>
        </div>
      </main>
    );
  }

  if (workoutFinished && savedWorkoutLog) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#eef3f9_100%)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
                  Pass slutfört
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Bra jobbat
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                  Ditt pass har sparats. Här ser du en snabb sammanfattning av
                  resultatet.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                      "accent"
                    )}`}
                  >
                    Sparat
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                      "neutral"
                    )}`}
                  >
                    {savedWorkoutLog.exercises.length} övningar
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                      "neutral"
                    )}`}
                  >
                    {totalSetsCompleted} set
                  </div>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
                    <p className="text-sm text-slate-500">Tid</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatDuration(savedWorkoutLog.durationSeconds)}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
                    <p className="text-sm text-slate-500">Övningar</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {savedWorkoutLog.exercises.length}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
                    <p className="text-sm text-slate-500">Set</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {totalSetsCompleted}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
                    <p className="text-sm text-slate-500">Volym</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {Math.round(totalVolume)} kg
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                  <p className="text-sm text-slate-500">Slutfört</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatDateTime(savedWorkoutLog.completedAt)}
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-indigo-100 bg-[linear-gradient(180deg,rgba(238,242,255,0.9),rgba(255,255,255,0.95))] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700">
                  Nästa steg
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                  Passet är sparat
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Du kan nu gå tillbaka till dashboarden eller se träningshistorik.
                </p>

                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => router.push("/home")}
                    className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-700"
                  >
                    Till dashboard
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push("/history")}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    Se historik
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const displayName = getDisplayName(authUser);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#eef3f9_100%)] px-4 py-4 pb-28 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-6 overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
                Aktivt pass
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                {exercise.name}
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Hej {displayName}. Följ passet steg för steg och logga seten direkt
                här.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                    "accent"
                  )}`}
                >
                  Övning {currentExerciseIndex + 1}/{exercises.length}
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                    "neutral"
                  )}`}
                >
                  Set {currentSet}/{exercise.sets}
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getBadgeClasses(
                    timedExercise ? "warning" : "neutral"
                  )}`}
                >
                  {timedExercise ? "Tidsstyrd övning" : "Repsbaserad övning"}
                </div>
              </div>

              {pageError ? (
                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {pageError}
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-indigo-100 bg-[linear-gradient(180deg,rgba(238,242,255,0.9),rgba(255,255,255,0.95))] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700">
                Passöverblick
              </p>

              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                {workout.name}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Klara set
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {completedSetsForCurrentExercise}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Totalt klara set
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {totalSetsCompleted}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => {
                    void handleAbortWorkout();
                  }}
                  disabled={isFinishingWorkout}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-base font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFinishingWorkout ? "Avslutar..." : "Avsluta pass"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
                Pågående set
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {exercise.name}
              </h2>

              {timedExercise ? (
                <>
                  <div className="mt-6 rounded-[28px] border border-indigo-100 bg-indigo-50/70 px-5 py-6 text-center">
                    <p className="text-sm font-medium text-slate-600">Måltid</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {targetDurationSeconds} sekunder
                    </p>

                    <p className="mt-5 text-6xl font-semibold tracking-tight text-slate-900 sm:text-7xl">
                      {formatTimerClock(exerciseTimerElapsedSeconds)}
                    </p>

                    {targetDurationSeconds > 0 ? (
                      <div className="mt-5 space-y-2 text-base">
                        <p className="text-slate-700">
                          Kvar: {formatTimerClock(timedSecondsRemaining)}
                        </p>

                        {timedSecondsOver > 0 ? (
                          <p className="font-medium text-amber-700">
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
                      className="rounded-2xl bg-green-600 px-5 py-5 text-lg font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Starta
                    </button>

                    <button
                      type="button"
                      onClick={stopTimedSet}
                      disabled={timedSetPhase !== "running"}
                      className="rounded-2xl bg-red-600 px-5 py-5 text-lg font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Stoppa
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-900">
                      Reps
                    </label>
                    <input
                      value={setLog.reps}
                      onChange={(e) =>
                        setSetLog((prev) => ({ ...prev, reps: e.target.value }))
                      }
                      inputMode="numeric"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xl font-semibold text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-900">
                      Vikt (kg)
                    </label>
                    <input
                      value={setLog.weight}
                      onChange={(e) =>
                        setSetLog((prev) => ({ ...prev, weight: e.target.value }))
                      }
                      inputMode="decimal"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xl font-semibold text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              )}

              {timedExercise ? (
                <div className="mt-6">
                  <label className="mb-2 block text-sm font-semibold text-slate-900">
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xl font-semibold text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
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
                        className="rounded-2xl bg-indigo-600 px-5 py-5 text-lg font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Spara set
                      </button>

                      <button
                        type="button"
                        onClick={skipExercise}
                        className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-lg font-semibold text-slate-900 transition hover:bg-slate-50"
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
                          className="rounded-2xl bg-indigo-600 px-5 py-5 text-lg font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Spara set
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={continueAfterSavedRepSet}
                          className="rounded-2xl bg-indigo-600 px-5 py-5 text-lg font-semibold text-white transition hover:bg-indigo-700"
                        >
                          {isLastSet ? "Avsluta övning" : "Nästa set"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={skipExercise}
                        className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-lg font-semibold text-slate-900 transition hover:bg-slate-50"
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
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-lg font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    Tillbaka
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void completeExerciseFeedback();
                    }}
                    disabled={disableFeedbackContinue}
                    className="rounded-2xl bg-indigo-600 px-5 py-5 text-lg font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLastExercise ? "Avsluta pass" : "Till nästa övning"}
                  </button>
                </div>
              )}
            </section>

            {/* Vilotimern visas inte medan tidsstyrt arbetsset pågår */}
            {showRestTimer && timedSetPhase !== "running" ? (
              <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
                  Vila
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Vilotimer
                </h2>

                <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 px-5 py-6 text-center">
                  <p className="text-6xl font-semibold tracking-tight text-slate-900 sm:text-7xl">
                    {formatTimerClock(restRemainingSeconds)}
                  </p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={toggleRestTimer}
                    className="rounded-2xl bg-indigo-600 px-5 py-5 text-lg font-semibold text-white transition hover:bg-indigo-700"
                  >
                    {restTimerRunning ? "Pausa" : "Starta"}
                  </button>

                  <button
                    type="button"
                    onClick={resetRestTimerToPreferred}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-lg font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    Återställ
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => adjustRestTimer(-15)}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-lg font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    -15 s
                  </button>

                  <button
                    type="button"
                    onClick={() => adjustRestTimer(15)}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-lg font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    +15 s
                  </button>
                </div>
              </section>
            ) : null}

            {showExerciseFeedback ? (
              <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
                  Utvärdering
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Hur gick övningen?
                </h2>

                {timedExercise ? (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-slate-900">
                      Ansträngning
                    </p>
                    <div className="mt-3 grid gap-3">
                      {TIMED_EFFORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSelectedTimedEffort(option.value)}
                          className={`rounded-2xl border px-5 py-5 text-left transition ${
                            selectedTimedEffort === option.value
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          <div className="text-lg font-semibold">{option.label}</div>
                          <div className="mt-1 text-sm">{option.description}</div>
                        </button>
                      ))}
                    </div>

                    {selectedTimedEffort ? (
                      <p className="mt-3 text-sm text-slate-500">
                        Vald nivå: {getTimedEffortLabel(selectedTimedEffort)}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-slate-900">
                      Extra reps
                    </p>
                    <div className="mt-3 grid gap-3">
                      {EXTRA_REP_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSelectedExtraReps(option.value)}
                          className={`rounded-2xl border px-5 py-5 text-left transition ${
                            selectedExtraReps === option.value
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          <div className="text-lg font-semibold">{option.label}</div>
                          <div className="mt-1 text-sm">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isNewExerciseForRating ? (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-slate-900">
                      Vad tyckte du om övningen?
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {RATING_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setSelectedRating(option)}
                          className={`rounded-2xl border px-5 py-3 text-base font-semibold transition ${
                            selectedRating === option
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowExerciseFeedback(false);
                      setSelectedExtraReps(null);
                      setSelectedTimedEffort(null);
                      setSelectedRating(null);
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-lg font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    Tillbaka
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void completeExerciseFeedback();
                    }}
                    disabled={disableFeedbackContinue}
                    className="rounded-2xl bg-indigo-600 px-5 py-5 text-lg font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLastExercise ? "Avsluta pass" : "Till nästa övning"}
                  </button>
                </div>
              </section>
            ) : null}
          </div>

          <div className="space-y-6">
            <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
                Just nu
              </p>

              <div className="mt-5 space-y-3">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Övning
                  </p>
                  <p className="mt-2 text-base font-semibold text-slate-900">
                    {exercise.name}
                  </p>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Setstatus
                  </p>
                  <p className="mt-2 text-base font-semibold text-slate-900">
                    Set {currentSet} av {exercise.sets}
                  </p>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Typ
                  </p>
                  <p className="mt-2 text-base font-semibold text-slate-900">
                    {timedExercise ? "Tidsstyrd övning" : "Repsbaserad övning"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
                Logg
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Loggade set
              </h2>

              {currentExerciseSummary?.sets?.length ? (
                <div className="mt-5 space-y-3">
                  {currentExerciseSummary.sets.map((set) => (
                    <div
                      key={`${set.setNumber}-${set.completedAt}`}
                      className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-900"
                    >
                      <span className="font-semibold">Set {set.setNumber}</span>
                      {set.actualReps !== null ? ` • ${set.actualReps} reps` : ""}
                      {set.actualDuration !== null
                        ? ` • ${set.actualDuration} sek`
                        : ""}
                      {set.actualWeight !== null ? ` • ${set.actualWeight} kg` : ""}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  Inga set sparade ännu.
                </p>
              )}

              <p className="mt-4 text-sm text-slate-500">
                Klara set i denna övning: {completedSetsForCurrentExercise} /{" "}
                {exercise.sets}
              </p>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
                Beskrivning
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Aktuell övning
              </h2>

              <p className="mt-3 text-sm leading-7 text-slate-600">
                {exercise.description?.trim()
                  ? exercise.description
                  : "Ingen beskrivning finns för den här övningen ännu."}
              </p>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}