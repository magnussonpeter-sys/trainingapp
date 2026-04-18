"use client";

import type { AnalysisMetricCardData, AnalysisStatus } from "@/lib/analysis/analysis-types";
import { uiCardClasses } from "@/lib/ui/card-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getStatusClasses(status: AnalysisStatus) {
  if (status === "positive") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "watch" || status === "high") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "low") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function AnalysisMetricCard({
  data,
  extra,
}: {
  data: AnalysisMetricCardData;
  extra?: React.ReactNode;
}) {
  return (
    <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {data.title}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            {data.statusLabel}
          </h2>
        </div>

        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            getStatusClasses(data.status),
          )}
        >
          {data.statusLabel}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">{data.body}</p>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
        {data.keyData}
      </div>

      {extra ? <div className="mt-4">{extra}</div> : null}

      <div className="mt-4 space-y-2">
        {data.supportingPoints.map((point) => (
          <p key={point} className="text-sm leading-6 text-slate-600">
            {point}
          </p>
        ))}
      </div>
    </section>
  );
}
