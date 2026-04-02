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

const EXTRA_REP_OPTIONS: ExtraRepsOption[] = [0, 2, 4, 6];

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

  // Timer för tidsstyrda övningar.
  const [exerciseTimerRunning, setExerciseTimerRunning] = useState(false);
  const [exerciseTimerElapsedSeconds, setExerciseTimerElapsedSeconds] =
    useState(0);
  const [exerciseTimerAlarmPlayed, setExerciseTimerAlarmPlayed] =
    useState(false);

  // Vilotimer mellan set.
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerRunning, setRestTimerRunning] = useState(false);
  const [restDurationSeconds, setRestDurationSeconds] = useState(0);
  const [restRemainingSeconds, setRestRemainingSeconds] = useState(0);

  // Hindrar upprepade pip.
  const lastCountdownSecondRef = useRef<number | null>(null);

  // Hindrar dubbelstart av vila efter stop.
  const hasStartedRestAfterStopRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
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

        // Nytt auth-format: { user }
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
        activeWorkout.exercises.forEach((exercise) => {
          const savedWeight = getLastWeightForExercise(userId, exercise.id);
          if (savedWeight) {
            initialWeights[exercise.id] = savedWeight;
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
        lastCountdownSecondRef.current = null;
        hasStartedRestAfterStopRef.current = false;
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
    if (!exerciseTimerRunning) return;

    const timeout = window.setTimeout(() => {
      setExerciseTimerElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [exerciseTimerRunning, exerciseTimerElapsedSeconds]);

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
    if (!timedExercise || !exerciseTimerRunning || targetDurationSeconds <= 0) {
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
    exerciseTimerRunning,
    targetDurationSeconds,
    exerciseTimerElapsedSeconds,
    exerciseTimerAlarmPlayed,
  ]);

  useEffect(() => {
    if (!workout) return;
    if (!timedExercise) return;

    setSetLog((prev) => ({
      ...prev,
      durationSeconds: String(exerciseTimerElapsedSeconds),
    }));
  }, [exerciseTimerElapsedSeconds, workout, timedExercise]);

  const currentExerciseSummary = useMemo(() => {
    return completedExercises.find((item) => item.exerciseId === exercise.id) ?? null;
  }, [completedExercises, exercise.id]);

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
    : 0;

  const disableFeedbackContinue = timedExercise
    ? selectedTimedEffort === null ||
      (isNewExerciseForRating && selectedRating === null)
    : selectedExtraReps === null ||
      (isNewExerciseForRating && selectedRating === null);

  const getPreferredRestSeconds = (exerciseId: string, defaultRest: number) => {
    if (!userId) return defaultRest;
    return getLastRestForExercise(userId, exerciseId) ?? defaultRest;
  };

  const startRestTimer = (seconds: number, exerciseId?: string) => {
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
  };

  const stopRestTimer = () => {
    setShowRestTimer(false);
    setRestTimerRunning(false);
    setRestDurationSeconds(0);
    setRestRemainingSeconds(0);
  };

  const dismissRestTimerForActiveSet = () => {
    // Dölj vilotimern så fort användaren börjar nästa set.
    stopRestTimer();
  };

  const adjustRestTimer = (deltaSeconds: number) => {
    const nextDuration = Math.max(5, restDurationSeconds + deltaSeconds);
    const nextRemaining = Math.max(5, restRemainingSeconds + deltaSeconds);

    setShowRestTimer(true);
    setRestDurationSeconds(nextDuration);
    setRestRemainingSeconds(nextRemaining);

    if (userId) {
      saveLastRestForExercise(userId, exercise.id, nextDuration);
    }
  };

  const toggleRestTimer = () => {
    if (!showRestTimer) return;
    setRestTimerRunning((prev) => !prev);
  };

  const resetRestTimerToPreferred = () => {
    const preferredRest = getPreferredRestSeconds(exercise.id, exercise.rest);
    startRestTimer(preferredRest, exercise.id);
  };

  const startExerciseTimer = () => {
    dismissRestTimerForActiveSet();
    hasStartedRestAfterStopRef.current = false;

    if (exerciseTimerElapsedSeconds === 0) {
      setSetLog((prev) => ({
        ...prev,
        durationSeconds: "0",
      }));
    }

    setExerciseTimerRunning(true);
  };

  const stopExerciseTimer = () => {
    setExerciseTimerRunning(false);

    setSetLog((prev) => ({
      ...prev,
      durationSeconds: String(exerciseTimerElapsedSeconds),
    }));

    // Starta vila direkt när användaren trycker stop på tidsstyrd övning,
    // men bara om det inte är sista setet på övningen.
    if (!isLastSet && !hasStartedRestAfterStopRef.current) {
      const preferredRest = getPreferredRestSeconds(exercise.id, exercise.rest);
      startRestTimer(preferredRest, exercise.id);
      hasStartedRestAfterStopRef.current = true;
    }
  };

  const startNextSet = () => {
    const nextSetNumber = currentSet + 1;

    setCurrentSet(nextSetNumber);
    setSetLog({
      reps: getDefaultRepsValue(exercise.reps),
      durationSeconds: getDefaultDurationValue(exercise.duration),
      weight: lastWeightByExercise[exercise.id] ?? "",
      completed: false,
    });

    setExerciseTimerRunning(false);
    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    lastCountdownSecondRef.current = null;
    hasStartedRestAfterStopRef.current = false;
    dismissRestTimerForActiveSet();
    setShowExerciseDescription(false);
  };

  const goToNextExercise = () => {
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

    setExerciseTimerRunning(false);
    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    lastCountdownSecondRef.current = null;
    hasStartedRestAfterStopRef.current = false;
    dismissRestTimerForActiveSet();
    setShowExerciseDescription(false);
  };

  const completeSet = () => {
    if (!userId) return;
    if (!exercise) return;
    if (setLog.completed) return;

    if (!timedExercise && !setLog.reps.trim()) {
      return;
    }

    if (timedExercise && !setLog.durationSeconds.trim()) {
      return;
    }

    const currentExerciseLog = currentExerciseSummary
      ? currentExerciseSummary
      : createEmptyExerciseLog({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          plannedSets: exercise.sets,
          plannedReps: exercise.reps ?? null,
          plannedDuration: exercise.duration ?? null,
          isNewExercise: isNewExerciseForRating,
        });

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
      ...currentExerciseLog,
      sets: [...currentExerciseLog.sets, newSet],
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

    if (!isLastSet) {
      const preferredRest = getPreferredRestSeconds(exercise.id, exercise.rest);
      startRestTimer(preferredRest, exercise.id);
    }

    if (!timedExercise) {
      setExerciseTimerRunning(false);
      setExerciseTimerElapsedSeconds(0);
      setExerciseTimerAlarmPlayed(false);
    }
  };

  const openFeedbackForCompletedExercise = () => {
    const summary =
      completedExercises.find((item) => item.exerciseId === exercise.id) ?? null;

    if (!summary) return;

    setSelectedExtraReps(summary.extraReps ?? null);
    setSelectedTimedEffort(summary.timedEffort ?? null);
    setSelectedRating(summary.rating ?? null);
    setShowExerciseFeedback(true);
  };

  const continueAfterSavedSet = () => {
    if (!setLog.completed) return;

    if (isLastSet) {
      openFeedbackForCompletedExercise();
      return;
    }

    startNextSet();
  };

  const completeExerciseFeedback = async () => {
    setCompletedExercises((prev) =>
      prev.map((item) => {
        if (item.exerciseId !== exercise.id) return item;

        return {
          ...item,
          extraReps: timedExercise ? null : selectedExtraReps,
          timedEffort: timedExercise ? selectedTimedEffort : null,
          rating: isNewExerciseForRating ? selectedRating : item.rating,
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
  };

  const finishWorkout = async (status: "completed" | "aborted") => {
    if (!workout || !userId) return;

    const completedAt = new Date().toISOString();

    const workoutLog = createWorkoutLog({
      userId,
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: sessionStartedAt,
      completedAt,
      status,
      exercises: completedExercises,
    });

    saveWorkoutLog(userId, workoutLog);

    try {
      await saveWorkoutLogToApi(workoutLog);
    } catch (error) {
      console.error("Could not save workout log to API", error);
    }

    setSavedWorkoutLog(workoutLog);
    setWorkoutFinished(true);
  };

  if (!authChecked) {
    return <div className="p-6">Kontrollerar inloggning...</div>;
  }

  if (!workout || !userId) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-3xl font-bold text-gray-950">Inget aktivt pass</h1>
        <p className="mt-2 text-sm text-gray-800">
          Det finns inget pass att köra just nu.
        </p>
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
        >
          Till startsidan
        </button>
      </main>
    );
  }

  if (workoutFinished && savedWorkoutLog) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-gray-700">
          {formatDateTime(savedWorkoutLog.completedAt)}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-950">
          Passet är klart
        </h1>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-700">Tid</p>
            <p className="mt-1 font-semibold text-gray-950">
              {formatDuration(savedWorkoutLog.durationSeconds)}
            </p>
          </div>

          <div className="rounded-2xl bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-700">
              Övningar
            </p>
            <p className="mt-1 font-semibold text-gray-950">
              {savedWorkoutLog.exercises.length}
            </p>
          </div>

          <div className="rounded-2xl bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-700">Set</p>
            <p className="mt-1 font-semibold text-gray-950">
              {totalSetsCompleted}
            </p>
          </div>

          <div className="rounded-2xl bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-700">
              Volym
            </p>
            <p className="mt-1 font-semibold text-gray-950">
              {Math.round(totalVolume)} kg
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/home")}
          className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
        >
          Till startsidan
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <button
        type="button"
        onClick={() => void finishWorkout("aborted")}
        className="text-sm font-medium text-blue-700 underline underline-offset-2"
      >
        Avsluta pass
      </button>

      <p className="mt-4 text-sm text-gray-700">
        Övning {currentExerciseIndex + 1} av {exercises.length}
      </p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">{exercise.name}</h1>

      <p className="mt-2 text-sm text-gray-800">
        Set {currentSet} av {exercise.sets}
      </p>

      {exercise.description ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setShowExerciseDescription((prev) => !prev)}
            className="text-sm font-semibold text-gray-900"
          >
            {showExerciseDescription ? "Dölj beskrivning" : "Visa beskrivning"}
          </button>

          {showExerciseDescription ? (
            <p className="mt-3 text-sm text-gray-800">{exercise.description}</p>
          ) : null}
        </div>
      ) : null}

      <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
        {timedExercise ? (
          <>
            <p className="text-sm text-gray-800">
              Måltid: {targetDurationSeconds} sekunder
            </p>

            <p className="mt-4 text-5xl font-bold text-gray-950">
              {formatTimerClock(exerciseTimerElapsedSeconds)}
            </p>

            {targetDurationSeconds > 0 ? (
              <div className="mt-3 space-y-1 text-sm">
                <p className="text-gray-800">
                  Kvar: {formatTimerClock(timedSecondsRemaining)}
                </p>

                {timedSecondsOver > 0 ? (
                  <p className="text-amber-700">
                    Övertid: {formatTimerClock(timedSecondsOver)}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={startExerciseTimer}
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
              >
                Starta
              </button>

              <button
                type="button"
                onClick={stopExerciseTimer}
                className="flex-1 rounded-2xl border px-4 py-3 font-semibold text-gray-900"
              >
                Stoppa
              </button>
            </div>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                Reps
              </label>
              <input
                value={setLog.reps}
                onChange={(e) =>
                  setSetLog((prev) => ({ ...prev, reps: e.target.value }))
                }
                inputMode="numeric"
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                Vikt (kg)
              </label>
              <input
                value={setLog.weight}
                onChange={(e) =>
                  setSetLog((prev) => ({ ...prev, weight: e.target.value }))
                }
                inputMode="decimal"
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
              />
            </div>
          </div>
        )}

        {timedExercise ? (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">
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
              className="w-full rounded-xl border px-3 py-3 text-base outline-none"
            />
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          {!showExerciseFeedback ? (
            <>
              <button
                type="button"
                onClick={() => router.push("/workout/preview")}
                className="flex-1 rounded-2xl border px-4 py-3 text-base font-semibold text-gray-900"
              >
                Tillbaka
              </button>

              {!setLog.completed ? (
                <button
                  type="button"
                  onClick={completeSet}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
                >
                  Spara set
                </button>
              ) : (
                <button
                  type="button"
                  onClick={continueAfterSavedSet}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
                >
                  {isLastSet ? "Avsluta övning" : "Nästa set"}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowExerciseFeedback(false);
                  setSelectedExtraReps(null);
                  setSelectedTimedEffort(null);
                  setSelectedRating(null);
                }}
                className="flex-1 rounded-2xl border px-4 py-3 text-base font-semibold text-gray-900"
              >
                Tillbaka
              </button>

              <button
                type="button"
                onClick={() => {
                  void completeExerciseFeedback();
                }}
                disabled={disableFeedbackContinue}
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
              >
                {isLastExercise ? "Avsluta pass" : "Nästa övning"}
              </button>
            </>
          )}
        </div>
      </section>

      {showRestTimer ? (
        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Vilotimer</h2>

          <p className="mt-3 text-4xl font-bold text-gray-950">
            {formatTimerClock(restRemainingSeconds)}
          </p>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={toggleRestTimer}
              className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              {restTimerRunning ? "Pausa" : "Starta"}
            </button>

            <button
              type="button"
              onClick={resetRestTimerToPreferred}
              className="flex-1 rounded-2xl border px-4 py-3 font-semibold text-gray-900"
            >
              Återställ
            </button>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => adjustRestTimer(-15)}
              className="flex-1 rounded-2xl border px-4 py-3 font-semibold text-gray-900"
            >
              -15 s
            </button>

            <button
              type="button"
              onClick={() => adjustRestTimer(15)}
              className="flex-1 rounded-2xl border px-4 py-3 font-semibold text-gray-900"
            >
              +15 s
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">
          Loggade set för övningen hittills
        </h2>

        {currentExerciseSummary?.sets?.length ? (
          <div className="mt-3 space-y-2">
            {currentExerciseSummary.sets.map((set) => (
              <div
                key={`${set.setNumber}-${set.completedAt}`}
                className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-900"
              >
                Set {set.setNumber} •{" "}
                {set.actualReps !== null ? `${set.actualReps} reps` : "inga reps"}
                {set.actualDuration !== null ? ` • ${set.actualDuration} sek` : ""}
                {set.actualWeight !== null ? ` • ${set.actualWeight} kg` : ""}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-800">Inga set sparade ännu.</p>
        )}
      </section>

      {showExerciseFeedback ? (
        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            Hur gick övningen?
          </h2>

          {timedExercise ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-900">Ansträngning</p>
              <div className="mt-2 grid gap-2">
                {TIMED_EFFORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedTimedEffort(option.value)}
                    className={`rounded-xl border px-3 py-3 text-left ${
                      selectedTimedEffort === option.value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "text-gray-900"
                    }`}
                  >
                    <div className="font-semibold">{option.label}</div>
                    <div className="text-sm">{option.description}</div>
                  </button>
                ))}
              </div>

              {selectedTimedEffort ? (
                <p className="mt-2 text-sm text-gray-700">
                  Vald nivå: {getTimedEffortLabel(selectedTimedEffort)}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-900">Extra reps</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EXTRA_REP_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedExtraReps(option)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                      selectedExtraReps === option
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "text-gray-900"
                    }`}
                  >
                    {option === 6 ? "6+" : option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isNewExerciseForRating ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-900">Betyg</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {RATING_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedRating(option)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                      selectedRating === option
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "text-gray-900"
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
    </main>
  );
}