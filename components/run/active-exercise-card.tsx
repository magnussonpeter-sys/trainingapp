"use client";

import { useEffect, useState } from "react";

import EffortFeedbackRow from "@/components/run/effort-feedback-row";
import TimerPanel from "@/components/run/timer-panel";
import WeightChipRow from "@/components/run/weight-chip-row";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import type { ExtraRepsOption } from "@/lib/workout-log-storage";
import type { TimedEffortOption } from "@/types/exercise-feedback";
import type { Exercise } from "@/types/workout";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function shouldShowWeightInput(params: {
  exercise: Exercise;
  weight: string;
  suggestedWeightValue: string;
  weightChipOptions: string[];
}) {
  const { exercise, weight, suggestedWeightValue, weightChipOptions } = params;

  return Boolean(
    weight.trim() ||
      suggestedWeightValue.trim() ||
      weightChipOptions.length > 0 ||
      (exercise.availableWeightsKg?.length ?? 0) > 0 ||
      exercise.suggestedWeight !== null &&
        exercise.suggestedWeight !== undefined &&
        exercise.suggestedWeight !== "",
  );
}

function formatStructure(exercise: Exercise, blockType: string) {
  const perSet =
    typeof exercise.duration === "number" && exercise.duration > 0
      ? `${exercise.duration}s`
      : `${exercise.reps ?? "-"} reps`;

  const setWord = exercise.sets === 1 ? "set" : "set";
  const blockSuffix = blockType === "superset" ? " per varv" : "";

  return `${perSet} × ${exercise.sets} ${setWord}${blockSuffix}`;
}

type ActiveExerciseCardProps = {
  exercise: Exercise | null;
  blockType: "straight_sets" | "superset" | "circuit";
  currentSet: number;
  currentSetTotal: number;
  currentRound: number;
  currentRoundTotal: number;
  currentExerciseIndex: number;
  currentExerciseCount: number;
  nextStepLabel?: string;
  timedExercise: boolean;
  timerState: "idle" | "running" | "ready_to_save";
  elapsedSeconds: number;
  reps: string;
  onRepsChange: (value: string) => void;
  weight: string;
  onWeightChange: (value: string) => void;
  onWeightChipSelect: (value: string) => void;
  suggestedWeightValue: string;
  weightUnitLabel: string;
  weightChipOptions: string[];
  primaryButtonLabel: string;
  onPrimaryAction: () => void;
  onSkip: () => void;
  showRestTimer: boolean;
  restRemainingSeconds: number;
  showExerciseFeedback: boolean;
  selectedExtraReps: ExtraRepsOption | null;
  setSelectedExtraReps: (value: ExtraRepsOption | null) => void;
  selectedTimedEffort: TimedEffortOption | null;
  setSelectedTimedEffort: (value: TimedEffortOption | null) => void;
  onSkipFeedback: () => void;
  onSubmitFeedback: () => void;
};

