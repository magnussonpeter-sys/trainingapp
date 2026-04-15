"use client";

import type { TouchEvent } from "react";
import type { Exercise } from "@/types/workout";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type OverviewItem = {
  key: string;
  name: string;
  summary: string;
  blockLabel?: string;
  active?: boolean;
};

type WorkoutOverviewSheetProps = {
  title?: string;
  items: OverviewItem[];
  expanded: boolean;
  onSetExpanded: (expanded: boolean) => void;
};

function formatSummary(exercise: Exercise) {
  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    return `${exercise.sets} × ${exercise.duration}s`;
  }

  return `${exercise.sets} × ${exercise.reps ?? "-"}`;
}

export function buildOverviewItems(params: {
  workoutBlocks: Array<{
    type: "straight_sets" | "superset" | "circuit";
    title?: string;
    exercises: Exercise[];
  }>;
  currentBlockIndex: number;
  currentExerciseId: string | null;
}): OverviewItem[] {
  const items: OverviewItem[] = [];

  params.workoutBlocks.slice(params.currentBlockIndex).forEach((block, blockOffset) => {
    const absoluteBlockIndex = params.currentBlockIndex + blockOffset;

    block.exercises.forEach((exercise) => {
      items.push({
        key: `${absoluteBlockIndex}:${exercise.id}`,
        name: exercise.name,
        summary: formatSummary(exercise),
        blockLabel: block.type === "superset" ? block.title || "Superset" : undefined,
        active: exercise.id === params.currentExerciseId,
      });
    });
  });

  return items;
}

export default function WorkoutOverviewSheet({
  title = "Passöversikt",
  items,
  expanded,
  onSetExpanded,
}: WorkoutOverviewSheetProps) {
  if (items.length === 0) {
    return null;
  }

  const visibleItems = expanded ? items : items.slice(0, 3);
  let touchStartY = 0;
  let touchDeltaY = 0;

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    touchStartY = event.touches[0]?.clientY ?? 0;
    touchDeltaY = 0;
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
    const currentY = event.touches[0]?.clientY ?? touchStartY;
    touchDeltaY = currentY - touchStartY;
  }

  function handleTouchEnd() {
    if (touchDeltaY <= -24) {
      onSetExpanded(true);
      return;
    }

    if (touchDeltaY >= 24) {
      onSetExpanded(false);
    }
  }

  return (
    <section className="flex h-full flex-col rounded-t-[32px] border border-slate-200/80 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur">
      <div
        className="flex items-center justify-center px-5 pb-1 pt-3"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <span className="h-1.5 w-14 rounded-full bg-slate-200" />
      </div>

      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <span className="text-sm text-slate-500">{items.length} kvar</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
        <div className="space-y-2">
          {visibleItems.map((item) => (
          <div
            key={item.key}
            className={cn(
              "flex items-center justify-between gap-3 rounded-2xl px-3 py-3 transition",
              item.active ? "bg-emerald-50" : "bg-transparent",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {item.name}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {item.blockLabel ? `${item.blockLabel} · ` : ""}
                {item.summary}
              </p>
            </div>

            <div className="shrink-0">
              {item.active ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Nu
                </span>
              ) : (
                <span className="text-slate-300">›</span>
              )}
            </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
