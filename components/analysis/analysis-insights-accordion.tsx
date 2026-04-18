"use client";

import { useState } from "react";

import type { AnalysisData } from "@/lib/analysis/analysis-types";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AnalysisInsightsAccordion({ data }: { data: AnalysisData }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Fördjupning
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Mer analys
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
        >
          {open ? "Dölj" : "Visa"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <h3 className="text-sm font-semibold text-slate-950">Dataunderlag</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {data.dataQuality.hasEnoughData
                ? `Analysen bygger på ${data.dataQuality.completedWorkoutCount} genomförda pass i historiken.`
                : data.dataQuality.message}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <h3 className="text-sm font-semibold text-slate-950">Hypertrofidos per grupp</h3>
            <div className="mt-3 space-y-2">
              {data.hypertrophyDose.groups.map((group) => (
                <div key={group.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700">{group.label}</span>
                  <span className="text-slate-500">
                    {group.averageWeeklySets} set / vecka · målzon {group.minTarget}–{group.maxTarget}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <h3 className="text-sm font-semibold text-slate-950">Drivare i styrkeanalysen</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {data.strengthProgress.driverLabels.length > 0
                ? `${data.strengthProgress.driverLabels.join(", ")}. ${data.strengthProgress.reliabilityLabel}.`
                : "Fler återkommande belastade övningar behövs för att peka ut tydliga drivare."}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
