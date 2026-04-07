"use client";

import { useEffect, useState } from "react";
import {
  getWorkoutLogs,
  type WorkoutLog,
} from "@/lib/workout-log-storage";
import {
  resetStaleSyncingItems,
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

export type HomeGym = {
  id: string | number;
  name: string;
};

export type HomeGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

export type HomeUserSettings = {
  training_goal?: HomeGoal | null;
};

// Håller gym-listan robust även om API-formatet varierar lite.
function normalizeGyms(data: unknown): HomeGym[] {
  if (Array.isArray(data)) {
    return data
      .filter(
        (item): item is { id: string | number; name: string } =>
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          "name" in item &&
          (typeof (item as { id: unknown }).id === "string" ||
            typeof (item as { id: unknown }).id === "number") &&
          typeof (item as { name: unknown }).name === "string",
      )
      .map((gym) => ({
        id: gym.id,
        name: gym.name,
      }));
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

  useEffect(() => {
    let isMounted = true;

    async function loadHome() {
      try {
        setPageError(null);

        // Börja alltid med aktuell användare.
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

        // Om något tidigare fastnat i syncing återställs det först.
        resetStaleSyncingItems();

        // Försök synka offline-kön innan vi hämtar loggarna.
        // Då hinner nyligen avslutade offline-pass komma in i historiken.
        try {
          const syncResult = await syncPendingWorkoutQueue();
          console.log("Home pending sync result:", syncResult);
        } catch (error) {
          console.error("Kunde inte synka pending queue på home:", error);
        }

        // Home behöver bara gym, settings och senaste loggar.
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
          setGyms(normalizeGyms(gymsData));
        }

        if (settingsRes.ok && settingsData?.ok) {
          setSettings(settingsData.settings ?? null);
        }

        // Läs historik från API efter att sync-försök redan gjorts.
        try {
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
            throw new Error(
              logsData?.error || "Kunde inte hämta träningshistorik",
            );
          }

          if (!isMounted) {
            return;
          }

          setWorkoutLogs(logsData.logs);
          setLogsSource("api");
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

    // Kör en extra sync när nätet kommer tillbaka medan användaren redan är på home.
    async function handleOnline() {
      try {
        const result = await syncPendingWorkoutQueue();
        console.log("Online sync result:", result);
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