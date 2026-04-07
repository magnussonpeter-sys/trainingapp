"use client";

// Bottom sheet för att byta en befintlig övning.

import type { ExerciseCatalogItem } from "@/lib/exercise-catalog";
import { uiButtonClasses } from "@/lib/ui/button-classes";

type ReplaceExerciseSheetProps = {
  open: boolean;
  currentExerciseName?: string;
  search: string;
  onSearchChange: (value: string) => void;
  catalogItems: ExerciseCatalogItem[];
  onReplace: (item: ExerciseCatalogItem) => void;
  onClose: () => void;
  error?: string | null;
};

export default function ReplaceExerciseSheet({
  open,
  currentExerciseName,
  search,
  onSearchChange,
  catalogItems,
  onReplace,
  onClose,
  error,
}: ReplaceExerciseSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm">
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-3xl overflow-hidden rounded-t-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Preview
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                Byt övning
              </h2>
              {currentExerciseName ? (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Nuvarande övning: {currentExerciseName}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className={uiButtonClasses.secondary}
            >
              Stäng
            </button>
          </div>
        </div>

        <div className="max-h-[calc(88vh-120px)] overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Sök övning att byta till"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />

          <div className="mt-4 space-y-3">
            {catalogItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {item.name}
                    </h3>

                    {item.description ? (
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {item.description}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => onReplace(item)}
                    className={uiButtonClasses.primary}
                  >
                    Byt
                  </button>
                </div>
              </div>
            ))}

            {catalogItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                Inga övningar matchade sökningen.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}