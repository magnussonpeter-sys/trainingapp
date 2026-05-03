"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createExerciseFromCatalogItem } from "@/lib/custom-workout-builder-utils";
import {
  getAvailableExercises,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import { normalizeEquipmentIdList } from "@/lib/equipment";
import type { Gym } from "@/lib/gyms";
import {
  getActiveWorkoutSessionDraft,
  saveActiveWorkoutSessionDraft,
} from "@/lib/active-workout-session-storage";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { applyExerciseProgression } from "@/lib/workout-flow/exercise-progression";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  getWorkoutDraft,
  saveWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import { getActiveWorkout, saveActiveWorkout } from "@/lib/workout-storage";
import type { Exercise, Workout, WorkoutBlock } from "@/types/workout";

type WorkoutWithMetadata = Workout & {
  availableEquipment?: string[];
  equipment?: string[];
  equipmentList?: string[];
  gymEquipment?: string[];
};

type AuthUser = {
  id?: string | number | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function resolveLocalFallbackUserId() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const storage = window.localStorage;
    const prefixes = [
      "active_workout_session:",
      "workout_draft:",
      "active_workout:",
    ];

    for (const prefix of prefixes) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && key.startsWith(prefix)) {
          return key.slice(prefix.length);
        }
      }
    }
  } catch {
    return "";
  }

  return "";
}

function createBodyweightGym(userId: string): Gym {
  return {
    id: "bodyweight",
    user_id: userId,
    name: "Kroppsvikt / utan gym",
    description: null,
    is_shared: false,
    equipment: [
      {
        id: "bodyweight",
        gym_id: "bodyweight",
        equipment_type: "bodyweight",
        label: "Kroppsvikt",
      },
    ],
  };
}

function getWorkoutEquipment(workout: WorkoutWithMetadata) {
  const rawEquipment = [
    ...(workout.availableEquipment ?? []),
    ...(workout.equipment ?? []),
    ...(workout.equipmentList ?? []),
    ...(workout.gymEquipment ?? []),
  ];

  return normalizeEquipmentIdList(rawEquipment, {
    includeBodyweightFallback: true,
  });
}

function getBlockLetter(index: number) {
  return String.fromCharCode(65 + Math.max(0, index));
}

function formatBlockLabel(block: WorkoutBlock, index: number) {
  if (block.type === "superset") {
    return block.title?.trim() || `Superset ${getBlockLetter(index)}`;
  }

  if (block.type === "circuit") {
    return block.title?.trim() || `Circuit ${index + 1}`;
  }

  return block.title?.trim() || `Block ${index + 1}`;
}

function formatExerciseTarget(exercise: Exercise) {
  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    return `${exercise.duration} s`;
  }

  if (typeof exercise.reps === "number" && exercise.reps > 0) {
    return `${exercise.reps} reps`;
  }

  return "egen målvolym";
}

function getFlattenedExerciseEntries(workout: Workout) {
  const entries: Array<{ blockIndex: number; exerciseIndex: number; exercise: Exercise }> = [];

  workout.blocks.forEach((block, blockIndex) => {
    block.exercises.forEach((exercise, exerciseIndex) => {
      entries.push({ blockIndex, exerciseIndex, exercise });
    });
  });

  return entries;
}

