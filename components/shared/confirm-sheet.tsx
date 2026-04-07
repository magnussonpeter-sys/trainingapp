"use client";

// Enkel bekräftelsesheet för destruktiva eller viktiga val.

import { uiButtonClasses } from "@/lib/ui/button-classes";

type ConfirmSheetProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel = "Bekräfta",
  cancelLabel = "Avbryt",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm">
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl rounded-t-[32px] border border-slate-200 bg-white p-5 shadow-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Bekräfta
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>

        {description ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCancel}
            className={uiButtonClasses.secondary}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={
              destructive
                ? "inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition active:scale-[0.99]"
                : uiButtonClasses.primary
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}