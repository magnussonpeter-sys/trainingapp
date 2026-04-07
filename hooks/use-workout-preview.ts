"use client";

// Hook för preview-flödet.
// Håller preview/page.tsx tunn och sparar alltid tillbaka till samma draft.

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
import type { Exercise, Workout } from "@/types/workout";

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

// Söknormalisering.
function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

// Försöker hitta utrustningsfrön från draft.
// Tills vidare bodyweight som trygg fallback om vi saknar bättre metadata.
function getEquipmentSeedFromWorkout(workout: Workout | null) {
  if (!workout?.gym) {
    return ["bodyweight"];
  }

  const gymLabel = workout.gym.trim().toLowerCase();

  if (
    gymLabel.includes("kroppsvikt") ||
    gymLabel.includes("utan gym") ||
    gymLabel === "bodyweight"
  ) {
    return ["bodyweight"];
  }

  return ["bodyweight"];
}

function createExerciseFromCatalog(item: ExerciseCatalogItem): Exercise {
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

export function useWorkoutPreview({ userId }: UseWorkoutPreviewProps) {
  const [workout, setWorkout] = useState<Workout | null>(null);
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
    const normalized = normalizePreviewWorkout(draft) as Workout | null;

    setWorkout(normalized);
    setLoading(false);
  }, [userId]);

  function updateWorkout(nextWorkout: Workout) {
    setWorkout(nextWorkout);

    if (userId) {
      saveWorkoutDraft(userId, nextWorkout);
    }
  }

  function findExerciseIndex(exerciseId: string) {
    if (!workout) {
      return -1;
    }

    return workout.exercises.findIndex((exercise) => exercise.id === exerciseId);
  }

  function updateExercise(exerciseId: string, patch: Partial<Exercise>) {
    if (!workout) {
      return;
    }

    const nextExercises = workout.exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }

      return {
        ...exercise,
        ...patch,
      };
    });

    updateWorkout({
      ...workout,
      exercises: nextExercises,
    });
  }

  function removeExercise(exerciseId: string) {
    if (!workout) {
      return;
    }

    const nextExercises = workout.exercises.filter(
      (exercise) => exercise.id !== exerciseId,
    );

    updateWorkout({
      ...workout,
      exercises: nextExercises,
    });
  }

  function moveExercise(exerciseId: string, direction: "up" | "down") {
    if (!workout) {
      return;
    }

    const index = findExerciseIndex(exerciseId);

    if (index === -1) {
      return;
    }

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

  function incrementSets(exerciseId: string) {
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? workout?.exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      sets: clampNumber(exercise.sets + 1, 1, 12),
    });
  }

  function decrementSets(exerciseId: string) {
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? workout?.exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      sets: clampNumber(exercise.sets - 1, 1, 12),
    });
  }

  function incrementReps(exerciseId: string) {
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? workout?.exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      reps: clampNumber((exercise.reps ?? 8) + 1, 1, 30),
      duration: undefined,
    });
  }

  function decrementReps(exerciseId: string) {
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? workout?.exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      reps: clampNumber((exercise.reps ?? 8) - 1, 1, 30),
      duration: undefined,
    });
  }

  function incrementDuration(exerciseId: string) {
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? workout?.exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      duration: clampNumber((exercise.duration ?? 30) + 5, 5, 300),
      reps: undefined,
    });
  }

  function decrementDuration(exerciseId: string) {
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? workout?.exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      duration: clampNumber((exercise.duration ?? 30) - 5, 5, 300),
      reps: undefined,
    });
  }

  function incrementRest(exerciseId: string) {
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? workout?.exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
      rest: clampNumber(exercise.rest + 15, 0, 300),
    });
  }

  function decrementRest(exerciseId: string) {
    const index = findExerciseIndex(exerciseId);
    const exercise = index >= 0 ? workout?.exercises[index] : null;

    if (!exercise) {
      return;
    }

    updateExercise(exerciseId, {
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
    if (!workout) {
      return false;
    }

    const nextExercise = createExerciseFromCatalog(item);
    const alreadyExists = workout.exercises.some((exercise) => {
      return (
        exercise.name.trim().toLowerCase() ===
        nextExercise.name.trim().toLowerCase()
      );
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

  function replaceWithCatalogExercise(
    exerciseId: string,
    item: ExerciseCatalogItem,
  ) {
    if (!workout) {
      return false;
    }

    const nextExercise = createExerciseFromCatalog(item);
    const currentIndex = findExerciseIndex(exerciseId);

    if (currentIndex === -1) {
      return false;
    }

    const alreadyExists = workout.exercises.some((exercise, index) => {
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

    const currentExercise = workout.exercises[currentIndex];

    updateExercise(exerciseId, {
      ...nextExercise,
      id: currentExercise.id,
    });

    setError(null);
    setCatalogSearch("");
    return true;
  }

  function addCustomExercise() {
    if (!workout) {
      return false;
    }

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
  };
}