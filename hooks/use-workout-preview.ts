"use client";

import { useEffect, useState } from "react";
import {
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";

type UseWorkoutPreviewProps = {
  userId: string;
};

export function useWorkoutPreview({ userId }: UseWorkoutPreviewProps) {
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Init – hämta draft
  useEffect(() => {
    const draft = getWorkoutDraft(userId);
    const normalized = normalizePreviewWorkout(draft);

    setWorkout(normalized);
    setLoading(false);
  }, [userId]);

  // Uppdatera + autospara
  function updateWorkout(next: any) {
    setWorkout(next);
    saveWorkoutDraft(userId, next);
  }

  // === Actions ===

  function updateExercise(index: number, patch: any) {
    const updated = { ...workout };
    updated.exercises[index] = {
      ...updated.exercises[index],
      ...patch,
    };
    updateWorkout(updated);
  }

  function removeExercise(index: number) {
    const updated = { ...workout };
    updated.exercises.splice(index, 1);
    updateWorkout(updated);
  }

  function addExercise(exercise: any) {
    const updated = { ...workout };
    updated.exercises.push(exercise);
    updateWorkout(updated);
  }

  return {
    workout,
    loading,
    updateExercise,
    removeExercise,
    addExercise,
  };
}