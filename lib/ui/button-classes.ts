// Delade knappstilar för hela appen.
// Matchar visuellt login-sidan (/)

export const uiButtonClasses = {
  // 🔵 PRIMARY – huvudknapp (som "Logga in")
  primary:
    "min-h-11 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500",

  // ⚪ SECONDARY – ljus knapp
  secondary:
    "min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",

  // 🌑 GHOST DARK – används på mörk bakgrund (header)
  ghostDark:
    "min-h-11 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15 active:scale-[0.99]",

  // ⚪ GHOST – diskret knapp
  ghost:
    "min-h-11 rounded-2xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]",

  // 🔘 Chips
  chip:
    "min-h-11 rounded-full border px-3 py-2 text-sm font-medium transition active:scale-[0.99]",

  chipSelected: "border-slate-900 bg-slate-900 text-white",
  chipSuggested: "border-sky-300 bg-sky-50 text-sky-800",
  chipDefault: "border-slate-200 bg-white text-slate-700",

  // 💪 Feedback
  feedbackSelected: "border-slate-900 bg-slate-900 text-white",
  feedbackDefault: "border-slate-200 bg-white text-slate-700",
};