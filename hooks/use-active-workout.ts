"use client"; // Central state-motor för /run.
// Viktigt i denna version:
// - stöd för workout.blocks
// - lokal återställning av aktivt pass
// - färdiga pass sparas åter till workout_logs
// - hook-API hålls kompatibelt med nuvarande run/page.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearActiveWorkoutSessionDraft,
  getActiveWorkoutSessionDraft,
  isDraftForWorkout,
  saveActiveWorkoutSessionDraft,
} from "@/lib/active-workout-session-storage";
import { saveExerciseFeedbackEntry } from "@/lib/exercise-feedback-storage";
import { saveExerciseProgression } from "@/lib/progression-store";
import { enqueuePendingSyncItem } from "@/lib/workout-flow/pending-sync-store";
import {
  createWorkoutLog,
  saveWorkoutLog,
  type CompletedExercise,
  type CompletedSet,
  type ExtraRepsOption,
} from "@/lib/workout-log-storage";
import type { TimedEffortOption } from "@/types/exercise-feedback";
import {
  buildWeightChipOptions,
  formatWeightValue,
} from "@/lib/workout-flow/exercise-progression";
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

function mapTimedEffortForProgression(
  value: TimedEffortOption | null,
): "easy" | "moderate" | "hard" | null {
  if (value === "light") {
    return "easy";
  }

  if (value === "just_right") {
    return "moderate";
  }

  if (value === "tough") {
    return "hard";
  }

  return null;
}

function buildCompletedExercisesWithSet(params: {
  previous: CompletedExercise[];
  exercise: WorkoutExercise;
  completedSet: CompletedSet;
}) {
  const { previous, exercise, completedSet } = params;

  const next = [...previous];
  const index = findCompletedExerciseIndex(next, exercise.id);

  if (index === -1) {
    const newExercise = createCompletedExercise(exercise);
    newExercise.sets.push(completedSet);
    next.push(newExercise);
    return next;
  }

  const existing = next[index];
  next[index] = {
    ...existing,
    plannedSets: exercise.sets,
    plannedReps: exercise.reps ?? null,
    plannedDuration: exercise.duration ?? null,
    sets: [...existing.sets, completedSet],
  };

  return next;
}

function buildCompletedExercisesWithFeedback(params: {
  previous: CompletedExercise[];
  exercise: WorkoutExercise;
  timedExercise: boolean;
  selectedExtraReps: ExtraRepsOption | null;
  selectedTimedEffort: TimedEffortOption | null;
}) {
  const {
    previous,
    exercise,
    timedExercise,
    selectedExtraReps,
    selectedTimedEffort,
  } = params;

  const next = [...previous];
  const index = findCompletedExerciseIndex(next, exercise.id);

  if (index === -1) {
    return next;
  }

  next[index] = {
    ...next[index],
    extraReps: timedExercise ? null : selectedExtraReps ?? null,
    timedEffort: timedExercise ? selectedTimedEffort ?? null : null,
  };

  return next;
}

