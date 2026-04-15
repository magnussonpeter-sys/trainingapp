"use client";

// Delade typer och helpers för gymflödet.
// Håller UI och API i sync när vi bryter upp flödet i mindre vyer.

export type EquipmentType =
  | "dumbbell"
  | "barbell"
  | "bench"
  | "rack"
  | "kettlebell"
  | "machine"
  | "cable"
  | "bands"
  | "rings"
  | "bodyweight"
  | "other";

export type BandLevel = "light" | "medium" | "heavy";

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
  { value: "bench", label: "Bänk" },
  { value: "rack", label: "Rack / ställning" },
  { value: "kettlebell", label: "Kettlebells" },
  { value: "machine", label: "Maskin" },
  { value: "cable", label: "Kabelmaskin" },
  { value: "bands", label: "Gummiband" },
  { value: "rings", label: "Romerska ringar" },
  { value: "bodyweight", label: "Kroppsvikt" },
  { value: "other", label: "Övrigt" },
];

const DEFAULT_LABELS: Record<EquipmentType, string> = {
  dumbbell: "Hantlar",
  barbell: "Skivstång",
  bench: "Bänk",
  rack: "Rack",
  kettlebell: "Kettlebells",
  machine: "Maskin",
  cable: "Kabelmaskin",
  bands: "Gummiband",
  rings: "Romerska ringar",
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
  return {
    equipmentType: item.equipment_type,
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
  return type === "dumbbell" || type === "barbell" || type === "kettlebell";
}

export function usesWholeKiloQuickWeights(type: EquipmentType) {
  return type === "barbell" || type === "kettlebell";
}

export function allowsFreeformWeightEntry(type: EquipmentType) {
  return (
    type === "dumbbell" ||
    type === "barbell" ||
    type === "kettlebell" ||
    type === "machine" ||
    type === "cable"
  );
}

export function getEquipmentTypeLabel(type: EquipmentType) {
  return (
    EQUIPMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
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
