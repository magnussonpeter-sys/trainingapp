"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAvailableExercises,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import { getSuggestedWeight } from "@/lib/progression-engine";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import type { Exercise, Workout, WorkoutBlock } from "@/types/workout";

type UseWorkoutPreviewProps = {
  userId: string;
};

type GymSummary = {
  id: string;
  name: string;
  equipment: string[];
};

type WorkoutWithEquipmentMeta = Workout & {
  availableEquipment?: string[];
  equipment?: string[];
  equipmentList?: string[];
  gymEquipment?: string[];
};

type EffectiveEquipmentContext = {
  workoutGymName: string | null;
  matchedGymName: string | null;
  matchedGymEquipment: string[];
  workoutEmbeddedEquipment: string[];
  effectiveEquipment: string[];
};

type PreviewSummary = {
  exerciseCount: number;
  setCount: number;
  timedExercises: number;
  estimatedMinutes: number;
};

type PreviewDebugInfo = {
  workoutGym: string | null;
  workoutGymLabel: string | null;
  workoutAvailableEquipment: string[];
  gymsLoaded: boolean;
  gymsCount: number;
  matchedGymName: string | null;
  matchedGymEquipment: string[];
  extractedEquipment: string[];
  equipmentSeed: string[];
  availableCatalogCount: number;
  filteredCatalogCount: number;
  firstAvailableExerciseNames: string[];
  firstFilteredExerciseNames: string[];
};

const KNOWN_EQUIPMENT_TYPES = [
  "bodyweight",
  "bench",
  "dumbbells",
  "barbell",
  "rack",
  "pullup_bar",
  "cable_machine",
  "rings",
] as const;

function clampNumber(value: number, min: number, max?: number) {
  if (Number.isNaN(value)) {
    return min;
  }

  if (typeof max === "number") {
    return Math.min(Math.max(value, min), max);
  }

  return Math.max(value, min);
}

function createExerciseId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function normalizeGymName(value: string) {
  return value.trim().toLowerCase();
}

// Normaliserar olika textvarianter till katalogens equipment-id:n.
function normalizeEquipmentName(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized === "bodyweight" ||
    normalized === "body_weight" ||
    normalized.includes("kroppsvikt") ||
    normalized.includes("utan gym")
  ) {
    return "bodyweight";
  }

  if (
    normalized.includes("dumbbell") ||
    normalized.includes("dumbbells") ||
    normalized.includes("hantel") ||
    normalized.includes("hantlar")
  ) {
    return "dumbbells";
  }

  if (normalized.includes("barbell") || normalized.includes("skivstång")) {
    return "barbell";
  }

  if (normalized.includes("bench") || normalized.includes("bänk")) {
    return "bench";
  }

  if (normalized.includes("rack") || normalized.includes("ställning")) {
    return "rack";
  }

  if (
    normalized.includes("pullup") ||
    normalized.includes("pull-up") ||
    normalized.includes("chinup") ||
    normalized.includes("chins") ||
    normalized.includes("räcke")
  ) {
    return "pullup_bar";
  }

  if (normalized.includes("cable") || normalized.includes("kabel")) {
    return "cable_machine";
  }

  if (normalized.includes("ring") || normalized.includes("romerska")) {
    return "rings";
  }

  return null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

// Läser en godtycklig equipment-array från API/draft/workout.
function extractEquipmentArray(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const normalizedValues: string[] = [];

  for (const item of candidate) {
    if (typeof item === "string") {
      const normalized = normalizeEquipmentName(item);
      if (normalized) {
        normalizedValues.push(normalized);
      }
      continue;
    }

    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const possibleValues = [
        record.equipment_type,
        record.type,
        record.label,
        record.name,
      ];

      for (const possibleValue of possibleValues) {
        if (typeof possibleValue === "string") {
          const normalized = normalizeEquipmentName(possibleValue);
          if (normalized) {
            normalizedValues.push(normalized);
            break;
          }
        }
      }
    }
  }

  return uniqueStrings(normalizedValues);
}

// Läser equipment som råkar finnas inbäddat i workout-objektet.
function extractEquipmentFromWorkoutInternal(workout: Workout | null): string[] {
  if (!workout) {
    return [];
  }

  const record = workout as WorkoutWithEquipmentMeta;

  const candidates: unknown[] = [
    record.availableEquipment,
    record.equipment,
    record.equipmentList,
    record.gymEquipment,
  ];

  const merged = candidates.flatMap((candidate) =>
    extractEquipmentArray(candidate),
  );

  return uniqueStrings(merged);
}

