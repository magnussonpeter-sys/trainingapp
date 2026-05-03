"use client";

import { useEffect } from "react";

type AppToastProps = {
  message: string | null;
  tone?: "success" | "info" | "warning";
  onDismiss: () => void;
  durationMs?: number;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AppToast({
  message,
  tone = "success",
  onDismiss,
  durationMs = 3200,
}: AppToastProps) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(onDismiss, durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [durationMs, message, onDismiss]);

  if (!message) {
    return null;
  }

  const toneClassName =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "info"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-start justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur",
          toneClassName,
        )}
      >
        <p className="min-w-0 flex-1 text-sm font-medium leading-6">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 min-w-11 shrink-0 rounded-xl px-3 text-sm font-semibold"
          aria-label="Stäng meddelande"
          title="Stäng"
        >
          OK
        </button>
      </div>
    </div>
  );
}
