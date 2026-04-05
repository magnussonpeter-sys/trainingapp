"use client";

import { useEffect, useState } from "react";

const MIN_DURATION = 5;
const MAX_DURATION = 180;
const DEFAULT_DURATION = 30;
const DEFAULT_GYM_ID = "bodyweight";

// Håller tid inom rimliga gränser.
function clampDuration(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_DURATION;
  }

  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(value)));
}

// Bygger lagringsnyckel per användare.
function getStorageKey(userId: string) {
  return `ai-workout-settings:${userId}`;
}

type UseHomePreferencesParams = {
  userId?: string | null;
  defaultGymId?: string;
};

export function useHomePreferences({
  userId,
  defaultGymId = DEFAULT_GYM_ID,
}: UseHomePreferencesParams) {
  const [selectedDuration, setSelectedDuration] = useState(DEFAULT_DURATION);
  const [durationInput, setDurationInput] = useState(String(DEFAULT_DURATION));
  const [selectedGymId, setSelectedGymId] = useState(defaultGymId);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSelectedDuration(DEFAULT_DURATION);
      setDurationInput(String(DEFAULT_DURATION));
      setSelectedGymId(defaultGymId);
      setHasLoadedPreferences(true);
      return;
    }

    try {
      const raw = localStorage.getItem(getStorageKey(userId));

      if (!raw) {
        setSelectedDuration(DEFAULT_DURATION);
        setDurationInput(String(DEFAULT_DURATION));
        setSelectedGymId(defaultGymId);
        setHasLoadedPreferences(true);
        return;
      }

      const parsed = JSON.parse(raw) as {
        duration?: unknown;
        gymId?: unknown;
      };

      const nextDuration =
        typeof parsed.duration === "number"
          ? clampDuration(parsed.duration)
          : DEFAULT_DURATION;

      const nextGymId =
        typeof parsed.gymId === "string" && parsed.gymId.trim()
          ? parsed.gymId
          : defaultGymId;

      setSelectedDuration(nextDuration);
      setDurationInput(String(nextDuration));
      setSelectedGymId(nextGymId);
    } catch (error) {
      console.error("Kunde inte läsa sparade home-val:", error);
      setSelectedDuration(DEFAULT_DURATION);
      setDurationInput(String(DEFAULT_DURATION));
      setSelectedGymId(defaultGymId);
    } finally {
      setHasLoadedPreferences(true);
    }
  }, [defaultGymId, userId]);

  useEffect(() => {
    if (!userId || !hasLoadedPreferences) {
      return;
    }

    try {
      localStorage.setItem(
        getStorageKey(userId),
        JSON.stringify({
          duration: selectedDuration,
          gymId: selectedGymId,
        }),
      );
    } catch (error) {
      console.error("Kunde inte spara home-val:", error);
    }
  }, [hasLoadedPreferences, selectedDuration, selectedGymId, userId]);

  function updateDuration(nextDuration: number) {
    const clamped = clampDuration(nextDuration);
    setSelectedDuration(clamped);
    setDurationInput(String(clamped));
  }

  function updateDurationInput(value: string) {
    // Tillåt bara siffror i inputfältet.
    const sanitized = value.replace(/[^\d]/g, "");
    setDurationInput(sanitized);

    const parsed = Number(sanitized);

    if (sanitized !== "" && Number.isFinite(parsed)) {
      setSelectedDuration(clampDuration(parsed));
    }
  }

  function commitDurationInput() {
    const parsed = Number(durationInput);
    const clamped = clampDuration(parsed);
    setSelectedDuration(clamped);
    setDurationInput(String(clamped));
  }

  return {
    selectedDuration,
    durationInput,
    selectedGymId,
    hasLoadedPreferences,
    setSelectedGymId,
    updateDuration,
    updateDurationInput,
    commitDurationInput,
  };
}