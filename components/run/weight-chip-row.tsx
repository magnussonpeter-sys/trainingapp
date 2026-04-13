"use client";

import { uiButtonClasses } from "@/lib/ui/button-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type WeightChipRowProps = {
  chips: string[];
  selectedWeight: string;
  suggestedWeight: string;
  unitLabel?: string;
  onSelect: (value: string) => void;
};

export default function WeightChipRow({
  chips,
  selectedWeight,
  suggestedWeight,
  unitLabel = "kg",
  onSelect,
}: WeightChipRowProps) {
  const normalizedSelected = selectedWeight.trim().replace(",", ".");
  const normalizedSuggested = suggestedWeight.trim().replace(",", ".");

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const normalizedChip = chip.trim().replace(",", ".");
        const isSelected = normalizedChip === normalizedSelected;
        const isSuggested = normalizedChip === normalizedSuggested;

        return (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            className={cn(
              uiButtonClasses.chip,
              isSelected
                ? uiButtonClasses.chipSelected
                : isSuggested
                  ? uiButtonClasses.chipSuggested
                  : uiButtonClasses.chipDefault,
            )}
          >
            {chip} {unitLabel}
            {isSuggested ? " · förslag" : ""}
          </button>
        );
      })}
    </div>
  );
}
