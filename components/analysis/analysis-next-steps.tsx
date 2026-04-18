"use client";

import type { AnalysisNextStep } from "@/lib/analysis/analysis-types";
import { uiCardClasses } from "@/lib/ui/card-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AnalysisNextSteps({ nextSteps }: { nextSteps: AnalysisNextStep[] }) {
  return (
    <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Detta hjälper dig framåt nästa vecka
      </p>
      <div className="mt-4 space-y-3">
        {nextSteps.map((step) => (
          <div
            key={`${step.label}-${step.detail}`}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
          >
            <h3 className="text-sm font-semibold text-slate-950">{step.label}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{step.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
