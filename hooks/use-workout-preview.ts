"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  getAvailableExercises,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";

type WorkoutExercise = {
  id: string;
  name: string;
  sets: number;
  reps?: number;
  duration?: number;
  rest: number;
  description?: string;
};

type PreviewWorkout = {
  id: string;
  name: string;
  duration: number;
  gymLabel?: string;
  exercises: WorkoutExercise[];
};

type UseWorkoutPreviewProps = {
  userId: string;
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

// Enkel id-generator för customövningar.
function createExerciseId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

// Söknormalisering för kataloglistan.
function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

// Plockar fram en rimlig utrustningslista från workout-draften.
function getEquipmentSeedFromWorkout(workout: PreviewWorkout | null) {
  if (!workout?.gymLabel) {
    return ["bodyweight"];
  }

  const gymLabel = workout.gymLabel.trim().toLowerCase();

  if (
    gymLabel.includes("kroppsvikt") ||
    gymLabel.includes("utan gym") ||
    gymLabel === "bodyweight"
  ) {
    return ["bodyweight"];
  }

  // Tills vidare använder vi bodyweight som säker fallback om vi inte har bättre metadata.
  return ["bodyweight"];
}

// Gör om katalogövning till vanlig workout-övning.
function createExerciseFromCatalog(item: ExerciseCatalogItem): WorkoutExercise {
  const isTimed =
    typeof item.defaultDuration === "number" &&
    item.defaultDuration > 0 &&
    typeof item.defaultReps !== "number";

  return {
    id: item.id,
    name: item.name,
    sets: item.defaultSets,
    reps: isTimed ? undefined : item.defaultReps ?? 10,
    duration: isTimed ? item.defaultDuration : undefined,
    rest: item.defaultRest,
    description: item.description,
  };
}

// Skapar customövning från formuläret.
function createCustomExercise(params: {
  name: string;
  sets: string;
  reps: string;
  duration: string;
  rest: string;
  description: string;
}): WorkoutExercise {
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

export function useWorkoutPreview({ userId }: UseWorkoutPreviewProps) {
  const [workout, setWorkout] = useState<PreviewWorkout | null>(null);
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
    if (!userId) {
      setWorkout(null);
      setLoading(false);
      return;
    }

    const draft = getWorkoutDraft(userId);
    const normalized = normalizePreviewWorkout(draft) as PreviewWorkout | null;

    setWorkout(normalized);
    setLoading(false);
  }, [userId]);

  function updateWorkout(next: PreviewWorkout) {
    setWorkout(next);

    if (userId) {
      saveWorkoutDraft(userId, next);
    }
  }

  function updateExercise(index: number, patch: Partial<WorkoutExercise>) {
    if (!workout) return;

    const nextExercises = [...workout.exercises];
    const current = nextExercises[index];
    if (!current) return;

    nextExercises[index] = {
      ...current,
      ...patch,
    };

    updateWorkout({
      ...workout,
      exercises: nextExercises,
    });
  }

  function removeExercise(index: number) {
    if (!workout) return;

    const nextExercises = workout.exercises.filter((_, itemIndex) => {
      return itemIndex !== index;
    });

    updateWorkout({
      ...workout,
      exercises: nextExercises,
    });
  }

  function moveExercise(index: number, direction: "up" | "down") {
    if (!workout) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= workout.exercises.length) {
      return;
    }

    const nextExercises = [...workout.exercises];
    const current = nextExercises[index];
    const target = nextExercises[targetIndex];

    nextExercises[index] = target;
    nextExercises[targetIndex] = current;

    updateWorkout({
      ...workout,
      exercises: nextExercises,
    });
  }

  function incrementSets(index: number) {
    if (!workout) return;

    const exercise = workout.exercises[index];
    if (!exercise) return;

    updateExercise(index, {
      sets: clampNumber(exercise.sets + 1, 1, 12),
    });
  }

  function decrementSets(index: number) {
    if (!workout) return;

    const exercise = workout.exercises[index];
    if (!exercise) return;

    updateExercise(index, {
      sets: clampNumber(exercise.sets - 1, 1, 12),
    });
  }

  function incrementRest(index: number) {
    if (!workout) return;

    const exercise = workout.exercises[index];
    if (!exercise) return;

    updateExercise(index, {
      rest: clampNumber(exercise.rest + 15, 0, 300),
    });
  }

  function decrementRest(index: number) {
    if (!workout) return;

    const exercise = workout.exercises[index];
    if (!exercise) return;

    updateExercise(index, {
      rest: clampNumber(exercise.rest - 15, 0, 300),
    });
  }

  const availableCatalogExercises = useMemo(() => {
    const seedEquipment = getEquipmentSeedFromWorkout(workout);
    return getAvailableExercises(seedEquipment);
  }, [workout]);

  const filteredCatalogExercises = useMemo(() => {
    const search = normalizeSearch(catalogSearch);

    if (!search) {
      return availableCatalogExercises.slice(0, 80);
    }

    return availableCatalogExercises
      .filter((exercise) => {
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
      .slice(0, 80);
  }, [availableCatalogExercises, catalogSearch]);

  function addCatalogExercise(item: ExerciseCatalogItem) {
    if (!workout) return;

    const nextExercise = createExerciseFromCatalog(item);

    const alreadyExists = workout.exercises.some((exercise) => {
      return exercise.name.trim().toLowerCase() === nextExercise.name.trim().toLowerCase();
    });

    if (alreadyExists) {
      setError("Övningen finns redan i passet.");
      return false;
    }

    updateWorkout({
      ...workout,
      exercises: [...workout.exercises, nextExercise],
    });

    setError(null);
    setCatalogSearch("");
    return true;
  }

  function replaceWithCatalogExercise(index: number, item: ExerciseCatalogItem) {
    if (!workout) return false;

    const nextExercise = createExerciseFromCatalog(item);
    const current = workout.exercises[index];

    if (!current) return false;

    const alreadyExists = workout.exercises.some((exercise, exerciseIndex) => {
      if (exerciseIndex === index) {
        return false;
      }

      return exercise.name.trim().toLowerCase() === nextExercise.name.trim().toLowerCase();
    });

    if (alreadyExists) {
      setError("Den övningen finns redan i passet.");
      return false;
    }

    updateExercise(index, nextExercise);
    setError(null);
    setCatalogSearch("");
    return true;
  }

  function addCustomExercise() {
    if (!workout) return false;

    if (!customName.trim()) {
      setError("Ange namn på övningen.");
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

    updateWorkout({
      ...workout,
      exercises: [...workout.exercises, nextExercise],
    });

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
    if (!workout) {
      return {
        exerciseCount: 0,
        totalSets: 0,
        timedExercises: 0,
      };
    }

    return {
      exerciseCount: workout.exercises.length,
      totalSets: workout.exercises.reduce((sum, exercise) => {
        return sum + exercise.sets;
      }, 0),
      timedExercises: workout.exercises.filter((exercise) => {
        return typeof exercise.duration === "number" && exercise.duration > 0;
      }).length,
    };
  }, [workout]);

  return {
    workout,
    loading,
    error,
    setError,
    summary,
    updateExercise,
    removeExercise,
    moveExercise,
    incrementSets,
    decrementSets,
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
  };
}