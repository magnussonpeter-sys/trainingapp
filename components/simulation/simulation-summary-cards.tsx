import type { SimulationEvaluation } from "@/lib/simulation/types";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function SimulationSummaryCards({
  evaluation,
}: {
  evaluation: SimulationEvaluation;
}) {
  const cards = [
    { label: "Följsamhet", value: formatPercent(evaluation.adherenceRate), helper: "Genomförda av planerade pass" },
    { label: "Progression", value: `${evaluation.progressionQualityScore}/100`, helper: "Samlad kvalitet" },
    { label: "Överbelastning", value: `${evaluation.overloadRiskScore}/100`, helper: "Lägre är bättre" },
    { label: "Målanpassning", value: `${evaluation.goalAlignmentScore}/100`, helper: "Passar valt mål" },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {card.label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {card.value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
        </article>
      ))}
    </section>
  );
}

