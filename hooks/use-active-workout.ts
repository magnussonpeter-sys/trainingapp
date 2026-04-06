"use client"; // Central state-motor för /run.
// Fokus:
// - lokal lagring först
// - robust resume / finish / abort
// - pending sync för färdiga pass
// - tunnare page.tsx
// - små steg så att resten av UI:t kan leva vidare

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CompletedExercise,
  CompletedSet,
  ExtraRepsOption,
} from "@/lib/workout-log-storage";
import type { TimedEffortOption } from "@/types/exercise-feedback";
import type { Workout } from "@/types/workout";
import {
  clearActiveWorkoutSessionDraft,
  getActiveWorkoutSessionDraft,
  saveActiveWorkoutSessionDraft,
} from "@/lib/active-workout-session-storage";
import {
  clearActiveWorkoutSnapshot,
  getActiveWorkoutSnapshot,
  saveActiveWorkoutSnapshot,
} from "@/lib/workout-flow/active-workout-store";
import {
  clearSessionDraft,
  getSessionDraft,
  saveSessionDraft,
} from "@/lib/workout-flow/session-draft-store";
import {
  enqueuePendingSyncItem,
  getPendingSyncCount,
} from "@/lib/workout-flow/pending-sync-store";

type WorkoutExercise = Workout["exercises"][number];
type TimerState = "idle" | "running" | "ready_to_save";
type SaveStatus = "idle" | "saving" | "saved_local" | "error_local";
type SyncStatus = "idle" | "pending" | "syncing" | "synced" | "error";

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
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

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