function isBodyweightOnlyEquipment(equipment: string[]) {
  return equipment.length === 1 && equipment[0] === "bodyweight";
}

function getWorkoutGymName(workout: Workout | null) {
  if (!workout) {
    return null;
  }

  const values = [workout.gymLabel, workout.gym].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  return values[0] ?? null;
}

// Hämtar gyms från backend och normaliserar till enkel struktur.
async function fetchGyms(): Promise<GymSummary[]> {
  const response = await fetch("/api/gyms", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => null);

  const gymsSource = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.gyms)
      ? payload.gyms
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  const gyms: GymSummary[] = [];

  for (const item of gymsSource) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;

    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id
        : typeof record.id === "number"
          ? String(record.id)
          : "";

    const name =
      typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : typeof record.label === "string" && record.label.trim()
          ? record.label.trim()
          : "";

    const equipment = extractEquipmentArray(
      (record.equipment ??
        record.gymEquipment ??
        record.equipmentList) as unknown,
    );

    if (!id && !name) {
      continue;
    }

    gyms.push({
      id: id || name,
      name: name || id,
      equipment,
    });
  }

  return gyms;
}

// Försöker matcha workoutens gym mot hämtade gyms.
function matchGymByWorkout(workout: Workout | null, gyms: GymSummary[]) {
  const workoutGymName = getWorkoutGymName(workout);

  if (!workoutGymName || gyms.length === 0) {
    return null;
  }

  const normalizedWorkoutGym = normalizeGymName(workoutGymName);

  const exactNameMatch =
    gyms.find((gym) => normalizeGymName(gym.name) === normalizedWorkoutGym) ??
    null;

  if (exactNameMatch) {
    return exactNameMatch;
  }

  const exactIdMatch =
    gyms.find((gym) => normalizeGymName(gym.id) === normalizedWorkoutGym) ??
    null;

  if (exactIdMatch) {
    return exactIdMatch;
  }

  return (
    gyms.find((gym) => {
      const gymName = normalizeGymName(gym.name);
      const gymId = normalizeGymName(gym.id);

      return (
        gymName.includes(normalizedWorkoutGym) ||
        normalizedWorkoutGym.includes(gymName) ||
        gymId === normalizedWorkoutGym
      );
    }) ?? null
  );
}

// Bestämmer vilken equipment som preview faktiskt ska använda.
function deriveEffectiveEquipmentContext(
  workout: Workout | null,
  gyms: GymSummary[],
): EffectiveEquipmentContext {
  const workoutGymName = getWorkoutGymName(workout);
  const matchedGym = matchGymByWorkout(workout, gyms);
  const matchedGymEquipment = uniqueStrings(matchedGym?.equipment ?? []);
  const workoutEmbeddedEquipment = extractEquipmentFromWorkoutInternal(workout);

  const workoutGymText = (workoutGymName ?? "").toLowerCase();
  const isExplicitBodyweightGym =
    workoutGymText.includes("kroppsvikt") ||
    workoutGymText.includes("utan gym") ||
    workoutGymText === "bodyweight";

  // Rätt gym i DB ska vinna.
  if (matchedGym && matchedGymEquipment.length > 0) {
    return {
      workoutGymName,
      matchedGymName: matchedGym.name,
      matchedGymEquipment,
      workoutEmbeddedEquipment,
      effectiveEquipment: matchedGymEquipment,
    };
  }

  // Om workout bara råkat få bodyweight men egentligen är kopplat till gym:
  // använd bred fallback i stället för att låsa till bodyweight.
  if (workoutEmbeddedEquipment.length > 0) {
    if (
      !isExplicitBodyweightGym &&
      workoutGymName &&
      isBodyweightOnlyEquipment(workoutEmbeddedEquipment)
    ) {
      return {
        workoutGymName,
        matchedGymName: matchedGym?.name ?? null,
        matchedGymEquipment,
        workoutEmbeddedEquipment,
        effectiveEquipment: [...KNOWN_EQUIPMENT_TYPES],
      };
    }

    return {
      workoutGymName,
      matchedGymName: matchedGym?.name ?? null,
      matchedGymEquipment,
      workoutEmbeddedEquipment,
      effectiveEquipment: workoutEmbeddedEquipment,
    };
  }

  if (isExplicitBodyweightGym) {
    return {
      workoutGymName,
      matchedGymName: matchedGym?.name ?? null,
      matchedGymEquipment,
      workoutEmbeddedEquipment,
      effectiveEquipment: ["bodyweight"],
    };
  }

  if (workoutGymName) {
    return {
      workoutGymName,
      matchedGymName: matchedGym?.name ?? null,
      matchedGymEquipment,
      workoutEmbeddedEquipment,
      effectiveEquipment: [...KNOWN_EQUIPMENT_TYPES],
    };
  }

  return {
    workoutGymName,
    matchedGymName: matchedGym?.name ?? null,
    matchedGymEquipment,
    workoutEmbeddedEquipment,
    effectiveEquipment: ["bodyweight"],
  };
}

