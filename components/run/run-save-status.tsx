"use client";

// Diskret statusrad för lokal sparning och återupptagning.
// Samma ton som övriga run-komponenter.

type RunSaveStatusProps = {
  status: "idle" | "saving" | "saved_local" | "error_local";
  restoreNotice?: string | null;
  pendingSyncCount?: number;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function RunSaveStatus({
  status,
  restoreNotice,
  pendingSyncCount = 0,
}: RunSaveStatusProps) {
  const label =
    status === "saving"
      ? "Sparar lokalt..."
      : status === "saved_local"
        ? "Sparat lokalt"
        : status === "error_local"
          ? "Kunde inte spara lokalt"
          : "Pass pågår";

  const toneClass =
    status === "error_local"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={cn("rounded-2xl border p-3 text-sm", toneClass)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{label}</span>

        {pendingSyncCount > 0 ? (
          <span className="text-slate-500">
            {pendingSyncCount} väntar på synk
          </span>
        ) : null}
      </div>

      {restoreNotice ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">{restoreNotice}</p>
      ) : null}
    </div>
  );
}