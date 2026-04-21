"use client";

import type { SimulationSeriesPoint } from "@/lib/simulation/types";

function buildPath(points: SimulationSeriesPoint[], key: keyof SimulationSeriesPoint) {
  const width = 680;
  const height = 180;
  const maxIndex = Math.max(1, points.length - 1);

  return points
    .map((point, index) => {
      const raw = point[key];
      const value = typeof raw === "number" ? raw : 0;
      const x = (index / maxIndex) * width;
      const y = height - (Math.min(Math.max(value, 0), 100) / 100) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function SimulationReadinessChart({ points }: { points: SimulationSeriesPoint[] }) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Readiness och fatigue</h2>
      <p className="mt-1 text-sm text-slate-500">Linjerna visar daglig status efter återhämtning eller pass.</p>
      <div className="mt-4 overflow-hidden rounded-3xl bg-slate-50 p-3">
        <svg viewBox="0 0 680 190" className="h-56 w-full">
          <path d={buildPath(points, "readiness")} fill="none" stroke="#047857" strokeWidth="4" />
          <path d={buildPath(points, "fatigue")} fill="none" stroke="#e11d48" strokeWidth="3" opacity="0.75" />
          <path d={buildPath(points, "soreness")} fill="none" stroke="#f59e0b" strokeWidth="3" opacity="0.7" />
          <path d={buildPath(points, "motivation")} fill="none" stroke="#2563eb" strokeWidth="3" opacity="0.7" />
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-slate-600">
        <span>Grön: readiness</span><span>Röd: fatigue</span><span>Gul: soreness</span><span>Blå: motivation</span>
      </div>
    </section>
  );
}

