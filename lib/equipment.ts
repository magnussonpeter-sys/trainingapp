// Gemensam utrustningsmodell för gymdata, katalog och AI-flödet.
// Håller system-id:n enkla men låter gymdatat vara mer detaljerat.

export const EQUIPMENT_IDS = [
  "bodyweight",
  "bench",
  "dumbbells",
  "barbell",
  "ez_bar",
  "trap_bar",
  "kettlebells",
  "rack",
  "smith_machine",
  "pullup_bar",
  "dip_bars",
  "cable_machine",
  "machines",
  "bands",
  "rings",
  "boxes",
  "medicine_ball",
] as const;

export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

export const GYM_EQUIPMENT_TYPES = [
  "dumbbell",
  "barbell",
  "ez_bar",
  "trap_bar",
  "bench",
  "rack",
  "smith_machine",
  "kettlebell",
  "pullup_bar",
  "dip_bars",
  "cable_machine",
  "machine",
  "bands",
  "rings",
  "box",
  "medicine_ball",
  "bodyweight",
  "other",
] as const;

export type GymEquipmentType = (typeof GYM_EQUIPMENT_TYPES)[number];

export const BAND_LEVELS = ["light", "medium", "heavy"] as const;
export type BandLevel = (typeof BAND_LEVELS)[number];

const GYM_EQUIPMENT_TYPE_TO_ID: Partial<Record<GymEquipmentType, EquipmentId>> = {
  dumbbell: "dumbbells",
  barbell: "barbell",
  ez_bar: "ez_bar",
  trap_bar: "trap_bar",
  bench: "bench",
  rack: "rack",
  smith_machine: "smith_machine",
  kettlebell: "kettlebells",
  pullup_bar: "pullup_bar",
  dip_bars: "dip_bars",
  cable_machine: "cable_machine",
  machine: "machines",
  bands: "bands",
  rings: "rings",
  box: "boxes",
  medicine_ball: "medicine_ball",
  bodyweight: "bodyweight",
};

const LEGACY_EQUIPMENT_ALIASES: Record<string, EquipmentId> = {
  body_weight: "bodyweight",
  cable: "cable_machine",
  cable_station: "cable_machine",
  cable_crossover: "cable_machine",
  machine: "machines",
  machines: "machines",
  kettlebell: "kettlebells",
  kettlebells: "kettlebells",
  box: "boxes",
  dip_bar: "dip_bars",
  dumbbell: "dumbbells",
  band: "bands",
};

const LEGACY_GYM_EQUIPMENT_TYPE_ALIASES: Record<string, GymEquipmentType> = {
  cable: "cable_machine",
  cable_machine: "cable_machine",
  machine: "machine",
  machines: "machine",
  dumbbells: "dumbbell",
  kettlebells: "kettlebell",
  boxes: "box",
};

const TEXT_SYNONYMS: Array<{ match: RegExp; equipmentId: EquipmentId }> = [
  { match: /\b(kroppsvikt|bodyweight|utan gym|utan utrustning)\b/i, equipmentId: "bodyweight" },
  { match: /\b(bank|bänk|bench|flat bench|incline bench)\b/i, equipmentId: "bench" },
  { match: /\b(hantel|hantlar|dumbbell|dumbbells|hex dumbbell)\b/i, equipmentId: "dumbbells" },
  { match: /\b(ez[\s_-]?bar|curlstång|curlstang)\b/i, equipmentId: "ez_bar" },
  { match: /\b(trap[\s_-]?bar|hex[\s_-]?bar)\b/i, equipmentId: "trap_bar" },
  { match: /\b(skivstång|skivstang|barbell|olympic bar)\b/i, equipmentId: "barbell" },
  { match: /\b(kettlebell|kettlebells)\b/i, equipmentId: "kettlebells" },
  { match: /\b(rack|ställning|stallning|squat stand|power rack)\b/i, equipmentId: "rack" },
  { match: /\b(smith machine|smithmaskin|smith_machine)\b/i, equipmentId: "smith_machine" },
  { match: /\b(chins|chinup|chin-up|pullup|pull-up|pullup_bar|chinup_bar|räcke)\b/i, equipmentId: "pullup_bar" },
  { match: /\b(dips?st[äa]nger|dip bars?|dip_bars)\b/i, equipmentId: "dip_bars" },
  { match: /\b(kabel|cable|crossover|cross over|cable_machine)\b/i, equipmentId: "cable_machine" },
  { match: /\b(maskin|machine|machines)\b/i, equipmentId: "machines" },
  { match: /\b(gummiband|band|bands|resistance band)\b/i, equipmentId: "bands" },
  { match: /\b(ringar|romerska ringar|gymnastic rings|gymnastikringar|rings)\b/i, equipmentId: "rings" },
  { match: /\b(lada|låda|box|boxes|plyo box)\b/i, equipmentId: "boxes" },
  { match: /\b(medicine ball|medicinboll|medicine_ball)\b/i, equipmentId: "medicine_ball" },
];

