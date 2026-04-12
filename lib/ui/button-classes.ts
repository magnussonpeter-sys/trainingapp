// Delade knappstilar för hela appen.
// Ljus mossgrön huvudknapp med mörk text.

export const uiButtonClasses = {
  primary:
    "min-h-11 rounded-2xl !bg-lime-200 px-4 py-3 text-sm font-semibold !text-slate-900 shadow-sm transition hover:!bg-lime-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:!bg-slate-300 disabled:!text-slate-500",

  secondary:
    "min-h-11 rounded-2xl border border-slate-200 !bg-white px-4 py-3 text-sm font-medium !text-slate-800 transition hover:!bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",

  ghostDark:
    "min-h-11 rounded-2xl border border-slate-900/10 !bg-white/60 px-3 py-2 text-sm font-medium !text-slate-900 transition hover:!bg-white/80 active:scale-[0.99]",

  ghost:
    "min-h-11 rounded-2xl px-3 py-2 text-sm font-medium !text-slate-700 transition hover:!bg-slate-100 active:scale-[0.99]",

  chip:
    "min-h-11 rounded-full border px-3 py-2 text-sm font-medium transition active:scale-[0.99]",

  chipSelected: "!border-lime-500 !bg-lime-200 !text-slate-900",
  chipSuggested: "!border-lime-300 !bg-lime-50 !text-slate-800",
  chipDefault: "!border-slate-200 !bg-white !text-slate-700",

  feedbackSelected: "!border-lime-500 !bg-lime-200 !text-slate-900",
  feedbackDefault: "!border-slate-200 !bg-white !text-slate-700",
};