"use client";

import SectionCard from "@/components/app-shell/section-card";

type StatusSummaryCardProps = {
  title: string;
  detail: string;
};

// Liten statusyta i stället för tung dashboard.
export default function StatusSummaryCard({
  title,
  detail,
}: StatusSummaryCardProps) {
  return (
    <SectionCard kicker="Kort status" title={title}>
      <p className="text-sm leading-6 text-slate-600">{detail}</p>
    </SectionCard>
  );
}