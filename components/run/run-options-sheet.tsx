"use client";

import { uiButtonClasses } from "@/lib/ui/button-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatDuration(seconds?: number) {
  const safeSeconds = Math.max(0, seconds ?? 0);

  if (safeSeconds < 60) {
    return `${safeSeconds} s`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  if (!restSeconds) {
    return `${minutes} min`;
  }

  return `${minutes} min ${restSeconds} s`;
}

type ValueAdjusterProps = {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
};

function ValueAdjuster({
  label,
  value,
  onDecrease,
  onIncrease,
}: ValueAdjusterProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDecrease}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition active:scale-[0.98]"
        >
          −
        </button>

        <div className="min-w-[72px] text-center text-base font-semibold text-slate-900">
          {value}
        </div>

        <button
          type="button"
          onClick={onIncrease}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition active:scale-[0.98]"
        >
          +
        </button>
      </div>
    </div>
  );
}

type RunOptionsSheetProps = {
  open: boolean;
  currentExerciseName?: string;
  plannedSets?: number;
  plannedReps?: number;
  plannedDuration?: number;
  plannedRest?: number;
  timedExercise: boolean;
  timerState: "idle" | "running" | "ready_to_save";
  onClose: () => void;
  onSkipExercise: () => void;
  onAbortWorkout: () => void;
  onResetTimedSet: () => void;
  onIncreaseSets: () => void;
  onDecreaseSets: () => void;
  onIncreaseReps: () => void;
  onDecreaseReps: () => void;
  onIncreaseDuration: () => void;
  onDecreaseDuration: () => void;
  onIncreaseRest: () => void;
  onDecreaseRest: () => void;
};

export default function RunOptionsSheet({
  open,
  currentExerciseName,
  plannedSets,
  plannedReps,
  plannedDuration,
  plannedRest,
  timedExercise,
  timerState,
  onClose,
  onSkipExercise,
  onAbortWorkout,
  onResetTimedSet,
  onIncreaseSets,
  onDecreaseSets,
  onIncreaseReps,
  onDecreaseReps,
  onIncreaseDuration,
  onDecreaseDuration,
  onIncreaseRest,
  onDecreaseRest,
}: RunOptionsSheetProps) {
  if (!open) {
    return null;
  }

  const canResetTimedSet = timedExercise && timerState === "ready_to_save";

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Stäng meny"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl rounded-t-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200" />

        <div className="px-4 pb-6 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Run
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                Alternativ
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Justera aktuell övning utan att störa huvudflödet.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={uiButtonClasses.secondary}
            >
              Stäng
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Aktuell övning
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">
                {currentExerciseName || "Ingen övning vald"}
              </h3>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ValueAdjuster
                  label="Set"
                  value={String(plannedSets ?? 0)}
                  onDecrease={onDecreaseSets}
                  onIncrease={onIncreaseSets}
                />

                <ValueAdjuster
                  label="Vila"
                  value={formatDuration(plannedRest)}
                  onDecrease={onDecreaseRest}
                  onIncrease={onIncreaseRest}
                />

                {!timedExercise ? (
                  <ValueAdjuster
                    label="Reps"
                    value={String(plannedReps ?? 0)}
                    onDecrease={onDecreaseReps}
                    onIncrease={onIncreaseReps}
                  />
                ) : (
                  <ValueAdjuster
                    label="Tid per set"
                    value={formatDuration(plannedDuration)}
                    onDecrease={onDecreaseDuration}
                    onIncrease={onIncreaseDuration}
                  />
                )}
              </div>
            </section>

            <section className="space-y-3">
              <button
                type="button"
                onClick={onSkipExercise}
                className={cn(uiButtonClasses.secondary, "w-full justify-start")}
              >
                Hoppa över aktuell övning
              </button>

              {canResetTimedSet ? (
                <button
                  type="button"
                  onClick={onResetTimedSet}
                  className={cn(uiButtonClasses.secondary, "w-full justify-start")}
                >
                  Kör om aktuellt tidsset
                </button>
              ) : null}

              <button
                type="button"
                onClick={onAbortWorkout}
                className="min-h-11 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-100 active:scale-[0.99]"
              >
                Avbryt pass och gå till home
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}