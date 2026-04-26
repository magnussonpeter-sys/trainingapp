"use client";

import { useEffect, useMemo, useState } from "react";

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

type StoredHomePreferences = {
  duration?: unknown;
  gymId?: unknown;
};

export function getStoredHomePreferences(userId: string) {
  if (!userId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(getStorageKey(userId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredHomePreferences;

    return {
      duration:
        typeof parsed.duration === "number"
          ? clampDuration(parsed.duration)
          : null,
      gymId:
        typeof parsed.gymId === "string" && parsed.gymId.trim()
          ? parsed.gymId.trim()
          : null,
    };
  } catch (error) {
    console.error("Kunde inte läsa sparade home-val:", error);
    return null;
  }
}

export function storeHomePreferences(params: {
  userId: string;
  duration?: number | null;
  gymId?: string | null;
}) {
  if (!params.userId) {
    return;
  }

  try {
    const previous = getStoredHomePreferences(params.userId);

    localStorage.setItem(
      getStorageKey(params.userId),
      JSON.stringify({
        duration:
          typeof params.duration === "number"
            ? clampDuration(params.duration)
            : previous?.duration ?? DEFAULT_DURATION,
        gymId:
          typeof params.gymId === "string" && params.gymId.trim()
            ? params.gymId.trim()
            : previous?.gymId ?? DEFAULT_GYM_ID,
      }),
    );
  } catch (error) {
    console.error("Kunde inte spara home-val:", error);
  }
}

export function getStoredHomeGymId(userId: string) {
  return getStoredHomePreferences(userId)?.gymId ?? null;
}

export function storeHomeGymId(userId: string, gymId: string) {
  storeHomePreferences({
    userId,
    gymId,
  });
}

type UseHomePreferencesParams = {
  userId?: string | null;
  defaultGymId?: string;
  defaultDuration?: number;
};

export function useHomePreferences({
  userId,
  defaultGymId = DEFAULT_GYM_ID,
  defaultDuration = DEFAULT_DURATION,
}: UseHomePreferencesParams) {
  const safeDefaultDuration = useMemo(
    () => clampDuration(defaultDuration),
    [defaultDuration],
  );

  const [selectedDuration, setSelectedDuration] = useState(safeDefaultDuration);
  const [durationInput, setDurationInput] = useState(
    String(safeDefaultDuration),
  );
  const [selectedGymId, setSelectedGymId] = useState(defaultGymId);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);

  useEffect(() => {
    // Ingen användare ännu: använd rena defaults.
    if (!userId) {
      setSelectedDuration(safeDefaultDuration);
      setDurationInput(String(safeDefaultDuration));
      setSelectedGymId(defaultGymId);
      setHasLoadedPreferences(true);
      return;
    }

    setHasLoadedPreferences(false);

    try {
      const stored = getStoredHomePreferences(userId);

      if (!stored) {
        setSelectedDuration(safeDefaultDuration);
        setDurationInput(String(safeDefaultDuration));
        setSelectedGymId(defaultGymId);
        return;
      }

      const nextDuration = stored.duration ?? safeDefaultDuration;
      const nextGymId = stored.gymId ?? defaultGymId;
      setSelectedDuration(nextDuration);
      setDurationInput(String(nextDuration));
      setSelectedGymId(nextGymId);
    } catch {
      setSelectedDuration(safeDefaultDuration);
      setDurationInput(String(safeDefaultDuration));
      setSelectedGymId(defaultGymId);
    } finally {
      setHasLoadedPreferences(true);
    }
  }, [defaultGymId, safeDefaultDuration, userId]);

  useEffect(() => {
    // Spara inte förrän vi säkert har laddat initial state.
    if (!userId || !hasLoadedPreferences) {
      return;
    }

    try {
      storeHomePreferences({
        userId,
        duration: selectedDuration,
        gymId: selectedGymId,
      });
    } catch {
      // Preferences är bara en bekvämlighet och får inte krascha sidan.
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

  function resetToDefaults() {
    setSelectedDuration(safeDefaultDuration);
    setDurationInput(String(safeDefaultDuration));
    setSelectedGymId(defaultGymId);
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
    resetToDefaults,
  };
}