// Lägger in equipment-meta i workout så UI/debug kan läsa samma fält som tidigare.
function withEquipmentMetadata(
  workout: Workout,
  equipment: string[],
): WorkoutWithEquipmentMeta {
  return {
    ...workout,
    availableEquipment: [...equipment],
    equipment: [...equipment],
    equipmentList: [...equipment],
    gymEquipment: [...equipment],
  };
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

// Applicerar progression på en enskild övning.
function applyProgressionToExercise(userId: string, exercise: Exercise): Exercise {
  const exerciseWithWeight = exercise as Exercise & {
    suggestedWeight?: unknown;
  };

  const fallbackWeight = toNumberOrNull(exerciseWithWeight.suggestedWeight ?? null);

  const suggestedWeight = getSuggestedWeight({
    userId,
    exerciseId: exercise.id,
    fallbackWeight,
  });

  return {
    ...exercise,
    suggestedWeight,
  } as Exercise;
}

function createExerciseFromCatalog(
  userId: string,
  item: ExerciseCatalogItem,
): Exercise {
  const isTimed =
    typeof item.defaultDuration === "number" &&
    item.defaultDuration > 0 &&
    typeof item.defaultReps !== "number";

  const baseExercise: Exercise = {
    id: item.id,
    name: item.name,
    sets: item.defaultSets,
    reps: isTimed ? undefined : item.defaultReps ?? 10,
    duration: isTimed ? item.defaultDuration : undefined,
    rest: item.defaultRest,
    description: item.description,
  };

  return applyProgressionToExercise(userId, baseExercise);
}

function createCustomExercise(params: {
  name: string;
  sets: string;
  reps: string;
  duration: string;
  rest: string;
  description: string;
}): Exercise {
  const parsedSets = Math.max(1, Number(params.sets) || 3);
  const parsedReps = Math.max(0, Number(params.reps) || 0);
  const parsedDuration = Math.max(0, Number(params.duration) || 0);
  const parsedRest = Math.max(0, Number(params.rest) || 45);

  return {
    id: `custom_${createExerciseId()}`,
    name: params.name.trim(),
    sets: parsedSets,
    reps: parsedDuration > 0 ? undefined : parsedReps || 10,
    duration: parsedDuration > 0 ? parsedDuration : undefined,
    rest: parsedRest,
    description: params.description.trim() || undefined,
    isCustom: true,
  };
}

// Säkerställer att workout alltid har minst ett block.
function ensureWorkoutHasBlocks(workout: Workout): Workout {
  if (Array.isArray(workout.blocks) && workout.blocks.length > 0) {
    return workout;
  }

  const fallbackBlock: WorkoutBlock = {
    type: "straight_sets",
    title: "Huvuddel",
    exercises: [],
  };

  return {
    ...workout,
    blocks: [fallbackBlock],
  };
}

function getPrimaryBlock(workout: Workout | null): WorkoutBlock | null {
  if (!workout?.blocks?.length) {
    return null;
  }

  return workout.blocks[0] ?? null;
}

function getPrimaryExercises(workout: Workout | null): Exercise[] {
  return getPrimaryBlock(workout)?.exercises ?? [];
}

// Applicerar progression på första blockets övningar.
function applyProgressionToWorkout(userId: string, workout: Workout): Workout {
  const safeWorkout = ensureWorkoutHasBlocks(workout);
  const firstBlock = safeWorkout.blocks[0];

  if (!firstBlock) {
    return safeWorkout;
  }

  const nextBlocks = [...safeWorkout.blocks];
  nextBlocks[0] = {
    ...firstBlock,
    exercises: firstBlock.exercises.map((exercise) =>
      applyProgressionToExercise(userId, exercise),
    ),
  };

  return {
    ...safeWorkout,
    blocks: nextBlocks,
  };
}

// Enkel sammanfattning som preview-sidan kan visa.
function buildSummary(workout: Workout | null): PreviewSummary {
  const exercises = getPrimaryExercises(workout);

  const exerciseCount = exercises.length;
  const setCount = exercises.reduce(
    (sum, exercise) => sum + (exercise.sets ?? 0),
    0,
  );

  const timedExercises = exercises.filter(
    (exercise) =>
      typeof exercise.duration === "number" && exercise.duration > 0,
  ).length;

  const workSeconds = exercises.reduce((sum, exercise) => {
    const setCount = exercise.sets ?? 0;

    if (typeof exercise.duration === "number" && exercise.duration > 0) {
      return sum + exercise.duration * setCount;
    }

    // Grov uppskattning för repsövningar.
    return sum + 40 * setCount;
  }, 0);

  const restSeconds = exercises.reduce((sum, exercise) => {
    const setCount = Math.max(0, (exercise.sets ?? 1) - 1);
    return sum + (exercise.rest ?? 0) * setCount;
  }, 0);

  return {
    exerciseCount,
    setCount,
    timedExercises,
    estimatedMinutes: Math.max(1, Math.round((workSeconds + restSeconds) / 60)),
  };
}

export function useWorkoutPreview({ userId }: UseWorkoutPreviewProps) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [gyms, setGyms] = useState<GymSummary[]>([]);
  const [gymsLoaded, setGymsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catalogSearch, setCatalogSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [customSets, setCustomSets] = useState("3");
  const [customReps, setCustomReps] = useState("10");
  const [customDuration, setCustomDuration] = useState("");
  const [customRest, setCustomRest] = useState("45");
  const [customDescription, setCustomDescription] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadPreviewState() {
      if (!userId) {
        if (!isMounted) {
          return;
        }

        setWorkout(null);
        setGyms([]);
        setGymsLoaded(true);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [draft, loadedGyms] = await Promise.all([
          Promise.resolve(getWorkoutDraft(userId)),
          fetchGyms(),
        ]);

        if (!isMounted) {
          return;
        }

        setGyms(loadedGyms);
        setGymsLoaded(true);

        const normalized = normalizePreviewWorkout(draft) as Workout | null;

        if (!normalized) {
          setWorkout(null);
          setLoading(false);
          return;
        }

        const safeWorkout = applyProgressionToWorkout(
          userId,
          ensureWorkoutHasBlocks(normalized),
        );

        setWorkout(safeWorkout);
        setLoading(false);
      } catch (unknownError) {
        if (!isMounted) {
          return;
        }

        setWorkout(null);
        setGyms([]);
        setGymsLoaded(true);
        setLoading(false);
        setError(
          unknownError instanceof Error
            ? unknownError.message
            : "Kunde inte läsa preview-pass.",
        );
      }
    }

    void loadPreviewState();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const equipmentContext = useMemo(() => {
    return deriveEffectiveEquipmentContext(workout, gyms);
  }, [gyms, workout]);

  const effectiveEquipment = equipmentContext.effectiveEquipment;

  // Derived preview-workout med stabil equipment-meta.
  const previewWorkout = useMemo(() => {
    if (!workout) {
      return null;
    }

    return withEquipmentMetadata(workout, effectiveEquipment);
  }, [effectiveEquipment, workout]);

  const availableCatalogExercises = useMemo(() => {
    return getAvailableExercises(effectiveEquipment);
  }, [effectiveEquipment]);

  const filteredCatalogExercises = useMemo(() => {
    const search = normalizeSearch(catalogSearch);
    const selectedEquipment = new Set(effectiveEquipment);

    function getExerciseScore(exercise: ExerciseCatalogItem) {
      const required = exercise.requiredEquipment ?? [];
      const matchesSelected = required.filter((item) =>
        selectedEquipment.has(item),
      ).length;

      const isPureBodyweight =
        required.length === 1 && required[0] === "bodyweight";

      let score = matchesSelected * 10;

      // Kroppsviktsövningar får lägre score i riktiga gym.
      if (
        selectedEquipment.size > 1 &&
        selectedEquipment.has("bodyweight") === false &&
        isPureBodyweight
      ) {
        score -= 5;
      }

      if (search) {
        const haystack = [
          exercise.name,
          exercise.description ?? "",
          ...(exercise.requiredEquipment ?? []),
        ]
          .join(" ")
          .toLowerCase();

        if (haystack.includes(search)) {
          score += 100;
        }
      }

      return score;
    }

    return [...availableCatalogExercises]
      .filter((exercise) => {
        if (!search) {
          return true;
        }

        const haystack = [
          exercise.name,
          exercise.description ?? "",
          ...(exercise.requiredEquipment ?? []),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      })
      .sort((a, b) => getExerciseScore(b) - getExerciseScore(a));
  }, [availableCatalogExercises, catalogSearch, effectiveEquipment]);

  const summary = useMemo(() => buildSummary(previewWorkout), [previewWorkout]);

const debugInfo = useMemo<PreviewDebugInfo>(() => {
  return {
    workoutGym: workout?.gym ?? null,
    workoutGymLabel: workout?.gymLabel ?? null,
    workoutAvailableEquipment:
      extractEquipmentFromWorkoutInternal(previewWorkout),
    gymsLoaded,
    gymsCount: gyms.length,
    matchedGymName: equipmentContext.matchedGymName,
    matchedGymEquipment: equipmentContext.matchedGymEquipment,
    extractedEquipment: extractEquipmentFromWorkoutInternal(previewWorkout),
    equipmentSeed: effectiveEquipment,
    availableCatalogCount: availableCatalogExercises.length,
    filteredCatalogCount: filteredCatalogExercises.length,
    firstAvailableExerciseNames: availableCatalogExercises
      .slice(0, 10)
      .map((exercise) => exercise.name),
    firstFilteredExerciseNames: filteredCatalogExercises
      .slice(0, 10)
      .map((exercise) => exercise.name),
  };
}, [
    availableCatalogExercises,
    effectiveEquipment,
    equipmentContext.matchedGymEquipment,
    equipmentContext.matchedGymName,
    filteredCatalogExercises,
    gyms.length,
    gymsLoaded,
    previewWorkout,
    workout?.gym,
    workout?.gymLabel,
  ]);

  function persistWorkout(nextWorkout: Workout) {
    const safeWorkout = applyProgressionToWorkout(
      userId,
      ensureWorkoutHasBlocks(nextWorkout),
    );

    setWorkout(safeWorkout);

    if (userId) {
      // Spara även effektiv equipment så draft blir stabil efter reload.
      const workoutToSave = withEquipmentMetadata(safeWorkout, effectiveEquipment);
      saveWorkoutDraft(userId, workoutToSave);
    }
  }

  function updatePrimaryExercises(nextExercises: Exercise[]) {
    if (!workout) {
      return;
    }

    const blocks = [...workout.blocks];
    const currentPrimaryBlock = getPrimaryBlock(workout);

    if (!currentPrimaryBlock) {
      return;
    }

    blocks[0] = {
      ...currentPrimaryBlock,
      exercises: nextExercises.map((exercise) =>
        applyProgressionToExercise(userId, exercise),
      ),
    };

    persistWorkout({
      ...workout,
      blocks,
    });
  }

  function findExerciseIndex(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    return exercises.findIndex((exercise) => exercise.id === exerciseId);
  }

  function updateExercise(exerciseId: string, patch: Partial<Exercise>) {
    const exercises = getPrimaryExercises(previewWorkout);

    if (!workout || exercises.length === 0) {
      return;
    }

    const nextExercises = exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }

      return applyProgressionToExercise(userId, {
        ...exercise,
        ...patch,
      });
    });

    updatePrimaryExercises(nextExercises);
  }

  function removeExercise(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);

    if (!workout) {
      return;
    }

    const nextExercises = exercises.filter(
      (exercise) => exercise.id !== exerciseId,
    );

    updatePrimaryExercises(nextExercises);
  }

  function replaceWithCatalogExercise(
    exerciseId: string,
    item: ExerciseCatalogItem,
  ): boolean {
    const exercises = getPrimaryExercises(previewWorkout);

    if (!workout || exercises.length === 0) {
      setError("Kunde inte ersätta övningen.");
      return false;
    }

    const replacement = createExerciseFromCatalog(userId, item);
    const index = exercises.findIndex((exercise) => exercise.id === exerciseId);

    if (index === -1) {
      setError("Kunde inte hitta övningen som skulle ersättas.");
      return false;
    }

    const nextExercises = [...exercises];
    nextExercises[index] = {
      ...replacement,
      id: exerciseId, // Behåll id för stabil UI-hantering.
    };

    updatePrimaryExercises(nextExercises);
    setError(null);
    return true;
  }

  function moveExercise(exerciseId: string, direction: "up" | "down") {
    const exercises = getPrimaryExercises(previewWorkout);

    if (!workout) {
      return;
    }

    const index = findExerciseIndex(exerciseId);

    if (index === -1) {
      return;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= exercises.length) {
      return;
    }

    const nextExercises = [...exercises];
    const current = nextExercises[index];
    const target = nextExercises[targetIndex];

    nextExercises[index] = target;
    nextExercises[targetIndex] = current;

    updatePrimaryExercises(nextExercises);
  }

  function incrementSets(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      sets: clampNumber(exercise.sets + 1, 1, 12),
    });
  }

  function decrementSets(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      sets: clampNumber(exercise.sets - 1, 1, 12),
    });
  }

  function incrementReps(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      reps: clampNumber((exercise.reps ?? 8) + 1, 1, 30),
      duration: undefined,
    });
  }

  function decrementReps(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      reps: clampNumber((exercise.reps ?? 8) - 1, 1, 30),
      duration: undefined,
    });
  }

  function incrementDuration(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      duration: clampNumber((exercise.duration ?? 30) + 5, 5, 300),
      reps: undefined,
    });
  }

  function decrementDuration(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      duration: clampNumber((exercise.duration ?? 30) - 5, 5, 300),
      reps: undefined,
    });
  }

  function incrementRest(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      rest: clampNumber(exercise.rest + 15, 0, 300),
    });
  }

  function decrementRest(exerciseId: string) {
    const exercises = getPrimaryExercises(previewWorkout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      rest: clampNumber(exercise.rest - 15, 0, 300),
    });
  }

  function addCatalogExercise(item: ExerciseCatalogItem): boolean {
    const currentExercises = getPrimaryExercises(previewWorkout);

    if (!workout) {
      setError("Kunde inte lägga till övningen.");
      return false;
    }

    const nextExercise = createExerciseFromCatalog(userId, item);
    updatePrimaryExercises([...currentExercises, nextExercise]);
    setError(null);
    return true;
  }

  function addCustomExercise(): boolean {
    if (!customName.trim()) {
      setError("Du behöver ange ett namn på övningen.");
      return false;
    }

    const currentExercises = getPrimaryExercises(previewWorkout);

    if (!workout) {
      setError("Kunde inte lägga till egen övning.");
      return false;
    }

    const nextExercise = createCustomExercise({
      name: customName,
      sets: customSets,
      reps: customReps,
      duration: customDuration,
      rest: customRest,
      description: customDescription,
    });

    updatePrimaryExercises([...currentExercises, nextExercise]);

    // Rensa formuläret efter lyckad tilläggning.
    setCustomName("");
    setCustomSets("3");
    setCustomReps("10");
    setCustomDuration("");
    setCustomRest("45");
    setCustomDescription("");
    setError(null);

    return true;
  }

  return {
    workout: previewWorkout,
    loading,
    error,
    setError,
    summary,
    debugInfo,

    catalogSearch,
    setCatalogSearch,
    availableCatalogExercises,
    filteredCatalogExercises,
    addCatalogExercise,
    replaceWithCatalogExercise,

    customName,
    setCustomName,
    customSets,
    setCustomSets,
    customReps,
    setCustomReps,
    customDuration,
    setCustomDuration,
    customRest,
    setCustomRest,
    customDescription,
    setCustomDescription,
    addCustomExercise,

    updateExercise,
    removeExercise,
    moveExercise,
    incrementSets,
    decrementSets,
    incrementReps,
    decrementReps,
    incrementDuration,
    decrementDuration,
    incrementRest,
    decrementRest,

    gymsLoaded,
    gymsCount: gyms.length,
    matchedGymName: equipmentContext.matchedGymName,
    matchedGymEquipment: equipmentContext.matchedGymEquipment,
    effectiveEquipment,

    // Behåller gammalt debug-API.
    extractEquipmentFromWorkout: () =>
      extractEquipmentFromWorkoutInternal(previewWorkout),
  };
}