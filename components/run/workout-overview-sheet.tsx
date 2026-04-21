"use client";

import { useRef } from "react";
import type { TouchEvent } from "react";
import type { Exercise } from "@/types/workout";
import { formatExerciseTarget } from "@/lib/exercise-execution";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type OverviewItem = {
  key: string;
  name: string;
  summary: string;
  blockLabel?: string;
  blockKey: string;
  blockType: "straight_sets" | "superset" | "circuit";
  exercisePosition: number;
  active?: boolean;
};

type WorkoutOverviewSheetProps = {
  title?: string;
  items: OverviewItem[];
  expanded: boolean;
  onSetExpanded: (expanded: boolean) => void;
};

function formatSummary(exercise: Exercise) {
  return `${exercise.sets} × ${formatExerciseTarget(exercise)}`;
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

    block.exercises.forEach((exercise, exerciseIndex) => {
      items.push({
        key: `${absoluteBlockIndex}:${exercise.id}`,
        name: exercise.name,
        summary: formatSummary(exercise),
        blockKey: `${absoluteBlockIndex}:${block.type}`,
        blockType: block.type,
        blockLabel: block.type === "superset" ? block.title || "Superset" : undefined,
        exercisePosition: exerciseIndex + 1,
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
  const touchStartYRef = useRef(0);
  const touchDeltaYRef = useRef(0);

  if (items.length === 0) {
    return null;
  }

  const visibleItems = expanded ? items : items.slice(0, 3);
  const itemGroups = visibleItems.reduce<Array<{ key: string; type: OverviewItem["blockType"]; label?: string; items: OverviewItem[] }>>(
    (groups, item) => {
      const previousGroup = groups[groups.length - 1];
      if (previousGroup && previousGroup.key === item.blockKey) {
        previousGroup.items.push(item);
        return groups;
      }

      groups.push({
        key: item.blockKey,
        type: item.blockType,
        label: item.blockLabel,
        items: [item],
      });
      return groups;
    },
    [],
  );

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    touchStartYRef.current = event.touches[0]?.clientY ?? 0;
    touchDeltaYRef.current = 0;
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
    const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
    touchDeltaYRef.current = currentY - touchStartYRef.current;
  }

  function handleTouchEnd() {
    // Use a short swipe threshold so the sheet feels responsive on small screens.
    if (touchDeltaYRef.current <= -16) {
      onSetExpanded(true);
      return;
    }

    if (touchDeltaYRef.current >= 16) {
      onSetExpanded(false);
    }
  }

  return (
    <section className="flex h-full flex-col rounded-t-[32px] border border-slate-200/80 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur">
      <div
        className="flex items-center justify-center px-5 pb-1 pt-3 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <span className="h-1.5 w-14 rounded-full bg-slate-200" />
      </div>

      <div
        className="touch-none flex items-center justify-between gap-3 px-5 pb-2 pt-1"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <h2 className="text-base font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <span className="text-xs font-medium text-slate-500">{items.length} kvar</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1">
        <div className="space-y-1.5">
          {itemGroups.map((group) => (
            <div
              key={group.key}
              className={cn(
                "space-y-1",
                group.type === "superset"
                  ? "rounded-[24px] border border-emerald-100 bg-emerald-50/65 px-2 py-2"
                  : "",
              )}
            >
              {group.type === "superset" && group.label ? (
                <p className="px-2 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80">
                  {group.label}
                </p>
              ) : null}

              {group.items.map((item) => (
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition",
                    item.active
                      ? "bg-white text-slate-950 shadow-sm ring-1 ring-emerald-200"
                      : group.type === "superset"
                        ? "bg-transparent"
                        : "bg-transparent",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {group.type === "superset" ? (
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          item.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-white/80 text-slate-500",
                        )}
                      >
                        {String.fromCharCode(64 + item.exercisePosition)}
                      </span>
                    ) : null}

                    <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {item.summary}
                    </p>
                    </div>
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
          ))}
        </div>
      </div>
    </section>
  );
}
