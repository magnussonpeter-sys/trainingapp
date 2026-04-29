import {
  getExerciseById,
  getNextProgressionExercise,
  normalizeEquipmentList,
  type EquipmentId,
} from "@/lib/exercise-catalog";
import {
  extractEquipmentIdsFromRecords,
  normalizeEquipmentId,
} from "@/lib/equipment";
import { getSuggestedTimedDuration, getSuggestedWeight } from "@/lib/progression-engine";
import { getExerciseProgression } from "@/lib/progression-store";
import type { Exercise } from "@/types/workout";

export type ProgressionGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

export type WorkoutGymEquipmentItem = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  weights_kg?: number[] | null;
};

function toFiniteNumberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatWeightValue(value: number | string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  if (Number.isInteger(numericValue)) {
    return String(numericValue);
  }

  return numericValue.toFixed(1).replace(".0", "");
}

function dedupeSortedWeights(values: number[]) {
  return [...new Set(values)]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

function snapWeightToAvailableWeights(
  suggestedWeight: number,
  availableWeightsKg: number[],
) {
  if (availableWeightsKg.length === 0) {
    return suggestedWeight;
  }

  return availableWeightsKg.reduce((closest, current) => {
    return Math.abs(current - suggestedWeight) < Math.abs(closest - suggestedWeight)
      ? current
      : closest;
  }, availableWeightsKg[0]);
}

function getNearbyAvailableWeights(
  availableWeightsKg: number[],
  baseWeight: number,
  maxCount = 7,
) {
  if (availableWeightsKg.length === 0) {
    return [];
  }

  return [...availableWeightsKg]
    .sort((a, b) => {
      const distanceA = Math.abs(a - baseWeight);
      const distanceB = Math.abs(b - baseWeight);

      if (distanceA === distanceB) {
        return a - b;
      }

      return distanceA - distanceB;
    })
    .slice(0, maxCount)
    .sort((a, b) => a - b);
}

function isDualDumbbellExercise(
  exercise: Exercise,
  requiredEquipment: EquipmentId[] = [],
) {
  const normalizedText = [
    exercise.id,
    exercise.name,
    exercise.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const explicitSinglePatterns = [
    "one_arm",
    "single_arm",
    "single_leg",
    "single_",
    "enarms",
    "enarm",
    "enbens",
    "single",
    "suitcase",
  ];

  if (
    explicitSinglePatterns.some((pattern) => normalizedText.includes(pattern))
  ) {
    return false;
  }

  const explicitSinglePhrases = [
    "med hantel",
    "en hantel",
    "en dumbbell",
    "a dumbbell",
  ];
  const explicitSingleExerciseIds = new Set([
    "goblet_squat",
    "dumbbell_hip_thrust",
    "overhead_triceps_extension",
    "dumbbell_suitcase_carry",
    "bird_dog_row",
  ]);

  if (explicitSingleExerciseIds.has(exercise.id)) {
    return false;
  }

  if (explicitSinglePhrases.some((phrase) => normalizedText.includes(phrase))) {
    return false;
  }

  const explicitDualHints = [
    "hantlar",
    "hantlarna",
    "dumbbells",
    "två hantlar",
    "ett par hantlar",
    "i händerna",
    "arnoldpress",
  ];

  if (explicitDualHints.some((hint) => normalizedText.includes(hint))) {
    return true;
  }

  // För hantelövningar tolkar vi dubbla hantlar som default om texten inte tydligt
  // säger att det är en ensam hantel eller en unilateral variant.
  return requiredEquipment.includes("dumbbells");
}

function getLoadMetadata(exercise: Exercise) {
  const catalogExercise = getExerciseById(exercise.id);

  if (!catalogExercise) {
    return {
      weightSelectionMode: "total" as const,
      weightUnitLabel: "kg",
      relevantEquipmentIds: [] as EquipmentId[],
    };
  }

  const relevantEquipmentIds: EquipmentId[] = [];
  const requiredEquipment = catalogExercise.requiredEquipment ?? [];

  if (requiredEquipment.includes("dumbbells")) {
    relevantEquipmentIds.push("dumbbells");
  }

  if (requiredEquipment.includes("barbell")) {
    relevantEquipmentIds.push("barbell");
  }

  if (requiredEquipment.includes("ez_bar")) {
    relevantEquipmentIds.push("ez_bar");
  }

  if (requiredEquipment.includes("trap_bar")) {
    relevantEquipmentIds.push("trap_bar");
  }

  if (requiredEquipment.includes("kettlebells")) {
    relevantEquipmentIds.push("kettlebells");
  }

  if (requiredEquipment.includes("smith_machine")) {
    relevantEquipmentIds.push("smith_machine");
  }

  if (requiredEquipment.includes("cable_machine")) {
    relevantEquipmentIds.push("cable_machine");
  }

  if (requiredEquipment.includes("machines")) {
    relevantEquipmentIds.push("machines");
  }

  if (requiredEquipment.includes("medicine_ball")) {
    relevantEquipmentIds.push("medicine_ball");
  }

  const usesDumbbells = relevantEquipmentIds.includes("dumbbells");

  if (usesDumbbells && isDualDumbbellExercise(exercise, requiredEquipment)) {
    return {
      relevantEquipmentIds,
      weightSelectionMode: "per_hand" as const,
      weightUnitLabel: "kg per hantel",
    };
  }

  if (
    usesDumbbells ||
    relevantEquipmentIds.includes("kettlebells") ||
    relevantEquipmentIds.includes("medicine_ball")
  ) {
    return {
      relevantEquipmentIds,
      weightSelectionMode: "single_implement" as const,
      weightUnitLabel: "kg",
    };
  }

  return {
    relevantEquipmentIds,
    weightSelectionMode: "total" as const,
    weightUnitLabel: "kg",
  };
}

function getAvailableWeightsForExercise(
  exercise: Exercise,
  gymEquipmentItems: WorkoutGymEquipmentItem[],
) {
  const loadMetadata = getLoadMetadata(exercise);

  if (gymEquipmentItems.length === 0 || loadMetadata.relevantEquipmentIds.length === 0) {
    return {
      ...loadMetadata,
      availableWeightsKg: [] as number[],
    };
  }

  const collectedWeights = gymEquipmentItems.flatMap((item) => {
    const equipmentIds = extractEquipmentIdsFromRecords(
      [
        {
          equipment_type: item.equipment_type,
          equipmentType: item.equipmentType,
          label: item.label,
        },
      ],
      { includeBodyweightFallback: false },
    );

    const matches = equipmentIds.some((equipmentId) =>
      loadMetadata.relevantEquipmentIds.includes(equipmentId),
    );

    if (!matches) {
      return [];
    }

    return Array.isArray(item.weights_kg) ? item.weights_kg : [];
  });

  return {
    ...loadMetadata,
    availableWeightsKg: dedupeSortedWeights(collectedWeights),
  };
}

function buildWeightProgressionNote(params: {
  availableWeightsKg: number[];
  lastWeight: number | null;
  suggestedWeight: number | null;
  weightUnitLabel: string;
}) {
  const { availableWeightsKg, lastWeight, suggestedWeight, weightUnitLabel } = params;

  if (suggestedWeight == null) {
    return undefined;
  }

  const suggestedLabel = `${formatWeightValue(suggestedWeight)} ${weightUnitLabel}`;

  if (lastWeight == null) {
    if (availableWeightsKg.length > 0) {
      return `Startförslag: ${suggestedLabel}. Förslaget är anpassat till registrerade vikter i gymmet.`;
    }

    return `Startförslag: ${suggestedLabel}.`;
  }

  const difference = Math.round((suggestedWeight - lastWeight) * 10) / 10;

  if (difference === 0) {
    return `Behåll ungefär senaste nivån: ${suggestedLabel}.`;
  }

  const direction = difference > 0 ? "upp" : "ned";
  const deltaLabel = formatWeightValue(Math.abs(difference));

  return `Senast låg du runt ${formatWeightValue(lastWeight)} ${weightUnitLabel}. Nu föreslås ${suggestedLabel} (${direction} ${deltaLabel}).`;
}

function buildTimedProgressionNote(params: {
  lastDuration: number | null;
  nextDuration: number | null;
}) {
  const { lastDuration, nextDuration } = params;

  if (nextDuration == null) {
    return undefined;
  }

  if (lastDuration == null) {
    return `Målet är ${nextDuration} sekunder i dagens pass.`;
  }

  if (lastDuration === nextDuration) {
    return `Behåll ungefär senaste nivån: ${nextDuration} sekunder.`;
  }

  const delta = nextDuration - lastDuration;
  const direction = delta > 0 ? "upp" : "ned";

  return `Senast låg du runt ${lastDuration} sekunder. Nu föreslås ${nextDuration} sekunder (${direction} ${Math.abs(delta)} s).`;
}

function applyBodyweightProgression(params: {
  exercise: Exercise;
  goal?: string | null;
  availableEquipment: string[];
  progression: ReturnType<typeof getExerciseProgression>;
}) {
  const { exercise, goal, progression, availableEquipment } = params;

  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    return {
      exercise,
      note: exercise.progressionNote,
    };
  }

  const currentReps =
    typeof exercise.reps === "number" && Number.isFinite(exercise.reps)
      ? exercise.reps
      : null;
  const currentSets =
    typeof exercise.sets === "number" && Number.isFinite(exercise.sets)
      ? exercise.sets
      : 3;

  if (currentReps == null || !progression) {
    return {
      exercise,
      note: exercise.progressionNote,
    };
  }

  let nextReps = currentReps;
  let nextSets = currentSets;

  if (progression.lastExtraReps != null) {
    if (progression.lastExtraReps >= 4) {
      if (goal === "strength") {
        if (currentReps >= 8) {
          nextSets = Math.min(currentSets + 1, 6);
        } else {
          nextReps = currentReps + 1;
        }
      } else {
        nextReps = currentReps + 2;
      }
    } else if (progression.lastExtraReps === 2) {
      if (goal === "body_composition" || goal === "hypertrophy") {
        nextReps = currentReps + 1;
      }
    } else if (progression.lastExtraReps === 0) {
      if (currentReps > 6) {
        nextReps = currentReps - 1;
      }
    }
  }

  const changed = nextReps !== currentReps || nextSets !== currentSets;
  const nextVariant =
    progression?.lastExtraReps != null && progression.lastExtraReps >= 4
      ? getNextProgressionExercise(exercise.id, availableEquipment)
      : null;
  const variantHint = nextVariant
    ? ` Nästa naturliga variant i stegen är ${nextVariant.name}.`
    : "";

  return {
    exercise: {
      ...exercise,
      reps: nextReps,
      sets: nextSets,
    },
    note: changed
      ? `Kroppsviktsprogression: från ${currentSets} x ${currentReps} till ${nextSets} x ${nextReps}.${variantHint}`
      : exercise.progressionNote,
  };
}

function applyLoadConstraintAdjustments(params: {
  exercise: Exercise;
  goal?: string | null;
  requestedWeight: number;
  snappedWeight: number;
}) {
  const { exercise, goal, requestedWeight, snappedWeight } = params;
  const difference = snappedWeight - requestedWeight;

  if (Math.abs(difference) < 2.5) {
    return {
      exercise,
      note: undefined as string | undefined,
    };
  }

  const nextExercise = { ...exercise };

  if (difference < 0) {
    if (goal === "strength") {
      nextExercise.sets = Math.min((nextExercise.sets ?? 3) + 1, 6);
    } else if (typeof nextExercise.reps === "number") {
      nextExercise.reps = Math.min(nextExercise.reps + 2, 20);
    }

    return {
      exercise: nextExercise,
      note: "Närmaste tillgängliga vikt i gymmet är lättare än idealet, så förslaget kompenserar med lite mer volym.",
    };
  }

  if (typeof nextExercise.reps === "number") {
    nextExercise.reps = Math.max(nextExercise.reps - 2, 4);
  } else {
    nextExercise.sets = Math.max((nextExercise.sets ?? 3) - 1, 2);
  }

  return {
    exercise: nextExercise,
    note: "Närmaste tillgängliga vikt i gymmet är tyngre än idealet, så förslaget sänker reps eller set något.",
  };
}

export function buildWeightChipOptions(params: {
  availableWeightsKg?: number[];
  currentWeight: string;
  lastWeight: string;
  suggestedWeight: string;
}) {
  const availableWeightsKg = dedupeSortedWeights(params.availableWeightsKg ?? []);
  const baseValue = Number(
    params.suggestedWeight.trim().replace(",", ".") ||
      params.lastWeight.trim().replace(",", ".") ||
      params.currentWeight.trim().replace(",", "."),
  );

  if (availableWeightsKg.length > 0 && Number.isFinite(baseValue) && baseValue > 0) {
    return getNearbyAvailableWeights(availableWeightsKg, baseValue).map((value) =>
      formatWeightValue(value),
    );
  }

  const values = new Set<string>();

  const addValue = (value: string) => {
    const parsed = Number(value.trim().replace(",", "."));

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    values.add(formatWeightValue(parsed));
  };

  addValue(params.suggestedWeight);
  addValue(params.currentWeight);
  addValue(params.lastWeight);

  if (Number.isFinite(baseValue) && baseValue > 0) {
    for (const offset of [-4, -2, -1, 1, 2, 4]) {
      const next = baseValue + offset;

      if (next > 0) {
        addValue(String(next));
      }
    }
  }

  return Array.from(values)
    .map((value) => ({
      label: value,
      numeric: Number(value),
    }))
    .sort((a, b) => a.numeric - b.numeric)
    .map((item) => item.label);
}

function snapWeightDownToAvailableLimit(
  availableWeightsKg: number[],
  maxWeight: number,
) {
  const eligible = availableWeightsKg
    .filter((weight) => weight <= maxWeight)
    .sort((left, right) => right - left);

  return eligible[0] ?? maxWeight;
}

function applyConservativePerHandGuardrail(params: {
  exercise: Exercise;
  suggestedWeight: number;
  availableWeightsKg: number[];
  lastWeight: number | null;
  weightSelectionMode: "total" | "single_implement" | "per_hand";
}) {
  const {
    exercise,
    suggestedWeight,
    availableWeightsKg,
    lastWeight,
    weightSelectionMode,
  } = params;

  if (weightSelectionMode !== "per_hand" || lastWeight != null) {
    return {
      suggestedWeight,
      note: undefined as string | undefined,
    };
  }

  const catalogExercise = getExerciseById(exercise.id);
  const variantGroup = catalogExercise?.variantGroup ?? "";
  const conservativeCaps: Record<string, number> = {
    chest_fly: 15,
    biceps_curl: 17.5,
    lateral_raise: 10,
    rear_delt: 10,
    triceps_isolation: 15,
  };
  const genericPerHandCap = 25;
  const maxSuggestedWeight =
    conservativeCaps[variantGroup] ?? genericPerHandCap;

  if (suggestedWeight <= maxSuggestedWeight) {
    return {
      suggestedWeight,
      note: undefined as string | undefined,
    };
  }

  const cappedWeight = snapWeightDownToAvailableLimit(
    availableWeightsKg,
    maxSuggestedWeight,
  );

  return {
    suggestedWeight: cappedWeight,
    // Nya hantelisolationsövningar ska starta konservativt tills faktisk historik finns.
    note: "Startförslaget hölls medvetet konservativt för en ny hantelövning per hand.",
  };
}

export function applyExerciseProgression(params: {
  exercise: Exercise;
  goal?: string | null;
  gymEquipmentItems?: WorkoutGymEquipmentItem[];
  userId: string;
}): Exercise {
  const { exercise, goal, gymEquipmentItems = [], userId } = params;
  const progression = getExerciseProgression(userId, exercise.id);
  const loadMetadata = getAvailableWeightsForExercise(exercise, gymEquipmentItems);
  const progressionEquipment = normalizeEquipmentList(
    gymEquipmentItems.flatMap((item) =>
      [item.equipment_type, item.equipmentType, item.label]
        .map((value) => normalizeEquipmentId(value))
        .filter((value): value is EquipmentId => typeof value === "string" && value.length > 0),
    ),
  );
  const fallbackWeight = toFiniteNumberOrNull(exercise.suggestedWeight ?? null);

  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    const suggestedDuration = getSuggestedTimedDuration({
      userId,
      exerciseId: exercise.id,
      fallbackDuration: exercise.duration,
      goal:
        goal === "strength" ||
        goal === "hypertrophy" ||
        goal === "body_composition"
          ? goal
          : "health",
    });

    return {
      ...exercise,
      suggestedWeight: null,
      suggestedWeightLabel: undefined,
      availableWeightsKg: [],
      weightUnitLabel: undefined,
      weightSelectionMode: undefined,
      lastPerformedWeight: null,
      duration: suggestedDuration,
      lastPerformedDuration: progression?.lastDuration ?? null,
      progressionNote: buildTimedProgressionNote({
        lastDuration: progression?.lastDuration ?? null,
        nextDuration: suggestedDuration,
      }),
    };
  }

  if (loadMetadata.relevantEquipmentIds.length === 0) {
    const bodyweightResult = applyBodyweightProgression({
      exercise,
      goal,
      availableEquipment: progressionEquipment,
      progression,
    });

    return {
      ...bodyweightResult.exercise,
      suggestedWeight: null,
      suggestedWeightLabel: undefined,
      availableWeightsKg: [],
      weightUnitLabel: undefined,
      weightSelectionMode: undefined,
      lastPerformedWeight: null,
      progressionNote: bodyweightResult.note,
    };
  }

  const suggestedWeight = getSuggestedWeight({
    userId,
    exerciseId: exercise.id,
    fallbackWeight,
  });
  const perHandGuardrail =
    typeof suggestedWeight === "number"
      ? applyConservativePerHandGuardrail({
          exercise,
          suggestedWeight,
          availableWeightsKg: loadMetadata.availableWeightsKg,
          lastWeight: progression?.lastWeight ?? null,
          weightSelectionMode: loadMetadata.weightSelectionMode,
        })
      : null;
  const guardedSuggestedWeight =
    perHandGuardrail && typeof perHandGuardrail.suggestedWeight === "number"
      ? perHandGuardrail.suggestedWeight
      : suggestedWeight;

  const snappedSuggestedWeight =
    typeof guardedSuggestedWeight === "number" &&
    loadMetadata.availableWeightsKg.length > 0
      ? snapWeightToAvailableWeights(
          guardedSuggestedWeight,
          loadMetadata.availableWeightsKg,
        )
      : guardedSuggestedWeight;
  const loadConstraintAdjustment =
    typeof guardedSuggestedWeight === "number" && typeof snappedSuggestedWeight === "number"
      ? applyLoadConstraintAdjustments({
          exercise,
          goal,
          requestedWeight: guardedSuggestedWeight,
          snappedWeight: snappedSuggestedWeight,
        })
      : {
          exercise,
          note: undefined as string | undefined,
        };

  const suggestedWeightLabel =
    snappedSuggestedWeight != null
      ? `${formatWeightValue(snappedSuggestedWeight)} ${loadMetadata.weightUnitLabel}`
      : undefined;

  return {
    ...loadConstraintAdjustment.exercise,
    suggestedWeight: snappedSuggestedWeight,
    suggestedWeightLabel,
    availableWeightsKg: getNearbyAvailableWeights(
      loadMetadata.availableWeightsKg,
      typeof snappedSuggestedWeight === "number"
        ? snappedSuggestedWeight
        : toFiniteNumberOrNull(exercise.suggestedWeight ?? null) ?? 0,
      7,
    ),
    weightUnitLabel: loadMetadata.weightUnitLabel,
    weightSelectionMode: loadMetadata.weightSelectionMode,
    lastPerformedWeight: progression?.lastWeight ?? null,
    progressionNote: buildWeightProgressionNote({
      availableWeightsKg: loadMetadata.availableWeightsKg,
      lastWeight: progression?.lastWeight ?? null,
      suggestedWeight:
        typeof snappedSuggestedWeight === "number" ? snappedSuggestedWeight : null,
      weightUnitLabel: loadMetadata.weightUnitLabel,
    }) ?? perHandGuardrail?.note ?? loadConstraintAdjustment.note,
  };
}
