"use client";

import type { HomeTrainingTrend } from "@/lib/planning/home-training-trend";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getStatusTone(score: number) {
  if (score > 110) {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-900",
      bar: "from-amber-400 to-lime-300",
    };
  }

  if (score >= 90) {
    return {
      badge: "border-emerald-200 bg-emerald-50 text-emerald-900",
      bar: "from-emerald-500 to-lime-400",
    };
  }

  if (score >= 65) {
    return {
      badge: "border-lime-200 bg-lime-50 text-lime-900",
      bar: "from-lime-500 to-lime-300",
    };
  }

  if (score >= 35) {
    return {
      badge: "border-sky-200 bg-sky-50 text-sky-900",
      bar: "from-sky-500 to-lime-300",
    };
  }

  return {
    badge: "border-slate-200 bg-slate-50 text-slate-800",
    bar: "from-slate-400 to-sky-300",
  };
}

function getTrainingDoseBarClass(kind: HomeTrainingTrend["bars"][number]["kind"]) {
  if (kind === "future") {
    return "border-2 border-dashed border-lime-300 bg-lime-100/50";
  }

  if (kind === "current") {
    return "bg-gradient-to-t from-emerald-500 to-lime-400";
  }

  return "bg-slate-300";
}

function getTrainingDoseBarStyle(value: number, chartMax: number) {
  if (value <= 0) {
    return { height: "0%" };
  }

  // Små positiva värden ska fortfarande synas, men 0 ska inte se ut som genomförd träning.
  return {
    height: `${clampNumber((value / chartMax) * 100, 0, 100)}%`,
    minHeight: "12px",
  };
}

function getTrainingDoseChartAriaLabel(trend: HomeTrainingTrend) {
  const values = trend.bars
    .map((bar) => `${bar.label} ${Math.round(bar.score)}`)
    .join(", ");

  return `Träningsdos senaste veckorna. Mål 100. ${values}.`;
}

type TrainingTrendCardProps = {
  trend: HomeTrainingTrend;
  onShowDetails: () => void;
};

export default function TrainingTrendCard(props: TrainingTrendCardProps) {
  const tone = getStatusTone(props.trend.score);
  const progressWidth = Math.max(6, Math.min(props.trend.score, 140) / 1.4);
  const targetValue = 100;
  const maxValue = Math.max(targetValue, ...props.trend.bars.map((bar) => Math.round(bar.score)), 0);
  const chartMax = Math.min(160, Math.max(120, Math.ceil(maxValue / 20) * 20));
  const targetLineBottomPercent = clampNumber((targetValue / chartMax) * 100, 0, 100);
  const midLineBottomPercent = clampNumber((50 / chartMax) * 100, 0, 100);
  const chartAriaLabel = getTrainingDoseChartAriaLabel(props.trend);
  const hasVisibleHistory = props.trend.bars.some((bar) => bar.kind !== "future");

  return (
    <section className={cn(uiCardClasses.base, "p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Träningsöversikt
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Träningsdos
          </h2>
        </div>

        <button
          type="button"
          onClick={props.onShowDetails}
          className={cn(uiButtonClasses.secondary, "px-3")}
        >
          Visa mer
        </button>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-500">Den här veckan</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-4xl font-semibold tracking-tight text-slate-950">
              {props.trend.score}
              <span className="text-2xl text-slate-400">/100</span>
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600">Träningsdos</p>
          </div>
          <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", tone.badge)}>
            {props.trend.statusLabel}
          </span>
        </div>

        <div
          className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label={`Träningsdos ${props.trend.score} av 100`}
          aria-valuenow={Math.min(props.trend.score, 140)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn("h-full rounded-full bg-gradient-to-r transition-[width]", tone.bar)}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-700">{props.trend.coachText}</p>

      <div className="mt-4 rounded-2xl border border-lime-100 bg-lime-50/70 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Bästa justering
        </p>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-900">
          {props.trend.recommendation}
        </p>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-900">Senaste veckorna</p>

        {!hasVisibleHistory && props.trend.bars.every((bar) => Math.round(bar.score) === 0) ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Genomför några pass för att se veckotrend.
          </p>
        ) : (
          <div className="mt-3" role="img" aria-label={chartAriaLabel}>
            <div className="flex gap-3">
              <div className="relative h-48 w-8 shrink-0 text-[11px] font-medium text-slate-400">
                <span className="absolute -translate-y-1/2" style={{ bottom: `${targetLineBottomPercent}%` }}>
                  100
                </span>
                <span className="absolute -translate-y-1/2" style={{ bottom: `${midLineBottomPercent}%` }}>
                  50
                </span>
                <span className="absolute bottom-0">0</span>
              </div>

              <div className="relative h-48 flex-1">
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-slate-300"
                  style={{ bottom: `${targetLineBottomPercent}%` }}
                >
                  <span className="absolute -top-5 right-0 rounded-full bg-white px-2 text-[10px] font-medium text-slate-500">
                    Mål 100
                  </span>
                </div>
                <div
                  className="absolute left-0 right-0 border-t border-slate-100"
                  style={{ bottom: `${midLineBottomPercent}%` }}
                />
                <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200" />

                <div className="grid h-full grid-cols-5 items-end gap-2">
                  {props.trend.bars.map((bar) => {
                    const roundedValue = Math.round(bar.score);
                    const barStyle = getTrainingDoseBarStyle(roundedValue, chartMax);

                    return (
                      <div key={bar.key} className="relative flex h-full min-w-0 flex-col items-center justify-end">
                        {bar.kind === "current" ? (
                          <div className="absolute inset-y-0 w-full rounded-2xl bg-lime-50/80" />
                        ) : null}

                        <span className="relative z-10 mb-2 text-[11px] font-semibold text-slate-700">
                          {roundedValue}
                        </span>

                        <div className="relative z-10 flex h-[140px] w-full items-end justify-center">
                          {roundedValue > 0 ? (
                            <div
                              className={cn(
                                "w-9 rounded-t-2xl transition-[height]",
                                getTrainingDoseBarClass(bar.kind),
                              )}
                              style={barStyle}
                              aria-label={`${bar.label}: ${roundedValue} av 100 i träningsdos`}
                            />
                          ) : bar.kind === "current" ? (
                            <div
                              className="mb-[2px] h-1.5 w-9 rounded-full bg-lime-300"
                              aria-label={`${bar.label}: 0 av 100 i träningsdos`}
                            />
                          ) : (
                            <div
                              className="mb-[2px] h-1 w-8 rounded-full bg-slate-200"
                              aria-label={`${bar.label}: 0 av 100 i träningsdos`}
                            />
                          )}
                        </div>

                        <span
                          className={cn(
                            "mt-2 text-[11px] font-medium",
                            bar.kind === "current" ? "text-slate-900" : "text-slate-500",
                          )}
                        >
                          {bar.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>{props.trend.completedSessionsThisWeek} pass</span>
        <span aria-hidden="true">·</span>
        <span>{props.trend.completedWorkSetsThisWeek} arbetsset</span>
        <span aria-hidden="true">·</span>
        <span>{props.trend.completedMinutesThisWeek} min</span>
      </div>
    </section>
  );
}