const GYM_EQUIPMENT_WITH_WEIGHTS = new Set<GymEquipmentType>([
  "dumbbell",
  "barbell",
  "ez_bar",
  "trap_bar",
  "smith_machine",
  "kettlebell",
  "cable_machine",
  "machine",
  "medicine_ball",
]);

type EquipmentRecord = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  name?: string | null;
  type?: string | null;
};

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidEquipmentId(value: unknown): value is EquipmentId {
  return typeof value === "string" && EQUIPMENT_IDS.includes(value as EquipmentId);
}

export function isValidGymEquipmentType(value: unknown): value is GymEquipmentType {
  return (
    typeof value === "string" &&
    GYM_EQUIPMENT_TYPES.includes(value as GymEquipmentType)
  );
}

export function normalizeGymEquipmentType(
  value: string | null | undefined,
): GymEquipmentType | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value).replace(/\s+/g, "_");
  if (!normalized) {
    return null;
  }

  if (isValidGymEquipmentType(normalized)) {
    return normalized;
  }

  return LEGACY_GYM_EQUIPMENT_TYPE_ALIASES[normalized] ?? null;
}

export function isValidBandLevel(value: unknown): value is BandLevel {
  return typeof value === "string" && BAND_LEVELS.includes(value as BandLevel);
}

export function mapGymEquipmentTypeToEquipmentId(
  value: string | null | undefined,
): EquipmentId | null {
  const normalizedGymType = normalizeGymEquipmentType(value);

  if (normalizedGymType && normalizedGymType in GYM_EQUIPMENT_TYPE_TO_ID) {
    return GYM_EQUIPMENT_TYPE_TO_ID[normalizedGymType] ?? null;
  }

  return null;
}

export function normalizeEquipmentId(value: string | null | undefined): EquipmentId | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const directId = normalized.replace(/\s+/g, "_");
  if (isValidEquipmentId(directId)) {
    return directId;
  }

  const mappedGymType = mapGymEquipmentTypeToEquipmentId(directId);
  if (mappedGymType) {
    return mappedGymType;
  }

  const legacyAlias = LEGACY_EQUIPMENT_ALIASES[directId];
  if (legacyAlias) {
    return legacyAlias;
  }

  for (const synonym of TEXT_SYNONYMS) {
    if (synonym.match.test(normalized)) {
      return synonym.equipmentId;
    }
  }

  return null;
}

export function detectEquipmentIdsFromText(value: string | null | undefined): EquipmentId[] {
  if (!value) {
    return [];
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  const detected = new Set<EquipmentId>();
  const primary = normalizeEquipmentId(normalized);

  if (primary) {
    detected.add(primary);
  }

  for (const synonym of TEXT_SYNONYMS) {
    if (synonym.match.test(normalized)) {
      detected.add(synonym.equipmentId);
    }
  }

  return Array.from(detected);
}

export function normalizeEquipmentIdList(
  input: Iterable<string | null | undefined>,
  options?: { includeBodyweightFallback?: boolean },
): EquipmentId[] {
  const values = new Set<EquipmentId>();

  for (const item of input) {
    for (const normalized of detectEquipmentIdsFromText(item ?? null)) {
      values.add(normalized);
    }
  }

  // Behåll kroppsvikt som trygg fallback för äldre och delvis tom data.
  if (options?.includeBodyweightFallback !== false) {
    values.add("bodyweight");
  }

  return Array.from(values);
}

export function extractEquipmentIdsFromRecords(
  input: Array<EquipmentRecord | string | null | undefined>,
  options?: { includeBodyweightFallback?: boolean },
) {
  const detected: Array<string | null | undefined> = [];

  for (const item of input) {
    if (typeof item === "string") {
      detected.push(item);
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    detected.push(
      item.equipment_type,
      item.equipmentType,
      item.type,
      item.label,
      item.name,
    );
  }

  return normalizeEquipmentIdList(detected, options);
}

export function supportsGymEquipmentWeights(
  type: GymEquipmentType | string | null | undefined,
) {
  const normalizedType = normalizeGymEquipmentType(type);
  return normalizedType != null && GYM_EQUIPMENT_WITH_WEIGHTS.has(normalizedType);
}

export function supportsWholeKiloQuickWeights(
  type: GymEquipmentType | string | null | undefined,
) {
  const normalizedType = normalizeGymEquipmentType(type);

  return (
    normalizedType === "barbell" ||
    normalizedType === "ez_bar" ||
    normalizedType === "trap_bar" ||
    normalizedType === "kettlebell" ||
    normalizedType === "medicine_ball"
  );
}
