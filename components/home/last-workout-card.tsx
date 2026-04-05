"use client";

import Link from "next/link";

import SectionCard from "@/components/app-shell/section-card";

type LastWorkoutSummary = {
  completedAt: string;
  workoutName: string;
  durationLabel: string;
  exerciseCount: number;
  setCount: number;
};

type LastWorkoutCardProps = {
  workout: LastWorkoutSummary | null;
};

// Kompakt kort för senaste genomförda pass.
export default function LastWorkoutCard({ workout }: LastWorkoutCardProps) {
  return (
    <SectionCard
      kicker="Senaste pass"
      title="Senast genomfört"
      actions={
        <Link
          href="/history"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
        >
          Historik
        </Link>
      }
    >
      {workout ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">{workout.completedAt}</p>

          <h3 className="mt-2 text-lg font-semibold text-slate-950">
            {workout.workoutName}
          </h3>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {workout.durationLabel}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {workout.exerciseCount} övningar
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {workout.setCount} set
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-sm leading-6 text-slate-600">
            Inget genomfört pass ännu. Börja med ett kort pass idag.
          </p>
        </div>
      )}
    </SectionCard>
  );
}