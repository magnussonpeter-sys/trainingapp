"use client";

import { useEffect, useState } from "react";

import EffortFeedbackRow from "@/components/run/effort-feedback-row";
import TimerPanel from "@/components/run/timer-panel";
import WeightChipRow from "@/components/run/weight-chip-row";
import {
  formatExerciseTarget,
  getSideSwitchSeconds,
  getTimedExerciseTotalSeconds,
} from "@/lib/exercise-execution";
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

function formatCurrentWeightLabel(params: {
  weight: string;
  suggestedWeightValue: string;
  weightUnitLabel: string;
}) {
  const value = params.weight.trim() || params.suggestedWeightValue.trim();
  if (!value) {
    return null;
  }

  return `${value} ${params.weightUnitLabel}`;
}

function formatExerciseLoad(exercise: Exercise, fallbackUnitLabel: string) {
  if (exercise.suggestedWeight === null || exercise.suggestedWeight === undefined || exercise.suggestedWeight === "") {
    return null;
  }

  return `${exercise.suggestedWeight} ${exercise.weightUnitLabel ?? fallbackUnitLabel}`;
}

function getExerciseLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function getSupersetProgressPercent(params: {
  exerciseCount: number;
  currentExercisePosition: number;
  currentRound: number;
  currentRoundTotal: number;
}) {
  const totalSteps = Math.max(1, params.exerciseCount * params.currentRoundTotal);
  // Display progress includes the active step so the bar feels alive during the set.
  const activeStep =
    (params.currentRound - 1) * params.exerciseCount +
    Math.max(1, params.currentExercisePosition);

  return Math.min(100, Math.round((activeStep / totalSteps) * 100));
}

type ActiveExerciseCardProps = {
  exercise: Exercise | null;
  blockType: "straight_sets" | "superset" | "circuit";
  blockLabel?: string;
  currentSet: number;
  currentSetTotal: number;
  currentRound: number;
  currentRoundTotal: number;
  currentBlockExercises: Exercise[];
  currentBlockExercisePosition: number;
  timedExercise: boolean;
  timerState: "idle" | "running" | "ready_to_save";
  elapsedSeconds: number;
  reps: string;
  onRepsChange: (value: string) => void;
  weight: string;
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
  blockLabel,
  currentSet,
  currentSetTotal,
  currentRound,
  currentRoundTotal,
  currentBlockExercises,
  currentBlockExercisePosition,
  timedExercise,
  timerState,
  elapsedSeconds,
  reps,
  onRepsChange,
  weight,
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
    // Reset secondary panels after React has committed the new active step.
    const resetPanelTimer = window.setTimeout(() => {
      setShowDescription(false);
      setShowWeightPicker(false);
      setShowWeightEditor(false);
    }, 0);

    return () => window.clearTimeout(resetPanelTimer);
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
  const currentWeightLabel = formatCurrentWeightLabel({
    weight,
    suggestedWeightValue,
    weightUnitLabel,
  });
  const activeMetricLabel = `${formatExerciseTarget(exercise)}${
    currentWeightLabel ? ` · ${currentWeightLabel}` : ""
  }`;
  const isSuperset = blockType === "superset";
  const supersetProgressPercent = getSupersetProgressPercent({
    exerciseCount: currentBlockExercises.length,
    currentExercisePosition: currentBlockExercisePosition,
    currentRound,
    currentRoundTotal,
  });
  const eyebrowLabel =
    isSuperset
      ? `${blockLabel ?? "SUPERSET"} (${currentRoundTotal} varv)`
      : "Aktiv övning";

  return (
    <section
      className={cn(
        "rounded-[32px] bg-white px-4 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)]",
        isSuperset
          ? "border-2 border-emerald-200/90"
          : "border border-slate-200/80",
      )}
    >
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
        <div className="space-y-3.5">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.22em]",
                  isSuperset
                    ? "text-emerald-700"
                    : "text-slate-400",
                )}
              >
                {eyebrowLabel}
              </p>

              {isSuperset ? (
                <p className="text-base font-semibold tracking-tight text-slate-950">
                  Varv {currentRound} / {currentRoundTotal}
                </p>
              ) : null}
            </div>

            {isSuperset ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
                  style={{ width: `${supersetProgressPercent}%` }}
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowDescription((previous) => !previous)}
              className="mt-4 w-full text-left"
            >
              <h2 className="truncate text-[clamp(2rem,8vw,2.85rem)] font-semibold leading-[1.02] tracking-tight text-slate-950">
                {exercise.name}
              </h2>
            </button>

            <p className="mt-2 text-[1.35rem] font-medium leading-tight tracking-tight text-slate-800">
              {activeMetricLabel}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {isSuperset
                ? `Övning ${currentBlockExercisePosition} av ${currentBlockExercises.length}`
                : `Set ${currentSet} av ${currentSetTotal} · ${formatStructure(exercise, blockType)}`}
            </p>
          </div>

          {showDescription ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {exercise.description?.trim() || "Ingen beskrivning tillgänglig ännu."}
            </div>
          ) : null}

          {timedExercise ? (
            <TimerPanel
              elapsedSeconds={elapsedSeconds}
              targetDurationSeconds={getTimedExerciseTotalSeconds(exercise)}
              perSideDurationSeconds={getSideSwitchSeconds(exercise) ?? undefined}
              timerState={timerState}
            />
          ) : null}

          {showRestTimer ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
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
                "flex w-full items-center justify-center gap-2 rounded-[22px] py-4 text-lg font-semibold shadow-[0_14px_34px_rgba(74,222,128,0.3)]",
              )}
            >
              <span aria-hidden="true">✓</span>
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

          {isSuperset ? (
            <div className="border-t border-slate-200/80 pt-3">
              <div className="space-y-2">
                {currentBlockExercises.map((blockExercise, index) => {
                  const letter = getExerciseLetter(index);
                  const isActiveExercise =
                    index + 1 === currentBlockExercisePosition &&
                    blockExercise.id === exercise.id;
                  const displayLoad = isActiveExercise
                    ? currentWeightLabel
                    : formatExerciseLoad(blockExercise, weightUnitLabel);

                  return (
                    <div
                      key={`${blockExercise.id}:${index}`}
                      className={cn(
                        "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border px-3 py-3 transition",
                        isActiveExercise
                          ? "border-emerald-300 bg-emerald-600 text-white shadow-[0_10px_26px_rgba(22,101,52,0.18)]"
                          : "border-slate-200 bg-white text-slate-900",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                          isActiveExercise
                            ? "bg-white/18 text-white"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {letter}
                      </span>
                      <p className="truncate text-base font-semibold">
                        {blockExercise.name}
                      </p>
                      <p
                        className={cn(
                          "whitespace-nowrap text-sm font-semibold",
                          isActiveExercise ? "text-white" : "text-slate-700",
                        )}
                      >
                        {formatExerciseTarget(blockExercise)}
                      </p>
                      {displayLoad ? (
                        <p
                          className={cn(
                            "whitespace-nowrap text-sm font-semibold",
                            isActiveExercise ? "text-white" : "text-slate-900",
                          )}
                        >
                          {displayLoad}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs font-medium text-slate-500">
                <span className="h-px flex-1 bg-emerald-200" />
                <span>Varv {currentRound} / {currentRoundTotal}</span>
                <span className="h-px flex-1 bg-emerald-200" />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
