"use client";

import Link from "next/link";

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

// Håller senaste passet kompakt och lättskannat.
export default function LastWorkoutCard({ workout }: LastWorkoutCardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
            Senaste pass
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            Senast genomfört
          </h2>
        </div>

        <Link
          href="/history"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
        >
          Historik
        </Link>
      </div>

      {workout ? (
        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
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
        <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-sm leading-6 text-slate-600">
            Inget genomfört pass ännu. Börja med ett kort pass idag.
          </p>
        </div>
      )}
    </section>
  );
}