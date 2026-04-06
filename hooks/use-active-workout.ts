"use client";

// Central state-motor för /run
// All logik för set, timer, vikt, navigation ligger här
// Offline-first: sparar direkt till localStorage via active-workout-session-storage

import { useEffect, useMemo, useState } from "react";
import {
  getActiveWorkoutSessionDraft,
  saveActiveWorkoutSessionDraft,
} from "@/lib/active-workout-session-storage";
import type { Workout } from "@/types/workout";

type TimerState = "idle" | "running" | "ready_to_save";

type UseActiveWorkoutProps = {
  userId: string;
  workout: Workout | null;
};

export function useActiveWorkout({ userId, workout }: UseActiveWorkoutProps) {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);

  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved"
  >("idle");

  // =========================
  // INIT (restore från localStorage)
  // =========================
  useEffect(() => {
    if (!userId || !workout) return;

    const draft = getActiveWorkoutSessionDraft(userId);

    if (!draft) return;

    // Restore state
    setCurrentExerciseIndex(draft.currentExerciseIndex);
    setCurrentSet(draft.currentSet);
    setWeight(draft.setLog.weight);
    setReps(draft.setLog.reps);
    setElapsedSeconds(draft.exerciseTimerElapsedSeconds);
    setTimerState(draft.timedSetPhase);
  }, [userId, workout]);

  // =========================
  // DERIVED
  // =========================
  const currentExercise = useMemo(() => {
    if (!workout) return null;
    return workout.exercises[currentExerciseIndex];
  }, [workout, currentExerciseIndex]);

  const isTimed = useMemo(() => {
    return (
      currentExercise &&
      currentExercise.duration &&
      !currentExercise.reps
    );
  }, [currentExercise]);

  // =========================
  // SAVE (offline-first)
  // =========================
  function persist() {
    if (!userId || !workout) return;

    setSaveStatus("saving");

    saveActiveWorkoutSessionDraft(userId, {
      workoutId: workout.id ?? null,
      workoutName: workout.name,
      sessionStartedAt: new Date().toISOString(),
      currentExerciseIndex,
      currentSet,
      lastWeightByExercise: {},
      setLog: {
        reps,
        durationSeconds: String(elapsedSeconds),
        weight,
        completed: false,
      },
      completedExercises: [],
      showExerciseFeedback: false,
      selectedExtraReps: null,
      selectedTimedEffort: null,
      selectedRating: null,
      exerciseTimerElapsedSeconds: elapsedSeconds,
      exerciseTimerAlarmPlayed: false,
      timedSetPhase: timerState,
      showRestTimer: false,
      restTimerRunning: false,
      restDurationSeconds: 0,
      restRemainingSeconds: 0,
    });

    setTimeout(() => setSaveStatus("saved"), 200);
  }

  // =========================
  // AUTO SAVE
  // =========================
  useEffect(() => {
    persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentExerciseIndex,
    currentSet,
    weight,
    reps,
    elapsedSeconds,
    timerState,
  ]);

  // =========================
  // TIMER LOGIC
  // =========================
  useEffect(() => {
    if (timerState !== "running") return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timerState]);

  function startTimer() {
    setTimerState("running");
  }

  function stopTimer() {
    setTimerState("ready_to_save");
  }

  function resetTimer() {
    setElapsedSeconds(0);
    setTimerState("idle");
  }

  // =========================
  // SET SAVE
  // =========================
  function saveSet() {
    // reset input
    setReps("");
    setElapsedSeconds(0);
    setTimerState("idle");

    // nästa set
    setCurrentSet((prev) => prev + 1);
  }

  // =========================
  // NAVIGATION
  // =========================
  function nextExercise() {
    if (!workout) return;

    setCurrentExerciseIndex((prev) => prev + 1);
    setCurrentSet(1);
    setWeight("");
    setReps("");
  }

  return {
    currentExercise,
    currentExerciseIndex,
    currentSet,

    weight,
    setWeight,
    reps,
    setReps,

    isTimed,
    timerState,
    elapsedSeconds,

    startTimer,
    stopTimer,
    resetTimer,

    saveSet,
    nextExercise,

    saveStatus,
  };
}