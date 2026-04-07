"use client";

// Enkel toppsektion för preview.
// Håller samma visuella språk som /run och /home.

import { uiButtonClasses } from "@/lib/ui/button-classes";

type PreviewHeaderProps = {
  workoutName: string;
  onBack: () => void;
};

export default function PreviewHeader({
  workoutName,
  onBack,
}: PreviewHeaderProps) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
      <div className="bg-slate-900 px-5 pb-6 pt-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
              Föreslaget pass
            </p>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {workoutName}
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
              Justera snabbt det du vill innan du startar passet.
            </p>
          </div>

          <button
            type="button"
            onClick={onBack}
            className={uiButtonClasses.ghostInverted}
          >
            Tillbaka
          </button>
        </div>
      </div>
    </section>
  );
}