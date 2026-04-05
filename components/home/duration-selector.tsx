"use client";

type DurationSelectorProps = {
  value: number;
  inputValue: string;
  quickOptions: readonly number[];
  onQuickSelect: (duration: number) => void;
  onInputChange: (value: string) => void;
  onInputBlur: () => void;
};

// Tidsväljare hålls enkel och mobilvänlig.
export default function DurationSelector({
  value,
  inputValue,
  quickOptions,
  onQuickSelect,
  onInputChange,
  onInputBlur,
}: DurationSelectorProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <label
        htmlFor="duration"
        className="text-sm font-semibold text-slate-900"
      >
        Tid
      </label>

      <p className="mt-1 text-sm text-slate-600">
        Välj hur långt pass du vill ha idag.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {quickOptions.map((duration) => {
          const isSelected = value === duration;

          return (
            <button
              key={duration}
              type="button"
              onClick={() => onQuickSelect(duration)}
              className={`min-h-[44px] rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                isSelected
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
              }`}
            >
              {duration} min
            </button>
          );
        })}
      </div>

      <input
        id="duration"
        inputMode="numeric"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onBlur={onInputBlur}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        placeholder="Annan tid i minuter"
      />
    </div>
  );
}