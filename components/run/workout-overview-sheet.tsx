"use client";

import { useRef, useState } from "react";
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
  blockIndex: number;
  blockType: "straight_sets" | "superset" | "circuit";
  exercisePosition: number;
  active?: boolean;
};

type WorkoutOverviewSheetProps = {
  title?: string;
  items: OverviewItem[];
  totalBlockCount: number;
  currentBlockIndex: number;
  canReplaceCurrentBlock: boolean;
  canMoveCurrentBlockDown: boolean;
  expanded: boolean;
  onSetExpanded: (expanded: boolean) => void;
  onReplaceCurrentBlock: () => void;
  onMoveUpcomingBlock: (fromIndex: number, toIndex: number) => void;
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
        blockIndex: absoluteBlockIndex,
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
  totalBlockCount,
  currentBlockIndex,
  canReplaceCurrentBlock,
  canMoveCurrentBlockDown,
  expanded,
  onSetExpanded,
  onReplaceCurrentBlock,
  onMoveUpcomingBlock,
}: WorkoutOverviewSheetProps) {
  const touchStartYRef = useRef(0);
  const touchDeltaYRef = useRef(0);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);

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

  if (items.length === 0) {
    return null;
  }

  const visibleItems = expanded ? items : [];
  const itemGroups = visibleItems.reduce<Array<{ key: string; type: OverviewItem["blockType"]; label?: string; blockIndex: number; items: OverviewItem[] }>>(
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
        blockIndex: item.blockIndex,
        items: [item],
      });
      return groups;
    },
    [],
  );

  function handleToggleExpanded() {
    const nextExpanded = !expanded;
    if (!nextExpanded) {
      setSelectedBlockIndex(null);
    }
    onSetExpanded(nextExpanded);
  }

  function handleBlockPress(blockIndex: number) {
    // Nuvarande eller kommande block kan markeras för snabb omordning.
    if (blockIndex < currentBlockIndex) {
      return;
    }

    setSelectedBlockIndex((previous) => (previous === blockIndex ? null : blockIndex));
  }

  function handleMoveBlock(fromIndex: number, toIndex: number) {
    onMoveUpcomingBlock(fromIndex, toIndex);
    setSelectedBlockIndex(toIndex);
  }

  return (
    <section className="flex h-full flex-col rounded-t-[32px] border border-slate-200/80 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur">
      <div
        className="flex cursor-pointer items-center justify-center px-5 pb-1 pt-3 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleToggleExpanded}
        role="button"
        aria-label={expanded ? "Dölj passöversikt" : "Visa passöversikt"}
      >
        <span className="h-1.5 w-14 rounded-full bg-slate-200" />
      </div>

      <div
        className="touch-none flex cursor-pointer items-center justify-between gap-3 px-5 pb-2 pt-1"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleToggleExpanded}
        role="button"
        aria-label={expanded ? "Dölj passöversikt" : "Visa passöversikt"}
      >
        <h2 className="text-base font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        {!expanded ? (
          <span className="text-sm font-medium text-slate-500">{items.length} kvar</span>
        ) : null}
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
                <div className="flex items-center justify-between gap-3 px-2 pt-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80">
                    {group.label}
                  </p>
                  {group.blockIndex === currentBlockIndex ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Pågår
                    </span>
                  ) : null}
                </div>
              ) : group.blockIndex === currentBlockIndex ? (
                <div className="flex justify-end px-2 pt-0.5">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Pågår
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => handleBlockPress(group.blockIndex)}
                className={cn(
                  "w-full rounded-2xl border text-left transition",
                  selectedBlockIndex === group.blockIndex
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-transparent",
                  group.blockIndex >= currentBlockIndex ? "active:scale-[0.995]" : "",
                )}
                aria-label={
                  group.blockIndex === currentBlockIndex
                    ? "Visa val för aktuellt block"
                    : `Visa val för block ${group.items[0]?.name ?? ""}`
                }
              >
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
                        <p className="truncate text-[16px] font-semibold text-slate-900">
                          {item.name}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-slate-500">
                          {item.summary}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {item.active ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Nu
                        </span>
                      ) : group.blockIndex >= currentBlockIndex ? (
                        <span className="text-slate-300">›</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </button>

              {expanded &&
              selectedBlockIndex === group.blockIndex &&
              group.blockIndex >= currentBlockIndex ? (
                <div className="flex items-center justify-end gap-2 px-2">
                  {group.blockIndex === currentBlockIndex && canReplaceCurrentBlock ? (
                    <button
                      type="button"
                      onClick={onReplaceCurrentBlock}
                      className="min-h-9 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition active:scale-[0.99]"
                      aria-label="Byt övning i aktuellt block"
                      title="Byt övning"
                    >
                      Byt övning
                    </button>
                  ) : null}
                  {group.blockIndex === currentBlockIndex && canMoveCurrentBlockDown ? (
                    <button
                      type="button"
                      onClick={() => handleMoveBlock(group.blockIndex, group.blockIndex + 1)}
                      disabled={group.blockIndex >= totalBlockCount - 1}
                      className={cn(
                        "min-h-9 rounded-full border px-3 text-xs font-semibold transition",
                        group.blockIndex >= totalBlockCount - 1
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                          : "border-slate-200 bg-white text-slate-700 active:scale-[0.99]",
                      )}
                      aria-label="Flytta aktuellt block nedåt"
                      title="Flytta block nedåt"
                    >
                      Flytta ned
                    </button>
                  ) : null}
                  {group.blockIndex > currentBlockIndex ? (
                    <button
                      type="button"
                      onClick={() => handleMoveBlock(group.blockIndex, group.blockIndex - 1)}
                      disabled={group.blockIndex <= currentBlockIndex + 1}
                      className={cn(
                        "min-h-9 rounded-full border px-3 text-xs font-semibold transition",
                        group.blockIndex <= currentBlockIndex + 1
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                          : "border-slate-200 bg-white text-slate-700 active:scale-[0.99]",
                      )}
                      aria-label="Flytta block uppåt"
                      title="Flytta block uppåt"
                    >
                      Flytta upp
                    </button>
                  ) : null}
                  {group.blockIndex > currentBlockIndex ? (
                    <button
                      type="button"
                      onClick={() => handleMoveBlock(group.blockIndex, group.blockIndex + 1)}
                      disabled={group.blockIndex >= totalBlockCount - 1}
                      className={cn(
                        "min-h-9 rounded-full border px-3 text-xs font-semibold transition",
                        group.blockIndex >= totalBlockCount - 1
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                          : "border-slate-200 bg-white text-slate-700 active:scale-[0.99]",
                      )}
                      aria-label="Flytta block nedåt"
                      title="Flytta block nedåt"
                    >
                      Flytta ned
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
