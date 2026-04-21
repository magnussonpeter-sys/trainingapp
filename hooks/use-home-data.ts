"use client";

// Home-data-hook.
// Viktigt i denna version:
// - behåller gymmens equipment-data
// - fortsatt kompatibel med home-sidan
// - påverkar AI-pass så rätt gymutrustning faktiskt skickas vidare

import { useEffect, useRef, useState } from "react";

import {
  getWorkoutLogs,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import { getCachedHomeSettings, saveCachedHomeSettings } from "@/lib/home-settings-cache";
import {
  syncPendingWorkoutQueue,
} from "@/lib/workout-flow/pending-sync-service";

export type HomeAuthUser = {
  id: number | string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  displayName?: string | null;
  role?: "user" | "admin";
  status?: "active" | "disabled";
};

export type HomeGymEquipmentItem = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  name?: string | null;
  type?: string | null;
};

export type HomeGym = {
  id: string | number;
  name: string;
  equipment?: HomeGymEquipmentItem[];
};

export type HomeGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

export type HomePriorityMuscle =
  | "chest"
  | "back"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "calves"
  | "core";

export type HomeUserSettings = {
  experience_level?: "beginner" | "novice" | "intermediate" | "advanced" | null;
  training_goal?: HomeGoal | null;
  avoid_supersets?: boolean | null;
  superset_preference?: "allowed" | "avoid_all" | "avoid_all_dumbbell" | null;
  primary_priority_muscle?: HomePriorityMuscle | null;
  secondary_priority_muscle?: HomePriorityMuscle | null;
  tertiary_priority_muscle?: HomePriorityMuscle | null;
};

