// hooks/use-active-workout.ts

import { useMemo, useState } from "react";
import type { Exercise, Workout } from "@/types/workout";

// =========================
// SPRINT 1 – VIKTIGT
// =========================
// Tidigare:
// type WorkoutExercise = Workout["exercises"][number];
//
// Nu (blocks):
// Vi jobbar istället direkt med Exercise
// =========================

type WorkoutExercise = Exercise;

type TimerState = "idle" | "running" | "ready_to_save";

// =========================
// Hjälpfunktion
// Plattar ut blocks → lista
// =========================

function getAllExercises(workout: Workout | null): WorkoutExercise[] {
  if (!workout?.blocks?.length) return [];

  return workout.blocks.flatMap((block) => block.exercises ?? []);
}

export function useActiveWorkout({
  workout,
}: {
  workout: Workout | null;
}) {
  // =========================
  // STATE
  // =========================

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);

  const [timerState, setTimerState] = useState<TimerState>("idle");

  // =========================
  // DERIVED
  // =========================

  // SPRINT 1: använd platt lista
  const allExercises = useMemo(() => getAllExercises(workout), [workout]);

  const currentExercise = allExercises[currentExerciseIndex] ?? null;

  const isWorkoutComplete =
    allExercises.length > 0 && currentExerciseIndex >= allExercises.length;

  // =========================
  // TIMER
  // =========================

  function startTimer() {
    setTimerState("running");
  }

  function stopTimer() {
    setTimerState("ready_to_save");
  }

  function resetTimer() {
    setTimerState("idle");
  }

  // =========================
  // SET-HANTERING
  // =========================

  function saveSet() {
    if (!currentExercise) return;

    if (currentSet < currentExercise.sets) {
      setCurrentSet((prev) => prev + 1);
      setTimerState("idle");
      return;
    }

    moveToNextExercise();
  }

  // =========================
  // NAVIGATION
  // =========================

  function moveToNextExercise() {
    setCurrentExerciseIndex((prev) => prev + 1);
    setCurrentSet(1);
    setTimerState("idle");
  }

  function skipExercise() {
    moveToNextExercise();
  }

  // =========================
  // WORKOUT STATE
  // =========================

  function finishWorkout() {
    // Placeholder – behåll befintlig logik i din app
    console.log("Workout finished");
  }

  function abortWorkout() {
    console.log("Workout aborted");
  }

  // =========================
  // RETURN
  // =========================

  return {
    currentExercise,
    currentSet,
    timerState,

    startTimer,
    stopTimer,
    resetTimer,

    saveSet,
    skipExercise,
    moveToNextExercise,

    isWorkoutComplete,

    finishWorkout,
    abortWorkout,
  };
}