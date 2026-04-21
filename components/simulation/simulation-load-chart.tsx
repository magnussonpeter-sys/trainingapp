"use client";

import type { SimulationSeriesPoint } from "@/lib/simulation/types";

export default function SimulationLoadChart({ points }: { points: SimulationSeriesPoint[] }) {
  const maxLoad = Math.max(1, ...points.map((point) => point.sessionLoad ?? 0));

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Belastning per pass</h2>
      <p className="mt-1 text-sm text-slate-500">Staplar visar session load. Punkter visar svårighet och nöjdhet.</p>
      <div className="mt-4 flex h-56 items-end gap-1 overflow-hidden rounded-3xl bg-slate-50 px-3 py-4">
        {points.map((point) => (
          <div key={point.dayIndex} className="flex min-w-1 flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t-md bg-emerald-600/70"
              style={{ height: `${((point.sessionLoad ?? 0) / maxLoad) * 100}%` }}
              title={`${point.date}: ${point.sessionLoad ?? 0}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

