"use client";

// Visar tydligt när ett pass har återupptagits.
// Håller fokus på trygghet i offline-first-flödet.

type RunResumeBannerProps = {
  restoreNotice?: string | null;
};

export default function RunResumeBanner({
  restoreNotice,
}: RunResumeBannerProps) {
  if (!restoreNotice) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      <p className="font-medium">Pågående pass återupptaget</p>
      <p className="mt-1 leading-6">{restoreNotice}</p>
    </section>
  );
}