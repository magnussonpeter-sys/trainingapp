"use client";

import { uiButtonClasses } from "@/lib/ui/button-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type PreviewSummaryCardProps = {
  workoutName: string;
  durationMinutes: number;
  exerciseCount: number;
  totalSets: number;
  gymLabel?: string;
  subtitle?: string;
  startDisabled?: boolean;
  onBack: () => void;
  onStart: () => void;
};

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function PreviewSummaryCard({
  workoutName,
  durationMinutes,
  exerciseCount,
  totalSets,
  gymLabel,
  subtitle,
  startDisabled = false,
  onBack,
  onStart,
}: PreviewSummaryCardProps) {
  return (
    <section className="rounded-[32px] border border-slate-200/80 bg-white px-4 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">
            Föreslaget pass
          </p>
          <h1 className="mt-2 text-[clamp(1.9rem,7vw,2.4rem)] font-semibold leading-tight tracking-tight text-slate-950">
            {workoutName}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onBack}
          className={cn(uiButtonClasses.secondary, "shrink-0 px-3")}
        >
          Tillbaka
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <SummaryPill label="Tid" value={`${durationMinutes} min`} />
        <SummaryPill label="Övningar" value={String(exerciseCount)} />
        <SummaryPill label="Set" value={String(totalSets)} />
        <SummaryPill label="Gym" value={gymLabel?.trim() || "Valt gym"} />
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={startDisabled}
        className={cn(uiButtonClasses.primary, "mt-4 w-full justify-center py-4 text-base")}
      >
        Starta pass
      </button>
    </section>
  );
}
