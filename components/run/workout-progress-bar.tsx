"use client";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type WorkoutProgressBarProps = {
  title?: string;
  detail?: string;
  percent: number;
};

export default function WorkoutProgressBar({
  title,
  detail,
  percent,
}: WorkoutProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white/90 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-slate-500">
          {title || "Passprogress"}
        </p>
        <p className="shrink-0 text-sm font-medium text-slate-500">
          {detail || `${clampedPercent}%`}
        </p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-300 transition-all duration-300",
          )}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </section>
  );
}
