"use client";

import { useState } from "react";

import PreviewInlineEditor from "@/components/preview/preview-inline-editor";
import PreviewSupersetFlow from "@/components/preview/preview-superset-flow";
import {
  formatExerciseTarget,
  formatRingSetupLabel,
} from "@/lib/exercise-execution";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import type { Exercise, WorkoutBlock } from "@/types/workout";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function isTimedExercise(exercise: Exercise) {
  return (
    typeof exercise.duration === "number" &&
    exercise.duration > 0 &&
    (!exercise.reps || exercise.reps <= 0)
  );
}

function formatStructure(exercise: Exercise) {
  return `${formatExerciseTarget(exercise)} × ${exercise.sets}`;
}

function getBlockSetCount(block: WorkoutBlock) {
  return block.exercises.reduce((total, exercise) => total + exercise.sets, 0);
}

function formatBlockTypeLabel(blockType: WorkoutBlock["type"]) {
  if (blockType === "superset") {
    return "Superset";
  }

  if (blockType === "circuit") {
    return "Circuit";
  }

  return "Block";
}

function formatBlockSummary(block: WorkoutBlock) {
  const exerciseCount = block.exercises.length;
  const setCount = getBlockSetCount(block);

  if (block.type === "superset" || block.type === "circuit") {
    return `${exerciseCount} övningar · ${block.rounds ?? 1} varv`;
  }

  return `${exerciseCount} övningar · ${setCount} set`;
}

type PreviewBlockCardProps = {
  block: WorkoutBlock;
  blockIndex: number;
  onSetBlockType: (blockIndex: number, nextType: WorkoutBlock["type"]) => void;
  onIncrementBlockRounds: (blockIndex: number) => void;
  onDecrementBlockRounds: (blockIndex: number) => void;
  onIncrementBlockRestBetweenExercises: (blockIndex: number) => void;
  onDecrementBlockRestBetweenExercises: (blockIndex: number) => void;
  onIncrementBlockRestAfterRound: (blockIndex: number) => void;
  onDecrementBlockRestAfterRound: (blockIndex: number) => void;
  onIncreaseSets: (exerciseId: string) => void;
  onDecreaseSets: (exerciseId: string) => void;
  onIncreaseReps: (exerciseId: string) => void;
  onDecreaseReps: (exerciseId: string) => void;
  onIncreaseDuration: (exerciseId: string) => void;
  onDecreaseDuration: (exerciseId: string) => void;
  onIncreaseRest: (exerciseId: string) => void;
  onDecreaseRest: (exerciseId: string) => void;
  onMoveExerciseUp: (exerciseId: string) => void;
  onMoveExerciseDown: (exerciseId: string) => void;
  onReplaceExercise: (exerciseId: string) => void;
  onRemoveExercise: (exerciseId: string) => void;
};

