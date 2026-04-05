"use client";

type ChipOption<T extends string | number> = {
  value: T;
  label: string;
};

type ChipSelectorProps<T extends string | number> = {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

// Gemensam chip-selector för tid, filter och liknande val.
export default function ChipSelector<T extends string | number>({
  options,
  value,
  onChange,
  className = "",
}: ChipSelectorProps<T>) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-[44px] rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
              isSelected
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}