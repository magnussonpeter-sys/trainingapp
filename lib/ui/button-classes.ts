// Delade knappstilar för hela appen.
// Målet är konsekvent färg, kontrast och touch-ytor på alla sidor.

export const uiButtonClasses = {
  primary:
    "min-h-11 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500",
  secondary:
    "min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",
  ghostDark:
    "min-h-11 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",
  chip:
    "min-h-11 rounded-full border px-3 py-2 text-sm font-medium transition active:scale-[0.99]",
  chipSelected: "border-indigo-600 bg-indigo-600 text-white",
  chipSuggested: "border-sky-300 bg-sky-50 text-sky-800",
  chipDefault: "border-slate-200 bg-white text-slate-700",
  feedbackSelected: "border-indigo-600 bg-indigo-600 text-white",
  feedbackDefault: "border-slate-200 bg-white text-slate-700",
};