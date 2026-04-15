"use client";

// /run-sidan.
// Fokus:
// - tunn huvudvy
// - robust offline-first
// - tydlig huvudhandling
// - auto-finish när passet är klart
// - nytt mobilfokuserat UI är standard
// - gammalt UI finns kvar bakom en legacy-flagga som säker fallback

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import RunFinishSummary from "@/components/run/run-finish-summary";
import RunScreenLegacy from "@/components/run/run-screen-legacy";
import type { RunScreenProps } from "@/components/run/run-screen-props";
import RunScreenStructured from "@/components/run/run-screen-structured";
import { clearActiveWorkoutSessionDraft } from "@/lib/active-workout-session-storage";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  clearWorkoutDraft,
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import { useActiveWorkout } from "@/hooks/use-active-workout";
import type { Exercise, Workout } from "@/types/workout";

type AuthUser = {
  id?: string | number | null;
  name?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getDisplayName(user: AuthUser | null) {
  if (!user) {
    return "där";
  }

  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "där"
  );
}

// Fallback om auth inte är färdig men lokala run-nycklar finns.
// Viktigt för resume/offline.
function resolveLocalFallbackUserId() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const storage = window.localStorage;
    const prefixes = [
      "active_workout_session:",
      "workout_draft:",
      "workout_session_draft:",
      "active_workout_store:",
    ];

    for (const prefix of prefixes) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && key.startsWith(prefix)) {
          return key.slice(prefix.length);
        }
      }
    }
  } catch {
    return "";
  }

  return "";
}

function clampNumber(value: number, min: number, max?: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (typeof max === "number") {
    return Math.min(Math.max(value, min), max);
  }

  return Math.max(value, min);
}

// Plattar ut blocks till en linjär lista där det behövs.
// Run-motorn använder fortfarande denna ordning för vissa delar av flödet.
function getAllExercises(workout: Workout | null): Exercise[] {
  if (!workout?.blocks?.length) {
    return [];
  }

  return workout.blocks.flatMap((block) => block.exercises ?? []);
}

// Hitta var en övning ligger i blocks-strukturen.
// Behövs när användaren ändrar sets/reps/rest/duration under passet.
function findExerciseLocation(
  workout: Workout | null,
  exerciseId: string,
): { blockIndex: number; exerciseIndex: number } | null {
  if (!workout?.blocks?.length) {
    return null;
  }

  for (let blockIndex = 0; blockIndex < workout.blocks.length; blockIndex += 1) {
    const block = workout.blocks[blockIndex];
    const exerciseIndex = block.exercises.findIndex((exercise) => exercise.id === exerciseId);

    if (exerciseIndex !== -1) {
      return { blockIndex, exerciseIndex };
    }
  }

  return null;
}

// Den strukturerade run-vyn behöver hela blockets övningar för att kunna
// visa en tydlig mobil sekvens och senare stödja autoscroll.
function getCurrentBlockExercises(
  workout: Workout | null,
  exerciseId: string | undefined,
): Exercise[] {
  if (!workout || !exerciseId) {
    return [];
  }

  const location = findExerciseLocation(workout, exerciseId);
  if (!location) {
    return [];
  }

  return workout.blocks[location.blockIndex]?.exercises ?? [];
}

function getCurrentBlockIndex(
  workout: Workout | null,
  exerciseId: string | undefined,
) {
  if (!workout || !exerciseId) {
    return 0;
  }

  const location = findExerciseLocation(workout, exerciseId);
  return location?.blockIndex ?? 0;
}