export function useActiveWorkout({ userId, workout }: UseActiveWorkoutProps) {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [completedExercises, setCompletedExercises] = useState<CompletedExercise[]>([]);
  const [showExerciseFeedback, setShowExerciseFeedback] = useState(false);
  const [selectedExtraReps, setSelectedExtraReps] = useState<ExtraRepsOption | null>(null);
  const [selectedTimedEffort, setSelectedTimedEffort] =
    useState<TimedEffortOption | null>(null);
  const [selectedRating, setSelectedRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerRunning, setRestTimerRunning] = useState(false);
  const [restDurationSeconds, setRestDurationSeconds] = useState(0);
  const [restRemainingSeconds, setRestRemainingSeconds] = useState(0);
  const [lastWeightByExercise, setLastWeightByExercise] = useState<Record<string, string>>(
    {},
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [finishSummaryVisible, setFinishSummaryVisible] = useState(false);

  const sessionStartedAtRef = useRef(new Date().toISOString());
  const countdownSignalRef = useRef<number | null>(null);
  const targetReachedSignalRef = useRef(false);
  const hasRestoredRef = useRef(false);

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

    return typeof currentExercise.duration === "number" && currentExercise.duration > 0;
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
    const lastWeight = currentExercise ? lastWeightByExercise[currentExercise.id] ?? "" : "";

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

    return currentExerciseIndex >= workout.exercises.length;
  }, [currentExerciseIndex, workout]);

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
    return userId ? getPendingSyncCount(userId) : 0;
  }, [userId, finishSummaryVisible, syncStatus]);

  const persistState = useCallback(
    (nextSaveStatus: SaveStatus = "saved_local") => {
      if (!userId || !workout) {
        return;
      }

      try {
        setSaveStatus("saving");

        // Full draft för exakt återställning av UI.
        saveSessionDraft(userId, {
          workoutId: workout.id ?? null,
          workoutName: workout.name,
          sessionStartedAt: sessionStartedAtRef.current,
          currentExerciseIndex,
          currentSet,
          reps,
          weight,
          elapsedSeconds,
          timerState,
          showRestTimer,
          restTimerRunning,
          restDurationSeconds,
          restRemainingSeconds,
          showExerciseFeedback,
          selectedExtraReps,
          selectedTimedEffort,
          selectedRating,
          lastWeightByExercise,
          completedExercises,
          status: isWorkoutComplete ? "finished" : "active",
        });

        // Lätt snapshot för snabb resume-koll.
        saveActiveWorkoutSnapshot(userId, {
          workoutId: workout.id ?? null,
          workoutName: workout.name,
          workout,
          currentExerciseIndex,
          currentSet,
          startedAt: sessionStartedAtRef.current,
          status: isWorkoutComplete ? "finished" : "active",
        });

        // Behåll bakåtkompatibilitet med gamla storage-lagret tills allt är flyttat.
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
    },
    [
      completedExercises,
      currentExercise?.duration,
      currentExerciseIndex,
      currentSet,
      elapsedSeconds,
      isWorkoutComplete,
      lastWeightByExercise,
      reps,
      restDurationSeconds,
      restRemainingSeconds,
      restTimerRunning,
      selectedExtraReps,
      selectedRating,
      selectedTimedEffort,
      showExerciseFeedback,
      showRestTimer,
      timedExercise,
      timerState,
      userId,
      weight,
      workout,
    ],
  );

  // Återställ från nya lagret först, sedan äldre fallback.
  useEffect(() => {
    if (!userId || !workout || hasRestoredRef.current) {
      return;
    }

    const sessionDraft = getSessionDraft(userId);

    if (
      sessionDraft &&
      sessionDraft.status === "active" &&
      sessionDraft.workoutName.trim() === workout.name.trim()
    ) {
      setCurrentExerciseIndex(sessionDraft.currentExerciseIndex);
      setCurrentSet(sessionDraft.currentSet);
      setReps(sessionDraft.reps);
      setWeight(sessionDraft.weight);
      setElapsedSeconds(sessionDraft.elapsedSeconds);
      setTimerState(sessionDraft.timerState);
      setShowRestTimer(sessionDraft.showRestTimer);
      setRestTimerRunning(sessionDraft.restTimerRunning);
      setRestDurationSeconds(sessionDraft.restDurationSeconds);
      setRestRemainingSeconds(sessionDraft.restRemainingSeconds);
      setShowExerciseFeedback(sessionDraft.showExerciseFeedback);
      setSelectedExtraReps(sessionDraft.selectedExtraReps);
      setSelectedTimedEffort(sessionDraft.selectedTimedEffort);
      setSelectedRating(sessionDraft.selectedRating);
      setLastWeightByExercise(sessionDraft.lastWeightByExercise);
      setCompletedExercises(sessionDraft.completedExercises);
      sessionStartedAtRef.current = sessionDraft.sessionStartedAt;
      setRestoreNotice("Tidigare lokalt sparat pass återställt.");
      hasRestoredRef.current = true;
      return;
    }

    const legacyDraft = getActiveWorkoutSessionDraft(userId);

    if (legacyDraft) {
      setCurrentExerciseIndex(legacyDraft.currentExerciseIndex);
      setCurrentSet(legacyDraft.currentSet);
      setReps(legacyDraft.setLog.reps);
      setWeight(legacyDraft.setLog.weight);
      setCompletedExercises(legacyDraft.completedExercises);
      setShowExerciseFeedback(legacyDraft.showExerciseFeedback);
      setSelectedExtraReps(legacyDraft.selectedExtraReps);
      setSelectedTimedEffort(legacyDraft.selectedTimedEffort);
      setSelectedRating(legacyDraft.selectedRating);
      setElapsedSeconds(legacyDraft.exerciseTimerElapsedSeconds);
      setTimerState(legacyDraft.timedSetPhase);
      setShowRestTimer(legacyDraft.showRestTimer);
      setRestTimerRunning(legacyDraft.restTimerRunning);
      setRestDurationSeconds(legacyDraft.restDurationSeconds);
      setRestRemainingSeconds(legacyDraft.restRemainingSeconds);
      setLastWeightByExercise(legacyDraft.lastWeightByExercise);
      sessionStartedAtRef.current = legacyDraft.sessionStartedAt;
      setRestoreNotice("Tidigare lokalt sparat pass återställt.");
      hasRestoredRef.current = true;
      return;
    }

    const activeSnapshot = getActiveWorkoutSnapshot(userId);

    if (
      activeSnapshot &&
      activeSnapshot.status === "active" &&
      activeSnapshot.workoutName.trim() === workout.name.trim()
    ) {
      setCurrentExerciseIndex(activeSnapshot.currentExerciseIndex);
      setCurrentSet(activeSnapshot.currentSet);
      sessionStartedAtRef.current = activeSnapshot.startedAt;
      setRestoreNotice("Aktivt pass återupptaget.");
      hasRestoredRef.current = true;
    }
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
  }, [currentExercise, showExerciseFeedback, suggestedWeightValue]);

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

  // Offline-first autosave på varje viktig förändring.
  useEffect(() => {
    if (!userId || !workout) {
      return;
    }

    persistState();
  }, [
    completedExercises,
    currentExerciseIndex,
    currentSet,
    elapsedSeconds,
    lastWeightByExercise,
    persistState,
    reps,
    restDurationSeconds,
    restRemainingSeconds,
    restTimerRunning,
    selectedExtraReps,
    selectedRating,
    selectedTimedEffort,
    showExerciseFeedback,
    showRestTimer,
    timerState,
    userId,
    weight,
    workout,
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
      plannedReps: typeof currentExercise.reps === "number" ? currentExercise.reps : null,
      plannedDuration:
        typeof currentExercise.duration === "number" ? currentExercise.duration : null,
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
          plannedReps: typeof currentExercise.reps === "number" ? currentExercise.reps : null,
          plannedDuration:
            typeof currentExercise.duration === "number" ? currentExercise.duration : null,
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

  function abortWorkout() {
    if (!userId || !workout) {
      return;
    }

    setSyncStatus("pending");

    enqueuePendingSyncItem({
      userId,
      workoutId: workout.id ?? null,
      workoutName: workout.name,
      workout,
      sessionStartedAt: sessionStartedAtRef.current,
      completedAt: new Date().toISOString(),
      status: "aborted",
      completedExercises,
    });

    clearActiveWorkoutSnapshot(userId);
    clearSessionDraft(userId);
    clearActiveWorkoutSessionDraft(userId);
  }

  function finishWorkout() {
    if (!userId || !workout) {
      return;
    }

    // Säkerställ senaste lokala state innan vi avslutar.
    persistState("saved_local");

    enqueuePendingSyncItem({
      userId,
      workoutId: workout.id ?? null,
      workoutName: workout.name,
      workout,
      sessionStartedAt: sessionStartedAtRef.current,
      completedAt: new Date().toISOString(),
      status: "completed",
      completedExercises,
    });

    clearActiveWorkoutSnapshot(userId);
    clearSessionDraft(userId);
    clearActiveWorkoutSessionDraft(userId);

    setSyncStatus("pending");
    setFinishSummaryVisible(true);
    setCurrentExerciseIndex(workout.exercises.length);
  }

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
    abortWorkout,
    finishWorkout,
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
    syncStatus,
    pendingSyncCount,
    finishSummaryVisible,
    isWorkoutComplete,
  };
}