"use client";

import WeightChipRow from "@/components/run/weight-chip-row";
import { uiButtonClasses } from "@/lib/ui/button-classes";

function formatTimerClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (!restSeconds) {
    return `${minutes} min`;
  }

  return `${minutes} min ${restSeconds} s`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function DescriptionToggle({
  description,
}: {
  description?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  if (!description?.trim()) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Övningsbeskrivning
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {isOpen ? "Dölj beskrivning" : "Visa beskrivning"}
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
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
      ) : null}
    </section>
  );
}

type CurrentExerciseCardProps = {
  exerciseName: string;
  description?: string;
  timedExercise: boolean;
  reps: string;
  onRepsChange: (value: string) => void;
  plannedReps?: number;
  weight: string;
  onWeightChange: (value: string) => void;
  suggestedWeightValue: string;
  weightChipOptions: string[];
  onWeightChipSelect: (value: string) => void;
  elapsedSeconds: number;
  targetDurationSeconds?: number;
  showRestTimer: boolean;
  restRemainingSeconds: number;
  restTimerRunning: boolean;
  onToggleRestTimer: () => void;
};

export default function CurrentExerciseCard({
  exerciseName,
  description,
  timedExercise,
  reps,
  onRepsChange,
  plannedReps,
  weight,
  onWeightChange,
  suggestedWeightValue,
  weightChipOptions,
  onWeightChipSelect,
  elapsedSeconds,
  targetDurationSeconds,
  showRestTimer,
  restRemainingSeconds,
  restTimerRunning,
  onToggleRestTimer,
}: CurrentExerciseCardProps) {
  return (
    <>
      <DescriptionToggle description={description} />

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

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Vikt
              </p>
              <div className="mt-2 flex items-end gap-2">
                <input
                  inputMode="decimal"
                  value={weight}
                  onChange={(event) => onWeightChange(event.target.value)}
                  className="w-full border-none bg-transparent p-0 text-3xl font-semibold text-slate-900 outline-none"
                />
                <span className="pb-1 text-sm font-medium text-slate-500">
                  kg
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {suggestedWeightValue
                  ? `AI-förslag: ${suggestedWeightValue} kg`
                  : "Ingen vikt föreslagen"}
              </p>
            </div>
          </div>

          <WeightChipRow
            chips={weightChipOptions}
            selectedWeight={weight}
            suggestedWeight={suggestedWeightValue}
            onSelect={onWeightChipSelect}
          />
        </section>
      ) : (
        <section className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
              Tid för set
            </p>
            <div className="mt-3 text-6xl font-semibold tracking-tight text-slate-900">
              {formatTimerClock(elapsedSeconds)}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Mål: {formatDuration(targetDurationSeconds ?? 0)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
              Vikt
            </p>
            <div className="mt-2 flex items-end gap-2">
              <input
                inputMode="decimal"
                value={weight}
                onChange={(event) => onWeightChange(event.target.value)}
                className="w-full border-none bg-transparent p-0 text-3xl font-semibold text-slate-900 outline-none"
              />
              <span className="pb-1 text-sm font-medium text-slate-500">
                kg
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {suggestedWeightValue
                ? `AI-förslag: ${suggestedWeightValue} kg`
                : "Valfri vikt"}
            </p>
          </div>

          <WeightChipRow
            chips={weightChipOptions}
            selectedWeight={weight}
            suggestedWeight={suggestedWeightValue}
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