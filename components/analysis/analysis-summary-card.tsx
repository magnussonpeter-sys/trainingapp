"use client";

import type { AnalysisSummary } from "@/lib/analysis/analysis-types";
import { uiCardClasses } from "@/lib/ui/card-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AnalysisSummaryCard({ summary }: { summary: AnalysisSummary }) {
  return (
    <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Analysöversikt
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {summary.title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{summary.subtitle}</p>

      <div className="mt-5 space-y-2">
        {summary.bullets.map((bullet) => (
          <div
            key={bullet}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            {bullet}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">
        {summary.confidenceLabel}
      </p>
    </section>
  );
}
