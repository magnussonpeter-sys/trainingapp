"use client";

import type { Exercise, WorkoutBlockType } from "@/types/workout";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type PreviewSupersetFlowProps = {
  blockType: WorkoutBlockType;
  exercises: Exercise[];
  restAfterRound?: number | null;
};

export default function PreviewSupersetFlow({
  blockType,
  exercises,
  restAfterRound,
}: PreviewSupersetFlowProps) {
  if (exercises.length === 0) {
    return null;
  }

  const showLoop = blockType === "superset" || blockType === "circuit";
  const flowSteps = exercises.map((exercise) => exercise.name);

  if (showLoop && typeof restAfterRound === "number" && restAfterRound > 0) {
    flowSteps.push(`Vila ${restAfterRound}s`);
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-center gap-2">
        {flowSteps.map((step, index) => (
          <div key={`${step}-${index}`} className="flex items-center gap-2">
            <div
              className={cn(
                "rounded-2xl border px-3 py-2 text-sm font-medium whitespace-nowrap",
                step.startsWith("Vila")
                  ? "border-slate-200 bg-white text-slate-700"
                  : "border-emerald-100 bg-emerald-50 text-emerald-900",
              )}
            >
              {step}
            </div>

            {index < flowSteps.length - 1 ? (
              <span className="text-slate-300">→</span>
            ) : showLoop ? (
              <span className="text-emerald-500">↺</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