function parseFiniteNumberOrNull(value: string) {
  const normalized = normalizeWeightString(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function useActiveWorkout({ userId, workout }: UseActiveWorkoutProps) {
  const allExercises = useMemo(() => getAllExercises(workout), [workout]);

  const [sessionStartedAt, setSessionStartedAt] = useState<string>(
    () => new Date().toISOString(),
  );
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
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerRunning, setRestTimerRunning] = useState(false);
  const [restRemainingSeconds, setRestRemainingSeconds] = useState(0);
  const [lastWeightByExercise, setLastWeightByExercise] = useState<
    Record<string, string>
  >({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const timerIntervalRef = useRef<number | null>(null);
  const restIntervalRef = useRef<number | null>(null);
  const restoreKeyRef = useRef("");
  const finishedLogKeyRef = useRef<string | null>(null);

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
      availableWeightsKg: currentExercise?.availableWeightsKg,
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
    // Full nät-sync används inte här ännu.
    return 0;
  }, []);

  // Återställ aktivt pass när workout/userId blir tillgängliga.
  useEffect(() => {
    if (!userId || !workout) {
      setIsHydrated(false);
      return;
    }

    const workoutRestoreKey = `${userId}:${workout.id ?? workout.name}`;

    if (restoreKeyRef.current === workoutRestoreKey) {
      return;
    }

    restoreKeyRef.current = workoutRestoreKey;
    finishedLogKeyRef.current = null;

const draft = getActiveWorkoutSessionDraft(userId);

if (draft && isDraftForWorkout(draft, workout)) {
  setSessionStartedAt(draft.sessionStartedAt);
  setCurrentExerciseIndex(Math.max(0, draft.currentExerciseIndex));
  setCurrentSet(Math.max(1, draft.currentSet));
  setReps(draft.setLog.reps ?? "");
  setWeight(draft.setLog.weight ?? "");
  setCompletedExercises(draft.completedExercises ?? []);
  setShowExerciseFeedback(Boolean(draft.showExerciseFeedback));
  setSelectedExtraReps(draft.selectedExtraReps ?? null);
  setSelectedTimedEffort(draft.selectedTimedEffort ?? null);
  setTimerState(draft.timedSetPhase ?? "idle");
  setElapsedSeconds(Math.max(0, draft.exerciseTimerElapsedSeconds ?? 0));
  setShowRestTimer(Boolean(draft.showRestTimer));
  setRestTimerRunning(Boolean(draft.restTimerRunning));
  setRestRemainingSeconds(Math.max(0, draft.restRemainingSeconds ?? 0));
  setLastWeightByExercise(draft.lastWeightByExercise ?? {});
  setRestoreNotice("Återställde ditt pågående pass.");
  setSaveStatus("saved_local");
  setIsHydrated(true);
  return;
}

    // Ny session för detta pass.
    setSessionStartedAt(new Date().toISOString());
    setCurrentExerciseIndex(0);
    setCurrentSet(1);
    setReps("");
    setWeight("");
    setCompletedExercises([]);
    setShowExerciseFeedback(false);
    setSelectedExtraReps(null);
    setSelectedTimedEffort(null);
    setTimerState("idle");
    setElapsedSeconds(0);
    setShowRestTimer(false);
    setRestTimerRunning(false);
    setRestRemainingSeconds(0);
    setLastWeightByExercise({});
    setRestoreNotice(null);
    setSaveStatus("idle");
    setIsHydrated(true);
  }, [userId, workout]);

  // Klampa index om passet ändrats.
  useEffect(() => {
    setCurrentExerciseIndex((previous) => {
      if (allExercises.length === 0) {
        return 0;
      }

      return Math.min(previous, allExercises.length);
    });
  }, [allExercises.length]);

  // Klampa set om aktuell övning ändrats.
  useEffect(() => {
    if (!currentExercise) {
      return;
    }

    setCurrentSet((previous) => {
      return Math.min(Math.max(previous, 1), Math.max(1, currentExercise.sets));
    });
  }, [currentExercise]);

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

  // Spara aktiv session lokalt så fort något viktigt ändras.
  useEffect(() => {
    if (!isHydrated || !userId || !workout || isWorkoutComplete) {
      return;
    }

    try {
      saveActiveWorkoutSessionDraft(userId, {
        workoutId: workout.id ?? null,
        workoutName: workout.name,
        sessionStartedAt,
        currentExerciseIndex,
        currentSet,
        lastWeightByExercise,
        setLog: {
          reps,
          durationSeconds: String(elapsedSeconds),
          weight,
          completed: false,
        },
        completedExercises,
        showExerciseFeedback,
        selectedExtraReps,
        selectedTimedEffort,
        selectedRating: null,
        exerciseTimerElapsedSeconds: elapsedSeconds,
        exerciseTimerAlarmPlayed: false,
        timedSetPhase: timerState,
        showRestTimer,
        restTimerRunning,
        restDurationSeconds: currentExercise?.rest ?? 0,
        restRemainingSeconds,
      });

      setSaveStatus((previous) =>
        previous === "saving" ? "saved_local" : previous,
      );
    } catch {
      setSaveStatus("error_local");
    }
  }, [
    completedExercises,
    currentExercise?.rest,
    currentExerciseIndex,
    currentSet,
    elapsedSeconds,
    isHydrated,
    isWorkoutComplete,
    lastWeightByExercise,
    reps,
    restRemainingSeconds,
    restTimerRunning,
    selectedExtraReps,
    selectedTimedEffort,
    sessionStartedAt,
    showExerciseFeedback,
    showRestTimer,
    timerState,
    userId,
    weight,
    workout,
  ]);

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

  function persistLastWeightForExercise(nextWeight: string) {
    if (!currentExercise) {
      return;
    }

    const normalizedWeight = normalizeWeightString(nextWeight);

    if (!normalizedWeight) {
      return;
    }

    setLastWeightByExercise((previous) => ({
      ...previous,
      [currentExercise.id]: formatWeightValue(normalizedWeight),
    }));
  }

  function buildCompletedSet(): CompletedSet | null {
    if (!currentExercise) {
      return null;
    }

    const parsedWeight = parseFiniteNumberOrNull(weight);
    const parsedReps = reps.trim() ? Number(reps.trim()) : null;
    const plannedWeight = parseFiniteNumberOrNull(suggestedWeightValue);

    return {
      setNumber: currentSet,
      plannedReps: currentExercise.reps ?? null,
      plannedDuration: currentExercise.duration ?? null,
      plannedWeight,
      actualReps:
        !timedExercise && parsedReps !== null && Number.isFinite(parsedReps)
          ? parsedReps
          : null,
      actualDuration: timedExercise ? elapsedSeconds : null,
      actualWeight: parsedWeight,
      repsLeft: null,
      timedEffort: null,
      completedAt: new Date().toISOString(),
    };
  }

  function saveSet() {
    if (!currentExercise) {
      return;
    }

    const completedSet = buildCompletedSet();
    if (!completedSet) {
      return;
    }

    setSaveStatus("saving");

    setCompletedExercises((previous) =>
      buildCompletedExercisesWithSet({
        previous,
        exercise: currentExercise,
        completedSet,
      }),
    );

    if (completedSet.actualWeight !== null) {
      persistLastWeightForExercise(String(completedSet.actualWeight));
    }

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
    setShowRestTimer(false);
    setRestTimerRunning(false);
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

    const completedExercise = completedExercises.find(
      (item) => item.exerciseId === currentExercise.id,
    );
    const lastSet = completedExercise?.sets[completedExercise.sets.length - 1];

    if (userId) {
      saveExerciseProgression(userId, currentExercise.id, {
        lastWeight: lastSet?.actualWeight ?? null,
        lastReps: lastSet?.actualReps ?? null,
        lastDuration: lastSet?.actualDuration ?? null,
        lastExtraReps: timedExercise ? null : selectedExtraReps ?? null,
        lastTimedEffort: timedExercise
          ? mapTimedEffortForProgression(selectedTimedEffort)
          : null,
      });

      // Spara rå upplevelse separat så Sprint 3 kan bygga vidare utan att läsa hela workoutloggen.
      saveExerciseFeedbackEntry(userId, {
        exerciseId: currentExercise.id,
        exerciseName: currentExercise.name,
        completedAt: new Date().toISOString(),
        extraReps: timedExercise ? undefined : selectedExtraReps ?? undefined,
        timedEffort: timedExercise ? selectedTimedEffort ?? undefined : undefined,
      });
    }

    setCompletedExercises((previous) =>
      buildCompletedExercisesWithFeedback({
        previous,
        exercise: currentExercise,
        timedExercise,
        selectedExtraReps,
        selectedTimedEffort,
      }),
    );

    moveToNextExercise();
  }

  const finishWorkout = useCallback(() => {
    if (!userId || !workout) {
      return;
    }

    const finishKey = `${workout.id ?? workout.name}:${sessionStartedAt}:completed`;

    if (finishedLogKeyRef.current === finishKey) {
      return;
    }

    finishedLogKeyRef.current = finishKey;

    try {
      const log = createWorkoutLog({
        userId,
        workout,
        startedAt: sessionStartedAt,
        exercises: completedExercises,
        status: "completed",
      });

      saveWorkoutLog(log);
      enqueuePendingSyncItem({
        userId,
        workoutId: log.workoutId,
        workoutName: log.workoutName,
        workout,
        sessionStartedAt: log.startedAt,
        completedAt: log.completedAt,
        status: log.status,
        completedExercises: log.exercises,
      });
      clearActiveWorkoutSessionDraft(userId);
      setSaveStatus("saved_local");
    } catch {
      setSaveStatus("error_local");
    }
  }, [completedExercises, sessionStartedAt, userId, workout]);

  const abortWorkout = useCallback(() => {
    if (!userId || !workout) {
      return;
    }

    const abortKey = `${workout.id ?? workout.name}:${sessionStartedAt}:aborted`;

    if (finishedLogKeyRef.current === abortKey) {
      return;
    }

    finishedLogKeyRef.current = abortKey;

    try {
      const hasAnyCompletedSets = completedExercises.some(
        (exercise) => exercise.sets.length > 0,
      );

      if (hasAnyCompletedSets) {
        const log = createWorkoutLog({
          userId,
          workout,
          startedAt: sessionStartedAt,
          exercises: completedExercises,
          status: "aborted",
        });

        saveWorkoutLog(log);
        enqueuePendingSyncItem({
          userId,
          workoutId: log.workoutId,
          workoutName: log.workoutName,
          workout,
          sessionStartedAt: log.startedAt,
          completedAt: log.completedAt,
          status: log.status,
          completedExercises: log.exercises,
        });
      }

      clearActiveWorkoutSessionDraft(userId);
      setSaveStatus("saved_local");
    } catch {
      setSaveStatus("error_local");
    }
  }, [completedExercises, sessionStartedAt, userId, workout]);

  return {
    currentExercise,
    currentSet,
    reps,
    setReps,
    weight,
    updateWeight,
    chooseWeightChip,
    suggestedWeightValue,
    suggestedWeightLabel: currentExercise?.suggestedWeightLabel ?? "",
    progressionNote: currentExercise?.progressionNote ?? "",
    weightUnitLabel: currentExercise?.weightUnitLabel ?? "kg",
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
    completedExercises,
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
