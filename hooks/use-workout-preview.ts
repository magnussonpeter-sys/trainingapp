"use client";

// Hook för preview-flödet.
// Håller preview/page.tsx tunn och sparar alltid tillbaka till samma draft.
//
// Sprint 1:
// - workout använder nu blocks i stället för platt exercises-lista
// - vi arbetar fortfarande mot första blocket för att behålla samma UX
//
// Progression v1:
// - suggestedWeight sätts här, innan workout visas i preview
//
// Debug/fix:
// - hämtar gym från /api/gyms
// - matchar valt gym mot draft
// - bygger equipmentSeed från verklig gymutrustning när workout saknar den
// - exponerar utökad debugInfo

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

type GymEquipmentApiItem = {
  equipment_type?: string | null;
  type?: string | null;
  label?: string | null;
  name?: string | null;
};

type GymApiItem = {
  id?: string | number;
  name?: string;
  equipment?: GymEquipmentApiItem[] | null;
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
    normalized.includes("hantel")
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

function extractEquipmentFromUnknownArray(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const normalizedValues = new Set<string>();

  for (const item of candidate) {
    if (typeof item === "string") {
      const normalized = normalizeEquipmentName(item);
      if (normalized) {
        normalizedValues.add(normalized);
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
            normalizedValues.add(normalized);
            break;
          }
        }
      }
    }
  }

  return Array.from(normalizedValues);
}

function extractEquipmentFromWorkout(workout: Workout | null): string[] {
  if (!workout) {
    return [];
  }

  const candidateArrays: unknown[] = [
    (workout as Record<string, unknown>).availableEquipment,
    (workout as Record<string, unknown>).equipment,
    (workout as Record<string, unknown>).equipmentList,
    (workout as Record<string, unknown>).gymEquipment,
  ];

  const merged = new Set<string>();

  for (const candidate of candidateArrays) {
    for (const item of extractEquipmentFromUnknownArray(candidate)) {
      merged.add(item);
    }
  }

  return Array.from(merged);
}

function normalizeGymIdentity(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).trim().toLowerCase();
}

function findMatchingGym(
  gyms: GymApiItem[],
  workout: Workout | null,
): GymApiItem | null {
  if (!workout || gyms.length === 0) {
    return null;
  }

  const candidates = [
    normalizeGymIdentity(workout.gym),
    normalizeGymIdentity(workout.gymLabel),
  ].filter(Boolean);

  if (candidates.length === 0) {
    return null;
  }

  for (const gym of gyms) {
    const gymId = normalizeGymIdentity(gym.id);
    const gymName = normalizeGymIdentity(gym.name);

    if (candidates.includes(gymId) || candidates.includes(gymName)) {
      return gym;
    }
  }

  return null;
}

function extractEquipmentFromMatchedGym(
  gyms: GymApiItem[],
  workout: Workout | null,
): string[] {
  const matchedGym = findMatchingGym(gyms, workout);
  if (!matchedGym) {
    return [];
  }

  return extractEquipmentFromUnknownArray(matchedGym.equipment ?? []);
}

function getEquipmentSeedFromWorkout(params: {
  workout: Workout | null;
  matchedGymEquipment: string[];
}) {
  const { workout, matchedGymEquipment } = params;

  const explicitEquipment = extractEquipmentFromWorkout(workout);
  if (explicitEquipment.length > 0) {
    return explicitEquipment;
  }

  if (matchedGymEquipment.length > 0) {
    return matchedGymEquipment;
  }

  const gymValue = [workout?.gym, workout?.gymLabel]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .join(" ")
    .toLowerCase();

  if (
    gymValue.includes("kroppsvikt") ||
    gymValue.includes("utan gym") ||
    gymValue === "bodyweight"
  ) {
    return ["bodyweight"];
  }

  if (gymValue.trim()) {
    return [...KNOWN_EQUIPMENT_TYPES];
  }

  return ["bodyweight"];
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

function applyProgressionToExercise(userId: string, exercise: Exercise): Exercise {
  const fallbackWeight = toNumberOrNull(exercise.suggestedWeight ?? null);

  const suggestedWeight = getSuggestedWeight({
    userId,
    exerciseId: exercise.id,
    fallbackWeight,
  });

  return {
    ...exercise,
    suggestedWeight,
  };
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
  };
}

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

