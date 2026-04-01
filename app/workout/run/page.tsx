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
  id: number;
  email: string | null;
  username: string | null;
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

  // Hjälper oss att inte spela pip flera gånger för samma sekund.
  const lastCountdownSecondRef = useRef<number | null>(null);

  // Hindrar att stop-knappen startar vilotimern flera gånger för samma set.
  const hasStartedRestAfterStopRef = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const authData = await authRes.json();

        if (!authRes.ok || !authData?.ok || !authData.user) {
          router.replace("/");
          return;
        }

        const user = authData.user as AuthUser;
        const userId = String(user.id);
        const activeWorkout = getActiveWorkout(userId);

        setAuthUser(user);
        setAuthChecked(true);

        if (!activeWorkout) {
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
      } catch {
        router.replace("/");
      }
    }

    void load();
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
    timedExercise && typeof exercise.duration === "number" ? exercise.duration : 0;

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
    if (!timedExercise || isLastSet) {
      return;
    }

    if (hasStartedRestAfterStopRef.current) {
      return;
    }

    const preferredRest = getPreferredRestSeconds(exercise.id, exercise.rest);
    startRestTimer(preferredRest, exercise.id);
    hasStartedRestAfterStopRef.current = true;
  };

  const resetExerciseTimer = () => {
    setExerciseTimerRunning(false);
    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    lastCountdownSecondRef.current = null;
    hasStartedRestAfterStopRef.current = false;

    setSetLog((prev) => ({
      ...prev,
      durationSeconds: getDefaultDurationValue(exercise.duration),
    }));
  };

  const upsertCompletedSet = (params: {
    exerciseId: string;
    setNumber: number;
    actualWeight: number | null;
    actualReps: number | null;
    actualDuration: number | null;
  }) => {
    if (!userId) return;

    setCompletedExercises((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.exerciseId === params.exerciseId
      );

      if (existingIndex === -1) {
        const plannedExercise = exercises.find(
          (item) => item.id === params.exerciseId
        );

        if (!plannedExercise) return prev;

        const newExerciseLog = createEmptyExerciseLog(
          plannedExercise,
          !hasExerciseBeenRated(userId, plannedExercise.id)
        );

        const newSet: CompletedSet = {
          setNumber: params.setNumber,
          plannedReps: plannedExercise.reps ?? null,
          plannedDuration: plannedExercise.duration ?? null,
          plannedWeight: null,
          actualReps: params.actualReps,
          actualDuration: params.actualDuration,
          actualWeight: params.actualWeight,
          repsLeft: null,
          timedEffort: null,
          completedAt: new Date().toISOString(),
        };

        newExerciseLog.sets.push(newSet);
        return [...prev, newExerciseLog];
      }

      return prev.map((item, index) => {
        if (index !== existingIndex) return item;

        const newSet: CompletedSet = {
          setNumber: params.setNumber,
          plannedReps: item.plannedReps,
          plannedDuration: item.plannedDuration,
          plannedWeight: null,
          actualReps: params.actualReps,
          actualDuration: params.actualDuration,
          actualWeight: params.actualWeight,
          repsLeft: null,
          timedEffort: null,
          completedAt: new Date().toISOString(),
        };

        const updatedSets: CompletedSet[] = [
          ...item.sets.filter((set) => set.setNumber !== params.setNumber),
          newSet,
        ].sort((a, b) => a.setNumber - b.setNumber);

        return {
          ...item,
          sets: updatedSets,
        };
      });
    });
  };

  const goToNextExercise = () => {
    if (!isLastExercise) {
      const nextExerciseIndex = currentExerciseIndex + 1;
      const nextExercise = exercises[nextExerciseIndex];
      const nextWeight =
        nextExercise && userId
          ? lastWeightByExercise[nextExercise.id] ||
            getLastWeightForExercise(userId, nextExercise.id) ||
            ""
          : "";

      setCurrentExerciseIndex(nextExerciseIndex);
      setCurrentSet(1);
      setSetLog({
        reps: nextExercise ? getDefaultRepsValue(nextExercise.reps) : "",
        durationSeconds: nextExercise
          ? getDefaultDurationValue(nextExercise.duration)
          : "",
        weight: nextWeight,
        completed: false,
      });

      setShowExerciseFeedback(false);
      setSelectedExtraReps(null);
      setSelectedTimedEffort(null);
      setSelectedRating(null);
      setShowExerciseDescription(false);

      setExerciseTimerRunning(false);
      setExerciseTimerElapsedSeconds(0);
      setExerciseTimerAlarmPlayed(false);
      lastCountdownSecondRef.current = null;
      hasStartedRestAfterStopRef.current = false;

      stopRestTimer();
    }
  };

  const finishWorkout = async (finalExercises: CompletedExercise[]) => {
    if (!userId || !workout) return;

    const workoutLog = createWorkoutLog({
      userId,
      workout,
      startedAt: sessionStartedAt,
      exercises: finalExercises,
    });

    try {
      await saveWorkoutLogToApi({
        userId,
        workoutId: workout.id ?? null,
        workoutName: workout.name,
        startedAt: workoutLog.startedAt,
        completedAt: workoutLog.completedAt,
        durationSeconds: workoutLog.durationSeconds,
        status: workoutLog.status,
        exercises: finalExercises,
        context: {
          source: "run-page",
        },
        metadata: {
          storageVersion: 2,
        },
        events: [
          {
            eventType: "workout_saved",
            payload: {
              exerciseCount: finalExercises.length,
            },
          },
        ],
      });
    } catch (error) {
      console.error("Failed to save workout log to API", error);
    }

    saveWorkoutLog(workoutLog);
    setSavedWorkoutLog(workoutLog);
    setWorkoutFinished(true);
    setShowExerciseFeedback(false);
    setExerciseTimerRunning(false);
    stopRestTimer();
  };

  const completeSet = () => {
    if (!userId) return;

    dismissRestTimerForActiveSet();

    const currentWeight = setLog.weight.trim();

    const actualRepsValue = timedExercise
      ? null
      : toNullableNumber(
          setLog.reps.trim() || getDefaultRepsValue(exercise.reps)
        );

    const actualDurationValue = timedExercise
      ? exerciseTimerElapsedSeconds > 0
        ? exerciseTimerElapsedSeconds
        : toNullableNumber(
            setLog.durationSeconds.trim() ||
              getDefaultDurationValue(exercise.duration)
          )
      : null;

    if (currentWeight) {
      setLastWeightByExercise((prev) => ({
        ...prev,
        [exercise.id]: currentWeight,
      }));

      saveLastWeightForExercise(userId, exercise.id, currentWeight);
    }

    upsertCompletedSet({
      exerciseId: exercise.id,
      setNumber: currentSet,
      actualWeight: toNullableNumber(setLog.weight),
      actualReps: actualRepsValue,
      actualDuration: actualDurationValue,
    });

    if (!isLastSet) {
      const nextWeight =
        currentWeight ||
        lastWeightByExercise[exercise.id] ||
        getLastWeightForExercise(userId, exercise.id) ||
        "";

      setCurrentSet((prev) => prev + 1);
      setSetLog({
        reps: getDefaultRepsValue(exercise.reps),
        durationSeconds: getDefaultDurationValue(exercise.duration),
        weight: nextWeight,
        completed: false,
      });

      setExerciseTimerRunning(false);
      setExerciseTimerElapsedSeconds(0);
      setExerciseTimerAlarmPlayed(false);
      lastCountdownSecondRef.current = null;
      hasStartedRestAfterStopRef.current = false;

      // För vanliga övningar startar vilan här när setet sparas.
      // För tidsstyrda övningar startas den redan när användaren trycker Stop.
      if (!timedExercise) {
        const preferredRest = getPreferredRestSeconds(exercise.id, exercise.rest);
        startRestTimer(preferredRest, exercise.id);
      }

      return;
    }

    setExerciseTimerRunning(false);
    stopRestTimer();
    setShowExerciseFeedback(true);
    hasStartedRestAfterStopRef.current = false;
  };

  const completeExerciseFeedback = async () => {
    if (!userId) return;

    if (timedExercise) {
      if (selectedTimedEffort === null) return;
    } else {
      if (selectedExtraReps === null) return;
    }

    if (isNewExerciseForRating && selectedRating === null) return;

    saveExerciseFeedbackEntry(userId, {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      completedAt: new Date().toISOString(),
      extraReps: timedExercise ? undefined : selectedExtraReps ?? undefined,
      timedEffort: timedExercise
        ? selectedTimedEffort ?? undefined
        : undefined,
      rating: isNewExerciseForRating ? selectedRating ?? undefined : undefined,
    });

    const updatedExercises = completedExercises.map((item) =>
      item.exerciseId === exercise.id
        ? {
            ...item,
            extraReps: timedExercise ? null : selectedExtraReps,
            timedEffort: timedExercise ? selectedTimedEffort : null,
            rating: isNewExerciseForRating ? selectedRating : item.rating,
            sets: item.sets.map((set) => ({
              ...set,
              repsLeft: timedExercise ? null : selectedExtraReps,
              timedEffort: timedExercise ? selectedTimedEffort : null,
            })),
          }
        : item
    );

    if (isLastExercise) {
      await finishWorkout(updatedExercises);
      return;
    }

    setCompletedExercises(updatedExercises);
    goToNextExercise();
  };

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-700">Kontrollerar inloggning...</p>
        </div>
      </main>
    );
  }

  if (!workout || !userId) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Inget aktivt pass</h1>
          <p className="mt-2 text-sm text-gray-700">
            Det finns inget pass att köra just nu.
          </p>

          <button
            onClick={() => router.push("/home")}
            className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
          >
            Till startsidan
          </button>
        </div>
      </main>
    );
  }

  if (workoutFinished && savedWorkoutLog) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col p-4 pb-28">
          <header className="mb-4">
            <p className="text-sm text-gray-600">Pass avslutat</p>
            <h1 className="text-2xl font-bold text-gray-900">
              {savedWorkoutLog.workoutName}
            </h1>
          </header>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Summering</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="text-sm text-gray-600">Tid</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">
                  {formatDuration(savedWorkoutLog.durationSeconds)}
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="text-sm text-gray-600">Övningar</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">
                  {savedWorkoutLog.exercises.length}
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="text-sm text-gray-600">Set totalt</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">
                  {totalSetsCompleted}
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="text-sm text-gray-600">Volym</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">
                  {Math.round(totalVolume)} kg
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-600">
              Avslutat {formatDateTime(savedWorkoutLog.completedAt)}
            </p>

            <div className="mt-5 space-y-4">
              {savedWorkoutLog.exercises.map((loggedExercise) => (
                <div
                  key={loggedExercise.exerciseId}
                  className="rounded-2xl border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {loggedExercise.exerciseName}
                      </h3>

                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        {loggedExercise.extraReps !== null ? (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                            Extra reps:{" "}
                            {loggedExercise.extraReps === 6
                              ? "6+"
                              : loggedExercise.extraReps}
                          </span>
                        ) : null}

                        {loggedExercise.timedEffort !== null ? (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                            Kändes:{" "}
                            {getTimedEffortLabel(loggedExercise.timedEffort)}
                          </span>
                        ) : null}

                        {loggedExercise.rating !== null ? (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                            Betyg: {loggedExercise.rating}/5
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-sm text-gray-500">
                      {loggedExercise.sets.length} set
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {loggedExercise.sets.map((set) => {
                      const isTimedSet =
                        loggedExercise.plannedDuration !== null &&
                        loggedExercise.plannedDuration > 0 &&
                        loggedExercise.plannedReps == null;

                      return (
                        <div
                          key={`${loggedExercise.exerciseId}-${set.setNumber}`}
                          className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-800"
                        >
                          <span className="font-medium">Set {set.setNumber}</span>
                          {" • "}
                          {isTimedSet
                            ? set.actualDuration !== null
                              ? `${set.actualDuration} sek`
                              : "ingen tid angiven"
                            : set.actualReps !== null
                            ? `${set.actualReps} reps`
                            : "inga reps angivna"}
                          {" • "}
                          {set.actualWeight !== null
                            ? `${set.actualWeight} kg`
                            : "ingen vikt"}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
          <div className="mx-auto w-full max-w-md p-4">
            <button
              onClick={() => router.push("/home")}
              className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white"
            >
              Avsluta
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col p-4 pb-48">
        <header className="mb-4">
          <p className="text-sm text-gray-600">Pågående pass</p>
          <h1 className="text-2xl font-bold text-gray-900">{workout.name}</h1>
        </header>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-600">
            Övning {currentExerciseIndex + 1} av {exercises.length}
          </p>

          <h2 className="mt-2 text-2xl font-bold text-gray-950">
            {exercise.name}
          </h2>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
              Set {currentSet} / {exercise.sets}
            </span>

            {!timedExercise && exercise.reps ? (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                Mål: {exercise.reps} reps
              </span>
            ) : null}

            {timedExercise && exercise.duration ? (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                Mål: {exercise.duration} sek
              </span>
            ) : null}

            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
              Vila {getPreferredRestSeconds(exercise.id, exercise.rest)} sek
            </span>
          </div>

          {timedExercise ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-medium text-emerald-800">
                Timer för övningen
              </p>

              <div className="mt-3 text-center">
                <div className="text-5xl font-bold tracking-tight text-emerald-950">
                  {formatTimerClock(exerciseTimerElapsedSeconds)}
                </div>

                {targetDurationSeconds > 0 ? (
                  <div className="mt-3 space-y-1 text-sm">
                    {timedSecondsRemaining > 0 ? (
                      <p className="text-emerald-900">
                        Kvar till mål: {formatTimerClock(timedSecondsRemaining)}
                      </p>
                    ) : (
                      <p className="font-medium text-emerald-900">
                        Mål nått
                        {timedSecondsOver > 0
                          ? ` · över tid ${formatTimerClock(timedSecondsOver)}`
                          : ""}
                      </p>
                    )}

                    <p className="text-emerald-800">
                      Pip på 3, 2, 1 och längre pip när måltiden nås.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={startExerciseTimer}
                  className="rounded-2xl bg-green-600 px-4 py-5 text-lg font-bold text-white shadow-sm"
                >
                  Start
                </button>

                <button
                  type="button"
                  onClick={stopExerciseTimer}
                  className="rounded-2xl bg-red-600 px-4 py-5 text-lg font-bold text-white shadow-sm"
                >
                  Stop
                </button>
              </div>

              <button
                type="button"
                onClick={resetExerciseTimer}
                className="mt-3 w-full rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm font-medium text-emerald-950"
              >
                Nollställ timer
              </button>
            </div>
          ) : null}

          {exercise.description ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowExerciseDescription((prev) => !prev)}
                className="text-sm font-medium text-blue-700 underline underline-offset-2"
              >
                {showExerciseDescription ? "Dölj beskrivning" : "Visa beskrivning"}
              </button>

              {showExerciseDescription ? (
                <p className="mt-2 rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
                  {exercise.description}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {!showExerciseFeedback ? (
          <>
            <section className="mt-4 rounded-2xl border bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">
                Logga aktuellt set
              </h3>

              <div className="mt-4 grid gap-4">
                {timedExercise ? (
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-700">
                      Utförd tid i sekunder
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={setLog.durationSeconds}
                      onChange={(e) => {
                        dismissRestTimerForActiveSet();
                        hasStartedRestAfterStopRef.current = false;

                        setSetLog((prev) => ({
                          ...prev,
                          durationSeconds: e.target.value,
                        }));
                      }}
                      placeholder={
                        exercise.duration ? String(exercise.duration) : "Sekunder"
                      }
                      className="w-full rounded-xl border px-3 py-3 text-base text-gray-900 outline-none"
                    />
                  </label>
                ) : (
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-700">Utförda reps</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={setLog.reps}
                      onChange={(e) => {
                        dismissRestTimerForActiveSet();
                        setSetLog((prev) => ({ ...prev, reps: e.target.value }));
                      }}
                      placeholder={exercise.reps ? String(exercise.reps) : "Reps"}
                      className="w-full rounded-xl border px-3 py-3 text-base text-gray-900 outline-none"
                    />
                  </label>
                )}

                <label className="text-sm">
                  <span className="mb-1 block text-gray-700">Vikt kg</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={setLog.weight}
                    onChange={(e) => {
                      dismissRestTimerForActiveSet();
                      setSetLog((prev) => ({ ...prev, weight: e.target.value }));
                    }}
                    placeholder="Valfritt"
                    className="w-full rounded-xl border px-3 py-3 text-base text-gray-900 outline-none"
                  />
                </label>
              </div>

              <p className="mt-3 text-sm text-gray-600">
                {timedExercise
                  ? "För tidsstyrda övningar loggas tiden från timern. Du kan också justera värdet manuellt vid behov."
                  : "Förifyllda reps motsvarar det planerade antalet. Ändra bara om du faktiskt gjorde fler eller färre."}
              </p>

              {currentExerciseSummary ? (
                <p className="mt-3 text-xs text-gray-500">
                  Loggade set för övningen hittills: {currentExerciseSummary.sets.length}
                </p>
              ) : null}
            </section>

            {showRestTimer ? (
              <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <h3 className="text-base font-semibold text-emerald-950">
                  Vila till nästa set
                </h3>

                <div className="mt-3 text-4xl font-bold tracking-tight text-emerald-950">
                  {formatTimerClock(restRemainingSeconds)}
                </div>

                <p className="mt-2 text-sm text-emerald-900">
                  Sparad vila för övningen: {restDurationSeconds} sek
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={stopRestTimer}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-900"
                  >
                    Avbryt
                  </button>

                  <button
                    type="button"
                    onClick={() => adjustRestTimer(-15)}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-900"
                  >
                    −15 s
                  </button>

                  <button
                    type="button"
                    onClick={() => adjustRestTimer(15)}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-900"
                  >
                    +15 s
                  </button>

                  <button
                    type="button"
                    onClick={toggleRestTimer}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-900"
                  >
                    {restTimerRunning ? "Pausa" : "Fortsätt"}
                  </button>

                  <button
                    type="button"
                    onClick={resetRestTimerToPreferred}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-900"
                  >
                    Starta om
                  </button>
                </div>

                <p className="mt-3 text-xs text-emerald-900">
                  Timern stängs automatiskt när du börjar nästa set.
                </p>
              </section>
            ) : null}
          </>
        ) : (
          <section className="mt-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">
              Hur kändes övningen?
            </h3>

            {timedExercise ? (
              <>
                <p className="mt-2 text-sm text-gray-700">
                  För tidsstyrda övningar: välj hur ansträngande setet kändes.
                </p>

                <div className="mt-4 grid gap-3">
                  {TIMED_EFFORT_OPTIONS.map((option) => {
                    const active = selectedTimedEffort === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedTimedEffort(option.value)}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          active
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-200 bg-white text-gray-900"
                        }`}
                      >
                        <div className="font-semibold">{option.label}</div>
                        <div
                          className={`mt-1 text-sm ${
                            active ? "text-blue-50" : "text-gray-600"
                          }`}
                        >
                          {option.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-gray-700">
                  Hur många extra repetitioner tror du att du hade klarat i slutet?
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {EXTRA_REP_OPTIONS.map((option) => {
                    const active = selectedExtraReps === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSelectedExtraReps(option)}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          active
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-200 bg-white text-gray-900"
                        }`}
                      >
                        <div className="font-semibold">
                          {option === 6 ? "6+" : option} extra reps
                        </div>
                        <div
                          className={`mt-1 text-sm ${
                            active ? "text-blue-50" : "text-gray-600"
                          }`}
                        >
                          {option === 0 && "Tungt"}
                          {option === 2 && "Lagom"}
                          {option === 4 && "Lite lätt"}
                          {option === 6 && "För lätt"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {isNewExerciseForRating ? (
              <>
                <h3 className="mt-6 text-base font-semibold text-gray-900">
                  Vad tyckte du om övningen?
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  Eftersom du inte gjort den tidigare får du gärna sätta ett betyg.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  {RATING_OPTIONS.map((rating) => {
                    const active = selectedRating === rating;

                    return (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setSelectedRating(rating)}
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-base font-semibold transition ${
                          active
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-200 bg-white text-gray-900"
                        }`}
                      >
                        {rating}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  1 = dålig, 5 = mycket bra
                </p>
              </>
            ) : null}
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md gap-3 p-4">
          {!showExerciseFeedback ? (
            <>
              <button
                type="button"
                onClick={() => router.push("/workout/preview")}
                className="flex-1 rounded-2xl border px-4 py-3 text-base font-semibold text-gray-900"
              >
                Tillbaka
              </button>

              <button
                type="button"
                onClick={completeSet}
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
              >
                {timedExercise
                  ? isLastSet
                    ? "Avsluta övning"
                    : "Spara set"
                  : isLastSet
                  ? "Avsluta övning"
                  : "Nästa set"}
              </button>
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
      </div>
    </main>
  );
}