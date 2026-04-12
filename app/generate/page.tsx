"use client";

// Enkel fallback-generator för pass.
// Den används när vi snabbt vill skapa ett pass utifrån valt gym och tid.
// Sprint 1:
// - Workout använder nu blocks i stället för platt exercises-lista
// - Vi behåller samma UI och samma grundbeteende
// - Strukturen gör det lättare att senare lägga till cirkelträning

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { saveGeneratedWorkout } from "../../lib/workout-storage";
import type { Exercise, Workout } from "../../types/workout";

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
  type: EquipmentType,
) {
  return !!equipment?.some((item) => item.equipment_type === type);
}

function buildWorkoutName(duration: number, gymName?: string) {
  if (gymName) return `${gymName} ${duration} min`;
  return `Träningspass ${duration} min`;
}

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
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
        const session: SessionData | null = sessionRaw
          ? JSON.parse(sessionRaw)
          : null;

        const duration = session?.duration ?? 15;
        const selectedGymId = session?.gym ?? "bodyweight";

        let selectedGym: ApiGym | null = null;
        let equipment: ApiGymEquipment[] = [];

        if (selectedGymId !== "bodyweight") {
          const res = await fetch(
            `/api/gyms?userId=${encodeURIComponent(userId)}`,
            { cache: "no-store" },
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

        let exercises: Exercise[];

        if (selectedGymId === "bodyweight") {
          exercises = [
            {
              id: createId(),
              name: "Knäböj",
              sets: 3,
              reps: 12,
              rest: 45,
            },
            {
              id: createId(),
              name: "Armhävningar",
              sets: 3,
              reps: 8,
              rest: 45,
            },
            {
              id: createId(),
              name: "Utfall bakåt",
              sets: 2,
              reps: 10,
              rest: 45,
            },
          ];
        } else if (hasBarbell && hasBench) {
          exercises = [
            {
              id: createId(),
              name: "Knäböj med skivstång",
              sets: 3,
              reps: 8,
              rest: 60,
            },
            {
              id: createId(),
              name: "Bänkpress",
              sets: 3,
              reps: 8,
              rest: 60,
            },
            {
              id: createId(),
              name: "Rodd med skivstång",
              sets: 3,
              reps: 10,
              rest: 60,
            },
          ];
        } else if (hasDumbbells) {
          exercises = [
            {
              id: createId(),
              name: "Goblet squat",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: createId(),
              name: "Hantelrodd",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: createId(),
              name: "Hantelpress",
              sets: 3,
              reps: 10,
              rest: 45,
            },
          ];
        } else if (hasKettlebell) {
          exercises = [
            {
              id: createId(),
              name: "Kettlebell squat",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: createId(),
              name: "Kettlebell swing",
              sets: 3,
              reps: 15,
              rest: 45,
            },
            {
              id: createId(),
              name: "Enarms kettlebell press",
              sets: 3,
              reps: 8,
              rest: 45,
            },
          ];
        } else if (hasRings) {
          exercises = [
            {
              id: createId(),
              name: "Ringrodd",
              sets: 3,
              reps: 8,
              rest: 45,
            },
            {
              id: createId(),
              name: "Armhävningar",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: createId(),
              name: "Bulgariska split squats",
              sets: 3,
              reps: 8,
              rest: 45,
            },
          ];
        } else if (hasCable) {
          exercises = [
            {
              id: createId(),
              name: "Kabelrodd",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: createId(),
              name: "Kabelpress",
              sets: 3,
              reps: 10,
              rest: 45,
            },
            {
              id: createId(),
              name: "Kabel squat",
              sets: 3,
              reps: 12,
              rest: 45,
            },
          ];
        } else if (hasBands) {
          exercises = [
            {
              id: createId(),
              name: "Bandrodd",
              sets: 3,
              reps: 12,
              rest: 45,
            },
            {
              id: createId(),
              name: "Bandpress",
              sets: 3,
              reps: 12,
              rest: 45,
            },
            {
              id: createId(),
              name: "Band squat",
              sets: 3,
              reps: 15,
              rest: 45,
            },
          ];
        } else {
          exercises = [
            {
              id: createId(),
              name: "Knäböj",
              sets: 3,
              reps: 12,
              rest: 45,
            },
            {
              id: createId(),
              name: "Armhävningar",
              sets: 3,
              reps: 8,
              rest: 45,
            },
            {
              id: createId(),
              name: "Höftlyft",
              sets: 3,
              reps: 12,
              rest: 45,
            },
          ];
        }

        const workout: Workout = {
          id: createId(),
          name: buildWorkoutName(duration, selectedGym?.name),
          duration,
          gym: selectedGymId,
          goal: "fitness",
          createdAt: new Date().toISOString(),
          blocks: [
            {
              type: "straight_sets",
              title: "Huvuddel",
              exercises,
            },
          ],
        };

        saveGeneratedWorkout(userId, workout);
        router.replace("/workout/preview");
      } catch (err) {
        console.error("Generate failed:", err);
        setError(
          err instanceof Error
            ? `Kunde inte skapa träningspass: ${err.message}`
            : "Kunde inte skapa träningspass.",
        );
      }
    };

    void run();
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-8 sm:px-6">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Skapar pass...</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Vi sätter ihop ett träningspass utifrån dina val.
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}