"use client";

// Central state-motor för /run.
// Fokus:
// - en tydlig huvudhandling
// - offline-first lagring
// - förvald vikt från AI/historik
// - enkel timerlogik
// - återställning om sidan laddas om

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getActiveWorkoutSessionDraft,
  saveActiveWorkoutSessionDraft,
} from "@/lib/active-workout-session-storage";
import type {
  CompletedExercise,
  CompletedSet,
  ExtraRepsOption,
} from "@/lib/workout-log-storage";
import type { TimedEffortOption } from "@/types/exercise-feedback";
import type { Workout } from "@/types/workout";

type WorkoutExercise = Workout["exercises"][number];
type TimerState = "idle" | "running" | "ready_to_save";
type SaveStatus = "idle" | "saving" | "saved_local" | "error_local";

type UseActiveWorkoutProps = {
  userId: string;
  workout: Workout | null;
};

function getDefaultRepsValue(value: number | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(value);
  }

  return "";
}

function getDefaultDurationValue(value: number | undefined) {
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

// Bygger viktchips så att AI-förslag kommer först.
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

// Enkla ljudsignaler via Web Audio.
function playBeep(params: {
  frequency?: number;
  durationMs?: number;
  volume?: number;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = params.frequency ?? 880;
    gainNode.gain.value = params.volume ?? 0.03;

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start();

    const durationSeconds = (params.durationMs ?? 120) / 1000;

    oscillator.stop(context.currentTime + durationSeconds);
    oscillator.onended = () => {
      void context.close();
    };
  } catch {
    // Ljud är bonus – får aldrig krascha passet.
  }
}

export function useActiveWorkout({
  userId,
  workout,
}: UseActiveWorkoutProps) {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);

  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");

  const [completedExercises, setCompletedExercises] = useState<
    CompletedExercise[]
  >([]);

  const [showExerciseFeedback, setShowExerciseFeedback] = useState(false);
  const [selectedExtraReps, setSelectedExtraReps] =
    useState<ExtraRepsOption | null>(null);
  const [selectedTimedEffort, setSelectedTimedEffort] =
    useState<TimedEffortOption | null>(null);
  const [selectedRating, setSelectedRating] = useState<1 | 2 | 3 | 4 | 5 | null>(
    null,
  );

  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerRunning, setRestTimerRunning] = useState(false);
  const [restDurationSeconds, setRestDurationSeconds] = useState(0);
  const [restRemainingSeconds, setRestRemainingSeconds] = useState(0);

  const [lastWeightByExercise, setLastWeightByExercise] = useState<
    Record<string, string>
  >({});

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  const sessionStartedAtRef = useRef<string>(new Date().toISOString());
  const countdownSignalRef = useRef<number | null>(null);
  const targetReachedSignalRef = useRef(false);

  const currentExercise = useMemo(() => {
    if (!workout) {
      return null;
    }

    return workout.exercises[currentExerciseIndex] ?? null;
  }, [workout, currentExerciseIndex]);

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
      ? (lastWeightByExercise[currentExercise.id] ?? "")
      : "";

    return buildWeightChipOptions({
      suggestedWeight: suggestedWeightValue,
      currentWeight: weight,
      lastWeight,
    });
  }, [currentExercise, lastWeightByExercise, suggestedWeightValue, weight]);

  // Återställ aktiv session lokalt om den finns.
  useEffect(() => {
    if (!userId || !workout) {
      return;
    }

    const draft = getActiveWorkoutSessionDraft(userId);
    if (!draft) {
      return;
    }

    setCurrentExerciseIndex(draft.currentExerciseIndex);
    setCurrentSet(draft.currentSet);
    setReps(draft.setLog.reps);
    setWeight(draft.setLog.weight);
    setCompletedExercises(draft.completedExercises);
    setShowExerciseFeedback(draft.showExerciseFeedback);
    setSelectedExtraReps(draft.selectedExtraReps);
    setSelectedTimedEffort(draft.selectedTimedEffort);
    setSelectedRating(draft.selectedRating);
    setElapsedSeconds(draft.exerciseTimerElapsedSeconds);
    setTimerState(draft.timedSetPhase);
    setShowRestTimer(draft.showRestTimer);
    setRestTimerRunning(draft.restTimerRunning);
    setRestDurationSeconds(draft.restDurationSeconds);
    setRestRemainingSeconds(draft.restRemainingSeconds);
    setLastWeightByExercise(draft.lastWeightByExercise);
    sessionStartedAtRef.current = draft.sessionStartedAt;

    setRestoreNotice("Tidigare lokalt sparat pass återställt.");
  }, [userId, workout]);

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

    setRestDurationSeconds(currentExercise.rest ?? 0);
    setRestRemainingSeconds(currentExercise.rest ?? 0);
  }, [currentExercise, suggestedWeightValue, showExerciseFeedback]);

  // Enkel set-timer.
  useEffect(() => {
    if (timerState !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((previous) => previous + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [timerState]);

  // Enkel vilotimer.
  useEffect(() => {
    if (!showRestTimer || !restTimerRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setRestRemainingSeconds((previous) => {
        if (previous <= 1) {
          playBeep({ frequency: 920, durationMs: 240, volume: 0.05 });
          setRestTimerRunning(false);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [restTimerRunning, showRestTimer]);

  // Logiska ljudsignaler för tidsövningar.
  useEffect(() => {
    if (!timedExercise || !currentExercise) {
      countdownSignalRef.current = null;
      targetReachedSignalRef.current = false;
      return;
    }

    const targetSeconds = currentExercise.duration ?? 0;

    if (timerState !== "running") {
      countdownSignalRef.current = null;
      targetReachedSignalRef.current = false;
      return;
    }

    const secondsRemaining = targetSeconds - elapsedSeconds;

    if (secondsRemaining >= 1 && secondsRemaining <= 3) {
      if (countdownSignalRef.current !== secondsRemaining) {
        countdownSignalRef.current = secondsRemaining;
        playBeep({ frequency: 760, durationMs: 90, volume: 0.03 });
      }
    }

    if (elapsedSeconds >= targetSeconds && !targetReachedSignalRef.current) {
      targetReachedSignalRef.current = true;
      playBeep({ frequency: 980, durationMs: 260, volume: 0.05 });
    }
  }, [currentExercise, elapsedSeconds, timedExercise, timerState]);

  function persistState(nextSaveStatus: SaveStatus = "saved_local") {
    if (!userId || !workout) {
      return;
    }

    try {
      setSaveStatus("saving");

      saveActiveWorkoutSessionDraft(userId, {
        workoutId: workout.id ?? null,
        workoutName: workout.name,
        sessionStartedAt: sessionStartedAtRef.current,
        currentExerciseIndex,
        currentSet,
        lastWeightByExercise,
        setLog: {
          reps,
          durationSeconds: timedExercise
            ? String(elapsedSeconds)
            : getDefaultDurationValue(currentExercise?.duration),
          weight,
          completed: false,
        },
        completedExercises,
        showExerciseFeedback,
        selectedExtraReps,
        selectedTimedEffort,
        selectedRating,
        exerciseTimerElapsedSeconds: elapsedSeconds,
        exerciseTimerAlarmPlayed: false,
        timedSetPhase: timerState,
        showRestTimer,
        restTimerRunning,
        restDurationSeconds,
        restRemainingSeconds,
      });

      setSaveStatus(nextSaveStatus);
    } catch {
      setSaveStatus("error_local");
    }
  }

  // Offline-first autosave på varje viktig förändring.
  useEffect(() => {
    if (!userId || !workout) {
      return;
    }

    persistState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userId,
    workout,
    currentExerciseIndex,
    currentSet,
    reps,
    weight,
    completedExercises,
    showExerciseFeedback,
    selectedExtraReps,
    selectedTimedEffort,
    selectedRating,
    elapsedSeconds,
    timerState,
    showRestTimer,
    restTimerRunning,
    restDurationSeconds,
    restRemainingSeconds,
    lastWeightByExercise,
  ]);

  function startTimer() {
    setShowRestTimer(false);
    setRestTimerRunning(false);
    setTimerState("running");
    countdownSignalRef.current = null;
    targetReachedSignalRef.current = false;
    playBeep({ frequency: 620, durationMs: 100, volume: 0.025 });
  }

  function stopTimer() {
    setTimerState("ready_to_save");
    playBeep({ frequency: 720, durationMs: 120, volume: 0.03 });
  }

  function resetTimer() {
    setElapsedSeconds(0);
    setTimerState("idle");
    countdownSignalRef.current = null;
    targetReachedSignalRef.current = false;
  }

  function updateWeight(nextWeight: string) {
    setWeight(nextWeight);
  }

  function chooseWeightChip(chipValue: string) {
    setWeight(chipValue);
  }

  function buildCompletedSet(): CompletedSet | null {
    if (!currentExercise) {
      return null;
    }

    const actualWeight = normalizeWeightString(weight)
      ? Number(normalizeWeightString(weight))
      : null;

    const actualReps =
      !timedExercise && normalizeWeightString(reps)
        ? Number(normalizeWeightString(reps))
        : !timedExercise && reps.trim()
          ? Number(reps)
          : null;

    const actualDuration = timedExercise ? elapsedSeconds : null;

    return {
      setNumber: currentSet,
      plannedReps:
        typeof currentExercise.reps === "number" ? currentExercise.reps : null,
      plannedDuration:
        typeof currentExercise.duration === "number"
          ? currentExercise.duration
          : null,
      plannedWeight: suggestedWeightValue
        ? Number(normalizeWeightString(suggestedWeightValue))
        : null,
      actualReps: Number.isFinite(actualReps) ? actualReps : null,
      actualDuration: Number.isFinite(actualDuration) ? actualDuration : null,
      actualWeight: Number.isFinite(actualWeight) ? actualWeight : null,
      repsLeft: null,
      completedAt: new Date().toISOString(),
      timedEffort: null,
    };
  }

  function appendCompletedSet(setItem: CompletedSet) {
    if (!currentExercise) {
      return;
    }

    setCompletedExercises((previous) => {
      const existingIndex = previous.findIndex(
        (item) => item.exerciseId === currentExercise.id,
      );

      if (existingIndex === -1) {
        const nextExercise: CompletedExercise = {
          exerciseId: currentExercise.id,
          exerciseName: currentExercise.name,
          plannedSets: currentExercise.sets,
          plannedReps:
            typeof currentExercise.reps === "number"
              ? currentExercise.reps
              : null,
          plannedDuration:
            typeof currentExercise.duration === "number"
              ? currentExercise.duration
              : null,
          isNewExercise: false,
          rating: null,
          extraReps: null,
          timedEffort: null,
          sets: [setItem],
        };

        return [...previous, nextExercise];
      }

      return previous.map((item, index) => {
        if (index !== existingIndex) {
          return item;
        }

        return {
          ...item,
          sets: [...item.sets, setItem],
        };
      });
    });
  }

  function moveToNextExercise() {
    if (!workout) {
      return;
    }

    const nextIndex = currentExerciseIndex + 1;

    if (nextIndex >= workout.exercises.length) {
      setShowExerciseFeedback(false);
      setCurrentExerciseIndex(nextIndex);
      return;
    }

    setCurrentExerciseIndex(nextIndex);
    setCurrentSet(1);
    setReps("");
    setWeight("");
    setElapsedSeconds(0);
    setTimerState("idle");
    setSelectedExtraReps(null);
    setSelectedTimedEffort(null);
    setSelectedRating(null);
    setShowExerciseFeedback(false);
    setShowRestTimer(false);
    setRestTimerRunning(false);
  }

  function saveSet() {
    if (!currentExercise) {
      return;
    }

    const completedSet = buildCompletedSet();
    if (!completedSet) {
      return;
    }

    appendCompletedSet(completedSet);

    if (weight.trim()) {
      setLastWeightByExercise((previous) => ({
        ...previous,
        [currentExercise.id]: weight.trim(),
      }));
    }

    setElapsedSeconds(0);
    setTimerState("idle");

    const isLastSet = currentSet >= currentExercise.sets;

    if (isLastSet) {
      setShowExerciseFeedback(true);
      setShowRestTimer(false);
      setRestTimerRunning(false);
      return;
    }

    const nextSet = currentSet + 1;

    setCurrentSet(nextSet);
    setReps(getDefaultRepsValue(currentExercise.reps));
    setShowRestTimer(true);
    setRestDurationSeconds(currentExercise.rest ?? 0);
    setRestRemainingSeconds(currentExercise.rest ?? 0);
    setRestTimerRunning((currentExercise.rest ?? 0) > 0);
  }

  function skipExercise() {
    moveToNextExercise();
  }

  function submitExerciseFeedback() {
    if (!currentExercise) {
      moveToNextExercise();
      return;
    }

    setCompletedExercises((previous) =>
      previous.map((item) => {
        if (item.exerciseId !== currentExercise.id) {
          return item;
        }

        return {
          ...item,
          extraReps: selectedExtraReps,
          rating: selectedRating,
          timedEffort: selectedTimedEffort,
          sets: item.sets.map((setItem) => ({
            ...setItem,
            timedEffort: selectedTimedEffort,
            repsLeft: selectedExtraReps,
          })),
        };
      }),
    );

    moveToNextExercise();
  }

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

  const isWorkoutComplete = useMemo(() => {
    if (!workout) {
      return false;
    }

    return currentExerciseIndex >= workout.exercises.length;
  }, [currentExerciseIndex, workout]);

  return {
    currentExercise,
    currentExerciseIndex,
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
    completedExercises,
    totalCompletedSets,
    totalVolume,
    showExerciseFeedback,
    selectedExtraReps,
    setSelectedExtraReps,
    selectedTimedEffort,
    setSelectedTimedEffort,
    selectedRating,
    setSelectedRating,
    submitExerciseFeedback,
    moveToNextExercise,
    showRestTimer,
    restTimerRunning,
    setRestTimerRunning,
    restDurationSeconds,
    restRemainingSeconds,
    restoreNotice,
    saveStatus,
    isWorkoutComplete,
  };
}