export default function RunPage() {
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState("");
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false);
  const [hasTriggeredAutoFinish, setHasTriggeredAutoFinish] = useState(false);
  const [useLegacyRunUi, setUseLegacyRunUi] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setUseLegacyRunUi(params.get("run_ui") === "legacy");
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        const data = (await response.json().catch(() => null)) as
          | { user?: AuthUser | null }
          | null;

        const user = data?.user ?? null;
        const nextUserId =
          user?.id !== undefined && user?.id !== null ? String(user.id) : "";

        if (!isMounted) {
          return;
        }

        if (nextUserId) {
          setAuthUser(user);
          setResolvedUserId(nextUserId);
          return;
        }

        setResolvedUserId(resolveLocalFallbackUserId());
      } catch {
        if (!isMounted) {
          return;
        }

        setResolvedUserId(resolveLocalFallbackUserId());
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!resolvedUserId) {
      setLoading(false);
      return;
    }

    try {
      const storedWorkout = getWorkoutDraft(resolvedUserId) as Workout | null;
      const normalizedWorkout = normalizePreviewWorkout(storedWorkout) as Workout | null;

      setWorkout(normalizedWorkout);
      setLoading(false);
      setPageError(null);
    } catch {
      setWorkout(null);
      setLoading(false);
      setPageError("Kunde inte läsa in pågående pass.");
    }
  }, [resolvedUserId]);

  const {
    currentExercise,
    currentBlockType,
    currentBlockTitle,
    currentBlockCoachNote,
    currentBlockExercisePosition,
    currentBlockExerciseCount,
    currentRound,
    currentRoundTotal,
    currentSet,
    reps,
    setReps,
    weight,
    updateWeight,
    chooseWeightChip,
    suggestedWeightValue,
    suggestedWeightLabel,
    progressionNote,
    weightUnitLabel,
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
  } = useActiveWorkout({
    userId: resolvedUserId,
    workout,
  });

  const allExercises = useMemo(() => getAllExercises(workout), [workout]);
  const currentBlockExercises = useMemo(() => {
    return getCurrentBlockExercises(workout, currentExercise?.id);
  }, [currentExercise?.id, workout]);
  const currentBlockIndex = useMemo(() => {
    return getCurrentBlockIndex(workout, currentExercise?.id);
  }, [currentExercise?.id, workout]);
  const totalPlannedSets = useMemo(() => {
    if (!workout?.blocks?.length) {
      return 0;
    }

    return workout.blocks.reduce((sum, block) => {
      return (
        sum +
        block.exercises.reduce((blockSum, exercise) => {
          return blockSum + Math.max(1, exercise.sets ?? 1);
        }, 0)
      );
    }, 0);
  }, [workout]);

  const nextExerciseName = useMemo(() => {
    if (!currentExercise || allExercises.length === 0) {
      return "";
    }

    const currentIndex = allExercises.findIndex((item) => item.id === currentExercise.id);

    if (currentIndex === -1) {
      return "";
    }

    return allExercises[currentIndex + 1]?.name ?? "";
  }, [allExercises, currentExercise]);

  const primaryButtonLabel = useMemo(() => {
    if (timedExercise) {
      if (timerState === "idle") {
        return "Starta set";
      }
      if (timerState === "running") {
        return "Stoppa set";
      }
      return "Spara set";
    }

    return "Spara set";
  }, [timedExercise, timerState]);

  const timedExercisesCount = useMemo(() => {
    return allExercises.filter((exercise) => {
      return typeof exercise.duration === "number" && exercise.duration > 0;
    }).length;
  }, [allExercises]);

  // Auto-finish när passet första gången går i mål.
  useEffect(() => {
    if (!isWorkoutComplete || hasTriggeredAutoFinish) {
      return;
    }

    setHasTriggeredAutoFinish(true);
    finishWorkout();
  }, [finishWorkout, hasTriggeredAutoFinish, isWorkoutComplete]);

  function persistWorkoutDraft(nextWorkout: Workout | null) {
    if (!resolvedUserId || !nextWorkout) {
      return;
    }

    try {
      saveWorkoutDraft(resolvedUserId, nextWorkout);
    } catch {
      setPageError("Kunde inte spara ändring i passupplägget lokalt.");
    }
  }

  function clearLocalRunState() {
    if (!resolvedUserId) {
      return;
    }

    clearActiveWorkoutSessionDraft(resolvedUserId);
    clearWorkoutDraft(resolvedUserId);
  }

  function updateCurrentExerciseField(field: keyof Exercise, value: number) {
    setWorkout((previous) => {
      if (!previous || !currentExercise) {
        return previous;
      }

      const location = findExerciseLocation(previous, currentExercise.id);
      if (!location) {
        return previous;
      }

      const nextBlocks = [...previous.blocks];
      const targetBlock = nextBlocks[location.blockIndex];
      const nextExercises = [...targetBlock.exercises];
      const targetExercise = nextExercises[location.exerciseIndex];

      nextExercises[location.exerciseIndex] = {
        ...targetExercise,
        [field]: value,
      };

      nextBlocks[location.blockIndex] = {
        ...targetBlock,
        exercises: nextExercises,
      };

      const nextWorkout: Workout = {
        ...previous,
        blocks: nextBlocks,
      };

      // Viktigt för offline-first så att planändringar inte tappas.
      persistWorkoutDraft(nextWorkout);

      return nextWorkout;
    });
  }

  function handleIncreaseSets() {
    updateCurrentExerciseField(
      "sets",
      clampNumber((currentExercise?.sets ?? 1) + 1, 1, 10),
    );
  }

  function handleDecreaseSets() {
    updateCurrentExerciseField(
      "sets",
      clampNumber((currentExercise?.sets ?? 1) - 1, 1, 10),
    );
  }

  function handleIncreaseReps() {
    updateCurrentExerciseField(
      "reps",
      clampNumber((currentExercise?.reps ?? 8) + 1, 1, 30),
    );
  }

  function handleDecreaseReps() {
    updateCurrentExerciseField(
      "reps",
      clampNumber((currentExercise?.reps ?? 8) - 1, 1, 30),
    );
  }

  function handleIncreaseDuration() {
    updateCurrentExerciseField(
      "duration",
      clampNumber((currentExercise?.duration ?? 30) + 5, 5, 300),
    );
  }

  function handleDecreaseDuration() {
    updateCurrentExerciseField(
      "duration",
      clampNumber((currentExercise?.duration ?? 30) - 5, 5, 300),
    );
  }

  function handleIncreaseRest() {
    updateCurrentExerciseField(
      "rest",
      clampNumber((currentExercise?.rest ?? 45) + 15, 0, 300),
    );
  }

  function handleDecreaseRest() {
    updateCurrentExerciseField(
      "rest",
      clampNumber((currentExercise?.rest ?? 45) - 15, 0, 300),
    );
  }

  function handlePrimaryAction() {
    if (timedExercise) {
      if (timerState === "idle") {
        startTimer();
        return;
      }

      if (timerState === "running") {
        stopTimer();
        return;
      }

      saveSet();
      return;
    }

    saveSet();
  }

  function handleGoHome() {
    clearLocalRunState();
    router.push("/home");
  }

  function handleSkipExerciseFromSheet() {
    setOptionsOpen(false);
    skipExercise();
  }

  function handleAbortFromSheet() {
    setOptionsOpen(false);
    setAbortConfirmOpen(true);
  }

  function confirmAbortWorkout() {
    setAbortConfirmOpen(false);
    abortWorkout();
    clearLocalRunState();
    router.push("/home");
  }

  function handleResetTimedSetFromSheet() {
    setOptionsOpen(false);
    resetTimer();
  }

  if (loading) {
    return <div className="p-6">Laddar pass...</div>;
  }

  if (!workout || !resolvedUserId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Inget aktivt pass hittades</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Gå tillbaka till home och starta ett nytt pass.
          </p>

          <button
            type="button"
            onClick={() => router.push("/home")}
            className={cn(uiButtonClasses.primary, "mt-4")}
          >
            Till home
          </button>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  if (isWorkoutComplete) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <div className="space-y-6">
          <RunFinishSummary
            userId={resolvedUserId}
            workoutName={workout.name}
            goal={workout.goal}
            totalCompletedSets={totalCompletedSets}
            totalVolume={Math.round(totalVolume)}
            timedExercises={timedExercisesCount}
            durationMinutes={workout.duration}
            completedExercises={completedExercises}
          />

          <button
            type="button"
            onClick={handleGoHome}
            className={cn(uiButtonClasses.primary, "w-full")}
          >
            Till home
          </button>
        </div>
      </main>
    );
  }

  const screenProps: RunScreenProps = {
    workoutName: workout.name,
    displayName: getDisplayName(authUser),
    pageError,
    restoreNotice,
    saveStatus,
    pendingSyncCount,
    totalPlannedSets,
    currentExercise,
    currentExerciseId: currentExercise?.id ?? null,
    currentBlockIndex,
    currentBlockType,
    currentBlockTitle,
    currentBlockCoachNote,
    currentBlockExercisePosition,
    currentBlockExerciseCount,
    currentBlockExercises,
    workoutBlocks: workout.blocks,
    currentRound,
    currentRoundTotal,
    currentSet,
    reps,
    setReps,
    weight,
    updateWeight,
    chooseWeightChip,
    suggestedWeightValue,
    suggestedWeightLabel,
    progressionNote,
    weightUnitLabel,
    weightChipOptions,
    timedExercise,
    timerState,
    elapsedSeconds,
    showRestTimer,
    restTimerRunning,
    setRestTimerRunning,
    restRemainingSeconds,
    primaryButtonLabel,
    nextExerciseName,
    totalCompletedSets,
    totalVolume,
    showExerciseFeedback,
    selectedExtraReps,
    setSelectedExtraReps,
    selectedTimedEffort,
    setSelectedTimedEffort,
    moveToNextExercise,
    submitExerciseFeedback,
    skipExercise,
    resetTimer,
    handlePrimaryAction,
    optionsOpen,
    setOptionsOpen,
    abortConfirmOpen,
    setAbortConfirmOpen,
    handleSkipExerciseFromSheet,
    handleAbortFromSheet,
    handleResetTimedSetFromSheet,
    handleIncreaseSets,
    handleDecreaseSets,
    handleIncreaseReps,
    handleDecreaseReps,
    handleIncreaseDuration,
    handleDecreaseDuration,
    handleIncreaseRest,
    handleDecreaseRest,
    confirmAbortWorkout,
  };

  if (useLegacyRunUi) {
    return <RunScreenLegacy {...screenProps} />;
  }

  return <RunScreenStructured {...screenProps} />;
}
