"use client";

import { useState } from "react";
import ManualWeightInput from "@/components/run/manual-weight-input";
import TimerPanel from "@/components/run/timer-panel";
import WeightChipRow from "@/components/run/weight-chip-row";
import { formatRingSetupLabel } from "@/lib/exercise-execution";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import type { Exercise } from "@/types/workout";

function formatTimerClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function DescriptionToggle({
  description,
}: {
  description?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const hasDescription = Boolean(description?.trim());

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-medium text-slate-700">
            {isOpen ? "Dölj detaljer" : "Visa detaljer"}
          </p>
        </div>

        <span
          className={cn(
            "text-lg font-semibold text-slate-500 transition-transform",
            isOpen ? "rotate-180" : "",
          )}
        >
          ˅
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-slate-100 px-4 py-4">
          <p className="text-sm leading-6 text-slate-600">
            {hasDescription
              ? description
              : "Ingen beskrivning tillgänglig ännu."}
          </p>
        </div>
      ) : null}
    </section>
  );
}

type CurrentExerciseCardProps = {
  description?: string;
  ringSetup?: Exercise["ringSetup"];
  timedExercise: boolean;
  reps: string;
  onRepsChange: (value: string) => void;
  plannedReps?: number;
  weight: string;
  onWeightChange: (value: string) => void;
  suggestedWeightValue: string;
  suggestedWeightLabel?: string;
  progressionNote?: string;
  weightUnitLabel?: string;
  weightChipOptions: string[];
  onWeightChipSelect: (value: string) => void;
  elapsedSeconds: number;
  targetDurationSeconds?: number;
  timerState: "idle" | "running" | "ready_to_save";
  showRestTimer: boolean;
  restRemainingSeconds: number;
  restTimerRunning: boolean;
  onToggleRestTimer: () => void;
};

export default function CurrentExerciseCard({
  description,
  ringSetup,
  timedExercise,
  reps,
  onRepsChange,
  plannedReps,
  weight,
  onWeightChange,
  suggestedWeightValue,
  suggestedWeightLabel,
  progressionNote,
  weightUnitLabel,
  weightChipOptions,
  onWeightChipSelect,
  elapsedSeconds,
  targetDurationSeconds,
  timerState,
  showRestTimer,
  restRemainingSeconds,
  restTimerRunning,
  onToggleRestTimer,
}: CurrentExerciseCardProps) {
  return (
    <>
      <DescriptionToggle description={description} />

      {ringSetup ? (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-700">
            Setup
          </p>
          <p className="mt-1 text-base font-semibold text-emerald-950">
            {formatRingSetupLabel(ringSetup)}
          </p>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            {ringSetup.instruction}
          </p>
          {ringSetup.progressionHint ? (
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              Tips: {ringSetup.progressionHint}
            </p>
          ) : null}
        </section>
      ) : null}

      {!timedExercise ? (
        <section className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Reps
              </p>
              <input
                inputMode="numeric"
                value={reps}
                onChange={(event) => onRepsChange(event.target.value)}
                className="mt-2 w-full border-none bg-transparent p-0 text-3xl font-semibold text-slate-900 outline-none"
              />
              <p className="mt-1 text-sm text-slate-500">
                Planerat: {plannedReps ?? "-"}
              </p>
            </div>

            <ManualWeightInput
              value={weight}
              onChange={onWeightChange}
              suggestedWeightValue={suggestedWeightValue}
              suggestedWeightLabel={suggestedWeightLabel}
              progressionNote={progressionNote}
              unitLabel={weightUnitLabel}
            />
          </div>

          <WeightChipRow
            chips={weightChipOptions}
            selectedWeight={weight}
            suggestedWeight={suggestedWeightValue}
            unitLabel={weightUnitLabel}
            onSelect={onWeightChipSelect}
          />
        </section>
      ) : (
        <section className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
          <TimerPanel
            elapsedSeconds={elapsedSeconds}
            targetDurationSeconds={targetDurationSeconds}
            timerState={timerState}
          />

          <ManualWeightInput
            value={weight}
            onChange={onWeightChange}
            suggestedWeightValue={suggestedWeightValue}
            suggestedWeightLabel={suggestedWeightLabel}
            progressionNote={progressionNote}
            label="Vikt"
            unitLabel={weightUnitLabel}
          />

          <WeightChipRow
            chips={weightChipOptions}
            selectedWeight={weight}
            suggestedWeight={suggestedWeightValue}
            unitLabel={weightUnitLabel}
            onSelect={onWeightChipSelect}
          />
        </section>
      )}

      {showRestTimer ? (
        <section className="rounded-[24px] border border-sky-100 bg-sky-50 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sky-600">
                Vila
              </p>
              <p className="mt-1 text-2xl font-semibold text-sky-950">
                {formatTimerClock(restRemainingSeconds)}
              </p>
            </div>

            <button
              type="button"
              onClick={onToggleRestTimer}
              className={uiButtonClasses.secondary}
            >
              {restTimerRunning ? "Pausa" : "Starta"}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
