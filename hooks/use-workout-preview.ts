"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAvailableExercises,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import {
  EQUIPMENT_IDS,
  extractEquipmentIdsFromRecords,
} from "@/lib/equipment";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  applyExerciseProgression,
  type WorkoutGymEquipmentItem,
} from "@/lib/workout-flow/exercise-progression";
import {
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import type {
  Exercise,
  Workout,
  WorkoutBlock,
  WorkoutBlockType,
  WorkoutPreparationFeedback,
  WorkoutPreparationLevel,
} from "@/types/workout";

type UseWorkoutPreviewProps = {
  userId: string;
};

type GymSummary = {
  id: string;
  name: string;
  equipment: string[];
  equipmentItems: WorkoutGymEquipmentItem[];
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

// Läser en godtycklig equipment-array från API/draft/workout.
function extractEquipmentArray(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return extractEquipmentIdsFromRecords(
    candidate as Array<Record<string, unknown> | string>,
    { includeBodyweightFallback: false },
  );
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
async function fetchGyms(userId: string): Promise<GymSummary[]> {
  if (!userId.trim()) {
    return [];
  }

  const url = `/api/gyms?userId=${encodeURIComponent(userId)}`;
  const gymsResponse = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!gymsResponse.ok) {
    return [];
  }

  const payload = await gymsResponse.json().catch(() => null);

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
    const rawEquipment = Array.isArray(record.equipment)
      ? (record.equipment as unknown[])
      : Array.isArray(record.gymEquipment)
        ? (record.gymEquipment as unknown[])
        : Array.isArray(record.equipmentList)
          ? (record.equipmentList as unknown[])
          : [];
    const equipmentItems = rawEquipment.filter(
      (item): item is WorkoutGymEquipmentItem =>
        typeof item === "object" && item !== null,
    );

    if (!id && !name) {
      continue;
    }

    gyms.push({
      id: id || name,
      name: name || id,
      equipment,
      equipmentItems,
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
        effectiveEquipment: [...EQUIPMENT_IDS],
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
      effectiveEquipment: [...EQUIPMENT_IDS],
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

function createExerciseFromCatalog(
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

  return baseExercise;
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

function blockHasRoundMetadata(
  block: WorkoutBlock,
): block is Extract<WorkoutBlock, { rounds?: number | null }> {
  return block.type === "superset" || block.type === "circuit";
}

function createBlockDefaults(
  blockType: WorkoutBlockType,
  block: WorkoutBlock,
): Partial<WorkoutBlock> {
  if (blockType === "straight_sets") {
    return {
      type: "straight_sets",
    };
  }

  const fallbackRounds = Math.max(
    1,
    ...block.exercises.map((exercise) => Math.max(1, exercise.sets)),
  );

  return {
    type: blockType,
    rounds:
      blockHasRoundMetadata(block) &&
      typeof block.rounds === "number" &&
      block.rounds > 0
        ? block.rounds
        : fallbackRounds,
    restBetweenExercises:
      blockHasRoundMetadata(block) &&
      typeof block.restBetweenExercises === "number"
        ? block.restBetweenExercises
        : blockType === "superset"
          ? 15
          : 0,
    restAfterRound:
      blockHasRoundMetadata(block) &&
      typeof block.restAfterRound === "number"
        ? block.restAfterRound
        : blockType === "superset"
          ? 60
          : 75,
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

type ExerciseLocation = {
  blockIndex: number;
  exerciseIndex: number;
  exercise: Exercise;
};

function getAllExercises(workout: Workout | null): Exercise[] {
  if (!workout?.blocks?.length) {
    return [];
  }

  return workout.blocks.flatMap((block) => block.exercises ?? []);
}

function findExerciseLocation(
  workout: Workout | null,
  exerciseId: string,
): ExerciseLocation | null {
  if (!workout?.blocks?.length) {
    return null;
  }

  for (let blockIndex = 0; blockIndex < workout.blocks.length; blockIndex += 1) {
    const block = workout.blocks[blockIndex];
    const exerciseIndex = block.exercises.findIndex(
      (exercise) => exercise.id === exerciseId,
    );

    if (exerciseIndex >= 0) {
      return {
        blockIndex,
        exerciseIndex,
        exercise: block.exercises[exerciseIndex],
      };
    }
  }

  return null;
}

// Applicerar progression blockvis så att framtida blocktyper kan återanvända samma idé.
function applyProgressionToWorkout(params: {
  userId: string;
  workout: Workout;
  gymEquipmentItems?: WorkoutGymEquipmentItem[];
}): Workout {
  const safeWorkout = ensureWorkoutHasBlocks(params.workout);
  const goal = safeWorkout.goal ?? "health";

  return {
    ...safeWorkout,
    blocks: safeWorkout.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((exercise) =>
        applyExerciseProgression({
          exercise,
          goal,
          gymEquipmentItems: params.gymEquipmentItems ?? [],
          userId: params.userId,
        }),
      ),
    })),
  };
}

// Enkel sammanfattning som preview-sidan kan visa.
function buildSummary(workout: Workout | null): PreviewSummary {
  const exercises = getAllExercises(workout);

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
          fetchGyms(userId),
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

        const matchedGym = matchGymByWorkout(normalized, loadedGyms);
        const safeWorkout = applyProgressionToWorkout({
          userId,
          workout: ensureWorkoutHasBlocks(normalized),
          gymEquipmentItems: matchedGym?.equipmentItems ?? [],
        });

        // Spara tillbaka berikad workout så att run-sidan får samma metadata
        // direkt även om användaren inte gör några manuella ändringar i preview.
        saveWorkoutDraft(
          userId,
          withEquipmentMetadata(
            safeWorkout,
            deriveEffectiveEquipmentContext(safeWorkout, loadedGyms).effectiveEquipment,
          ),
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

  function persistWorkout(nextWorkout: Workout) {
    const matchedGym = matchGymByWorkout(nextWorkout, gyms);
    const safeWorkout = applyProgressionToWorkout({
      userId,
      workout: ensureWorkoutHasBlocks(nextWorkout),
      gymEquipmentItems: matchedGym?.equipmentItems ?? [],
    });

    setWorkout(safeWorkout);

    if (userId) {
      // Spara även effektiv equipment så draft blir stabil efter reload.
      const workoutToSave = withEquipmentMetadata(safeWorkout, effectiveEquipment);
      saveWorkoutDraft(userId, workoutToSave);
    }
  }

  function updateBlock(
    blockIndex: number,
    updater: (block: WorkoutBlock) => WorkoutBlock,
  ) {
    if (!workout || blockIndex < 0 || blockIndex >= workout.blocks.length) {
      return;
    }

    const nextBlocks = workout.blocks.map((block, index) => {
      if (index !== blockIndex) {
        return block;
      }

      return updater(block);
    });

    persistWorkout({
      ...workout,
      blocks: nextBlocks,
    });
  }

  function updatePreparationFeedback(
    patch: Partial<WorkoutPreparationFeedback>,
  ) {
    if (!workout) {
      return;
    }

    const nextPreparationFeedback: WorkoutPreparationFeedback = {
      ...workout.preparationFeedback,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    persistWorkout({
      ...workout,
      preparationFeedback: nextPreparationFeedback,
    });
  }

  function setPreparationLevel(
    key: "energy" | "focus",
    value: WorkoutPreparationLevel,
  ) {
    updatePreparationFeedback({ [key]: value });
  }

  function setPreparationNote(note: string) {
    updatePreparationFeedback({ note });
  }

  function setBlockType(blockIndex: number, blockType: WorkoutBlockType) {
    updateBlock(blockIndex, (block) => {
      const nextBlock = {
        ...block,
        ...createBlockDefaults(blockType, block),
      } as WorkoutBlock;

      if (blockType === "straight_sets") {
        delete (nextBlock as Record<string, unknown>).rounds;
        delete (nextBlock as Record<string, unknown>).restBetweenExercises;
        delete (nextBlock as Record<string, unknown>).restAfterRound;
      }

      return nextBlock;
    });
  }

  function incrementBlockRounds(blockIndex: number) {
    updateBlock(blockIndex, (block) => {
      if (block.type === "straight_sets") {
        return block;
      }

      return {
        ...block,
        rounds: clampNumber((block.rounds ?? 1) + 1, 1, 10),
      };
    });
  }

  function decrementBlockRounds(blockIndex: number) {
    updateBlock(blockIndex, (block) => {
      if (block.type === "straight_sets") {
        return block;
      }

      return {
        ...block,
        rounds: clampNumber((block.rounds ?? 1) - 1, 1, 10),
      };
    });
  }

  function incrementBlockRestBetweenExercises(blockIndex: number) {
    updateBlock(blockIndex, (block) => {
      if (block.type === "straight_sets") {
        return block;
      }

      return {
        ...block,
        restBetweenExercises: clampNumber(
          (block.restBetweenExercises ?? 0) + 15,
          0,
          300,
        ),
      };
    });
  }

  function decrementBlockRestBetweenExercises(blockIndex: number) {
    updateBlock(blockIndex, (block) => {
      if (block.type === "straight_sets") {
        return block;
      }

      return {
        ...block,
        restBetweenExercises: clampNumber(
          (block.restBetweenExercises ?? 0) - 15,
          0,
          300,
        ),
      };
    });
  }

  function incrementBlockRestAfterRound(blockIndex: number) {
    updateBlock(blockIndex, (block) => {
      if (block.type === "straight_sets") {
        return block;
      }

      return {
        ...block,
        restAfterRound: clampNumber((block.restAfterRound ?? 45) + 15, 0, 300),
      };
    });
  }

  function decrementBlockRestAfterRound(blockIndex: number) {
    updateBlock(blockIndex, (block) => {
      if (block.type === "straight_sets") {
        return block;
      }

      return {
        ...block,
        restAfterRound: clampNumber((block.restAfterRound ?? 45) - 15, 0, 300),
      };
    });
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
        applyExerciseProgression({
          exercise,
          goal: workout.goal ?? "health",
          gymEquipmentItems:
            matchGymByWorkout(previewWorkout, gyms)?.equipmentItems ?? [],
          userId,
        }),
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

  function updateExerciseInBlocks(
    exerciseId: string,
    updater: (exercise: Exercise) => Exercise | null,
  ) {
    if (!workout) {
      return false;
    }

    const location = findExerciseLocation(previewWorkout, exerciseId);

    if (!location) {
      return false;
    }

    const nextBlocks = workout.blocks.map((block, blockIndex) => {
      if (blockIndex !== location.blockIndex) {
        return block;
      }

      const nextExercises = [...block.exercises];
      const nextExercise = updater(location.exercise);

      if (nextExercise === null) {
        nextExercises.splice(location.exerciseIndex, 1);
      } else {
        nextExercises[location.exerciseIndex] = applyExerciseProgression({
          exercise: nextExercise,
          goal: workout.goal ?? "health",
          gymEquipmentItems:
            matchGymByWorkout(previewWorkout, gyms)?.equipmentItems ?? [],
          userId,
        });
      }

      return {
        ...block,
        exercises: nextExercises,
      };
    });

    persistWorkout({
      ...workout,
      blocks: nextBlocks,
    });

    return true;
  }

  function updateExercise(exerciseId: string, patch: Partial<Exercise>) {
    if (!workout) {
      return;
    }

    updateExerciseInBlocks(exerciseId, (exercise) => ({
      ...exercise,
      ...patch,
    }));
  }

  function removeExercise(exerciseId: string) {
    if (!workout) {
      return;
    }

    updateExerciseInBlocks(exerciseId, () => null);
  }

  function replaceWithCatalogExercise(
    exerciseId: string,
    item: ExerciseCatalogItem,
  ): boolean {
    if (!workout) {
      setError("Kunde inte ersätta övningen.");
      return false;
    }

    const replacement = applyExerciseProgression({
      exercise: createExerciseFromCatalog(item),
      goal: workout.goal ?? "health",
      gymEquipmentItems:
        matchGymByWorkout(previewWorkout, gyms)?.equipmentItems ?? [],
      userId,
    });
    const replaced = updateExerciseInBlocks(exerciseId, () => ({
      ...replacement,
      id: exerciseId, // Behåll id för stabil UI-hantering.
    }));

    if (!replaced) {
      setError("Kunde inte hitta övningen som skulle ersättas.");
      return false;
    }
    setError(null);
    return true;
  }

  function moveExercise(exerciseId: string, direction: "up" | "down") {
    if (!workout) {
      return;
    }

    const location = findExerciseLocation(previewWorkout, exerciseId);

    if (!location) {
      return;
    }

    const nextBlocks = workout.blocks.map((block) => ({
      ...block,
      exercises: [...block.exercises],
    }));
    const currentBlock = nextBlocks[location.blockIndex];
    const currentExercise = currentBlock.exercises[location.exerciseIndex];

    if (!currentExercise) {
      return;
    }

    if (direction === "up") {
      if (location.exerciseIndex > 0) {
        const targetIndex = location.exerciseIndex - 1;
        const target = currentBlock.exercises[targetIndex];

        currentBlock.exercises[location.exerciseIndex] = target;
        currentBlock.exercises[targetIndex] = currentExercise;
      } else if (location.blockIndex > 0) {
        const previousBlock = nextBlocks[location.blockIndex - 1];

        if (previousBlock.exercises.length === 0) {
          return;
        }

        currentBlock.exercises.splice(location.exerciseIndex, 1);
        previousBlock.exercises.push(currentExercise);
      } else {
        return;
      }
    } else {
      if (location.exerciseIndex < currentBlock.exercises.length - 1) {
        const targetIndex = location.exerciseIndex + 1;
        const target = currentBlock.exercises[targetIndex];

        currentBlock.exercises[location.exerciseIndex] = target;
        currentBlock.exercises[targetIndex] = currentExercise;
      } else if (location.blockIndex < nextBlocks.length - 1) {
        const nextBlock = nextBlocks[location.blockIndex + 1];

        currentBlock.exercises.splice(location.exerciseIndex, 1);
        nextBlock.exercises.unshift(currentExercise);
      } else {
        return;
      }
    }

    persistWorkout({
      ...workout,
      blocks: nextBlocks,
    });
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

    const nextExercise = applyExerciseProgression({
      exercise: createExerciseFromCatalog(item),
      goal: workout?.goal ?? "health",
      gymEquipmentItems:
        matchGymByWorkout(previewWorkout, gyms)?.equipmentItems ?? [],
      userId,
    });
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
    preparationFeedback: previewWorkout?.preparationFeedback ?? null,
    setPreparationLevel,
    setPreparationNote,
    setBlockType,
    incrementBlockRounds,
    decrementBlockRounds,
    incrementBlockRestBetweenExercises,
    decrementBlockRestBetweenExercises,
    incrementBlockRestAfterRound,
    decrementBlockRestAfterRound,

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
