"use client";

type RunHeaderProps = {
  workoutName: string;
  displayName: string;
  onAbort: () => void;
  children?: React.ReactNode;
};

export default function RunHeader({
  workoutName,
  displayName,
  onAbort,
  children,
}: RunHeaderProps) {
  return (
    <div className="bg-slate-900 px-5 pb-6 pt-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
            Pass pågår
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {workoutName}
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-200">
            Hej {displayName}. Fokusera bara på nästa handling.
          </p>
        </div>

        <button
          type="button"
          onClick={onAbort}
          className="min-h-11 shrink-0 rounded-2xl border border-white/30 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 active:scale-[0.99]"
        >
          Avbryt
        </button>
      </div>

      {children}
    </div>
  );
}