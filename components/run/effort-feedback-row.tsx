"use client";

import { uiButtonClasses } from "@/lib/ui/button-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type RepsValue = 0 | 2 | 4 | 6 | null;
type TimedValue = "light" | "just_right" | "tough" | null;

type EffortFeedbackRowProps =
  | {
      mode: "reps";
      value: RepsValue;
      onChange: (value: 0 | 2 | 4 | 6) => void;
      onSkip: () => void;
      onContinue: () => void;
    }
  | {
      mode: "timed";
      value: TimedValue;
      onChange: (value: "light" | "just_right" | "tough") => void;
      onSkip: () => void;
      onContinue: () => void;
    };

export default function EffortFeedbackRow(props: EffortFeedbackRowProps) {
  const options =
    props.mode === "reps"
      ? [
          { value: 0 as const, label: "0 · tungt" },
          { value: 2 as const, label: "2 · bra" },
          { value: 4 as const, label: "4 · lätt" },
          { value: 6 as const, label: "6+ · mycket lätt" },
        ]
      : [
          { value: "light" as const, label: "Lätt" },
          { value: "just_right" as const, label: "Lagom" },
          { value: "tough" as const, label: "Tufft" },
        ];

  return (
    <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Feedback
        </p>

        <h3 className="mt-1 text-lg font-semibold text-slate-900">
          {props.mode === "reps"
            ? "Hur kändes sista seten?"
            : "Hur kändes tidsövningen?"}
        </h3>
      </div>

      <div
        className={cn(
          "gap-2",
          props.mode === "reps" ? "grid grid-cols-2" : "grid grid-cols-3",
        )}
      >
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => props.onChange(option.value as never)}
            className={cn(
              "min-h-11 rounded-2xl border px-3 py-3 text-sm font-medium transition",
              props.value === option.value
                ? uiButtonClasses.feedbackSelected
                : uiButtonClasses.feedbackDefault,
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={props.onSkip}
          className={uiButtonClasses.secondary}
        >
          Hoppa över
        </button>

        <button
          type="button"
          onClick={props.onContinue}
          className={cn(uiButtonClasses.primary, "flex-[1.3]")}
        >
          Fortsätt
        </button>
      </div>
    </div>
  );
}