"use client";

import { useEffect, useState } from "react";
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
import type { Workout } from "../../../types/workout";

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

function playTimerSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      // @ts-expect-error Safari fallback
      window.webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.03;
    gainNode.connect(audioContext.destination);

    const oscillator1 = audioContext.createOscillator();
    oscillator1.type = "sine";
    oscillator1.frequency.value = 660;
    oscillator1.connect(gainNode);

    const oscillator2 = audioContext.createOscillator();
    oscillator2.type = "sine";
    oscillator2.frequency.value = 880;
    oscillator2.connect(gainNode);

    const now = audioContext.currentTime;
    oscillator1.start(now);
    oscillator1.stop(now + 0.18);
    oscillator2.start(now + 0.12);
    oscillator2.stop(now + 0.32);

    window.setTimeout(() => {
      void audioContext.close();
    }, 600);
  } catch (error) {
    console.error("Could not play timer sound", error);
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
    if (!workout) return;

    const currentExercise = workout.exercises[currentExerciseIndex];
    if (!currentExercise || !isTimedExercise(currentExercise)) return;

    const targetSeconds = currentExercise.duration ?? 0;
    if (targetSeconds <= 0) return;

    if (
      exerciseTimerRunning &&
      !exerciseTimerAlarmPlayed &&
      exerciseTimerElapsedSeconds >= targetSeconds
    ) {
      playTimerSound();
      setExerciseTimerAlarmPlayed(true);
    }
  }, [
    workout,
    currentExerciseIndex,
    exerciseTimerRunning,
    exerciseTimerElapsedSeconds,
    exerciseTimerAlarmPlayed,
  ]);

  useEffect(() => {
    if (!workout) return;

    const currentExercise = workout.exercises[currentExerciseIndex];
    if (!currentExercise || !isTimedExercise(currentExercise)) return;

    setSetLog((prev) => ({
      ...prev,
      durationSeconds: String(exerciseTimerElapsedSeconds),
    }));
  }, [exerciseTimerElapsedSeconds, workout, currentExerciseIndex]);

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
    playTimerSound();
  }, [showRestTimer, restTimerRunning, restRemainingSeconds]);

  const userId = authUser ? String(authUser.id) : null;

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

  const currentExercise = workout.exercises[currentExerciseIndex];
  const completedSetsForCurrentExercise =
    completedExercises.find(
      (exercise) => exercise.exerciseId === currentExercise?.id
    )?.sets.length ?? 0;

  function resetSetInputForExercise(exerciseIndex: number) {
    const nextExercise = workout?.exercises[exerciseIndex];
    if (!nextExercise || !userId) return;

    const savedWeight = getLastWeightForExercise(userId, nextExercise.id);

    setSetLog({
      reps: getDefaultRepsValue(nextExercise.reps),
      durationSeconds: getDefaultDurationValue(nextExercise.duration),
      weight: savedWeight,
      completed: false,
    });

    setExerciseTimerRunning(false);
    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    setShowExerciseDescription(false);
  }

  function getOrCreateExerciseLog(exercise: Workout["exercises"][number]) {
    const existing = completedExercises.find(
      (item) => item.exerciseId === exercise.id
    );

    if (existing) {
      return existing;
    }

    const isNewExercise =
      !hasExerciseBeenRated(userId, exercise.id) &&
      !completedExercises.some((item) => item.exerciseId === exercise.id);

    return createEmptyExerciseLog({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      plannedSets: exercise.sets,
      plannedReps: exercise.reps ?? null,
      plannedDuration: exercise.duration ?? null,
      isNewExercise,
    });
  }

  function saveCurrentSet() {
    if (!currentExercise || !userId) return;

    const currentExerciseLog = getOrCreateExerciseLog(currentExercise);

    const actualReps = isTimedExercise(currentExercise)
      ? null
      : toNullableNumber(setLog.reps);
    const actualDuration = isTimedExercise(currentExercise)
      ? toNullableNumber(setLog.durationSeconds)
      : null;
    const actualWeight = toNullableNumber(setLog.weight);

    const nextSetNumber = currentExerciseLog.sets.length + 1;

    const newSet: CompletedSet = {
      setNumber: nextSetNumber,
      plannedReps: currentExercise.reps ?? null,
      plannedDuration: currentExercise.duration ?? null,
      plannedWeight: toNullableNumber(
        lastWeightByExercise[currentExercise.id] ?? ""
      ),
      actualReps,
      actualDuration,
      actualWeight,
      repsLeft: null,
      completedAt: new Date().toISOString(),
    };

    if (actualWeight !== null) {
      saveLastWeightForExercise(userId, currentExercise.id, String(actualWeight));
      setLastWeightByExercise((prev) => ({
        ...prev,
        [currentExercise.id]: String(actualWeight),
      }));
    }

    const updatedExerciseLog: CompletedExercise = {
      ...currentExerciseLog,
      sets: [...currentExerciseLog.sets, newSet],
    };

    setCompletedExercises((prev) => {
      const exists = prev.some(
        (exercise) => exercise.exerciseId === currentExercise.id
      );

      if (exists) {
        return prev.map((exercise) =>
          exercise.exerciseId === currentExercise.id
            ? updatedExerciseLog
            : exercise
        );
      }

      return [...prev, updatedExerciseLog];
    });

    setSetLog((prev) => ({
      ...prev,
      completed: true,
    }));

    const preferredRest = getLastRestForExercise(userId, currentExercise.id);
    const restSeconds = preferredRest || currentExercise.rest || 0;

    if (restSeconds > 0) {
      setShowRestTimer(true);
      setRestDurationSeconds(restSeconds);
      setRestRemainingSeconds(restSeconds);
      setRestTimerRunning(false);
      saveLastRestForExercise(userId, currentExercise.id, restSeconds);
    }
  }

  function moveToNextSetOrExercise() {
    if (!currentExercise) return;

    const currentExerciseLog = completedExercises.find(
      (exercise) => exercise.exerciseId === currentExercise.id
    );

    const completedSetCount = currentExerciseLog?.sets.length ?? 0;
    const hasFinishedAllSets = completedSetCount >= currentExercise.sets;

    if (!hasFinishedAllSets) {
      const nextSetNumber = completedSetCount + 1;
      setCurrentSet(nextSetNumber);
      setSetLog({
        reps: getDefaultRepsValue(currentExercise.reps),
        durationSeconds: getDefaultDurationValue(currentExercise.duration),
        weight: lastWeightByExercise[currentExercise.id] ?? "",
        completed: false,
      });
      setExerciseTimerRunning(false);
      setExerciseTimerElapsedSeconds(0);
      setExerciseTimerAlarmPlayed(false);
      return;
    }

    const exerciseLog = completedExercises.find(
      (exercise) => exercise.exerciseId === currentExercise.id
    );

    const isNewExercise = exerciseLog?.isNewExercise ?? false;

    if (exerciseLog && (isNewExercise || exerciseLog.extraReps === null)) {
      setSelectedExtraReps(exerciseLog.extraReps);
      setSelectedRating(exerciseLog.rating);
      setShowExerciseFeedback(true);
      return;
    }

    const nextExerciseIndex = currentExerciseIndex + 1;

    if (nextExerciseIndex >= workout.exercises.length) {
      finishWorkout("completed");
      return;
    }

    setCurrentExerciseIndex(nextExerciseIndex);
    setCurrentSet(1);
    resetSetInputForExercise(nextExerciseIndex);
  }

  async function saveExerciseFeedbackAndContinue() {
    if (!currentExercise || !userId) return;

    setCompletedExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.exerciseId !== currentExercise.id) return exercise;

        return {
          ...exercise,
          extraReps: selectedExtraReps,
          rating: exercise.isNewExercise ? selectedRating : exercise.rating,
        };
      })
    );

    saveExerciseFeedbackEntry(userId, currentExercise.id, {
      extraReps: selectedExtraReps,
      rating: selectedRating,
    });

    setShowExerciseFeedback(false);
    setSelectedExtraReps(null);
    setSelectedRating(null);

    const nextExerciseIndex = currentExerciseIndex + 1;

    if (nextExerciseIndex >= workout.exercises.length) {
      finishWorkout("completed");
      return;
    }

    setCurrentExerciseIndex(nextExerciseIndex);
    setCurrentSet(1);
    resetSetInputForExercise(nextExerciseIndex);
  }

  async function finishWorkout(status: "completed" | "aborted") {
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
  }

  function toggleExerciseTimer() {
    setExerciseTimerRunning((prev) => !prev);
  }

  function stopExerciseTimer() {
    setExerciseTimerRunning(false);
  }

  function startRestTimer() {
    if (restRemainingSeconds <= 0) {
      setRestRemainingSeconds(restDurationSeconds);
    }
    setRestTimerRunning(true);
  }

  function stopRestTimer() {
    setRestTimerRunning(false);
  }

  function adjustRestTimer(deltaSeconds: number) {
    const nextDuration = Math.max(0, restDurationSeconds + deltaSeconds);
    setRestDurationSeconds(nextDuration);
    setRestRemainingSeconds(nextDuration);
  }

  if (workoutFinished && savedWorkoutLog) {
    const totalSets = savedWorkoutLog.exercises.reduce(
      (sum, exercise) => sum + exercise.sets.length,
      0
    );

    const totalVolume = savedWorkoutLog.exercises.reduce((sum, exercise) => {
      return (
        sum +
        exercise.sets.reduce((setSum, set) => {
          if (set.actualWeight == null || set.actualReps == null) return setSum;
          return setSum + set.actualWeight * set.actualReps;
        }, 0)
      );
    }, 0);

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
            <p className="mt-1 font-semibold text-gray-950">{totalSets}</p>
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

  if (!currentExercise) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold text-gray-950">
          Passet kunde inte laddas
        </h1>
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

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <button
        type="button"
        onClick={() => finishWorkout("aborted")}
        className="text-sm font-medium text-blue-700 underline underline-offset-2"
      >
        Avsluta pass
      </button>

      <p className="mt-4 text-sm text-gray-700">
        Övning {currentExerciseIndex + 1} av {workout.exercises.length}
      </p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">
        {currentExercise.name}
      </h1>

      <p className="mt-2 text-sm text-gray-800">
        Set {currentSet} av {currentExercise.sets}
      </p>

      {currentExercise.description ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setShowExerciseDescription((prev) => !prev)}
            className="text-sm font-semibold text-gray-900"
          >
            {showExerciseDescription ? "Dölj beskrivning" : "Visa beskrivning"}
          </button>

          {showExerciseDescription ? (
            <p className="mt-3 text-sm text-gray-800">
              {currentExercise.description}
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
        {isTimedExercise(currentExercise) ? (
          <>
            <p className="text-sm text-gray-800">
              Måltid: {currentExercise.duration} sekunder
            </p>
            <p className="mt-4 text-5xl font-bold text-gray-950">
              {formatTimerClock(exerciseTimerElapsedSeconds)}
            </p>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={toggleExerciseTimer}
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
              >
                {exerciseTimerRunning ? "Pausa" : "Starta"}
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

        {isTimedExercise(currentExercise) ? (
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
          <button
            type="button"
            onClick={saveCurrentSet}
            disabled={setLog.completed}
            className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            Spara set
          </button>

          <button
            type="button"
            onClick={moveToNextSetOrExercise}
            className="flex-1 rounded-2xl border px-4 py-3 font-semibold text-gray-900"
          >
            Nästa
          </button>
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
              onClick={startRestTimer}
              className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              Starta
            </button>

            <button
              type="button"
              onClick={stopRestTimer}
              className="flex-1 rounded-2xl border px-4 py-3 font-semibold text-gray-900"
            >
              Stoppa
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
          Klara set i denna övning
        </h2>
        <p className="mt-2 text-sm text-gray-800">
          {completedSetsForCurrentExercise} / {currentExercise.sets} set sparade
        </p>
      </section>

      {showExerciseFeedback ? (
        <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            Hur gick övningen?
          </h2>

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

          <button
            type="button"
            onClick={saveExerciseFeedbackAndContinue}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
          >
            Fortsätt
          </button>
        </section>
      ) : null}
    </main>
  );
}