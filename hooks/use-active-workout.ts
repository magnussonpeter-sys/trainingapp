"use client";

// Central state-motor för /run.
// Sprint 1:
// - Workout använder nu blocks i stället för toppnivå-exercises
// - Vi behåller linjär körning av övningar genom att platta ut blocks
// - Hook-API:t hålls kompatibelt med befintlig run/page.tsx
// - Liten mängd kommentarer på viktiga ställen för att göra vidare steg lättare

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CompletedExercise,
  CompletedSet,
  ExtraRepsOption,
} from "@/lib/workout-log-storage";
import type { TimedEffortOption } from "@/types/exercise-feedback";
import type { Exercise, Workout } from "@/types/workout";

type WorkoutExercise = Exercise;
type TimerState = "idle" | "running" | "ready_to_save";
type SaveStatus = "idle" | "saving" | "saved_local" | "error_local";

type UseActiveWorkoutProps = {
  userId: string;
  workout: Workout | null;
};

function getAllExercises(workout: Workout | null): WorkoutExercise[] {
  if (!workout?.blocks?.length) {
    return [];
  }

  return workout.blocks.flatMap((block) => block.exercises ?? []);
}

function getDefaultRepsValue(value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(value);
  }

  return "";
}

function normalizeWeightString(value: string) {
  return value.trim().replace(",", ".").replace(/\s+/g, "");
}

function formatWeightValue(value: number | string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  if (Number.isInteger(numericValue)) {
    return String(numericValue);
  }

  return numericValue.toFixed(1).replace(".0", "");
}

// Försöker hitta AI-föreslagen/planderad vikt från flera möjliga fältnamn.
function getSuggestedWeightFromExercise(exercise: WorkoutExercise | null) {
  if (!exercise) {
    return "";
  }

  const candidateKeys = [
    "suggestedWeight",
    "suggestedWeightKg",
    "targetWeight",
    "targetWeightKg",
    "plannedWeight",
    "plannedWeightKg",
    "weight",
    "weightKg",
  ] as const;

  for (const key of candidateKeys) {
    const rawValue = (exercise as Record<string, unknown>)[key];

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return formatWeightValue(rawValue);
    }

    if (typeof rawValue === "string" && rawValue.trim()) {
      return formatWeightValue(rawValue.trim());
    }
  }

  return "";
}

// Bygger viktchips så att AI-förslag eller senaste vikt blir enkla att välja.
function buildWeightChipOptions(params: {
  suggestedWeight: string;
  currentWeight: string;
  lastWeight: string;
}) {
  const values = new Set<string>();

  const addValue = (value: string) => {
    const normalized = normalizeWeightString(value);
    if (!normalized) {
      return;
    }

    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue)) {
      values.add(value.trim());
      return;
    }

    values.add(formatWeightValue(numericValue));
  };

  addValue(params.suggestedWeight);
  addValue(params.currentWeight);
  addValue(params.lastWeight);

  const baseValue = Number(
    normalizeWeightString(params.suggestedWeight || params.lastWeight),
  );

  if (Number.isFinite(baseValue) && baseValue > 0) {
    // Några logiska närliggande steg.
    const offsets = [-4, -2, -1, 1, 2, 4];

    for (const offset of offsets) {
      const next = baseValue + offset;
      if (next > 0) {
        addValue(String(next));
      }
    }
  }

  return Array.from(values)
    .map((value) => ({
      label: value,
      numeric: Number(normalizeWeightString(value)),
    }))
    .sort((a, b) => {
      const aFinite = Number.isFinite(a.numeric);
      const bFinite = Number.isFinite(b.numeric);

      if (aFinite && bFinite) {
        return a.numeric - b.numeric;
      }

      return a.label.localeCompare(b.label, "sv");
    })
    .map((item) => item.label);
}

function findCompletedExerciseIndex(
  completedExercises: CompletedExercise[],
  exerciseId: string,
) {
  return completedExercises.findIndex((item) => item.exerciseId === exerciseId);
}

function createCompletedExercise(exercise: WorkoutExercise): CompletedExercise {
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    plannedSets: exercise.sets,
    plannedReps: exercise.reps ?? null,
    plannedDuration: exercise.duration ?? null,
    isNewExercise: Boolean(exercise.isNewExercise),
    rating: null,
    extraReps: null,
    timedEffort: null,
    sets: [],
  };
}

