import { GYM_EQUIPMENT_TYPES, type GymEquipmentType } from "@/lib/equipment";

export const ALL_EQUIPMENT_GYM_NAME = "All utrustning";
export const ALL_EQUIPMENT_GYM_ID = "all-equipment";

type GymEquipmentLike = {
  id?: string | number | null;
  gym_id?: string | number | null;
  equipment_type?: string | null;
  label?: string | null;
  notes?: string | null;
  weights_kg?: number[] | null;
  band_level?: string | null;
  band_levels?: string[] | null;
  quantity?: number | null;
};

const ALL_EQUIPMENT_LABELS: Record<GymEquipmentType, string> = {
  dumbbell: "Hantlar",
  barbell: "Skivstång",
  ez_bar: "EZ-stång",
  trap_bar: "Trap bar",
  bench: "Bänk",
  rack: "Rack / ställning",
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
  other: "Övrigt",
};

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isAllEquipmentGymName(value: string | null | undefined) {
  return normalizeName(value) === normalizeName(ALL_EQUIPMENT_GYM_NAME);
}

export function buildAllEquipmentGymEquipment(gymId: string | number) {
  const normalizedGymId = String(gymId);

  return GYM_EQUIPMENT_TYPES.filter((type) => type !== "other").map((type) => ({
    id: `all-equipment:${normalizedGymId}:${type}`,
    gym_id: normalizedGymId,
    equipment_type: type,
    label: ALL_EQUIPMENT_LABELS[type],
    notes: null,
    weights_kg: null,
    band_level: null,
    band_levels: type === "bands" ? ["light", "medium", "heavy"] : null,
    quantity: 1,
  }));
}

export function mergeAllEquipmentGymEquipment(
  gymId: string | number,
  currentEquipment: GymEquipmentLike[] | null | undefined,
) {
  const normalizedGymId = String(gymId);
  const existing = Array.isArray(currentEquipment) ? currentEquipment : [];
  const seenTypes = new Set(
    existing
      .map((item) => String(item.equipment_type ?? "").trim())
      .filter(Boolean),
  );
  const merged = [...existing];

  // Det här gymmet ska alltid representera "allt finns", även om databasen saknar någon post.
  for (const syntheticItem of buildAllEquipmentGymEquipment(normalizedGymId)) {
    if (seenTypes.has(syntheticItem.equipment_type)) {
      continue;
    }

    merged.push(syntheticItem);
  }

  return merged;
}

export function buildSyntheticAllEquipmentGym() {
  return {
    id: ALL_EQUIPMENT_GYM_ID,
    user_id: "shared",
    name: ALL_EQUIPMENT_GYM_NAME,
    description: "Delat standardgym med all utrustning tillgänglig.",
    is_shared: true,
    created_at: null,
    equipment: buildAllEquipmentGymEquipment(ALL_EQUIPMENT_GYM_ID),
  };
}
