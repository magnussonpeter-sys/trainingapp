"use client";

// Enkel timerpanel för tidsövningar.
// Samma mentala modell som docs beskriver:
// redo -> igång -> stoppad och redo att sparas.

function formatTimerClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (!restSeconds) {
    return `${minutes} min`;
  }

  return `${minutes} min ${restSeconds} s`;
}

type TimerPanelProps = {
  elapsedSeconds: number;
  targetDurationSeconds?: number;
  perSideDurationSeconds?: number;
  timerState: "idle" | "running" | "ready_to_save";
};

export default function TimerPanel({
  elapsedSeconds,
  targetDurationSeconds,
  perSideDurationSeconds,
  timerState,
}: TimerPanelProps) {
  const hasPerSideCue =
    typeof perSideDurationSeconds === "number" && perSideDurationSeconds > 0;
  const showSwitchCue =
    hasPerSideCue &&
    timerState === "running" &&
    elapsedSeconds >= perSideDurationSeconds &&
    elapsedSeconds < (targetDurationSeconds ?? perSideDurationSeconds);
  const showBothSidesDone =
    hasPerSideCue &&
    timerState === "running" &&
    elapsedSeconds >= (targetDurationSeconds ?? perSideDurationSeconds);
  const statusLabel =
    timerState === "idle"
      ? "Redo"
      : timerState === "running"
        ? "Pågår"
        : "Redo att sparas";

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 text-center shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        Tid för set
      </p>

      <div className="mt-3 text-6xl font-semibold tracking-tight text-slate-900">
        {formatTimerClock(elapsedSeconds)}
      </div>

      {showSwitchCue ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-900">
          Byt sida
        </div>
      ) : null}

      {showBothSidesDone ? (
        <div className="mt-4 rounded-2xl border border-lime-200 bg-lime-50 px-4 py-3 text-base font-semibold text-lime-900">
          Båda sidor klara
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          Mål:{" "}
          {hasPerSideCue
            ? `${formatDuration(perSideDurationSeconds)} / sida`
            : formatDuration(targetDurationSeconds ?? 0)}
        </span>

        {hasPerSideCue ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            Totalt: {formatDuration(targetDurationSeconds ?? 0)}
          </span>
        ) : null}

        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
