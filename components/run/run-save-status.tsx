"use client";

type RunSaveStatusProps = {
  status: "idle" | "saving" | "saved_local" | "error_local";
  restoreNotice?: string | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function RunSaveStatus({
  status,
  restoreNotice,
}: RunSaveStatusProps) {
  const label =
    status === "saving"
      ? "Sparar lokalt..."
      : status === "saved_local"
        ? "Sparat lokalt"
        : status === "error_local"
          ? "Kunde inte spara lokalt"
          : "Pass pågår";

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex rounded-full px-3 py-1 text-xs font-medium",
          status === "error_local"
            ? "bg-rose-100 text-rose-700"
            : status === "saving"
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-700",
        )}
      >
        {label}
      </span>

      {restoreNotice ? (
        <span className="inline-flex rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">
          {restoreNotice}
        </span>
      ) : null}
    </div>
  );
}