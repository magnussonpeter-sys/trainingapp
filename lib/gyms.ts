"use client";

// Delade typer och helpers för gymflödet.
// Håller UI och API i sync när vi bryter upp flödet i mindre vyer.

import type { BandLevel, GymEquipmentType } from "@/lib/equipment";
import {
  normalizeGymEquipmentType,
  supportsGymEquipmentWeights,
  supportsWholeKiloQuickWeights,
} from "@/lib/equipment";

export type EquipmentType = GymEquipmentType;

export type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
  name?: string | null;
  role?: "user" | "admin";
};

export type GymEquipment = {
  id: string;
  gym_id: string;
  equipment_type: EquipmentType;
  label: string;
  notes?: string | null;
  weights_kg?: number[] | null;
  band_level?: BandLevel | null;
  band_levels?: BandLevel[] | null;
  quantity?: number | null;
};

export type Gym = {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  is_shared?: boolean | null;
  equipment: GymEquipment[];
};

export type EquipmentDraft = {
  equipmentType: EquipmentType;
  label: string;
  quantity: string;
  notes: string;
  selectedWeights: number[];
  manualWeightInput: string;
  bandLevels: BandLevel[];
};

export const EQUIPMENT_TYPE_OPTIONS: Array<{
  value: EquipmentType;
  label: string;
}> = [
  { value: "dumbbell", label: "Hantlar" },
  { value: "barbell", label: "Skivstång" },
  { value: "ez_bar", label: "EZ-stång" },
  { value: "trap_bar", label: "Trap bar" },
  { value: "bench", label: "Bänk" },
  { value: "rack", label: "Rack / ställning" },
  { value: "smith_machine", label: "Smithmaskin" },
  { value: "kettlebell", label: "Kettlebells" },
  { value: "pullup_bar", label: "Chinsstång" },
  { value: "dip_bars", label: "Dip bars" },
  { value: "cable_machine", label: "Kabelmaskin" },
  { value: "machine", label: "Maskin" },
  { value: "bands", label: "Gummiband" },
  { value: "rings", label: "Romerska ringar" },
  { value: "box", label: "Box / plyobox" },
  { value: "medicine_ball", label: "Medicinboll" },
  { value: "bodyweight", label: "Kroppsvikt" },
  { value: "other", label: "Övrigt" },
];

const DEFAULT_LABELS: Record<EquipmentType, string> = {
  dumbbell: "Hantlar",
  barbell: "Skivstång",
  ez_bar: "EZ-stång",
  trap_bar: "Trap bar",
  bench: "Bänk",
  rack: "Rack",
  smith_machine: "Smithmaskin",
  kettlebell: "Kettlebells",
  pullup_bar: "Chinsstång",
  dip_bars: "Dip bars",
  cable_machine: "Kabelmaskin",
  machine: "Maskin",
  bands: "Gummiband",
  rings: "Romerska ringar",
  box: "Box / plyobox",
  medicine_ball: "Medicinboll",
  bodyweight: "Kroppsvikt",
  other: "Namn på utrustning",
};

export function createDefaultEquipmentDraft(
  equipmentType: EquipmentType = "dumbbell"
): EquipmentDraft {
  return {
    equipmentType,
    label: DEFAULT_LABELS[equipmentType],
    quantity: "",
    notes: "",
    selectedWeights: [],
    manualWeightInput: "",
    bandLevels: [],
  };
}

export function createDraftFromEquipment(item: GymEquipment): EquipmentDraft {
  const normalizedType = normalizeGymEquipmentType(item.equipment_type) ?? "other";

  return {
    equipmentType: normalizedType,
    label: item.label,
    quantity: item.quantity ? String(item.quantity) : "",
    notes: item.notes ?? "",
    selectedWeights: [...(item.weights_kg ?? [])].sort((a, b) => a - b),
    manualWeightInput: "",
    bandLevels:
      item.band_levels && item.band_levels.length > 0
        ? [...item.band_levels]
        : item.band_level
          ? [item.band_level]
          : [],
  };
}

export function isWeightBasedType(type: EquipmentType) {
  return supportsGymEquipmentWeights(type);
}

export function usesWholeKiloQuickWeights(type: EquipmentType) {
  return supportsWholeKiloQuickWeights(type);
}

export function allowsFreeformWeightEntry(type: EquipmentType) {
  return supportsGymEquipmentWeights(type);
}

export function getEquipmentTypeLabel(type: EquipmentType) {
  const normalizedType = normalizeGymEquipmentType(type) ?? type;

  return (
    EQUIPMENT_TYPE_OPTIONS.find((option) => option.value === normalizedType)?.label ??
    normalizedType
  );
}

export function formatWeightValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatWeights(weights?: number[] | null) {
  if (!weights || weights.length === 0) {
    return "Alla vikter / ej specificerat";
  }

  return `${[...weights]
    .sort((a, b) => a - b)
    .map(formatWeightValue)
    .join(", ")} kg`;
}

export function formatEquipmentMeta(item: GymEquipment) {
  const parts: string[] = [];

  if (isWeightBasedType(item.equipment_type)) {
    parts.push(formatWeights(item.weights_kg));
  }

  if (
    item.equipment_type === "bands" &&
    ((item.band_levels && item.band_levels.length > 0) || item.band_level)
  ) {
    const levels =
      item.band_levels && item.band_levels.length > 0
        ? item.band_levels
        : item.band_level
          ? [item.band_level]
          : [];
    const labels = levels.map((level) =>
      level === "light" ? "Lätt" : level === "medium" ? "Medium" : "Tung",
    );
    parts.push(`Motstånd: ${labels.join(", ")}`);
  }

  if (item.quantity && item.quantity > 0) {
    parts.push(`Antal: ${item.quantity}`);
  }

  if (item.notes?.trim()) {
    parts.push(item.notes.trim());
  }

  return parts.join(" • ");
}

export function getGymDisplayCount(gym: Gym) {
  return gym.equipment.length;
}

export function getDumbbellQuickWeights() {
  const weights: number[] = [];

  for (let weight = 0.5; weight <= 20; weight += 0.5) {
    weights.push(Number(weight.toFixed(1)));
  }

  return weights;
}

export function getWholeKiloQuickWeights() {
  return Array.from({ length: 20 }, (_, index) => index + 1);
}

export function getQuickWeightsForType(type: EquipmentType) {
  if (type === "dumbbell") {
    return getDumbbellQuickWeights();
  }

  if (usesWholeKiloQuickWeights(type)) {
    return getWholeKiloQuickWeights();
  }

  return [];
}

export function parseManualWeightsInput(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim().replace(",", "."))
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

export function sortUniqueWeights(weights: number[]) {
  return [...new Set(weights)].sort((a, b) => a - b);
}
