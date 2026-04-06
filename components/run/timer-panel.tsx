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
  timerState: "idle" | "running" | "ready_to_save";
};

export default function TimerPanel({
  elapsedSeconds,
  targetDurationSeconds,
  timerState,
}: TimerPanelProps) {
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

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          Mål: {formatDuration(targetDurationSeconds ?? 0)}
        </span>

        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
          {statusLabel}
        </span>
      </div>
    </div>
  );
}