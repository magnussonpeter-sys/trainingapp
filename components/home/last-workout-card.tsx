"use client";

import Link from "next/link";
import SectionCard from "@/components/app-shell/section-card";

type LastWorkoutCardProps = {
  title: string;
  completedAtLabel: string;
  durationLabel: string;
  setsLabel: string;
  href: string;
};

// Kompakt kort för senaste genomförda pass.
export default function LastWorkoutCard({
  title,
  completedAtLabel,
  durationLabel,
  setsLabel,
  href,
}: LastWorkoutCardProps) {
  return (
    <SectionCard
      kicker="Senaste passet"
      title={title}
      subtitle={completedAtLabel}
      className="rounded-[28px] p-6"
      contentClassName="grid gap-4"
    >
      <div className="flex flex-wrap gap-2 text-sm text-slate-600">
        <span className="rounded-full bg-slate-100 px-3 py-1">
          {durationLabel}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1">
          {setsLabel}
        </span>
      </div>

      <div>
        <Link
          href={href}
          className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Visa historik
        </Link>
      </div>
    </SectionCard>
  );
}