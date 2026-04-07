"use client";

// Ett kort per övning i preview.
// Fokus:
// - snabb överblick
// - inline redigering
// - enkla actions (flytta, byt, ta bort)

import PreviewInlineEditor from "@/components/preview/preview-inline-editor";

type PreviewExerciseCardProps = {
  index: number;
  total: number;

  name: string;
  description?: string;

  sets: number;
  reps?: number;
  duration?: number;
  rest: number;

  // Derived
  timedExercise: boolean;

  // Editors
  onDecreaseSets: () => void;
  onIncreaseSets: () => void;

  onDecreaseReps?: () => void;
  onIncreaseReps?: () => void;

  onDecreaseDuration?: () => void;
  onIncreaseDuration?: () => void;

  onDecreaseRest: () => void;
  onIncreaseRest: () => void;

  // Actions
  onMoveUp: () => void;
  onMoveDown: () => void;
  onReplace: () => void;
  onRemove: () => void;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function PreviewExerciseCard({
  index,
  total,
  name,
  description,
  sets,
  reps,
  duration,
  rest,
  timedExercise,
  onDecreaseSets,
  onIncreaseSets,
  onDecreaseReps,
  onIncreaseReps,
  onDecreaseDuration,
  onIncreaseDuration,
  onDecreaseRest,
  onIncreaseRest,
  onMoveUp,
  onMoveDown,
  onReplace,
  onRemove,
}: PreviewExerciseCardProps) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Övning {index + 1}
          </p>

          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            {name}
          </h3>

          {description ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>

        {/* Typ-badge */}
        <div
          className={cn(
            "rounded-xl border px-3 py-1 text-xs font-medium",
            timedExercise
              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          {timedExercise ? "Tid" : "Reps"}
        </div>
      </div>

      {/* EDITOR */}
      <div className="mt-4">
        <PreviewInlineEditor
          timedExercise={timedExercise}
          sets={sets}
          reps={reps}
          duration={duration}
          rest={rest}
          onDecreaseSets={onDecreaseSets}
          onIncreaseSets={onIncreaseSets}
          onDecreaseReps={onDecreaseReps}
          onIncreaseReps={onIncreaseReps}
          onDecreaseDuration={onDecreaseDuration}
          onIncreaseDuration={onIncreaseDuration}
          onDecreaseRest={onDecreaseRest}
          onIncreaseRest={onIncreaseRest}
        />
      </div>

      {/* ACTIONS */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className={cn(
            "rounded-xl border px-3 py-1.5 text-xs font-medium transition",
            index === 0
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
              : "border-slate-200 bg-white text-slate-700 active:scale-[0.98]",
          )}
        >
          ↑ Flytta upp
        </button>

        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className={cn(
            "rounded-xl border px-3 py-1.5 text-xs font-medium transition",
            index === total - 1
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
              : "border-slate-200 bg-white text-slate-700 active:scale-[0.98]",
          )}
        >
          ↓ Flytta ner
        </button>

        <button
          type="button"
          onClick={onReplace}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 active:scale-[0.98]"
        >
          Byt övning
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 active:scale-[0.98]"
        >
          Ta bort
        </button>
      </div>
    </div>
  );
}