export function useActiveWorkout({ userId, workout }: UseActiveWorkoutProps) {
  const allExercises = useMemo(() => getAllExercises(workout), [workout]);

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);

  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");

  const [completedExercises, setCompletedExercises] = useState<CompletedExercise[]>(
    [],
  );

  const [showExerciseFeedback, setShowExerciseFeedback] = useState(false);
  const [selectedExtraReps, setSelectedExtraReps] =
    useState<ExtraRepsOption | null>(null);
  const [selectedTimedEffort, setSelectedTimedEffort] =
    useState<TimedEffortOption | null>(null);

  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerRunning, setRestTimerRunning] = useState(false);
  const [restRemainingSeconds, setRestRemainingSeconds] = useState(0);

  const [lastWeightByExercise, setLastWeightByExercise] = useState<
    Record<string, string>
  >({});

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [restoreNotice] = useState<string | null>(null);

  const timerIntervalRef = useRef<number | null>(null);
  const restIntervalRef = useRef<number | null>(null);

  const currentExercise = useMemo(() => {
    return allExercises[currentExerciseIndex] ?? null;
  }, [allExercises, currentExerciseIndex]);

  const timedExercise = useMemo(() => {
    if (!currentExercise) {
      return false;
    }

    return (
      typeof currentExercise.duration === "number" && currentExercise.duration > 0
    );
  }, [currentExercise]);

  const suggestedWeightValue = useMemo(() => {
    const fromExercise = getSuggestedWeightFromExercise(currentExercise);
    if (fromExercise) {
      return fromExercise;
    }

    if (!currentExercise) {
      return "";
    }

    return lastWeightByExercise[currentExercise.id] ?? "";
  }, [currentExercise, lastWeightByExercise]);

  const weightChipOptions = useMemo(() => {
    const lastWeight = currentExercise
      ? lastWeightByExercise[currentExercise.id] ?? ""
      : "";

    return buildWeightChipOptions({
      suggestedWeight: suggestedWeightValue,
      currentWeight: weight,
      lastWeight,
    });
  }, [currentExercise, lastWeightByExercise, suggestedWeightValue, weight]);

  const isWorkoutComplete = useMemo(() => {
    if (!workout) {
      return false;
    }

    return allExercises.length > 0 && currentExerciseIndex >= allExercises.length;
  }, [allExercises.length, currentExerciseIndex, workout]);

  const totalCompletedSets = useMemo(() => {
    return completedExercises.reduce((sum, item) => sum + item.sets.length, 0);
  }, [completedExercises]);

  const totalVolume = useMemo(() => {
    return completedExercises.reduce((sum, item) => {
      return (
        sum +
        item.sets.reduce((exerciseSum, setItem) => {
          if (
            typeof setItem.actualReps === "number" &&
            typeof setItem.actualWeight === "number"
          ) {
            return exerciseSum + setItem.actualReps * setItem.actualWeight;
          }

          return exerciseSum;
        }, 0)
      );
    }, 0);
  }, [completedExercises]);

  const pendingSyncCount = useMemo(() => {
    // Sprint 1: placeholder tills vi återkopplar full sync-logik.
    return userId ? 0 : 0;
  }, [userId]);

  // Förifyll reps och vikt när övning/set byts.
  useEffect(() => {
    if (!currentExercise || showExerciseFeedback) {
      return;
    }

    setReps((previous) => {
      if (previous.trim()) {
        return previous;
      }

      return getDefaultRepsValue(currentExercise.reps);
    });

    setWeight((previous) => {
      if (previous.trim()) {
        return previous;
      }

      return suggestedWeightValue;
    });

    setRestRemainingSeconds(currentExercise.rest ?? 0);
  }, [currentExercise, showExerciseFeedback, suggestedWeightValue]);

  // Enkel set-timer.
  useEffect(() => {
    if (timerState !== "running") {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    timerIntervalRef.current = window.setInterval(() => {
      setElapsedSeconds((previous) => previous + 1);
    }, 1000);

    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [timerState]);

  // Enkel vilotimer.
  useEffect(() => {
    if (!showRestTimer || !restTimerRunning) {
      if (restIntervalRef.current !== null) {
        window.clearInterval(restIntervalRef.current);
        restIntervalRef.current = null;
      }
      return;
    }

    restIntervalRef.current = window.setInterval(() => {
      setRestRemainingSeconds((previous) => {
        if (previous <= 1) {
          setRestTimerRunning(false);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => {
      if (restIntervalRef.current !== null) {
        window.clearInterval(restIntervalRef.current);
        restIntervalRef.current = null;
      }
    };
  }, [restTimerRunning, showRestTimer]);

  function updateWeight(nextWeight: string) {
    setWeight(nextWeight);
  }

  function chooseWeightChip(chipValue: string) {
    setWeight(chipValue);
  }

  function startTimer() {
    setElapsedSeconds(0);
    setShowRestTimer(false);
    setRestTimerRunning(false);
    setTimerState("running");
  }

  function stopTimer() {
    setTimerState("ready_to_save");
  }

  function resetTimer() {
    setElapsedSeconds(0);
    setTimerState("idle");
  }

  function moveToNextExercise() {
    setCurrentExerciseIndex((previous) => previous + 1);
    setCurrentSet(1);
    setReps("");
    setWeight("");
    setElapsedSeconds(0);
    setTimerState("idle");
    setShowExerciseFeedback(false);
    setSelectedExtraReps(null);
    setSelectedTimedEffort(null);
    setShowRestTimer(false);
    setRestTimerRunning(false);
    setRestRemainingSeconds(0);
    setSaveStatus("saved_local");
  }

  function persistLastWeightForExercise() {
    if (!currentExercise) {
      return;
    }

    const normalizedWeight = normalizeWeightString(weight);
    if (!normalizedWeight) {
      return;
    }

    setLastWeightByExercise((previous) => ({
      ...previous,
      [currentExercise.id]: formatWeightValue(normalizedWeight),
    }));
  }

  function appendCompletedSet() {
    if (!currentExercise) {
      return;
    }

    const normalizedWeight = normalizeWeightString(weight);
    const parsedWeight = normalizedWeight ? Number(normalizedWeight) : null;
    const parsedReps = reps.trim() ? Number(reps.trim()) : null;

const completedSet: CompletedSet = {
  setNumber: currentSet,
  plannedReps: currentExercise.reps ?? null,
  plannedDuration: currentExercise.duration ?? null,
  plannedWeight: suggestedWeightValue ? Number(suggestedWeightValue) : null,
  actualReps:
    !timedExercise && parsedReps !== null && Number.isFinite(parsedReps)
      ? parsedReps
      : null,
  actualDuration: timedExercise ? elapsedSeconds : null,
  actualWeight:
    parsedWeight !== null && Number.isFinite(parsedWeight) ? parsedWeight : null,
  repsLeft: null,
  timedEffort: timedExercise ? selectedTimedEffort ?? null : null,
  completedAt: new Date().toISOString(),
};

    setCompletedExercises((previous) => {
      const next = [...previous];
      const index = findCompletedExerciseIndex(next, currentExercise.id);

      if (index === -1) {
        const newExercise = createCompletedExercise(currentExercise);
        newExercise.sets.push(completedSet);
        next.push(newExercise);
        return next;
      }

      const existing = next[index];
      const updated: CompletedExercise = {
        ...existing,
        sets: [...existing.sets, completedSet],
      };
      next[index] = updated;
      return next;
    });

    persistLastWeightForExercise();
  }

  function saveSet() {
    if (!currentExercise) {
      return;
    }

    setSaveStatus("saving");
    appendCompletedSet();

    if (currentSet < currentExercise.sets) {
      setCurrentSet((previous) => previous + 1);
      setReps(getDefaultRepsValue(currentExercise.reps));
      setElapsedSeconds(0);
      setTimerState("idle");

      if ((currentExercise.rest ?? 0) > 0) {
        setShowRestTimer(true);
        setRestRemainingSeconds(currentExercise.rest ?? 0);
        setRestTimerRunning(true);
      }

      setSaveStatus("saved_local");
      return;
    }

    setShowExerciseFeedback(true);
    setTimerState("idle");
    setElapsedSeconds(0);
    setSaveStatus("saved_local");
  }

  function skipExercise() {
    moveToNextExercise();
  }

  function submitExerciseFeedback() {
    if (!currentExercise) {
      moveToNextExercise();
      return;
    }

    setCompletedExercises((previous) => {
      const next = [...previous];
      const index = findCompletedExerciseIndex(next, currentExercise.id);

      if (index === -1) {
        return next;
      }

      const existing = next[index];

next[index] = {
  ...existing,
  extraReps: timedExercise ? null : selectedExtraReps ?? null,
  timedEffort: timedExercise ? selectedTimedEffort ?? null : null,
};

      return next;
    });

    moveToNextExercise();
  }

  function finishWorkout() {
    // Sprint 1: run/page styr själva finish-vyn via isWorkoutComplete.
    setSaveStatus("saved_local");
  }

  function abortWorkout() {
    setSaveStatus("saved_local");
  }

  return {
    currentExercise,
    currentSet,
    reps,
    setReps,
    weight,
    updateWeight,
    chooseWeightChip,
    suggestedWeightValue,
    weightChipOptions,
    timedExercise,
    timerState,
    elapsedSeconds,
    startTimer,
    stopTimer,
    resetTimer,
    saveSet,
    skipExercise,
    abortWorkout,
    finishWorkout,
    totalCompletedSets,
    totalVolume,
    showExerciseFeedback,
    selectedExtraReps,
    setSelectedExtraReps,
    selectedTimedEffort,
    setSelectedTimedEffort,
    submitExerciseFeedback,
    moveToNextExercise,
    showRestTimer,
    restTimerRunning,
    setRestTimerRunning,
    restRemainingSeconds,
    isWorkoutComplete,
    saveStatus,
    restoreNotice,
    pendingSyncCount,
  };
}