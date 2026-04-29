"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import StickyActionBar from "@/components/app-shell/sticky-action-bar";
import {
  BODYWEIGHT_GYM_ID,
  buildWorkoutFromBuilder,
  buildWorkoutSummary,
  cloneBlocks,
  createId,
} from "@/lib/custom-workout-builder-utils";
import {
  getSavedCustomWorkouts,
  removeSavedCustomWorkout,
  upsertSavedCustomWorkout,
  type SavedCustomWorkout,
} from "@/lib/custom-workout-library-storage";
import type { Gym } from "@/lib/gyms";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { saveActiveWorkout } from "@/lib/workout-storage";

type AuthUser = {
  id: number | string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getBodyweightGym(userId: string): Gym {
  return {
    id: BODYWEIGHT_GYM_ID,
    user_id: userId,
    name: "Kroppsvikt / utan gym",
    description: null,
    is_shared: false,
    equipment: [
      {
        id: "bodyweight",
        gym_id: BODYWEIGHT_GYM_ID,
        equipment_type: "bodyweight",
        label: "Kroppsvikt",
      },
    ],
  };
}

function normalizeGym(gym: Gym): Gym {
  return {
    ...gym,
    id: String(gym.id),
    user_id: String(gym.user_id),
    equipment: Array.isArray(gym.equipment)
      ? gym.equipment.map((item) => ({
          ...item,
          id: String(item.id),
          gym_id: String(item.gym_id),
        }))
      : [],
  };
}

export default function CustomWorkoutLibraryPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedCustomWorkout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      try {
        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        const authData = await authRes.json().catch(() => null);

        if (
          !authRes.ok ||
          !authData ||
          typeof authData !== "object" ||
          !("user" in authData) ||
          !(authData as { user?: unknown }).user
        ) {
          router.replace("/");
          return;
        }

        const user = (authData as { user: AuthUser }).user;
        const userId = String(user.id);
        const gymsRes = await fetch(`/api/gyms?userId=${encodeURIComponent(userId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const gymsData = await gymsRes.json().catch(() => null);
        const fetchedGyms =
          gymsRes.ok && gymsData?.ok && Array.isArray(gymsData.gyms)
            ? (gymsData.gyms as Gym[])
            : [];

        if (!isMounted) {
          return;
        }

        setAuthUser(user);
        setGyms([getBodyweightGym(userId), ...fetchedGyms.map(normalizeGym)]);
        setSavedWorkouts(getSavedCustomWorkouts(userId));
      } catch (loadError) {
        console.error("Failed to load custom workout library", loadError);
        router.replace("/");
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const workoutCards = useMemo(() => {
    return savedWorkouts.map((savedWorkout) => ({
      workout: savedWorkout,
      summary: buildWorkoutSummary(savedWorkout.blocks, savedWorkout.targetDurationMinutes),
    }));
  }, [savedWorkouts]);

  function editSavedWorkout(savedWorkoutId: string) {
    router.push(`/workout/custom/builder?id=${encodeURIComponent(savedWorkoutId)}`);
  }

  function copySavedWorkout(savedWorkout: SavedCustomWorkout) {
    if (!authUser) {
      return;
    }

    const duplicatedWorkout: SavedCustomWorkout = {
      ...savedWorkout,
      id: createId(),
      name: `${savedWorkout.name} kopia`,
      blocks: cloneBlocks(savedWorkout.blocks),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextSavedWorkouts = upsertSavedCustomWorkout(String(authUser.id), duplicatedWorkout);
    setSavedWorkouts(nextSavedWorkouts);
    setMessage(`"${duplicatedWorkout.name}" sparades som kopia.`);
    setError(null);
  }

  function deleteSavedWorkout(savedWorkoutId: string) {
    if (!authUser) {
      return;
    }

    const confirmed = window.confirm("Ta bort det här sparade passet?");
    if (!confirmed) {
      return;
    }

    const nextSavedWorkouts = removeSavedCustomWorkout(String(authUser.id), savedWorkoutId);
    setSavedWorkouts(nextSavedWorkouts);
    setMessage("Passet togs bort.");
    setError(null);
  }

  function runSavedWorkout(savedWorkout: SavedCustomWorkout) {
    if (!authUser) {
      return;
    }

    const matchingGym =
      gyms.find((gym) => gym.id === savedWorkout.gymId) ??
      (savedWorkout.gymId === BODYWEIGHT_GYM_ID
        ? gyms.find((gym) => gym.id === BODYWEIGHT_GYM_ID) ?? null
        : null);
    const workout = buildWorkoutFromBuilder({
      name: savedWorkout.name,
      targetDurationMinutes: savedWorkout.targetDurationMinutes,
      selectedGym: matchingGym,
      blocks: cloneBlocks(savedWorkout.blocks),
    });

    saveActiveWorkout(String(authUser.id), workout);
    router.push(`/workout/run?userId=${encodeURIComponent(String(authUser.id))}`);
  }

  if (!authChecked) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-600">Laddar dina egna pass...</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, "pb-28")}>
        <div className="space-y-5">
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Eget pass
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Mina egna pass
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Välj ett sparat pass att köra eller redigera. Buildern ligger separat så att det
              blir tydligt när du arbetar med ett pass just nu.
            </p>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {message}
              </div>
            ) : null}
          </section>

          {workoutCards.length === 0 ? (
            <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
              <h2 className="text-lg font-semibold text-slate-950">Inga sparade pass ännu</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Skapa ditt första egna pass i buildern och spara det här för att kunna köra det
                senare.
              </p>
              <Link
                href="/workout/custom/builder?mode=new"
                className={cn(uiButtonClasses.primary, "mt-4 inline-flex")}
              >
                Nytt pass
              </Link>
            </section>
          ) : (
            <section className="space-y-4">
              {workoutCards.map(({ workout, summary }) => (
                <article
                  key={workout.id}
                  className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                          {summary.blockCount} block
                        </span>
                        <span className="text-xs text-slate-400">
                          Uppdaterat {new Date(workout.updatedAt).toLocaleDateString("sv-SE")}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950">{workout.name}</h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {summary.exerciseCount} övningar · {summary.estimatedMinutes} min
                        {workout.gymName ? ` · ${workout.gymName}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => runSavedWorkout(workout)}
                      className={cn(uiButtonClasses.primary, "px-3 py-2 text-xs")}
                    >
                      Kör pass
                    </button>
                    <button
                      type="button"
                      onClick={() => editSavedWorkout(workout.id)}
                      className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
                    >
                      Redigera
                    </button>
                    <button
                      type="button"
                      onClick={() => copySavedWorkout(workout)}
                      className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
                    >
                      Kopiera
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedWorkout(workout.id)}
                      className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                    >
                      Ta bort
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      </div>

      <StickyActionBar>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className={cn(uiButtonClasses.secondary, "sm:flex-1")}
          >
            Till hem
          </button>
          <Link href="/workout/custom/builder?mode=new" className={cn(uiButtonClasses.primary, "sm:flex-1")}>
            Nytt pass
          </Link>
        </div>
      </StickyActionBar>
    </main>
  );
}