export default function ActiveExerciseCard({
  exercise,
  blockType,
  currentSet,
  currentSetTotal,
  currentRound,
  currentRoundTotal,
  currentExerciseIndex,
  currentExerciseCount,
  nextStepLabel,
  timedExercise,
  timerState,
  elapsedSeconds,
  reps,
  onRepsChange,
  weight,
  onWeightChange,
  onWeightChipSelect,
  suggestedWeightValue,
  weightUnitLabel,
  weightChipOptions,
  primaryButtonLabel,
  onPrimaryAction,
  onSkip,
  showRestTimer,
  restRemainingSeconds,
  showExerciseFeedback,
  selectedExtraReps,
  setSelectedExtraReps,
  selectedTimedEffort,
  setSelectedTimedEffort,
  onSkipFeedback,
  onSubmitFeedback,
}: ActiveExerciseCardProps) {
  const [showDescription, setShowDescription] = useState(false);
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [showWeightEditor, setShowWeightEditor] = useState(false);

  useEffect(() => {
    setShowDescription(false);
    setShowWeightPicker(false);
    setShowWeightEditor(false);
  }, [exercise?.id, currentSet, currentRound, showExerciseFeedback]);

  if (!exercise) {
    return null;
  }

  const showWeightInput = shouldShowWeightInput({
    exercise,
    weight,
    suggestedWeightValue,
    weightChipOptions,
  });

  const stepLabel =
    blockType === "superset"
      ? `A${currentExerciseIndex} · Varv ${currentRound} av ${currentRoundTotal}`
      : `Set ${currentSet} av ${currentSetTotal}`;

  return (
    <section className="rounded-[32px] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      {showExerciseFeedback ? (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Feedback
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Hur kändes det?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Spara upplevelsen snabbt innan nästa steg.
            </p>
          </div>

          {timedExercise ? (
            <EffortFeedbackRow
              mode="timed"
              value={selectedTimedEffort}
              onChange={setSelectedTimedEffort}
              onSkip={onSkipFeedback}
              onContinue={onSubmitFeedback}
            />
          ) : (
            <EffortFeedbackRow
              mode="reps"
              value={selectedExtraReps}
              onChange={setSelectedExtraReps}
              onSkip={onSkipFeedback}
              onContinue={onSubmitFeedback}
            />
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Aktiv övning
            </p>

            <button
              type="button"
              onClick={() => setShowDescription((previous) => !previous)}
              className="mt-2 text-left"
            >
              <h2 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-950">
                {exercise.name}
              </h2>
            </button>

            <p className="mt-2 text-base text-slate-500">
              {formatStructure(exercise, blockType)}
            </p>
          </div>

          {showDescription ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {exercise.description?.trim() || "Ingen beskrivning tillgänglig ännu."}
            </div>
          ) : null}

          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{stepLabel}</p>
            <p className="mt-1 text-sm text-slate-500">
              {nextStepLabel ? `Nästa: ${nextStepLabel}` : "Fokusera på detta set nu."}
            </p>
          </div>

          {timedExercise ? (
            <TimerPanel
              elapsedSeconds={elapsedSeconds}
              targetDurationSeconds={exercise.duration ?? undefined}
              timerState={timerState}
            />
          ) : null}

          {showRestTimer ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Vila nu: <span className="font-semibold">{restRemainingSeconds}s</span>
            </div>
          ) : null}

          {showWeightInput && showWeightEditor ? (
            <div className="space-y-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Vikt</p>
                <button
                  type="button"
                  onClick={() => setShowWeightEditor(false)}
                  className={uiButtonClasses.ghost}
                >
                  Klar
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowWeightPicker((previous) => !previous)}
                className="flex w-full items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left"
              >
                <span className="text-2xl font-semibold text-slate-900">
                  {weight || suggestedWeightValue || "Ange vikt"}
                </span>
                <span className="pb-1 text-sm font-medium text-slate-500">
                  {weightUnitLabel}
                </span>
              </button>

              {showWeightPicker ? (
                <WeightChipRow
                  chips={weightChipOptions}
                  selectedWeight={weight}
                  suggestedWeight={suggestedWeightValue}
                  unitLabel={weightUnitLabel}
                  onSelect={onWeightChipSelect}
                />
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  Reps
                </p>
                <input
                  inputMode="numeric"
                  value={reps}
                  onChange={(event) => onRepsChange(event.target.value)}
                  className="mt-2 w-full border-none bg-transparent p-0 text-2xl font-semibold text-slate-900 outline-none"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <button
              type="button"
              onClick={onPrimaryAction}
              className={cn(
                uiButtonClasses.primary,
                "w-full justify-center rounded-[20px] py-4 text-base shadow-[0_10px_30px_rgba(74,222,128,0.28)]",
              )}
            >
              {primaryButtonLabel}
            </button>

            <div className="flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                onClick={onSkip}
                className={uiButtonClasses.ghost}
              >
                Hoppa över
              </button>

              {showWeightInput ? (
                <>
                  <span className="text-slate-200">|</span>
                  <button
                    type="button"
                    onClick={() => setShowWeightEditor((previous) => !previous)}
                    className={uiButtonClasses.ghost}
                  >
                    Ändra vikt
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
