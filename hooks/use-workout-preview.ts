"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";

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

export function useWorkoutPreview({ userId }: UseWorkoutPreviewProps) {
  const [workout, setWorkout] = useState<PreviewWorkout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Saknas userId ska vi inte försöka läsa draft.
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

    // Autospara direkt så preview och run använder samma draft.
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

  const summary = useMemo(() => {
    if (!workout) {
      return {
        exerciseCount: 0,
        totalSets: 0,
      };
    }

    return {
      exerciseCount: workout.exercises.length,
      totalSets: workout.exercises.reduce((sum, exercise) => {
        return sum + exercise.sets;
      }, 0),
    };
  }, [workout]);

  return {
    workout,
    loading,
    summary,
    updateExercise,
    removeExercise,
    moveExercise,
    incrementSets,
    decrementSets,
    incrementRest,
    decrementRest,
  };
}