"use client";

import type { SimulationSeriesPoint } from "@/lib/simulation/types";

function buildPath(points: SimulationSeriesPoint[], key: "strengthLevel" | "workCapacity") {
  const width = 680;
  const height = 180;
  const values = points.map((point) => point[key]);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = Math.max(1, max - min);

  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point[key] - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function SimulationProgressChart({ points }: { points: SimulationSeriesPoint[] }) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Progression</h2>
      <p className="mt-1 text-sm text-slate-500">Relativ utveckling av styrka och arbetskapacitet.</p>
      <div className="mt-4 overflow-hidden rounded-3xl bg-slate-50 p-3">
        <svg viewBox="0 0 680 190" className="h-56 w-full">
          <path d={buildPath(points, "strengthLevel")} fill="none" stroke="#047857" strokeWidth="4" />
          <path d={buildPath(points, "workCapacity")} fill="none" stroke="#0f766e" strokeWidth="3" opacity="0.7" />
        </svg>
      </div>
      <div className="mt-3 flex gap-3 text-xs font-medium text-slate-600">
        <span>Grön: styrka</span><span>Teal: arbetskapacitet</span>
      </div>
    </section>
  );
}

