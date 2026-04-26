"use client";

import CurrentExerciseCard from "@/components/run/current-exercise-card";
import EffortFeedbackRow from "@/components/run/effort-feedback-row";
import NextExerciseHint from "@/components/run/next-exercise-hint";
import RunHeader from "@/components/run/run-header";
import RunOptionsSheet from "@/components/run/run-options-sheet";
import RunResumeBanner from "@/components/run/run-resume-banner";
import RunSaveStatus from "@/components/run/run-save-status";
import SetProgress from "@/components/run/set-progress";
import ConfirmSheet from "@/components/shared/confirm-sheet";
import { uiButtonClasses } from "@/lib/ui/button-classes";

import type { RunScreenProps } from "./run-screen-props";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function RunScreenLegacy(props: RunScreenProps) {
  const {
    workoutName,
    displayName,
    pageError,
    restoreNotice,
    saveStatus,
    pendingSyncCount,
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
    showRestTimer,
    restTimerRunning,
    setRestTimerRunning,
    restRemainingSeconds,
    primaryButtonLabel,
    nextExerciseName,
    totalCompletedSets,
    totalVolume,
    showExerciseFeedback,
    feedbackExercise,
    feedbackExerciseIndex,
    feedbackExerciseQueue,
    feedbackTimedExercise,
    selectedExtraReps,
    setSelectedExtraReps,
    selectedTimedEffort,
    setSelectedTimedEffort,
    skipExerciseFeedback,
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
  } = props;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="space-y-6">
        <RunHeader
          workoutName={workoutName}
          displayName={displayName}
          onAbort={() => setAbortConfirmOpen(true)}
          onOpenOptions={() => setOptionsOpen(true)}
        />

        {pageError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {pageError}
          </div>
        ) : null}

        <RunResumeBanner restoreNotice={restoreNotice} />
        <RunSaveStatus
          status={saveStatus}
          restoreNotice={restoreNotice}
          pendingSyncCount={pendingSyncCount}
        />

        {currentExercise ? (
          <>
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Aktuell övning
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                {currentExercise.name}
              </h2>

              <div className="mt-3 flex flex-wrap gap-2">
                {currentBlockType === "superset" ? (
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    Superset
                  </span>
                ) : null}
                {currentBlockType === "circuit" ? (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    Circuit
                  </span>
                ) : null}
                {currentBlockExerciseCount > 1 ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    Övning {currentBlockExercisePosition} av {currentBlockExerciseCount}
                  </span>
                ) : null}
                {currentBlockType === "superset" || currentBlockType === "circuit" ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    Varv {currentRound} av {currentRoundTotal}
                  </span>
                ) : null}
              </div>

              {currentBlockTitle || currentBlockCoachNote ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  {currentBlockTitle ? (
                    <p className="text-sm font-semibold text-slate-900">
                      {currentBlockTitle}
                    </p>
                  ) : null}
                  {currentBlockCoachNote ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {currentBlockCoachNote}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4">
                <SetProgress
                  currentSet={
                    currentBlockType === "superset" || currentBlockType === "circuit"
                      ? currentRound
                      : currentSet
                  }
                  totalSets={
                    currentBlockType === "superset" || currentBlockType === "circuit"
                      ? currentRoundTotal
                      : currentExercise.sets
                  }
                />
              </div>

              {!showExerciseFeedback ? (
                <CurrentExerciseCard
                  description={currentExercise.description}
                  ringSetup={currentExercise.ringSetup}
                  timedExercise={timedExercise}
                  reps={reps}
                  onRepsChange={setReps}
                  plannedReps={currentExercise.reps ?? undefined}
                  weight={weight}
                  onWeightChange={updateWeight}
                  suggestedWeightValue={suggestedWeightValue}
                  suggestedWeightLabel={suggestedWeightLabel}
                  progressionNote={progressionNote}
                  weightUnitLabel={weightUnitLabel}
                  weightChipOptions={weightChipOptions}
                  onWeightChipSelect={chooseWeightChip}
                  elapsedSeconds={elapsedSeconds}
                  targetDurationSeconds={currentExercise.duration ?? undefined}
                  timerState={timerState}
                  showRestTimer={showRestTimer}
                  restRemainingSeconds={restRemainingSeconds}
                  restTimerRunning={restTimerRunning}
                  onToggleRestTimer={() => {
                    setRestTimerRunning(!restTimerRunning);
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Feedback {feedbackExerciseQueue.length > 1
                        ? `${feedbackExerciseIndex + 1}/${feedbackExerciseQueue.length}`
                        : ""}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      {feedbackExercise?.name ?? currentExercise.name}
                    </h3>
                  </div>
                  {feedbackTimedExercise ? (
                    <EffortFeedbackRow
                      mode="timed"
                      value={selectedTimedEffort}
                      onChange={setSelectedTimedEffort}
                      onSkip={skipExerciseFeedback}
                      onContinue={submitExerciseFeedback}
                    />
                  ) : (
                    <EffortFeedbackRow
                      mode="reps"
                      value={selectedExtraReps}
                      onChange={setSelectedExtraReps}
                      onSkip={skipExerciseFeedback}
                      onContinue={submitExerciseFeedback}
                    />
                  )}
                </div>
              )}

              {!showExerciseFeedback ? (
                <div className="mt-5">
                  <NextExerciseHint nextExerciseName={nextExerciseName} />
                </div>
              ) : null}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Genomförda set
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {totalCompletedSets}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total volym
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {Math.round(totalVolume)}
                </p>
              </div>
            </section>
          </>
        ) : null}

        {!showExerciseFeedback ? (
          <div className="flex flex-col gap-3 sm:flex-row">
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
                className={cn(uiButtonClasses.secondary, "flex-1")}
              >
                Kör igen
              </button>
            ) : null}

            <button
              type="button"
              onClick={handlePrimaryAction}
              className={cn(uiButtonClasses.primary, "flex-1")}
            >
              {primaryButtonLabel}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={skipExerciseFeedback}
              className={cn(uiButtonClasses.secondary, "flex-1")}
            >
              Hoppa över feedback
            </button>

            <button
              type="button"
              onClick={submitExerciseFeedback}
              className={cn(uiButtonClasses.primary, "flex-1")}
            >
              Fortsätt
            </button>
          </div>
        )}
      </div>

      <RunOptionsSheet
        open={optionsOpen}
        currentExerciseName={currentExercise?.name}
        plannedSets={currentExercise?.sets}
        plannedReps={currentExercise?.reps ?? undefined}
        plannedDuration={currentExercise?.duration ?? undefined}
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