export default function PreviewBlockCard({
  block,
  blockIndex,
  onSetBlockType,
  onIncrementBlockRounds,
  onDecrementBlockRounds,
  onIncrementBlockRestBetweenExercises,
  onDecrementBlockRestBetweenExercises,
  onIncrementBlockRestAfterRound,
  onDecrementBlockRestAfterRound,
  onIncreaseSets,
  onDecreaseSets,
  onIncreaseReps,
  onDecreaseReps,
  onIncreaseDuration,
  onDecreaseDuration,
  onIncreaseRest,
  onDecreaseRest,
  onMoveExerciseUp,
  onMoveExerciseDown,
  onReplaceExercise,
  onRemoveExercise,
}: PreviewBlockCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [openExerciseIds, setOpenExerciseIds] = useState<Record<string, boolean>>({});

  function toggleExercise(exerciseId: string) {
    setOpenExerciseIds((previous) => ({
      ...previous,
      [exerciseId]: !previous[exerciseId],
    }));
  }

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                block.type === "superset"
                  ? "bg-emerald-100 text-emerald-800"
                  : block.type === "circuit"
                    ? "bg-indigo-100 text-indigo-800"
                    : "bg-slate-100 text-slate-700",
              )}
            >
              {formatBlockTypeLabel(block.type)}
            </span>
            <span className="text-xs text-slate-400">Block {blockIndex + 1}</span>
          </div>

          <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            {block.title ?? `Block ${blockIndex + 1}`}
          </h2>

          <p className="mt-1 text-sm text-slate-500">{formatBlockSummary(block)}</p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((previous) => !previous)}
          className={cn(uiButtonClasses.secondary, "shrink-0 px-3 py-2 text-xs")}
        >
          {expanded ? "Dölj" : "Visa"}
        </button>
      </div>

      {block.type === "superset" || block.type === "circuit" ? (
        <div className="mt-4">
          <PreviewSupersetFlow
            blockType={block.type}
            exercises={block.exercises}
            restAfterRound={block.restAfterRound}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {block.exercises.map((exercise) => (
            <span
              key={exercise.id}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
            >
              {exercise.name}
            </span>
          ))}
        </div>
      )}

      {block.purpose ? (
        <p className="mt-3 text-sm leading-6 text-slate-600">{block.purpose}</p>
      ) : null}

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {block.coachNote ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {block.coachNote}
            </div>
          ) : null}

          {block.warmup?.recommended && block.warmup.instruction ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {block.warmup.instruction}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSetBlockType(blockIndex, "straight_sets")}
              className={cn(
                uiButtonClasses.ghost,
                "rounded-full border px-3 py-2 text-xs",
                block.type === "straight_sets"
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700",
              )}
            >
              Straight sets
            </button>
            <button
              type="button"
              onClick={() => onSetBlockType(blockIndex, "superset")}
              className={cn(
                uiButtonClasses.ghost,
                "rounded-full border px-3 py-2 text-xs",
                block.type === "superset"
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800",
              )}
            >
              Superset
            </button>
          </div>

          {block.type === "superset" || block.type === "circuit" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStepper
                label="Varv"
                value={String(block.rounds ?? 1)}
                onDecrease={() => onDecrementBlockRounds(blockIndex)}
                onIncrease={() => onIncrementBlockRounds(blockIndex)}
              />
              <MiniStepper
                label="Mellan övningar"
                value={`${block.restBetweenExercises ?? 0}s`}
                onDecrease={() => onDecrementBlockRestBetweenExercises(blockIndex)}
                onIncrease={() => onIncrementBlockRestBetweenExercises(blockIndex)}
              />
              <MiniStepper
                label="Efter varv"
                value={`${block.restAfterRound ?? 0}s`}
                onDecrease={() => onDecrementBlockRestAfterRound(blockIndex)}
                onIncrease={() => onIncrementBlockRestAfterRound(blockIndex)}
              />
            </div>
          ) : null}

          <div className="space-y-3">
            {block.exercises.map((exercise, exerciseIndex) => {
              const timedExercise = isTimedExercise(exercise);
              const isOpen = openExerciseIds[exercise.id] ?? false;

              return (
                <div
                  key={exercise.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4"
                >
                  <button
                    type="button"
                    onClick={() => toggleExercise(exercise.id)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                        Övning {exerciseIndex + 1}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-slate-900">
                        {exercise.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatStructure(exercise)}
                        {exercise.rest ? ` · ${exercise.rest}s vila` : ""}
                        {exercise.suggestedWeightLabel ? ` · ${exercise.suggestedWeightLabel}` : ""}
                      </p>
                      {exercise.ringSetup ? (
                        <p className="mt-1 text-sm text-slate-500">
                          {formatRingSetupLabel(exercise.ringSetup)}
                        </p>
                      ) : null}
                    </div>

                    <span className="shrink-0 text-slate-300">{isOpen ? "−" : "+"}</span>
                  </button>

                  {isOpen ? (
                    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                      {exercise.description ? (
                        <p className="text-sm leading-6 text-slate-600">{exercise.description}</p>
                      ) : null}

                      {exercise.ringSetup ? (
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                          <p className="font-medium">
                            Setup: {exercise.ringSetup.label}
                          </p>
                          <p className="mt-1 leading-6">{exercise.ringSetup.instruction}</p>
                          {exercise.ringSetup.progressionHint ? (
                            <p className="mt-2 text-emerald-800">
                              Tips: {exercise.ringSetup.progressionHint}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {exercise.progressionNote ? (
                        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-sm text-sky-900">
                          {exercise.progressionNote}
                        </div>
                      ) : null}

                      <PreviewInlineEditor
                        timedExercise={timedExercise}
                        sets={exercise.sets}
                        reps={exercise.reps ?? undefined}
                        duration={exercise.duration ?? undefined}
                        rest={exercise.rest}
                        onDecreaseSets={() => onDecreaseSets(exercise.id)}
                        onIncreaseSets={() => onIncreaseSets(exercise.id)}
                        onDecreaseReps={() => onDecreaseReps(exercise.id)}
                        onIncreaseReps={() => onIncreaseReps(exercise.id)}
                        onDecreaseDuration={() => onDecreaseDuration(exercise.id)}
                        onIncreaseDuration={() => onIncreaseDuration(exercise.id)}
                        onDecreaseRest={() => onDecreaseRest(exercise.id)}
                        onIncreaseRest={() => onIncreaseRest(exercise.id)}
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onMoveExerciseUp(exercise.id)}
                          disabled={exerciseIndex === 0}
                          className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
                        >
                          Flytta upp
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveExerciseDown(exercise.id)}
                          disabled={exerciseIndex === block.exercises.length - 1}
                          className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
                        >
                          Flytta ner
                        </button>
                        <button
                          type="button"
                          onClick={() => onReplaceExercise(exercise.id)}
                          className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
                        >
                          Byt övning
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveExercise(exercise.id)}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                        >
                          Ta bort
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MiniStepper({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDecrease}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700"
        >
          −
        </button>
        <span className="text-sm font-semibold text-slate-900">{value}</span>
        <button
          type="button"
          onClick={onIncrease}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700"
        >
          +
        </button>
      </div>
    </div>
  );
}
