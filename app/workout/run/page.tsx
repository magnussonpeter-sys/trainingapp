"use client";

// /run-sidan.
// Fokus:
// - tunn huvudvy
// - robust offline-first
// - enkel debugpanel för Sprint 3-testning

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CurrentExerciseCard from "@/components/run/current-exercise-card";
import EffortFeedbackRow from "@/components/run/effort-feedback-row";
import NextExerciseHint from "@/components/run/next-exercise-hint";
import RunHeader from "@/components/run/run-header";
import RunOptionsSheet from "@/components/run/run-options-sheet";
import RunSaveStatus from "@/components/run/run-save-status";
import SetProgress from "@/components/run/set-progress";
import { clearActiveWorkoutSessionDraft } from "@/lib/active-workout-session-storage";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  clearWorkoutDraft,
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import {
  getActiveWorkoutSnapshot,
} from "@/lib/workout-flow/active-workout-store";
import {
  getSessionDraft,
} from "@/lib/workout-flow/session-draft-store";
import {
  getPendingSyncQueue,
} from "@/lib/workout-flow/pending-sync-store";
import { useActiveWorkout } from "@/hooks/use-active-workout";
import type { Workout } from "@/types/workout";

type AuthUser = {
  id?: string | number | null;
  name?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
};

type DebugSnapshot = {
  origin: string;
  href: string;
  resolvedUserId: string;
  pendingSyncQueue: unknown;
  sessionDraft: unknown;
  activeWorkoutSnapshot: unknown;
  workoutDraft: unknown;
  localStorageAccessible: boolean;
  readError: string | null;
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

// Läser debugdata säkert via våra store-funktioner.
// Då slipper vi problem med att DevTools ibland hamnar i fel frame/context.
function readRunDebugSnapshot(userId: string): DebugSnapshot {
  if (typeof window === "undefined") {
    return {
      origin: "",
      href: "",
      resolvedUserId: userId,
      pendingSyncQueue: null,
      sessionDraft: null,
      activeWorkoutSnapshot: null,
      workoutDraft: null,
      localStorageAccessible: false,
      readError: "window saknas",
    };
  }

  try {
    // Bara för att verifiera att localStorage faktiskt går att nå i denna context.
    void window.localStorage;

    return {
      origin: window.location.origin,
      href: window.location.href,
      resolvedUserId: userId,
      pendingSyncQueue: getPendingSyncQueue(),
      sessionDraft: userId ? getSessionDraft(userId) : null,
      activeWorkoutSnapshot: userId ? getActiveWorkoutSnapshot(userId) : null,
      workoutDraft: userId ? getWorkoutDraft(userId) : null,
      localStorageAccessible: true,
      readError: null,
    };
  } catch (error) {
    return {
      origin: window.location.origin,
      href: window.location.href,
      resolvedUserId: userId,
      pendingSyncQueue: null,
      sessionDraft: null,
      activeWorkoutSnapshot: null,
      workoutDraft: null,
      localStorageAccessible: false,
      readError: error instanceof Error ? error.message : "Okänt debugfel",
    };
  }
}

function DebugPanel({
  resolvedUserId,
}: {
  resolvedUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState<DebugSnapshot | null>(null);

  function refreshDebug() {
    setDebugSnapshot(readRunDebugSnapshot(resolvedUserId));
  }

  useEffect(() => {
    // Läs direkt när panelen öppnas eller userId ändras.
    if (!open) {
      return;
    }

    refreshDebug();
  }, [open, resolvedUserId]);

  return (
    <section className="mt-4 rounded-[28px] border border-amber-200 bg-amber-50 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700">
            Debug
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Använd detta för att kontrollera offline-lager utan DevTools-problem.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshDebug}
            className={uiButtonClasses.secondary}
          >
            Uppdatera
          </button>

          <button
            type="button"
            onClick={() => setOpen((previous) => !previous)}
            className={uiButtonClasses.secondary}
          >
            {open ? "Dölj" : "Visa"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-amber-200 px-4 py-4 sm:px-5">
          {debugSnapshot ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-200 bg-white p-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">Context</p>
                  <p className="mt-2 break-all">
                    <span className="font-medium">origin:</span>{" "}
                    {debugSnapshot.origin || "saknas"}
                  </p>
                  <p className="mt-1 break-all">
                    <span className="font-medium">href:</span>{" "}
                    {debugSnapshot.href || "saknas"}
                  </p>
                  <p className="mt-1 break-all">
                    <span className="font-medium">resolvedUserId:</span>{" "}
                    {debugSnapshot.resolvedUserId || "saknas"}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">localStorage:</span>{" "}
                    {debugSnapshot.localStorageAccessible ? "ok" : "ej åtkomlig"}
                  </p>
                  {debugSnapshot.readError ? (
                    <p className="mt-2 text-rose-700">
                      <span className="font-medium">fel:</span>{" "}
                      {debugSnapshot.readError}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-amber-200 bg-white p-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">Snabbkontroll</p>
                  <p className="mt-2">
                    <span className="font-medium">Pending queue count:</span>{" "}
                    {Array.isArray(debugSnapshot.pendingSyncQueue)
                      ? debugSnapshot.pendingSyncQueue.length
                      : 0}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Session draft:</span>{" "}
                    {debugSnapshot.sessionDraft ? "finns" : "saknas"}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Active snapshot:</span>{" "}
                    {debugSnapshot.activeWorkoutSnapshot ? "finns" : "saknas"}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Workout draft:</span>{" "}
                    {debugSnapshot.workoutDraft ? "finns" : "saknas"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-200 bg-white p-3">
                  <p className="text-sm font-medium text-slate-900">
                    Pending sync queue
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                    {JSON.stringify(debugSnapshot.pendingSyncQueue, null, 2)}
                  </pre>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-white p-3">
                  <p className="text-sm font-medium text-slate-900">
                    Session draft
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                    {JSON.stringify(debugSnapshot.sessionDraft, null, 2)}
                  </pre>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-white p-3">
                  <p className="text-sm font-medium text-slate-900">
                    Active workout snapshot
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                    {JSON.stringify(
                      debugSnapshot.activeWorkoutSnapshot,
                      null,
                      2,
                    )}
                  </pre>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-white p-3">
                  <p className="text-sm font-medium text-slate-900">
                    Workout draft
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                    {JSON.stringify(debugSnapshot.workoutDraft, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-700">
              Tryck på <span className="font-medium">Uppdatera</span> för att läsa
              debugdata.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function RunPage() {
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState("");
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);

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
      const normalizedWorkout = normalizePreviewWorkout(
        storedWorkout,
      ) as Workout | null;

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
  } = useActiveWorkout({
    userId: resolvedUserId,
    workout,
  });

  const nextExerciseName = useMemo(() => {
    if (!workout || !currentExercise) {
      return "";
    }

    const currentIndex = workout.exercises.findIndex(
      (item) => item.id === currentExercise.id,
    );

    if (currentIndex === -1) {
      return "";
    }

    return workout.exercises[currentIndex + 1]?.name ?? "";
  }, [currentExercise, workout]);

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

  function updateCurrentExerciseField(field: string, value: number) {
    setWorkout((previous) => {
      if (!previous || !currentExercise) {
        return previous;
      }

      const nextExercises = previous.exercises.map((exercise) => {
        if (exercise.id !== currentExercise.id) {
          return exercise;
        }

        return {
          ...exercise,
          [field]: value,
        };
      });

      const nextWorkout = {
        ...previous,
        exercises: nextExercises,
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

  function handleFinishWorkout() {
    // Kör hookens finish-flöde först så att pending sync verkligen skrivs.
    finishWorkout();
  }

  function handleSkipExerciseFromSheet() {
    setOptionsOpen(false);
    skipExercise();
  }

  function handleAbortFromSheet() {
    setOptionsOpen(false);
    abortWorkout();
    router.push("/home");
  }

  function handleResetTimedSetFromSheet() {
    setOptionsOpen(false);
    resetTimer();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Laddar pass...</p>
          </section>
        </div>
      </main>
    );
  }

  if (!workout || !resolvedUserId) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm leading-6 text-slate-600">
              Inget aktivt pass hittades. Gå tillbaka till home och starta ett
              nytt pass.
            </p>

            <button
              type="button"
              onClick={() => router.push("/home")}
              className={cn(uiButtonClasses.primary, "mt-4")}
            >
              Till home
            </button>
          </section>

          {pageError ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {pageError}
            </section>
          ) : null}

          <DebugPanel resolvedUserId={resolvedUserId} />
        </div>
      </main>
    );
  }

  if (isWorkoutComplete) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
            <div className="bg-slate-900 px-6 py-6 text-white">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
                Pass klart
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {workout.name}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Bra jobbat, {getDisplayName(authUser)}.
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <RunSaveStatus
                status={saveStatus}
                restoreNotice={restoreNotice}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                    Genomförda set
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {totalCompletedSets}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                    Total volym
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {Math.round(totalVolume)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <p className="font-medium">Pending sync just nu</p>
                <p className="mt-1">
                  {pendingSyncCount} objekt i lokal kö.
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleFinishWorkout}
              className={cn(uiButtonClasses.primary, "w-full")}
            >
              Spara avslutat pass
            </button>

            <button
              type="button"
              onClick={handleGoHome}
              className={cn(uiButtonClasses.secondary, "w-full")}
            >
              Till home
            </button>
          </div>

          <DebugPanel resolvedUserId={resolvedUserId} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-32">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <RunHeader
            workoutName={workout.name}
            displayName={getDisplayName(authUser)}
            onAbort={handleGoHome}
            onOpenOptions={() => setOptionsOpen(true)}
          />

          <div className="space-y-4 px-5 py-5">
            {pageError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {pageError}
              </div>
            ) : null}

            <RunSaveStatus status={saveStatus} restoreNotice={restoreNotice} />

            {currentExercise ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                      Aktuell övning
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                      {currentExercise.name}
                    </h2>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      Set
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {currentSet} / {currentExercise.sets}
                    </p>
                  </div>
                </div>

                <SetProgress
                  totalSets={currentExercise.sets}
                  currentSet={currentSet}
                />

                {!showExerciseFeedback ? (
                  <CurrentExerciseCard
                    description={currentExercise.description}
                    timedExercise={timedExercise}
                    reps={reps}
                    onRepsChange={setReps}
                    plannedReps={currentExercise.reps}
                    weight={weight}
                    onWeightChange={updateWeight}
                    suggestedWeightValue={suggestedWeightValue}
                    weightChipOptions={weightChipOptions}
                    onWeightChipSelect={chooseWeightChip}
                    elapsedSeconds={elapsedSeconds}
                    targetDurationSeconds={currentExercise.duration}
                    timerState={timerState}
                    showRestTimer={showRestTimer}
                    restRemainingSeconds={restRemainingSeconds}
                    restTimerRunning={restTimerRunning}
                    onToggleRestTimer={() =>
                      setRestTimerRunning(!restTimerRunning)
                    }
                  />
                ) : timedExercise ? (
                  <EffortFeedbackRow
                    mode="timed"
                    value={selectedTimedEffort}
                    onChange={setSelectedTimedEffort}
                    onSkip={moveToNextExercise}
                    onContinue={submitExerciseFeedback}
                  />
                ) : (
                  <EffortFeedbackRow
                    mode="reps"
                    value={selectedExtraReps}
                    onChange={setSelectedExtraReps}
                    onSkip={moveToNextExercise}
                    onContinue={submitExerciseFeedback}
                  />
                )}

                {!showExerciseFeedback ? (
                  <NextExerciseHint nextExerciseName={nextExerciseName} />
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      Genomförda set
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {totalCompletedSets}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      Total volym
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {Math.round(totalVolume)}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>

        <DebugPanel resolvedUserId={resolvedUserId} />
      </div>

      {!showExerciseFeedback ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <button
              type="button"
              onClick={skipExercise}
              className={cn(uiButtonClasses.secondary, "flex-1")}
            >
              Hoppa över
            </button>

            {timedExercise && timerState === "ready_to_save" ? (
              <button
                type="button"
                onClick={resetTimer}
                className={uiButtonClasses.secondary}
              >
                Kör igen
              </button>
            ) : null}

            <button
              type="button"
              onClick={handlePrimaryAction}
              className={cn(uiButtonClasses.primary, "flex-[1.4]")}
            >
              {primaryButtonLabel}
            </button>
          </div>
        </div>
      ) : null}

      <RunOptionsSheet
        open={optionsOpen}
        currentExerciseName={currentExercise?.name}
        plannedSets={currentExercise?.sets}
        plannedReps={currentExercise?.reps}
        plannedDuration={currentExercise?.duration}
        plannedRest={currentExercise?.rest}
        timedExercise={timedExercise}
        timerState={timerState}
        onClose={() => setOptionsOpen(false)}
        onSkipExercise={handleSkipExerciseFromSheet}
        onAbortWorkout={handleAbortFromSheet}
        onResetTimedSet={handleResetTimedSetFromSheet}
        onIncreaseSets={handleIncreaseSets}
        onDecreaseSets={handleDecreaseSets}
        onIncreaseReps={handleIncreaseReps}
        onDecreaseReps={handleDecreaseReps}
        onIncreaseDuration={handleIncreaseDuration}
        onDecreaseDuration={handleDecreaseDuration}
        onIncreaseRest={handleIncreaseRest}
        onDecreaseRest={handleDecreaseRest}
      />
    </main>
  );
}