"use client";

// Delad viktinput för /run.
// Håller samma visuella språk för reps- och tidsövningar.

type ManualWeightInputProps = {
  value: string;
  onChange: (value: string) => void;
  suggestedWeightValue: string;
  label?: string;
};

export default function ManualWeightInput({
  value,
  onChange,
  suggestedWeightValue,
  label = "Vikt",
}: ManualWeightInputProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <div className="mt-2 flex items-end gap-2">
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full border-none bg-transparent p-0 text-3xl font-semibold text-slate-900 outline-none"
        />
        <span className="pb-1 text-sm font-medium text-slate-500">kg</span>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {suggestedWeightValue
          ? `AI-förslag: ${suggestedWeightValue} kg`
          : "Ingen vikt föreslagen"}
      </p>
    </div>
  );
}