function mergeWorkoutLogs(apiLogs: WorkoutLog[], localLogs: WorkoutLog[]) {
  const merged = [...apiLogs];
  const seen = new Set(
    apiLogs.map((log) => `${log.workoutName}:${log.completedAt}:${log.status}`),
  );

  for (const log of localLogs) {
    const key = `${log.workoutName}:${log.completedAt}:${log.status}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(log);
  }

  return merged.sort(
    (left, right) =>
      new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime(),
  );
}

// Normaliserar gyms utan att tappa equipment.
function normalizeGyms(data: unknown): HomeGym[] {
  if (Array.isArray(data)) {
    return data
      .filter(
        (
          item,
        ): item is {
          id: string | number;
          name: string;
          equipment?: unknown;
        } =>
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          "name" in item &&
          (typeof (item as { id: unknown }).id === "string" ||
            typeof (item as { id: unknown }).id === "number") &&
          typeof (item as { name: unknown }).name === "string",
      )
      .map((gym) => {
        const rawEquipment = Array.isArray(gym.equipment)
          ? gym.equipment
          : [];

        const equipment = rawEquipment.filter(
          (item): item is HomeGymEquipmentItem =>
            typeof item === "object" && item !== null,
        );

        return {
          id: gym.id,
          name: gym.name,
          equipment,
        };
      });
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "gyms" in data &&
    Array.isArray((data as { gyms?: unknown }).gyms)
  ) {
    return normalizeGyms((data as { gyms: unknown[] }).gyms);
  }

  return [];
}

type UseHomeDataParams = {
  router: {
    replace: (href: string) => void;
  };
};

export function useHomeData({ router }: UseHomeDataParams) {
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<HomeAuthUser | null>(null);
  const [gyms, setGyms] = useState<HomeGym[]>([]);
  const [settings, setSettings] = useState<HomeUserSettings | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [logsSource, setLogsSource] = useState<"api" | "local">("api");
  const [isLoadingGyms, setIsLoadingGyms] = useState(false);
  const [gymError, setGymError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Skyddar mot dubbla syncar under samma mount.
  const hasRunInitialSyncRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function loadHome() {
      try {
        setPageError(null);

        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const authData = (await authRes.json().catch(() => null)) as
          | { ok?: boolean; user?: HomeAuthUser | null }
          | null;

        if (!authRes.ok || !authData?.user) {
          router.replace("/");
          return;
        }

        const user = authData.user;
        const userId = String(user.id);

        if (!isMounted) {
          return;
        }

        setAuthUser(user);
        setAuthChecked(true);
        setIsLoadingGyms(true);
        setGymError(null);

        // Lokal cache gör att nytt mål kan slå igenom direkt när användaren
        // kommer tillbaka från settings innan nätanropet hunnit bli klart.
        const cachedSettings = getCachedHomeSettings(userId);
        if (cachedSettings) {
          setSettings((previous) => ({
            ...previous,
            ...cachedSettings,
          }));
        }

        // Kör pending sync en gång per mount.
        if (!hasRunInitialSyncRef.current) {
          hasRunInitialSyncRef.current = true;

          try {
            await syncPendingWorkoutQueue();
          } catch (error) {
            console.error("Kunde inte synka pending queue på home:", error);
          }
        }

        const [gymsRes, settingsRes] = await Promise.all([
          fetch(`/api/gyms?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(`/api/user-settings?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
            credentials: "include",
          }),
        ]);

        const gymsData = (await gymsRes.json().catch(() => null)) as unknown;

        const settingsData = (await settingsRes.json().catch(() => null)) as
          | { ok?: boolean; settings?: HomeUserSettings | null; error?: string }
          | null;

        if (!isMounted) {
          return;
        }

        if (!gymsRes.ok) {
          const apiMessage =
            typeof gymsData === "object" &&
            gymsData !== null &&
            "error" in gymsData &&
            typeof (gymsData as { error?: unknown }).error === "string"
              ? (gymsData as { error: string }).error
              : "Kunde inte hämta gym.";

          setGymError(apiMessage);
          setGyms([]);
        } else {
          const normalizedGyms = normalizeGyms(gymsData);
          setGyms(normalizedGyms);
        }

        if (settingsRes.ok && settingsData?.ok) {
          const nextSettings = settingsData.settings ?? null;
          setSettings(nextSettings);

          if (nextSettings) {
            saveCachedHomeSettings(userId, {
              training_goal: nextSettings.training_goal ?? null,
              avoid_supersets:
                typeof nextSettings.avoid_supersets === "boolean"
                  ? nextSettings.avoid_supersets
                  : null,
              superset_preference:
                nextSettings.superset_preference === "allowed" ||
                nextSettings.superset_preference === "avoid_all" ||
                nextSettings.superset_preference === "avoid_all_dumbbell"
                  ? nextSettings.superset_preference
                  : null,
              primary_priority_muscle:
                typeof nextSettings.primary_priority_muscle === "string"
                  ? (nextSettings.primary_priority_muscle as HomePriorityMuscle)
                  : null,
              secondary_priority_muscle:
                typeof nextSettings.secondary_priority_muscle === "string"
                  ? (nextSettings.secondary_priority_muscle as HomePriorityMuscle)
                  : null,
              tertiary_priority_muscle:
                typeof nextSettings.tertiary_priority_muscle === "string"
                  ? (nextSettings.tertiary_priority_muscle as HomePriorityMuscle)
                  : null,
            });
          }
        }

        try {
          const localLogs = getWorkoutLogs(userId);
          const logsRes = await fetch(
            `/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=12`,
            {
              cache: "no-store",
              credentials: "include",
            },
          );

          const logsData = (await logsRes.json().catch(() => null)) as
            | { ok?: boolean; logs?: WorkoutLog[]; error?: string }
            | null;

          if (!logsRes.ok || !logsData?.ok || !Array.isArray(logsData.logs)) {
            throw new Error(logsData?.error || "Kunde inte hämta träningshistorik");
          }

          if (!isMounted) {
            return;
          }

          const apiLogs = logsData.logs;
          const mergedLogs = mergeWorkoutLogs(apiLogs, localLogs);

          setWorkoutLogs(mergedLogs);
          setLogsSource(apiLogs.length > 0 ? "api" : localLogs.length > 0 ? "local" : "api");
        } catch (error) {
          console.error("Kunde inte hämta loggar från API:", error);

          if (!isMounted) {
            return;
          }

          setWorkoutLogs(getWorkoutLogs(userId));
          setLogsSource("local");
        }
      } catch (error) {
        console.error("Kunde inte ladda home:", error);

        if (!isMounted) {
          return;
        }

        setPageError("Kunde inte ladda startsidan.");
      } finally {
        if (isMounted) {
          setIsLoadingGyms(false);
          setAuthChecked(true);
        }
      }
    }

    void loadHome();

    async function handleOnline() {
      try {
        await syncPendingWorkoutQueue();
      } catch (error) {
        console.error("Kunde inte köra online-sync:", error);
      }
    }

    window.addEventListener("online", handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
    };
  }, [router]);

  return {
    authChecked,
    authUser,
    gyms,
    settings,
    workoutLogs,
    logsSource,
    isLoadingGyms,
    gymError,
    pageError,
    setPageError,
  };
}
