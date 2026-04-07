// Delade shell-klasser för sidlayout.
// Gör att /home, /preview och /run kan dela samma grundstruktur.

export const uiPageShellClasses = {
  page: "min-h-screen bg-slate-50",
  content: "mx-auto max-w-3xl px-4 py-5 sm:px-6",
  contentWide: "mx-auto max-w-5xl px-4 py-5 sm:px-6",
  stack: "space-y-4",
  stickyFooter:
    "fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur",
  stickyFooterInner: "mx-auto flex max-w-3xl items-center gap-3",
};