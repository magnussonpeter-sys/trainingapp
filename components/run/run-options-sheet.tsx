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

type RunOptionsSheetProps = {
  open: boolean;
  currentExerciseName?: string;
  plannedReps?: number;
  plannedDuration?: number;
  plannedRest?: number;
  timedExercise: boolean;
  timerState: "idle" | "running" | "ready_to_save";
  onClose: () => void;
  onSkipExercise: () => void;
  onAbortWorkout: () => void;
  onResetTimedSet: () => void;
};

export default function RunOptionsSheet({
  open,
  currentExerciseName,
  plannedReps,
  plannedDuration,
  plannedRest,
  timedExercise,
  timerState,
  onClose,
  onSkipExercise,
  onAbortWorkout,
  onResetTimedSet,
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
                Avancerade val för pågående pass.
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

              <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
                {typeof plannedReps === "number" ? (
                  <span className="rounded-full bg-white px-3 py-1">
                    Planerade reps: {plannedReps}
                  </span>
                ) : null}

                {typeof plannedDuration === "number" ? (
                  <span className="rounded-full bg-white px-3 py-1">
                    Planerad tid: {formatDuration(plannedDuration)}
                  </span>
                ) : null}

                {typeof plannedRest === "number" ? (
                  <span className="rounded-full bg-white px-3 py-1">
                    Vila: {formatDuration(plannedRest)}
                  </span>
                ) : null}
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

            <p className="text-xs leading-5 text-slate-500">
              Nästa steg enligt planen är att lägga ännu fler avancerade val här,
              så att huvudvyn kan fortsätta vara ren och snabb.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}