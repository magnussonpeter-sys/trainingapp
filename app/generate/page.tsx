"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveGeneratedWorkout } from "../../lib/workout-storage";
import type { Workout } from "../../types/workout";

type EquipmentType =
  | "dumbbell"
  | "barbell"
  | "bench"
  | "rack"
  | "kettlebell"
  | "machine"
  | "cable"
  | "bands"
  | "rings"
  | "bodyweight"
  | "other";

type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
};

type ApiGymEquipment = {
  id: number;
  gym_id: number;
  equipment_type: EquipmentType;
  label: string;
  notes?: string | null;
  weights_kg?: number[] | null;
  band_level?: "light" | "medium" | "heavy" | null;
  quantity?: number | null;
};

type ApiGym = {
  id: number;
  name: string;
  equipment?: ApiGymEquipment[] | null;
};

type SessionData = {
  duration?: number;
  gym?: string;
};

function hasEquipment(
  equipment: ApiGymEquipment[] | undefined,
  type: EquipmentType
) {
  return !!equipment?.some((item) => item.equipment_type === type);
}

function buildWorkoutName(duration: number, gymName?: string) {
  if (gymName) return `${gymName} ${duration} min`;
  return `Träningspass ${duration} min`;
}

export default function GeneratePage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const authRes = await fetch("/api/auth/me", { cache: "no-store" });
        const authData = await authRes.json();

        if (!authRes.ok || !authData?.ok || !authData.user) {
          router.replace("/");
          return;
        }

        const authUser = authData.user as AuthUser;
        const userId = String(authUser.id);

        const sessionRaw = localStorage.getItem("session");
        const session: SessionData | null = sessionRaw ? JSON.parse(sessionRaw) : null;

        const duration = session?.duration ?? 15;
        const selectedGymId = session?.gym ?? "bodyweight";

        const makeId = () =>
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);

        let selectedGym: ApiGym | null = null;
        let equipment: ApiGymEquipment[] = [];

        if (selectedGymId !== "bodyweight") {
          const res = await fetch(
            `/api/gyms?userId=${encodeURIComponent(userId)}`,
            { cache: "no-store" }
          );

          const data = await res.json();

          if (!res.ok || !data?.ok) {
            throw new Error(data?.error || "Kunde inte hämta gym");
          }

          const gyms: ApiGym[] = Array.isArray(data.gyms) ? data.gyms : [];
          selectedGym =
            gyms.find((gym) => String(gym.id) === String(selectedGymId)) ?? null;

          if (!selectedGym) {
            throw new Error("Valt gym kunde inte hittas");
          }

          equipment = Array.isArray(selectedGym.equipment)
            ? selectedGym.equipment
            : [];
        }

        const hasDumbbells = hasEquipment(equipment, "dumbbell");
        const hasBarbell = hasEquipment(equipment, "barbell");
        const hasKettlebell = hasEquipment(equipment, "kettlebell");
        const hasBands = hasEquipment(equipment, "bands");
        const hasRings = hasEquipment(equipment, "rings");
        const hasBench = hasEquipment(equipment, "bench");
        const hasCable = hasEquipment(equipment, "cable");

        let exercises: Workout["exercises"];

        if (selectedGymId === "bodyweight") {
          exercises = [
            {
              id: makeId(),
              name: "Knäböj",
              sets: 3,
              reps: 12,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Armhävningar",
              sets: 3,
              reps: 8,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Utfall bakåt",
              sets: 2,
              reps: 10,
              rest: 45,
            },
          ];
        } else if (hasBarbell && hasBench) {
          exercises = [
            {
              id: makeId(),
              name: "Knäböj med skivstång",
              sets: 3,
              reps: 8,
              rest: 60,
            },
            {
              id: makeId(),
              name: "Bänkpress",
              sets: 3,
              reps: 8,
              rest: 60,
            },
            {
              id: makeId(),
              name: "Rodd med skivstång",
              sets: 3,
              reps: 10,
              rest: 60,
            },
          ];
        } else if (hasDumbbells) {
          exercises = [
            {
              id: makeId(),
              name: "Goblet squat",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Hantelrodd",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Hantelpress",
              sets: 3,
              reps: 10,
              rest: 45,
            },
          ];
        } else if (hasKettlebell) {
          exercises = [
            {
              id: makeId(),
              name: "Kettlebell squat",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Kettlebell swing",
              sets: 3,
              reps: 15,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Enarms kettlebell press",
              sets: 3,
              reps: 8,
              rest: 45,
            },
          ];
        } else if (hasRings) {
          exercises = [
            {
              id: makeId(),
              name: "Ringrodd",
              sets: 3,
              reps: 8,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Armhävningar",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Bulgariska split squats",
              sets: 3,
              reps: 8,
              rest: 45,
            },
          ];
        } else if (hasCable) {
          exercises = [
            {
              id: makeId(),
              name: "Kabelrodd",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Kabelpress",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Kabel squat",
              sets: 3,
              reps: 12,
              rest: 45,
            },
          ];
        } else if (hasBands) {
          exercises = [
            {
              id: makeId(),
              name: "Bandrodd",
              sets: 3,
              reps: 12,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Bandpress",
              sets: 3,
              reps: 12,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Band squat",
              sets: 3,
              reps: 15,
              rest: 45,
            },
          ];
        } else {
          exercises = [
            {
              id: makeId(),
              name: "Knäböj",
              sets: 3,
              reps: 12,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Armhävningar",
              sets: 3,
              reps: 8,
              rest: 45,
            },
            {
              id: makeId(),
              name: "Höftlyft",
              sets: 3,
              reps: 12,
              rest: 45,
            },
          ];
        }

        const workout: Workout = {
          id: makeId(),
          name: buildWorkoutName(duration, selectedGym?.name),
          duration,
          gym: selectedGymId,
          goal: "fitness",
          createdAt: new Date().toISOString(),
          exercises,
        };

        saveGeneratedWorkout(userId, workout);
        router.replace("/workout/preview");
      } catch (err) {
        console.error("Generate failed:", err);

        setError(
          err instanceof Error
            ? `Kunde inte skapa träningspass: ${err.message}`
            : "Kunde inte skapa träningspass."
        );
      }
    };

    void run();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm text-center">
        <h1 className="text-lg font-semibold">Skapar pass...</h1>
        <p className="mt-2 text-sm text-gray-600">
          Vi sätter ihop ett träningspass utifrån dina val.
        </p>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}