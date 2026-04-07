// Delade knappstilar för hela appen.
// Ljus grön huvudknapp med mörk text, i linje med headern.

export const uiButtonClasses = {
  primary:
    "min-h-11 rounded-2xl !bg-emerald-200 px-4 py-3 text-sm font-semibold !text-slate-900 shadow-sm transition hover:!bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:!bg-slate-300 disabled:!text-slate-500",

  secondary:
    "min-h-11 rounded-2xl border border-slate-200 !bg-white px-4 py-3 text-sm font-medium !text-slate-800 transition hover:!bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",

  ghostDark:
    "min-h-11 rounded-2xl border border-slate-900/10 !bg-white/60 px-3 py-2 text-sm font-medium !text-slate-900 transition hover:!bg-white/80 active:scale-[0.99]",

  ghost:
    "min-h-11 rounded-2xl px-3 py-2 text-sm font-medium !text-slate-700 transition hover:!bg-slate-100 active:scale-[0.99]",

  chip:
    "min-h-11 rounded-full border px-3 py-2 text-sm font-medium transition active:scale-[0.99]",

  chipSelected: "!border-emerald-500 !bg-emerald-200 !text-slate-900",
  chipSuggested: "!border-emerald-300 !bg-emerald-50 !text-slate-800",
  chipDefault: "!border-slate-200 !bg-white !text-slate-700",

  feedbackSelected: "!border-emerald-500 !bg-emerald-200 !text-slate-900",
  feedbackDefault: "!border-slate-200 !bg-white !text-slate-700",
};