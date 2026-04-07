"use client";

// Delad liten stepper för preview/run-sheet.
// Håller samma visuella språk som övriga appen.

type InlineNumberStepperProps = {
  label: string;
  value: string | number;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
  increaseDisabled?: boolean;
  helperText?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function InlineNumberStepper({
  label,
  value,
  onDecrease,
  onIncrease,
  decreaseDisabled = false,
  increaseDisabled = false,
  helperText,
}: InlineNumberStepperProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>

          <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            {value}
          </p>

          {helperText ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">{helperText}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDecrease}
            disabled={decreaseDisabled}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl border text-lg font-semibold transition",
              decreaseDisabled
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                : "border-slate-200 bg-white text-slate-700 active:scale-[0.98]",
            )}
            aria-label={`Minska ${label.toLowerCase()}`}
          >
            −
          </button>

          <button
            type="button"
            onClick={onIncrease}
            disabled={increaseDisabled}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl border text-lg font-semibold transition",
              increaseDisabled
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                : "border-slate-200 bg-white text-slate-700 active:scale-[0.98]",
            )}
            aria-label={`Öka ${label.toLowerCase()}`}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}