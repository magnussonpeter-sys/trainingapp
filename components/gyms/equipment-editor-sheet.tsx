"use client";

import { useEffect, useMemo, useState } from "react";

import { uiButtonClasses } from "@/lib/ui/button-classes";
import {
  createDefaultEquipmentDraft,
  EQUIPMENT_TYPE_OPTIONS,
  type EquipmentDraft,
  type EquipmentType,
  getQuickWeightsForType,
  isWeightBasedType,
  parseManualWeightsInput,
  sortUniqueWeights,
} from "@/lib/gyms";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type EquipmentEditorSheetProps = {
  open: boolean;
  title: string;
  initialDraft?: EquipmentDraft;
  mode: "create" | "edit";
  isSaving?: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onSave: (draft: EquipmentDraft) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
};

function getDefaultLabel(type: EquipmentType) {
  return (
    EQUIPMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    "Utrustning"
  );
}

export default function EquipmentEditorSheet({
  open,
  title,
  initialDraft,
  mode,
  isSaving = false,
  isDeleting = false,
  onClose,
  onSave,
  onDelete,
}: EquipmentEditorSheetProps) {
  const [draft, setDraft] = useState<EquipmentDraft>(
    initialDraft ?? createDefaultEquipmentDraft(),
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(initialDraft ?? createDefaultEquipmentDraft());
  }, [initialDraft, open]);

  const quickWeights = useMemo(() => {
    return getQuickWeightsForType(draft.equipmentType);
  }, [draft.equipmentType]);

  if (!open) {
    return null;
  }

  function updateDraft(updates: Partial<EquipmentDraft>) {
    setDraft((current) => ({ ...current, ...updates }));
  }

  function handleEquipmentTypeChange(nextType: EquipmentType) {
    setDraft((current) => ({
      ...createDefaultEquipmentDraft(nextType),
      label:
        current.equipmentType === nextType && current.label.trim()
          ? current.label
          : getDefaultLabel(nextType),
    }));
  }

  function toggleWeight(weight: number) {
    const nextWeights = draft.selectedWeights.includes(weight)
      ? draft.selectedWeights.filter((item) => item !== weight)
      : [...draft.selectedWeights, weight];

    updateDraft({
      selectedWeights: sortUniqueWeights(nextWeights),
    });
  }

  function handleAddManualWeights() {
    const parsedWeights = parseManualWeightsInput(draft.manualWeightInput);
    if (parsedWeights.length === 0) {
      return;
    }

    updateDraft({
      selectedWeights: sortUniqueWeights([
        ...draft.selectedWeights,
        ...parsedWeights,
      ]),
      manualWeightInput: "",
    });
  }

  const canSave = draft.label.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm">
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl rounded-t-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-center px-5 pb-1 pt-3">
          <span className="h-1.5 w-14 rounded-full bg-slate-200" />
        </div>

        <div className="max-h-[88dvh] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            {mode === "create" ? "Ny utrustning" : "Redigera utrustning"}
          </p>

          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {title}
          </h2>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Typ
              </label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleEquipmentTypeChange(option.value)}
                    className={cn(
                      uiButtonClasses.chip,
                      draft.equipmentType === option.value
                        ? uiButtonClasses.chipSelected
                        : uiButtonClasses.chipDefault,
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Namn
              </label>
              <input
                value={draft.label}
                onChange={(event) => updateDraft({ label: event.target.value })}
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                placeholder="Till exempel Hantlar"
              />
            </div>

            {draft.equipmentType === "bands" ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Motstånd
                </label>
                <p className="mb-3 text-sm leading-6 text-slate-500">
                  Välj en eller flera nivåer som finns i gymmet.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "light", label: "Lätt" },
                    { value: "medium", label: "Medium" },
                    { value: "heavy", label: "Tung" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const nextLevels = draft.bandLevels.includes(
                          option.value as EquipmentDraft["bandLevels"][number],
                        )
                          ? draft.bandLevels.filter((item) => item !== option.value)
                          : [
                              ...draft.bandLevels,
                              option.value as EquipmentDraft["bandLevels"][number],
                            ];

                        updateDraft({ bandLevels: nextLevels });
                      }}
                      className={cn(
                        uiButtonClasses.chip,
                        draft.bandLevels.includes(
                          option.value as EquipmentDraft["bandLevels"][number],
                        )
                          ? uiButtonClasses.chipSelected
                          : uiButtonClasses.chipDefault,
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isWeightBasedType(draft.equipmentType) ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Snabbval av vikter
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {quickWeights.map((weight) => (
                      <button
                        key={weight}
                        type="button"
                        onClick={() => toggleWeight(weight)}
                        className={cn(
                          uiButtonClasses.chip,
                          draft.selectedWeights.includes(weight)
                            ? uiButtonClasses.chipSelected
                            : uiButtonClasses.chipDefault,
                        )}
                      >
                        {Number.isInteger(weight) ? weight : weight.toFixed(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Lägg till egna vikter
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={draft.manualWeightInput}
                      onChange={(event) =>
                        updateDraft({ manualWeightInput: event.target.value })
                      }
                      placeholder="Ex. 22 eller 22, 24"
                      className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddManualWeights}
                      className={uiButtonClasses.secondary}
                    >
                      Lägg till
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Valda vikter
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {draft.selectedWeights.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Inga specifika vikter valda än.
                      </p>
                    ) : (
                      draft.selectedWeights.map((weight) => (
                        <button
                          key={weight}
                          type="button"
                          onClick={() => toggleWeight(weight)}
                          className={cn(
                            uiButtonClasses.chip,
                            uiButtonClasses.chipSelected,
                          )}
                        >
                          {Number.isInteger(weight) ? weight : weight.toFixed(1)} ×
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Antal
                </label>
                <input
                  value={draft.quantity}
                  onChange={(event) =>
                    updateDraft({ quantity: event.target.value })
                  }
                  inputMode="numeric"
                  className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                  placeholder="Valfritt"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Anteckning
                </label>
                <input
                  value={draft.notes}
                  onChange={(event) => updateDraft({ notes: event.target.value })}
                  className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                  placeholder="Valfritt"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => void onSave(draft)}
              disabled={!canSave || isSaving}
              className={uiButtonClasses.primary}
            >
              {isSaving ? "Sparar..." : "Spara"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className={uiButtonClasses.secondary}
            >
              Avbryt
            </button>

            {mode === "edit" && onDelete ? (
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={isDeleting}
                className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Tar bort..." : "Ta bort"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
