"use client";

import type { GoalFeedback } from "@/lib/planning/goal-feedback";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getStatusTone(status: GoalFeedback["status"]) {
  if (status === "recovery_risk") {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-900",
      accent: "from-amber-400/25 via-lime-100 to-white",
    };
  }

  if (status === "too_low" || status === "slightly_low") {
    return {
      badge: "border-sky-200 bg-sky-50 text-sky-900",
      accent: "from-sky-100 via-lime-50 to-white",
    };
  }

  if (status === "high") {
    return {
      badge: "border-violet-200 bg-violet-50 text-violet-900",
      accent: "from-violet-100 via-lime-50 to-white",
    };
  }

  if (status === "insufficient_data") {
    return {
      badge: "border-slate-200 bg-slate-50 text-slate-700",
      accent: "from-slate-100 via-white to-white",
    };
  }

  return {
    badge: "border-lime-200 bg-lime-50 text-lime-900",
    accent: "from-lime-100 via-emerald-50 to-white",
  };
}

function getChipTone(status: GoalFeedback["chips"][number]["status"]) {
  if (status === "good") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (status === "low") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

type GoalFeedbackCardProps = {
  feedback: GoalFeedback;
  recommendationLabel: string;
  weekSummary: string;
  focusSummary: string;
  primaryButtonLabel?: string;
  hideFocusHint?: boolean;
  onStartRecommended: () => void;
  onShowDetails: () => void;
};

export default function GoalFeedbackCard(props: GoalFeedbackCardProps) {
  const tone = getStatusTone(props.feedback.status);
  const showConfidenceNote = props.feedback.confidence === "low";

  return (
    <section
      className={cn(
        uiCardClasses.base,
        "overflow-hidden border-lime-200 bg-gradient-to-br p-5 shadow-[0_18px_40px_rgba(132,204,22,0.10)]",
        tone.accent,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Mot ditt mål
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {props.feedback.score}/100
          </h2>
        </div>

        <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", tone.badge)}>
          {props.feedback.headline}
        </span>
      </div>

      <p className="mt-3 text-base font-medium leading-7 text-slate-900">
        {props.feedback.summary}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{props.feedback.mainAdvice}</p>

      <div className="mt-4 rounded-2xl border border-white/70 bg-white/85 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Bästa nästa steg
        </p>
        <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
          {props.recommendationLabel}
        </p>
        {!props.hideFocusHint && props.feedback.concreteChange.focusLabels.length > 0 ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Helst med fokus på {props.feedback.concreteChange.focusLabels.join(" och ")}.
          </p>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-white/70 bg-white/85 px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{props.weekSummary}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Fokus just nu: <span className="font-medium text-slate-900">{props.focusSummary}</span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {props.feedback.chips.map((chip) => (
          <span
            key={chip.label}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium",
              getChipTone(chip.status),
            )}
          >
            {chip.label}: {chip.value}
          </span>
        ))}
      </div>

      {showConfidenceNote ? (
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Genomför några pass till så blir bedömningen säkrare.
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={props.onStartRecommended}
          className={cn(uiButtonClasses.primary, "w-full justify-center sm:flex-1")}
        >
          {props.primaryButtonLabel ?? "Starta rekommenderat pass"}
        </button>
        <button
          type="button"
          onClick={props.onShowDetails}
          className={cn(uiButtonClasses.secondary, "w-full justify-center sm:flex-1")}
        >
          Visa detaljer
        </button>
      </div>
    </section>
  );
}
