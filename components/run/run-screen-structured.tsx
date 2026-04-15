"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ActiveExerciseCard from "@/components/run/active-exercise-card";
import ExerciseFlowIndicator from "@/components/run/exercise-flow-indicator";
import RunOptionsSheet from "@/components/run/run-options-sheet";
import WorkoutOverviewSheet, {
  buildOverviewItems,
} from "@/components/run/workout-overview-sheet";
import WorkoutProgressBar from "@/components/run/workout-progress-bar";
import ConfirmSheet from "@/components/shared/confirm-sheet";

import type { RunScreenProps } from "./run-screen-props";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getProgressPercent(totalCompletedSets: number, totalPlannedSets: number) {
  if (totalPlannedSets <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((totalCompletedSets / totalPlannedSets) * 100));
}

function getCurrentSetTotal(props: RunScreenProps) {
  if (!props.currentExercise) {
    return 1;
  }

  if (props.currentBlockType === "superset") {
    return props.currentRoundTotal;
  }

  return Math.max(1, props.currentExercise.sets);
}

function getPrimaryActionLabel(props: RunScreenProps, currentSetTotal: number) {
  // Keep the CTA self-explanatory so the active card can stay visually lighter.
  if (props.currentBlockType === "superset") {
    return `${props.primaryButtonLabel} A${props.currentBlockExercisePosition} · ${props.currentRound}/${props.currentRoundTotal}`;
  }

  return `${props.primaryButtonLabel} ${props.currentSet}/${currentSetTotal}`;
}

function playCountdownBeep() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextConstructor =
    window.AudioContext ||
    // @ts-expect-error Safari använder fortfarande webkit-prefix i vissa lägen.
    window.webkitAudioContext;

  if (!AudioContextConstructor) {
    return;
  }

  const audioContext = new AudioContextConstructor();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.2);

  window.setTimeout(() => {
    void audioContext.close().catch(() => undefined);
  }, 250);
}

