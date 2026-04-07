"use client";

// Bottom sheet för att lägga till övningar i preview.
// Stöd för katalog + egen övning.

import type { ExerciseCatalogItem } from "@/lib/exercise-catalog";
import { uiButtonClasses } from "@/lib/ui/button-classes";

type AddExerciseSheetProps = {
  open: boolean;
  mode: "catalog" | "custom";
  onModeChange: (mode: "catalog" | "custom") => void;
  onClose: () => void;

  catalogSearch: string;
  onCatalogSearchChange: (value: string) => void;
  catalogItems: ExerciseCatalogItem[];
  onAddCatalogExercise: (item: ExerciseCatalogItem) => void;

  customName: string;
  onCustomNameChange: (value: string) => void;
  customSets: string;
  onCustomSetsChange: (value: string) => void;
  customReps: string;
  onCustomRepsChange: (value: string) => void;
  customDuration: string;
  onCustomDurationChange: (value: string) => void;
  customRest: string;
  onCustomRestChange: (value: string) => void;
  customDescription: string;
  onCustomDescriptionChange: (value: string) => void;
  onAddCustomExercise: () => void;

  error?: string | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AddExerciseSheet({
  open,
  mode,
  onModeChange,
  onClose,
  catalogSearch,
  onCatalogSearchChange,
  catalogItems,
  onAddCatalogExercise,
  customName,
  onCustomNameChange,
  customSets,
  onCustomSetsChange,
  customReps,
  onCustomRepsChange,
  customDuration,
  onCustomDurationChange,
  customRest,
  onCustomRestChange,
  customDescription,
  onCustomDescriptionChange,
  onAddCustomExercise,
  error,
}: AddExerciseSheetProps) {
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
                Lägg till övning
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={uiButtonClasses.secondary}
            >
              Stäng
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onModeChange("catalog")}
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                mode === "catalog"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700",
              )}
            >
              Katalog
            </button>

            <button
              type="button"
              onClick={() => onModeChange("custom")}
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                mode === "custom"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700",
              )}
            >
              Egen övning
            </button>
          </div>
        </div>

        <div className="max-h-[calc(88vh-144px)] overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {mode === "catalog" ? (
            <div className="space-y-4">
              <input
                value={catalogSearch}
                onChange={(event) => onCatalogSearchChange(event.target.value)}
                placeholder="Sök övning"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />

              <div className="space-y-3">
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
                        onClick={() => onAddCatalogExercise(item)}
                        className={uiButtonClasses.primary}
                      >
                        Lägg till
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
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Namn på övning
                </span>
                <input
                  value={customName}
                  onChange={(event) => onCustomNameChange(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Till exempel Bulgarian split squat"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Set
                  </span>
                  <input
                    value={customSets}
                    onChange={(event) => onCustomSetsChange(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Reps
                  </span>
                  <input
                    value={customReps}
                    onChange={(event) => onCustomRepsChange(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Tid per set (sek)
                  </span>
                  <input
                    value={customDuration}
                    onChange={(event) =>
                      onCustomDurationChange(event.target.value)
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Vila (sek)
                  </span>
                  <input
                    value={customRest}
                    onChange={(event) => onCustomRestChange(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Beskrivning
                </span>
                <textarea
                  value={customDescription}
                  onChange={(event) =>
                    onCustomDescriptionChange(event.target.value)
                  }
                  className="min-h-[120px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  placeholder="Kort instruktion eller notering"
                />
              </label>

              <button
                type="button"
                onClick={onAddCustomExercise}
                className={cn(uiButtonClasses.primary, "w-full")}
              >
                Lägg till övning
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}