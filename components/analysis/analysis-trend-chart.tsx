"use client";

import { useMemo, useState } from "react";

import type { TrendPoint } from "@/lib/analysis/analysis-types";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";

type TrendMode = "strength" | "hypertrophy" | "load";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getValue(point: TrendPoint, mode: TrendMode) {
  if (mode === "strength") {
    return point.strengthIndex;
  }

  if (mode === "hypertrophy") {
    return point.hypertrophyDose;
  }

  return point.load;
}

function formatValue(mode: TrendMode, value: number) {
  if (mode === "strength") {
    return `${Math.round(value)}`;
  }

  if (mode === "hypertrophy") {
    return `${Math.round(value)} set`;
  }

  return `${Math.round(value)} kg`;
}

export default function AnalysisTrendChart({ trends }: { trends: TrendPoint[] }) {
  const [mode, setMode] = useState<TrendMode>("strength");

  const chart = useMemo(() => {
    if (trends.length === 0) {
      return null;
    }

    const values = trends.map((point) => getValue(point, mode));
    const maxValue = Math.max(...values, 1);

    return trends.map((point, index) => {
      const value = getValue(point, mode);
      const height = Math.max(10, (value / maxValue) * 100);

      return {
        id: `${point.weekKey}-${mode}-${index}`,
        label: point.weekLabel,
        value,
        height,
      };
    });
  }, [mode, trends]);

  return (
    <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Trendgraf
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Utveckling vecka för vecka
          </h2>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { id: "strength" as TrendMode, label: "Styrka" },
          { id: "hypertrophy" as TrendMode, label: "Hypertrofidos" },
          { id: "load" as TrendMode, label: "Belastning" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            className={cn(
              uiButtonClasses.chip,
              mode === item.id ? uiButtonClasses.chipSelected : uiButtonClasses.chipDefault,
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {chart && chart.length > 0 ? (
        <div className="mt-5">
          <div className="flex h-44 items-end gap-3 overflow-x-auto pb-2">
            {chart.map((point) => (
              <div key={point.id} className="flex min-w-[52px] flex-col items-center gap-2">
                <div className="text-[11px] font-medium text-slate-500">
                  {formatValue(mode, point.value)}
                </div>
                <div className="flex h-28 items-end">
                  <div
                    className="w-10 rounded-t-2xl bg-lime-300"
                    style={{ height: `${point.height}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400">{point.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          Mer data behövs för att visa utvecklingsgrafen.
        </div>
      )}
    </section>
  );
}