function getExerciseScore(
  exercise: ExerciseCatalogItem,
  selectedEquipment: Set<string>,
  isBodyweightGym: boolean,
) {
  const required = exercise.requiredEquipment ?? [];
  const matchesSelected = required.filter((item) =>
    selectedEquipment.has(item),
  ).length;

  const isPureBodyweight =
    required.length === 1 && required[0] === "bodyweight";

  let score = matchesSelected * 10;

  if (!isBodyweightGym && isPureBodyweight) {
    score -= 100;
  }

  return score;
}

export function useWorkoutPreview({ userId }: UseWorkoutPreviewProps) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gyms, setGyms] = useState<GymApiItem[]>([]);
  const [gymsLoaded, setGymsLoaded] = useState(false);

  const [catalogSearch, setCatalogSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [customSets, setCustomSets] = useState("3");
  const [customReps, setCustomReps] = useState("10");
  const [customDuration, setCustomDuration] = useState("");
  const [customRest, setCustomRest] = useState("45");
  const [customDescription, setCustomDescription] = useState("");

  useEffect(() => {
    if (!userId) {
      setWorkout(null);
      setLoading(false);
      return;
    }

    const draft = getWorkoutDraft(userId);
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
  }, [userId]);

  useEffect(() => {
    let isMounted = true;

    async function loadGyms() {
      if (!userId) {
        setGyms([]);
        setGymsLoaded(true);
        return;
      }

      try {
        const response = await fetch(`/api/gyms?userId=${encodeURIComponent(userId)}`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = (await response.json().catch(() => null)) as
          | { gyms?: GymApiItem[] }
          | GymApiItem[]
          | null;

        if (!isMounted) {
          return;
        }

        const gymsArray = Array.isArray(data)
          ? data
          : Array.isArray(data?.gyms)
            ? data.gyms
            : [];

        setGyms(gymsArray);
        setGymsLoaded(true);
      } catch {
        if (!isMounted) {
          return;
        }

        setGyms([]);
        setGymsLoaded(true);
      }
    }

    void loadGyms();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  function updateWorkout(nextWorkout: Workout) {
    const safeWorkout = applyProgressionToWorkout(
      userId,
      ensureWorkoutHasBlocks(nextWorkout),
    );

    setWorkout(safeWorkout);

    if (userId) {
      saveWorkoutDraft(userId, safeWorkout);
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

    updateWorkout({
      ...workout,
      blocks,
    });
  }

  function findExerciseIndex(exerciseId: string) {
    const exercises = getPrimaryExercises(workout);
    return exercises.findIndex((exercise) => exercise.id === exerciseId);
  }

  function updateExercise(exerciseId: string, patch: Partial<Exercise>) {
    const exercises = getPrimaryExercises(workout);

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
    const exercises = getPrimaryExercises(workout);

    if (!workout) {
      return;
    }

    const nextExercises = exercises.filter((exercise) => exercise.id !== exerciseId);
    updatePrimaryExercises(nextExercises);
  }

  function moveExercise(exerciseId: string, direction: "up" | "down") {
    const exercises = getPrimaryExercises(workout);

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
    const exercises = getPrimaryExercises(workout);
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
    const exercises = getPrimaryExercises(workout);
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
    const exercises = getPrimaryExercises(workout);
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
    const exercises = getPrimaryExercises(workout);
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
    const exercises = getPrimaryExercises(workout);
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
    const exercises = getPrimaryExercises(workout);
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
    const exercises = getPrimaryExercises(workout);
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
    const exercises = getPrimaryExercises(workout);
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      rest: clampNumber(exercise.rest - 15, 0, 300),
    });
  }

  const matchedGym = useMemo(() => {
    return findMatchingGym(gyms, workout);
  }, [gyms, workout]);

  const matchedGymEquipment = useMemo(() => {
    return extractEquipmentFromMatchedGym(gyms, workout);
  }, [gyms, workout]);

  const equipmentSeed = useMemo(() => {
    return getEquipmentSeedFromWorkout({
      workout,
      matchedGymEquipment,
    });
  }, [matchedGymEquipment, workout]);

  const availableCatalogExercises = useMemo(() => {
    return getAvailableExercises(equipmentSeed);
  }, [equipmentSeed]);

  const filteredCatalogExercises = useMemo(() => {
    const search = normalizeSearch(catalogSearch);
    const selectedEquipment = new Set(equipmentSeed);
    const isBodyweightGym =
      selectedEquipment.size === 1 && selectedEquipment.has("bodyweight");

    const base = search
      ? availableCatalogExercises.filter((exercise) => {
          const haystack = [
            exercise.name,
            exercise.description,
            exercise.movementPattern,
            ...(exercise.primaryMuscles ?? []),
            ...(exercise.requiredEquipment ?? []),
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(search);
        })
      : availableCatalogExercises;

    return [...base]
      .sort((a, b) => {
        const scoreA = getExerciseScore(a, selectedEquipment, isBodyweightGym);
        const scoreB = getExerciseScore(b, selectedEquipment, isBodyweightGym);

        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }

        return a.name.localeCompare(b.name, "sv");
      })
      .slice(0, 80);
  }, [availableCatalogExercises, catalogSearch, equipmentSeed]);

  function addCatalogExercise(item: ExerciseCatalogItem) {
    const exercises = getPrimaryExercises(workout);

    if (!workout) {
      return false;
    }

    const nextExercise = createExerciseFromCatalog(userId, item);

    const alreadyExists = exercises.some((exercise) => {
      return (
        exercise.name.trim().toLowerCase() ===
        nextExercise.name.trim().toLowerCase()
      );
    });

    if (alreadyExists) {
      setError("Övningen finns redan i passet.");
      return false;
    }

    updatePrimaryExercises([...exercises, nextExercise]);
    setError(null);
    setCatalogSearch("");
    return true;
  }

  function replaceWithCatalogExercise(exerciseId: string, item: ExerciseCatalogItem) {
    const exercises = getPrimaryExercises(workout);

    if (!workout) {
      return false;
    }

    const nextExercise = createExerciseFromCatalog(userId, item);
    const currentIndex = findExerciseIndex(exerciseId);

    if (currentIndex === -1) {
      return false;
    }

    const alreadyExists = exercises.some((exercise, index) => {
      if (index === currentIndex) {
        return false;
      }

      return (
        exercise.name.trim().toLowerCase() ===
        nextExercise.name.trim().toLowerCase()
      );
    });

    if (alreadyExists) {
      setError("Den övningen finns redan i passet.");
      return false;
    }

    const currentExercise = exercises[currentIndex];

    updateExercise(exerciseId, {
      ...nextExercise,
      id: currentExercise.id,
    });

    setError(null);
    setCatalogSearch("");
    return true;
  }

  function addCustomExercise() {
    const exercises = getPrimaryExercises(workout);

    if (!workout) {
      return false;
    }

    if (!customName.trim()) {
      setError("Ange namn på övningen.");
      return false;
    }

    const nextExercise = applyProgressionToExercise(
      userId,
      createCustomExercise({
        name: customName,
        sets: customSets,
        reps: customReps,
        duration: customDuration,
        rest: customRest,
        description: customDescription,
      }),
    );

    updatePrimaryExercises([...exercises, nextExercise]);

    setCustomName("");
    setCustomSets("3");
    setCustomReps("10");
    setCustomDuration("");
    setCustomRest("45");
    setCustomDescription("");
    setError(null);

    return true;
  }

  const summary = useMemo(() => {
    const exercises = getPrimaryExercises(workout);

    if (!workout) {
      return {
        exerciseCount: 0,
        setCount: 0,
        timedExercises: 0,
      };
    }

    return {
      exerciseCount: exercises.length,
      setCount: exercises.reduce((sum, exercise) => sum + exercise.sets, 0),
      timedExercises: exercises.filter((exercise) => {
        return typeof exercise.duration === "number" && exercise.duration > 0;
      }).length,
    };
  }, [workout]);

  const debugInfo = useMemo(() => {
    return {
      workoutGym: workout?.gym ?? null,
      workoutGymLabel: workout?.gymLabel ?? null,
      workoutAvailableEquipment:
        ((workout as Record<string, unknown> | null)?.availableEquipment as unknown[]) ?? [],
      gymsLoaded,
      gymsCount: gyms.length,
      matchedGymName: matchedGym?.name ?? null,
      matchedGymEquipment,
      extractedEquipment: extractEquipmentFromWorkout(workout),
      equipmentSeed,
      availableCatalogCount: availableCatalogExercises.length,
      filteredCatalogCount: filteredCatalogExercises.length,
      firstAvailableExerciseNames: availableCatalogExercises
        .slice(0, 15)
        .map((exercise) => exercise.name),
      firstFilteredExerciseNames: filteredCatalogExercises
        .slice(0, 15)
        .map((exercise) => exercise.name),
    };
  }, [
    availableCatalogExercises,
    equipmentSeed,
    filteredCatalogExercises,
    gyms,
    gymsLoaded,
    matchedGym,
    matchedGymEquipment,
    workout,
  ]);

  return {
    workout,
    loading,
    error,
    setError,
    summary,
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
    catalogSearch,
    setCatalogSearch,
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
    debugInfo,
  };
}