export default function RunScreenStructured(props: RunScreenProps) {
  const {
    workoutName,
    pageError,
    totalPlannedSets,
    currentExercise,
    currentBlockType,
    currentBlockExercisePosition,
    currentBlockExerciseCount,
    currentBlockExercises,
    workoutBlocks,
    currentRound,
    currentRoundTotal,
    currentSet,
    totalCompletedSets,
    showExerciseFeedback,
    selectedExtraReps,
    setSelectedExtraReps,
    selectedTimedEffort,
    setSelectedTimedEffort,
    moveToNextExercise,
    submitExerciseFeedback,
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
  } = props;

  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const restCountdownRef = useRef<string | null>(null);
  const exerciseCountdownRef = useRef<string | null>(null);

  const progressPercent = getProgressPercent(totalCompletedSets, totalPlannedSets);
  const currentSetTotal = getCurrentSetTotal(props);
  const primaryActionLabel = getPrimaryActionLabel(props, currentSetTotal);
  const overviewHeight = isOverviewExpanded
    ? "min(50dvh, 400px)"
    : "min(18dvh, 148px)";
  const overviewItems = useMemo(() => {
    return buildOverviewItems({
      workoutBlocks,
      currentBlockIndex: props.currentBlockIndex,
      currentExerciseId: props.currentExerciseId,
    });
  }, [props.currentBlockIndex, props.currentExerciseId, workoutBlocks]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);

  useEffect(() => {
    if (!props.showRestTimer || props.restRemainingSeconds > 3 || props.restRemainingSeconds <= 0) {
      restCountdownRef.current = null;
      return;
    }

    const beepKey = `rest:${props.restRemainingSeconds}`;
    if (restCountdownRef.current === beepKey) {
      return;
    }

    restCountdownRef.current = beepKey;
    playCountdownBeep();
  }, [props.restRemainingSeconds, props.showRestTimer]);

  useEffect(() => {
    const targetDuration = props.currentExercise?.duration ?? 0;
    if (!props.timedExercise || props.timerState !== "running" || targetDuration <= 0) {
      exerciseCountdownRef.current = null;
      return;
    }

    const remainingSeconds = targetDuration - props.elapsedSeconds;
    if (remainingSeconds > 3 || remainingSeconds <= 0) {
      exerciseCountdownRef.current = null;
      return;
    }

    const beepKey = `exercise:${props.currentExercise?.id}:${remainingSeconds}`;
    if (exerciseCountdownRef.current === beepKey) {
      return;
    }

    exerciseCountdownRef.current = beepKey;
    playCountdownBeep();
  }, [
    props.currentExercise?.duration,
    props.currentExercise?.id,
    props.elapsedSeconds,
    props.timedExercise,
    props.timerState,
  ]);

  return (
    <main className="fixed inset-0 flex h-[100dvh] flex-col overflow-hidden overscroll-none bg-[radial-gradient(circle_at_top,_rgba(241,245,249,0.9),_rgba(248,250,252,1)_42%)]">
      <div className="z-30 border-b border-white/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="h-11 w-11 shrink-0" aria-hidden="true" />
            <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-slate-950">
              {workoutName}
            </h1>
            <button
              type="button"
              onClick={() => setOptionsOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-600 shadow-sm"
              aria-label="Öppna meny"
            >
              …
            </button>
          </div>

          <div className="mt-4">
            <WorkoutProgressBar percent={progressPercent} />
          </div>
        </div>
      </div>

      <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 overflow-hidden">
        <div
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-3 pt-4 sm:px-6"
          style={{
            paddingBottom: `calc(${overviewHeight} + env(safe-area-inset-bottom) + 12px)`,
          }}
        >
          {pageError ? (
            <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
              {pageError}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div className="space-y-3 pb-2">
              <ActiveExerciseCard
                exercise={currentExercise}
                blockType={currentBlockType}
                currentSet={currentSet}
                currentSetTotal={currentSetTotal}
                currentRound={currentRound}
                currentRoundTotal={currentRoundTotal}
                timedExercise={props.timedExercise}
                timerState={props.timerState}
                elapsedSeconds={props.elapsedSeconds}
                reps={props.reps}
                onRepsChange={props.setReps}
                weight={props.weight}
                onWeightChange={props.updateWeight}
                onWeightChipSelect={props.chooseWeightChip}
                suggestedWeightValue={props.suggestedWeightValue}
                weightUnitLabel={props.weightUnitLabel}
                weightChipOptions={props.weightChipOptions}
                primaryButtonLabel={primaryActionLabel}
                onPrimaryAction={props.handlePrimaryAction}
                onSkip={props.skipExercise}
                showRestTimer={props.showRestTimer}
                restRemainingSeconds={props.restRemainingSeconds}
                showExerciseFeedback={showExerciseFeedback}
                selectedExtraReps={selectedExtraReps}
                setSelectedExtraReps={setSelectedExtraReps}
                selectedTimedEffort={selectedTimedEffort}
                setSelectedTimedEffort={setSelectedTimedEffort}
                onSkipFeedback={moveToNextExercise}
                onSubmitFeedback={submitExerciseFeedback}
              />

              <div className="shrink-0">
                <ExerciseFlowIndicator
                  blockType={currentBlockType}
                  currentExercise={currentExercise}
                  currentExerciseIndex={currentBlockExercisePosition}
                  currentExerciseCount={currentBlockExerciseCount}
                  currentSet={currentSet}
                  currentSetTotal={currentSetTotal}
                  currentRound={currentRound}
                  currentRoundTotal={currentRoundTotal}
                  currentBlockExercises={currentBlockExercises}
                  showRestTimer={props.showRestTimer}
                  restRemainingSeconds={props.restRemainingSeconds}
                  nextExerciseName={props.nextExerciseName}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 mx-auto max-w-3xl px-2 transition-[height] duration-150 ease-out will-change-[height] sm:px-4"
          style={{ height: overviewHeight }}
        >
          <div className="pointer-events-auto h-full">
            <WorkoutOverviewSheet
              items={overviewItems}
              expanded={isOverviewExpanded}
              onSetExpanded={setIsOverviewExpanded}
            />
          </div>
        </div>
      </div>

      <RunOptionsSheet
        open={optionsOpen}
        currentExerciseName={currentExercise?.name}
        plannedSets={currentExercise?.sets}
        plannedReps={currentExercise?.reps ?? undefined}
        plannedDuration={currentExercise?.duration ?? undefined}
        plannedRest={currentExercise?.rest}
        timedExercise={Boolean(currentExercise?.duration)}
        timerState={props.timerState}
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

      <ConfirmSheet
        open={abortConfirmOpen}
        title="Avbryt passet?"
        description="Passet markeras som avbrutet. Du kan starta ett nytt pass från hem."
        confirmLabel="Avbryt pass"
        cancelLabel="Fortsätt träna"
        onConfirm={confirmAbortWorkout}
        onCancel={() => setAbortConfirmOpen(false)}
      />
    </main>
  );
}