export default function ReplaceBlockPageClient(props: {
  initialUserId: string;
  initialBlockIndex: string;
}) {
  const router = useRouter();

  const [resolvedUserId, setResolvedUserId] = useState("");
  const [workout, setWorkout] = useState<WorkoutWithMetadata | null>(null);
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [draftExercises, setDraftExercises] = useState<Exercise[]>([]);
  const [lockedExerciseIds, setLockedExerciseIds] = useState<string[]>([]);

  const blockIndex = Number(props.initialBlockIndex || "0");

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        const data = (await response.json().catch(() => null)) as
          | { user?: AuthUser | null }
          | null;
        const authUserId =
          data?.user?.id !== undefined && data.user?.id !== null
            ? String(data.user.id)
            : "";

        if (!isMounted) {
          return;
        }

        setResolvedUserId(props.initialUserId || authUserId || resolveLocalFallbackUserId());
      } catch {
        if (!isMounted) {
          return;
        }

        setResolvedUserId(props.initialUserId || resolveLocalFallbackUserId());
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [props.initialUserId]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!resolvedUserId) {
        setLoading(false);
        setError("Kunde inte hitta pågående pass.");
        return;
      }

      try {
        const storedWorkout = (normalizePreviewWorkout(
          getActiveWorkout(resolvedUserId) ?? getWorkoutDraft(resolvedUserId),
        ) as WorkoutWithMetadata | null);

        if (!storedWorkout?.blocks?.length) {
          if (!cancelled) {
            setWorkout(null);
            setLoading(false);
            setError("Inget pågående pass hittades.");
          }
          return;
        }

        const targetBlock = storedWorkout.blocks[blockIndex];
        if (!targetBlock || targetBlock.exercises.length === 0) {
          if (!cancelled) {
            setWorkout(null);
            setLoading(false);
            setError("Kunde inte hitta blocket du vill ändra.");
          }
          return;
        }

        if (!cancelled) {
          setWorkout(storedWorkout);
          setDraftExercises(targetBlock.exercises);
        }

        const sessionDraft = getActiveWorkoutSessionDraft(resolvedUserId);
        const startedExerciseIds = new Set(
          (sessionDraft?.completedExercises ?? [])
            .filter((exercise) => exercise.sets.length > 0)
            .map((exercise) => exercise.exerciseId),
        );
        const flattenedEntries = getFlattenedExerciseEntries(storedWorkout);
        const currentEntry = sessionDraft
          ? flattenedEntries[sessionDraft.currentExerciseIndex] ?? null
          : null;

        const nextLockedExerciseIds = targetBlock.exercises
          .filter((exercise, exerciseIndex) => {
            if (startedExerciseIds.has(exercise.id)) {
              return true;
            }

            // Superset tillåter inte blockbyte mitt i blocket för att skydda sekvensen.
            if (targetBlock.type === "superset") {
              return true;
            }

            return (
              currentEntry?.blockIndex === blockIndex &&
              currentEntry.exerciseIndex === exerciseIndex &&
              startedExerciseIds.has(currentEntry.exercise.id)
            );
          })
          .map((exercise) => exercise.id);

        const firstReplaceableIndex = targetBlock.exercises.findIndex(
          (exercise) => !nextLockedExerciseIds.includes(exercise.id),
        );

        if (!cancelled) {
          setLockedExerciseIds(nextLockedExerciseIds);
          setSelectedSlotIndex(firstReplaceableIndex >= 0 ? firstReplaceableIndex : 0);
        }

        if (storedWorkout.gym) {
          try {
            const response = await fetch("/api/gyms", { cache: "no-store" });
            const gyms = (await response.json().catch(() => [])) as Gym[];
            const matchedGym =
              gyms.find((gym) => String(gym.id) === String(storedWorkout.gym)) ?? null;

            if (!cancelled) {
              setSelectedGym(matchedGym);
            }
          } catch {
            if (!cancelled) {
              setSelectedGym(null);
            }
          }
        } else if (!cancelled) {
          setSelectedGym(createBodyweightGym(resolvedUserId));
        }

        if (!cancelled) {
          setLoading(false);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError("Kunde inte läsa in blockbytet.");
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [blockIndex, resolvedUserId]);

  const block = workout?.blocks?.[blockIndex] ?? null;
  const availableEquipment = useMemo(() => {
    if (!workout) {
      return ["bodyweight"];
    }

    const equipment = getWorkoutEquipment(workout);
    return equipment.length > 0 ? equipment : ["bodyweight"];
  }, [workout]);
  const availableCatalogExercises = useMemo(() => {
    const items = getAvailableExercises(availableEquipment);
    const search = catalogSearch.trim().toLowerCase();

    if (!search) {
      return items;
    }

    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(search) ||
        item.description.toLowerCase().includes(search) ||
        item.primaryMuscles.some((muscle) => muscle.toLowerCase().includes(search))
      );
    });
  }, [availableEquipment, catalogSearch]);

  const currentSlotExercise = draftExercises[selectedSlotIndex] ?? null;
  const canEditCurrentSlot =
    currentSlotExercise != null &&
    !lockedExerciseIds.includes(currentSlotExercise.id);

  function handleSelectCatalogExercise(item: ExerciseCatalogItem) {
    if (!workout || !currentSlotExercise || !canEditCurrentSlot) {
      return;
    }

    const replacementBase = createExerciseFromCatalogItem(item);
    const progressedReplacement = applyExerciseProgression({
      exercise: {
        ...replacementBase,
        // Behåll set-antalet så passets upplägg inte hoppar i volym mitt i run.
        sets: currentSlotExercise.sets,
      },
      userId: resolvedUserId,
      goal: workout.goal ?? null,
      gymEquipmentItems: selectedGym?.equipment ?? [],
    });

    setDraftExercises((previous) =>
      previous.map((exercise, index) =>
        index === selectedSlotIndex ? progressedReplacement : exercise,
      ),
    );
  }

  function handleSaveAndReturn() {
    if (!workout || !block || !resolvedUserId) {
      return;
    }

    const nextBlocks = [...workout.blocks];
    const nextBlock: WorkoutBlock = {
      ...block,
      title:
        block.type === "straight_sets" && draftExercises.length === 1
          ? draftExercises[0]?.name ?? block.title
          : block.title,
      exercises: draftExercises,
    };
    nextBlocks[blockIndex] = nextBlock;

    const nextWorkout: WorkoutWithMetadata = {
      ...workout,
      blocks: nextBlocks,
    };

    saveActiveWorkout(resolvedUserId, nextWorkout);
    saveWorkoutDraft(resolvedUserId, nextWorkout);

    const sessionDraft = getActiveWorkoutSessionDraft(resolvedUserId);
    if (sessionDraft) {
      const removedExerciseIds = new Set(
        block.exercises
          .map((exercise, index) => ({ exercise, nextExercise: draftExercises[index] }))
          .filter(({ exercise, nextExercise }) => nextExercise && nextExercise.id !== exercise.id)
          .map(({ exercise }) => exercise.id),
      );
      const nextCompletedExercises = sessionDraft.completedExercises.filter(
        (exercise) => !removedExerciseIds.has(exercise.exerciseId),
      );
      const nextFeedbackQueue = sessionDraft.feedbackExerciseQueue.filter(
        (exerciseId) => !removedExerciseIds.has(exerciseId),
      );
      const nextLastWeights = Object.fromEntries(
        Object.entries(sessionDraft.lastWeightByExercise).filter(
          ([exerciseId]) => !removedExerciseIds.has(exerciseId),
        ),
      );

      // Behåll tidigare loggade delar, men nollställ aktiv övningsinput efter blockbytet.
      saveActiveWorkoutSessionDraft(resolvedUserId, {
        workoutId: sessionDraft.workoutId,
        workoutName: nextWorkout.name,
        sessionStartedAt: sessionDraft.sessionStartedAt,
        currentExerciseIndex: sessionDraft.currentExerciseIndex,
        currentSet: 1,
        lastWeightByExercise: nextLastWeights,
        setLog: {
          reps: "",
          durationSeconds: "",
          weight: "",
          completed: false,
        },
        completedExercises: nextCompletedExercises,
        showExerciseFeedback: false,
        feedbackExerciseQueue: nextFeedbackQueue,
        feedbackExerciseIndex: 0,
        selectedExtraReps: null,
        selectedTimedEffort: null,
        selectedRating: null,
        exerciseTimerElapsedSeconds: 0,
        exerciseTimerAlarmPlayed: false,
        timedSetPhase: "idle",
        showRestTimer: false,
        restTimerRunning: false,
        restDurationSeconds: draftExercises[0]?.rest ?? nextBlock.exercises[0]?.rest ?? 0,
        restRemainingSeconds: draftExercises[0]?.rest ?? nextBlock.exercises[0]?.rest ?? 0,
      });
    }

    router.replace("/workout/run");
  }

  if (loading) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            Laddar blockbyte...
          </section>
        </div>
      </main>
    );
  }

  if (!workout || !block || error) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <section
            className={cn(
              uiCardClasses.section,
              uiCardClasses.sectionPadded,
              "space-y-4",
            )}
          >
            <h1 className="text-xl font-semibold text-slate-900">
              Byt övning i block
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              {error ?? "Kunde inte läsa in blocket."}
            </p>
            <button
              type="button"
              onClick={() => router.replace("/workout/run")}
              className={uiButtonClasses.primary}
            >
              Tillbaka till passet
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, "space-y-5 pb-24")}>
        <section
          className={cn(
            uiCardClasses.section,
            uiCardClasses.sectionPadded,
            "space-y-3",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Pågående pass
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                Byt övning i block
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Byt en eller flera övningar i{" "}
                {formatBlockLabel(block, blockIndex).toLowerCase()} och hoppa
                sedan direkt tillbaka till passet.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.replace("/workout/run")}
              className={uiButtonClasses.secondary}
            >
              Avbryt
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">
              {formatBlockLabel(block, blockIndex)}
            </span>
            <span className="mx-2 text-slate-300">•</span>
            {availableEquipment.join(", ")}
          </div>
        </section>

        <section
          className={cn(
            uiCardClasses.section,
            uiCardClasses.sectionPadded,
            "space-y-3",
          )}
        >
          <h2 className="text-base font-semibold text-slate-900">
            Övningar i blocket
          </h2>

          <div className="space-y-3">
            {draftExercises.map((exercise, index) => (
              <button
                key={`${exercise.id}:${index}`}
                type="button"
                onClick={() => {
                  if (!lockedExerciseIds.includes(exercise.id)) {
                    setSelectedSlotIndex(index);
                  }
                }}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition active:scale-[0.995]",
                  selectedSlotIndex === index
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white",
                  lockedExerciseIds.includes(exercise.id)
                    ? "cursor-not-allowed opacity-65"
                    : "",
                )}
                disabled={lockedExerciseIds.includes(exercise.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      {block.type === "superset"
                        ? `Plats ${String.fromCharCode(65 + index)}`
                        : `Övning ${index + 1}`}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-900">
                      {exercise.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {exercise.sets} set • {formatExerciseTarget(exercise)}
                    </p>
                    {lockedExerciseIds.includes(exercise.id) ? (
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Redan påbörjad och kan inte bytas
                      </p>
                    ) : null}
                  </div>
                  <span className="text-slate-300">›</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section
          className={cn(
            uiCardClasses.section,
            uiCardClasses.sectionPadded,
            "space-y-4",
          )}
        >
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
              Välj ny övning
            </p>
            <h2 className="text-base font-semibold text-slate-900">
              {currentSlotExercise
                ? `Byt ut ${currentSlotExercise.name}`
                : "Välj övning"}
            </h2>
            {!canEditCurrentSlot ? (
              <p className="text-sm text-slate-500">
                Den valda övningen är redan påbörjad och kan inte bytas.
              </p>
            ) : null}
          </div>

          <input
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="Sök övning"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />

          <div className="space-y-3">
            {availableCatalogExercises.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl border p-4 transition",
                  currentSlotExercise?.id === item.id
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {item.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectCatalogExercise(item)}
                    disabled={!canEditCurrentSlot}
                    className={cn(
                      currentSlotExercise?.id === item.id
                        ? "inline-flex min-h-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800"
                        : uiButtonClasses.secondary,
                      !canEditCurrentSlot ? "cursor-not-allowed opacity-60" : "",
                    )}
                  >
                    {currentSlotExercise?.id === item.id ? "Vald" : "Välj"}
                  </button>
                </div>
              </div>
            ))}

            {availableCatalogExercises.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                Inga övningar matchade sökningen.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className={uiPageShellClasses.stickyFooter}>
        <div className={uiPageShellClasses.stickyFooterInner}>
          <button
            type="button"
            onClick={() => router.replace("/workout/run")}
            className={cn(uiButtonClasses.secondary, "flex-1")}
          >
            Tillbaka
          </button>
          <button
            type="button"
            onClick={handleSaveAndReturn}
            className={cn(uiButtonClasses.primary, "flex-1")}
          >
            Spara och fortsätt
          </button>
        </div>
      </div>
    </main>
  );
}
