"use client";

// Blockbaserad builder för egna pass.
// Håller samma grundspråk som preview/run och sparar en lätt lokal draft.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import StickyActionBar from "@/components/app-shell/sticky-action-bar";
import PreviewSupersetFlow from "@/components/preview/preview-superset-flow";
import {
  clearCustomWorkoutBuilderDraft,
  getCustomWorkoutBuilderDraft,
  saveCustomWorkoutBuilderDraft,
  type CustomWorkoutBuilderDraft,
} from "@/lib/custom-workout-builder-storage";
import {
  getSavedCustomWorkouts,
  removeSavedCustomWorkout,
  upsertSavedCustomWorkout,
  type SavedCustomWorkout,
} from "@/lib/custom-workout-library-storage";
import {
  getAvailableExercises,
  type ExerciseCatalogItem,
} from "@/lib/exercise-catalog";
import { extractEquipmentIdsFromRecords } from "@/lib/equipment";
import type { Gym } from "@/lib/gyms";
import { saveWorkoutDraft } from "@/lib/workout-flow/workout-draft-store";
import { getStoredHomeGymId, storeHomeGymId } from "@/hooks/use-home-preferences";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { saveActiveWorkout } from "@/lib/workout-storage";
import type { Exercise, Workout, WorkoutBlock } from "@/types/workout";

type AuthUser = {
  id: number | string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
};

type AddBlockKind = "single" | "superset" | "custom";
type ExerciseInputMode = "reps" | "time";

type CustomExerciseDraft = {
  name: string;
  description: string;
  mode: ExerciseInputMode;
  sets: string;
  reps: string;
  duration: string;
  rest: string;
};

type SupersetDraft = {
  firstExerciseId: string;
  secondExerciseId: string;
  rounds: string;
  restBetweenExercises: string;
  restAfterRound: string;
};

const BODYWEIGHT_GYM_ID = "bodyweight";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function toPositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.round(parsed);
}

function cloneBlocks(blocks: WorkoutBlock[]) {
  // Blocken består av serialiserbara objekt, så JSON-klon räcker här.
  return JSON.parse(JSON.stringify(blocks)) as WorkoutBlock[];
}

function getDefaultCustomExerciseDraft(): CustomExerciseDraft {
  return {
    name: "",
    description: "",
    mode: "reps",
    sets: "3",
    reps: "10",
    duration: "30",
    rest: "45",
  };
}

function getDefaultSupersetDraft(): SupersetDraft {
  return {
    firstExerciseId: "",
    secondExerciseId: "",
    rounds: "3",
    restBetweenExercises: "15",
    restAfterRound: "45",
  };
}

function estimateWorkSeconds(exercise: Exercise) {
  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    return exercise.duration;
  }

  const reps = typeof exercise.reps === "number" && exercise.reps > 0 ? exercise.reps : 10;
  return reps * 4;
}

function estimateBlockDurationMinutes(block: WorkoutBlock) {
  if (block.type === "superset" || block.type === "circuit") {
    const rounds = Math.max(1, block.rounds ?? 1);
    const exerciseWork = block.exercises.reduce((sum, exercise) => {
      return sum + estimateWorkSeconds(exercise);
    }, 0);
    const betweenExerciseRest = Math.max(
      0,
      (block.restBetweenExercises ?? 0) * Math.max(0, block.exercises.length - 1),
    );
    const roundRest = Math.max(0, block.restAfterRound ?? 0);

    return Math.max(1, Math.round((rounds * (exerciseWork + betweenExerciseRest + roundRest)) / 60));
  }

  const seconds = block.exercises.reduce((sum, exercise) => {
    return sum + exercise.sets * (estimateWorkSeconds(exercise) + Math.max(0, exercise.rest));
  }, 0);

  return Math.max(1, Math.round(seconds / 60));
}

function buildWorkoutSummary(blocks: WorkoutBlock[], targetDurationMinutes: number | null) {
  const blockCount = blocks.length;
  const exerciseCount = blocks.reduce((sum, block) => sum + block.exercises.length, 0);
  const supersetCount = blocks.filter((block) => block.type === "superset").length;
  const estimatedMinutes = blocks.reduce((sum, block) => sum + estimateBlockDurationMinutes(block), 0);

  return {
    blockCount,
    exerciseCount,
    supersetCount,
    estimatedMinutes: targetDurationMinutes ?? estimatedMinutes,
  };
}

function createExerciseFromCatalogItem(item: ExerciseCatalogItem): Exercise {
  return {
    id: item.id,
    name: item.name,
    sets: item.defaultSets,
    reps: item.defaultReps ?? undefined,
    duration: item.defaultDuration ?? undefined,
    sidedness: item.sidedness,
    ringSetup: item.ringSetup,
    rest: item.defaultRest,
    description: item.description,
    isCustom: false,
  };
}

function createExerciseFromCustomDraft(draft: CustomExerciseDraft): Exercise {
  return {
    id: `custom-${createId()}`,
    name: draft.name.trim(),
    sets: toPositiveInteger(draft.sets, 3),
    reps: draft.mode === "reps" ? toPositiveInteger(draft.reps, 10) : undefined,
    duration: draft.mode === "time" ? toPositiveInteger(draft.duration, 30) : undefined,
    rest: Math.max(0, toPositiveInteger(draft.rest, 45)),
    description: draft.description.trim() || undefined,
    isCustom: true,
    isNewExercise: true,
  };
}

function createSingleBlock(item: ExerciseCatalogItem): WorkoutBlock {
  return {
    type: "straight_sets",
    title: item.name,
    exercises: [createExerciseFromCatalogItem(item)],
  };
}

function createCustomSingleBlock(draft: CustomExerciseDraft): WorkoutBlock {
  const exercise = createExerciseFromCustomDraft(draft);

  return {
    type: "straight_sets",
    title: exercise.name,
    exercises: [exercise],
  };
}

function createSupersetBlock(
  firstExercise: ExerciseCatalogItem,
  secondExercise: ExerciseCatalogItem,
  draft: SupersetDraft,
  supersetIndex: number,
): WorkoutBlock {
  const rounds = toPositiveInteger(draft.rounds, 3);
  const restBetweenExercises = Math.max(0, toPositiveInteger(draft.restBetweenExercises, 15));
  const restAfterRound = Math.max(0, toPositiveInteger(draft.restAfterRound, 45));

  const first = createExerciseFromCatalogItem(firstExercise);
  const second = createExerciseFromCatalogItem(secondExercise);

  first.sets = rounds;
  second.sets = rounds;
  first.rest = restAfterRound;
  second.rest = restAfterRound;

  return {
    type: "superset",
    title: `Superset ${String.fromCharCode(65 + supersetIndex)}`,
    rounds,
    restBetweenExercises,
    restAfterRound,
    exercises: [first, second],
  };
}

function buildWorkoutFromBuilder(params: {
  name: string;
  targetDurationMinutes: number | null;
  selectedGym: Gym | null;
  blocks: WorkoutBlock[];
}) {
  const { name, targetDurationMinutes, selectedGym, blocks } = params;
  const summary = buildWorkoutSummary(blocks, targetDurationMinutes);
  const availableEquipment = extractEquipmentIdsFromRecords(selectedGym?.equipment ?? [], {
    includeBodyweightFallback: true,
  });
  const isBodyweightGym = selectedGym?.id === BODYWEIGHT_GYM_ID;

  return {
    id: createId(),
    name: name.trim() || "Eget pass",
    duration: summary.estimatedMinutes,
    gym: isBodyweightGym ? null : selectedGym?.id ?? null,
    gymLabel:
      selectedGym?.id === BODYWEIGHT_GYM_ID
        ? "Kroppsvikt / utan gym"
        : selectedGym?.name ?? null,
    availableEquipment,
    createdAt: new Date().toISOString(),
    blocks,
  } satisfies Workout & { availableEquipment: string[] };
}

function SheetShell(props: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { open, title, subtitle, onClose, children } = props;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm">
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-3xl overflow-hidden rounded-t-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Eget pass
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                {title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>

            <button type="button" onClick={onClose} className={uiButtonClasses.secondary}>
              Stäng
            </button>
          </div>
        </div>

        <div className="max-h-[calc(88vh-132px)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function SummaryPill(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {props.label}
      </p>
      <p className="mt-1 text-base font-semibold text-slate-950">{props.value}</p>
    </div>
  );
}

function BlockActions(props: {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={props.onMoveUp}
        disabled={!props.canMoveUp}
        className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs disabled:opacity-50")}
      >
        Flytta upp
      </button>
      <button
        type="button"
        onClick={props.onMoveDown}
        disabled={!props.canMoveDown}
        className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs disabled:opacity-50")}
      >
        Flytta ned
      </button>
      <button
        type="button"
        onClick={props.onRemove}
        className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
      >
        Ta bort
      </button>
    </div>
  );
}

export default function CustomWorkoutPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGymId, setSelectedGymId] = useState(BODYWEIGHT_GYM_ID);
  const [workoutName, setWorkoutName] = useState("Eget pass");
  const [targetDurationInput, setTargetDurationInput] = useState("");
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedCustomWorkout[]>([]);
  const [editingSavedWorkoutId, setEditingSavedWorkoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [expandedBlockIndex, setExpandedBlockIndex] = useState<number | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [customSheetOpen, setCustomSheetOpen] = useState(false);
  const [supersetSheetOpen, setSupersetSheetOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [customExerciseDraft, setCustomExerciseDraft] = useState(getDefaultCustomExerciseDraft());
  const [supersetDraft, setSupersetDraft] = useState(getDefaultSupersetDraft());

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      try {
        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        let authData: unknown = null;
        try {
          authData = await authRes.json();
        } catch {
          authData = null;
        }

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

        const bodyweightGym: Gym = {
          id: BODYWEIGHT_GYM_ID,
          user_id: userId,
          name: "Kroppsvikt / utan gym",
          description: null,
          is_shared: false,
          equipment: [{ id: "bodyweight", gym_id: BODYWEIGHT_GYM_ID, equipment_type: "bodyweight", label: "Kroppsvikt" }],
        };

        const builderDraft = getCustomWorkoutBuilderDraft(userId);

        if (!isMounted) {
          return;
        }

        setAuthUser(user);
        setGyms([bodyweightGym, ...fetchedGyms]);
        setSavedWorkouts(getSavedCustomWorkouts(userId));

        if (builderDraft) {
          setWorkoutName(builderDraft.name);
          setTargetDurationInput(
            builderDraft.targetDurationMinutes ? String(builderDraft.targetDurationMinutes) : "",
          );
          setBlocks(builderDraft.blocks);
          setSelectedGymId(builderDraft.gymId || BODYWEIGHT_GYM_ID);
        } else {
          setSelectedGymId(getStoredHomeGymId(userId) ?? bodyweightGym.id);
        }
      } catch (loadError) {
        console.error("Failed to load custom workout page", loadError);
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

  const selectedGym = useMemo(() => {
    return gyms.find((gym) => gym.id === selectedGymId) ?? null;
  }, [gyms, selectedGymId]);

  const availableCatalogExercises = useMemo(() => {
    const availableEquipment = extractEquipmentIdsFromRecords(selectedGym?.equipment ?? [], {
      includeBodyweightFallback: true,
    });
    const available = getAvailableExercises(availableEquipment);
    const search = catalogSearch.trim().toLowerCase();

    if (!search) {
      return available;
    }

    return available.filter((exercise) => {
      return (
        exercise.name.toLowerCase().includes(search) ||
        exercise.description.toLowerCase().includes(search)
      );
    });
  }, [catalogSearch, selectedGym]);

  const targetDurationMinutes = useMemo(() => {
    const parsed = Number(targetDurationInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return Math.round(parsed);
  }, [targetDurationInput]);

  const summary = useMemo(() => {
    return buildWorkoutSummary(blocks, targetDurationMinutes);
  }, [blocks, targetDurationMinutes]);

  const canSave = workoutName.trim().length > 0 && blocks.length > 0;

  useEffect(() => {
    if (!authUser || !authChecked) {
      return;
    }

    const draft: CustomWorkoutBuilderDraft = {
      version: 1,
      name: workoutName.trim() || "Eget pass",
      targetDurationMinutes,
      gymId: selectedGymId,
      blocks: cloneBlocks(blocks),
    };

    saveCustomWorkoutBuilderDraft(String(authUser.id), draft);
  }, [authChecked, authUser, blocks, selectedGymId, targetDurationMinutes, workoutName]);

  useEffect(() => {
    if (!authUser?.id) {
      return;
    }

    // Dela senaste valda gym med startsidan så appen känns konsekvent mellan flöden.
    storeHomeGymId(String(authUser.id), selectedGymId || BODYWEIGHT_GYM_ID);
  }, [authUser?.id, selectedGymId]);

  function openBlockSheet() {
    setAddSheetOpen(true);
    setSaveMessage(null);
    setError(null);
  }

  function appendBlock(block: WorkoutBlock) {
    setBlocks((previous) => [...previous, block]);
    setExpandedBlockIndex(blocks.length);
  }

  function addSingleCatalogBlock(item: ExerciseCatalogItem) {
    appendBlock(createSingleBlock(item));
    setCatalogPickerOpen(false);
    setCatalogSearch("");
  }

  function addCustomSingleBlock() {
    if (!customExerciseDraft.name.trim()) {
      setError("Ange namn på övningen.");
      return;
    }

    appendBlock(createCustomSingleBlock(customExerciseDraft));
    setCustomExerciseDraft(getDefaultCustomExerciseDraft());
    setCustomSheetOpen(false);
    setError(null);
  }

  function addSupersetBlock() {
    const first = availableCatalogExercises.find(
      (exercise) => exercise.id === supersetDraft.firstExerciseId,
    );
    const second = availableCatalogExercises.find(
      (exercise) => exercise.id === supersetDraft.secondExerciseId,
    );

    if (!first || !second) {
      setError("Välj två övningar till supersetet.");
      return;
    }

    if (first.id === second.id) {
      setError("Välj två olika övningar till supersetet.");
      return;
    }

    const supersetIndex = blocks.filter((block) => block.type === "superset").length;
    appendBlock(createSupersetBlock(first, second, supersetDraft, supersetIndex));
    setSupersetDraft(getDefaultSupersetDraft());
    setSupersetSheetOpen(false);
    setCatalogSearch("");
    setError(null);
  }

  function updateSingleExercise(
    blockIndex: number,
    patch: Partial<Exercise>,
  ) {
    setBlocks((previous) =>
      previous.map((block, index) => {
        if (index !== blockIndex || block.type !== "straight_sets" || block.exercises.length === 0) {
          return block;
        }

        const [exercise] = block.exercises;
        const nextExercise = { ...exercise, ...patch };

        return {
          ...block,
          title: nextExercise.name,
          exercises: [nextExercise],
        };
      }),
    );
  }

  function updateSupersetBlock(
    blockIndex: number,
    patch: Partial<Extract<WorkoutBlock, { type: "superset" }>>,
  ) {
    setBlocks((previous) =>
      previous.map((block, index) => {
        if (index !== blockIndex || block.type !== "superset") {
          return block;
        }

        const nextRounds = patch.rounds ?? block.rounds ?? 1;
        const nextExercises = block.exercises.map((exercise) => ({
          ...exercise,
          sets: nextRounds,
        }));

        return {
          ...block,
          ...patch,
          rounds: nextRounds,
          exercises: nextExercises,
        };
      }),
    );
  }

  function updateSupersetExercise(
    blockIndex: number,
    exerciseIndex: number,
    patch: Partial<Exercise>,
  ) {
    setBlocks((previous) =>
      previous.map((block, index) => {
        if (index !== blockIndex || block.type !== "superset") {
          return block;
        }

        return {
          ...block,
          exercises: block.exercises.map((exercise, currentExerciseIndex) => {
            if (currentExerciseIndex !== exerciseIndex) {
              return exercise;
            }

            return { ...exercise, ...patch };
          }),
        };
      }),
    );
  }

  function moveBlock(blockIndex: number, direction: "up" | "down") {
    setBlocks((previous) => {
      const targetIndex = direction === "up" ? blockIndex - 1 : blockIndex + 1;

      if (targetIndex < 0 || targetIndex >= previous.length) {
        return previous;
      }

      const next = [...previous];
      const current = next[blockIndex];
      next[blockIndex] = next[targetIndex];
      next[targetIndex] = current;
      return next;
    });

    setExpandedBlockIndex((previous) => {
      if (previous == null) {
        return previous;
      }

      if (previous === blockIndex) {
        return direction === "up" ? blockIndex - 1 : blockIndex + 1;
      }

      return previous;
    });
  }

  function removeBlock(blockIndex: number) {
    setBlocks((previous) => previous.filter((_, index) => index !== blockIndex));
    setExpandedBlockIndex((previous) => {
      if (previous == null) {
        return previous;
      }

      if (previous === blockIndex) {
        return null;
      }

      if (previous > blockIndex) {
        return previous - 1;
      }

      return previous;
    });
  }

  function saveBuilder() {
    if (!authUser) {
      return;
    }

    if (!canSave) {
      setError("Lägg till minst ett block innan du sparar passet.");
      return;
    }

    const savedWorkout: SavedCustomWorkout = {
      id: editingSavedWorkoutId ?? createId(),
      name: workoutName.trim() || "Eget pass",
      targetDurationMinutes,
      gymId: selectedGymId,
      gymName: selectedGym?.name ?? null,
      blocks: cloneBlocks(blocks),
      createdAt:
        savedWorkouts.find((item) => item.id === editingSavedWorkoutId)?.createdAt ??
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextSavedWorkouts = upsertSavedCustomWorkout(String(authUser.id), savedWorkout);
    setSavedWorkouts(nextSavedWorkouts);
    setEditingSavedWorkoutId(savedWorkout.id);
    setSaveMessage(
      editingSavedWorkoutId ? "Passet uppdaterades." : "Passet sparades i dina egna pass.",
    );
    setError(null);
  }

  function previewWorkout() {
    if (!authUser) {
      return;
    }

    if (!canSave) {
      setError("Lägg till minst ett block innan du går vidare.");
      return;
    }

    const workout = buildWorkoutFromBuilder({
      name: workoutName,
      targetDurationMinutes,
      selectedGym,
      blocks,
    });

    saveWorkoutDraft(String(authUser.id), workout);
    saveBuilder();
    router.push(`/workout/preview?userId=${encodeURIComponent(String(authUser.id))}`);
  }

  function resetBuilder() {
    if (!authUser) {
      return;
    }

    clearCustomWorkoutBuilderDraft(String(authUser.id));
    setWorkoutName("Eget pass");
    setTargetDurationInput("");
    setSelectedGymId(BODYWEIGHT_GYM_ID);
    setBlocks([]);
    setEditingSavedWorkoutId(null);
    setExpandedBlockIndex(null);
    setSaveMessage("Utkastet rensades.");
    setError(null);
  }

  function loadSavedWorkout(savedWorkout: SavedCustomWorkout) {
    setWorkoutName(savedWorkout.name);
    setTargetDurationInput(
      savedWorkout.targetDurationMinutes ? String(savedWorkout.targetDurationMinutes) : "",
    );
    setSelectedGymId(savedWorkout.gymId || BODYWEIGHT_GYM_ID);
    if (authUser?.id) {
      storeHomeGymId(String(authUser.id), savedWorkout.gymId || BODYWEIGHT_GYM_ID);
    }
    setBlocks(cloneBlocks(savedWorkout.blocks));
    setEditingSavedWorkoutId(savedWorkout.id);
    setExpandedBlockIndex(null);
    setSaveMessage(`Redigerar nu "${savedWorkout.name}".`);
    setError(null);

    window.scrollTo({ top: 0, behavior: "smooth" });
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

    if (editingSavedWorkoutId === savedWorkoutId) {
      setEditingSavedWorkoutId(null);
      setSaveMessage("Det sparade passet togs bort.");
    }
  }

  if (!authChecked) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-600">Laddar passbyggaren...</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, "pb-6")}>
        <div className="space-y-5">
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Eget pass
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Bygg ditt pass
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Bygg ditt pass med övningar, block och supersets. Håll översikten ren
              och öppna detaljer först när du behöver dem.
            </p>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Passnamn
                </span>
                <input
                  value={workoutName}
                  onChange={(event) => setWorkoutName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
                  placeholder="Till exempel Överkropp A"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Passlängd (valfritt)
                  </span>
                  <input
                    value={targetDurationInput}
                    onChange={(event) => setTargetDurationInput(event.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
                    placeholder="Till exempel 35"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Gym</span>
                  <select
                    value={selectedGymId}
                    onChange={(event) => setSelectedGymId(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
                  >
                    {gyms.map((gym) => (
                      <option key={gym.id} value={gym.id}>
                        {gym.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {saveMessage ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {saveMessage}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveBuilder}
                className={cn(uiButtonClasses.primary, "sm:flex-1")}
              >
                Spara pass
              </button>
              <button
                type="button"
                onClick={resetBuilder}
                className={cn(uiButtonClasses.secondary, "sm:flex-1")}
              >
                Rensa utkast
              </button>
            </div>
          </section>

          <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Sammanfattning
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryPill label="Övningar" value={summary.exerciseCount} />
              <SummaryPill label="Block" value={summary.blockCount} />
              <SummaryPill label="Superset" value={summary.supersetCount} />
              <SummaryPill label="Längd" value={`${summary.estimatedMinutes} min`} />
            </div>
          </section>

          <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Sparade pass
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                  Dina egna pass
                </h2>
              </div>

              <button
                type="button"
                onClick={resetBuilder}
                className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
              >
                Nytt pass
              </button>
            </div>

            {savedWorkouts.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                När du sparar ett eget pass dyker det upp här så att du kan köra,
                redigera eller ta bort det senare.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {savedWorkouts.map((savedWorkout) => {
                  const savedSummary = buildWorkoutSummary(
                    savedWorkout.blocks,
                    savedWorkout.targetDurationMinutes,
                  );
                  const isEditing = editingSavedWorkoutId === savedWorkout.id;

                  return (
                    <article
                      key={savedWorkout.id}
                      className={cn(
                        "rounded-[28px] border px-4 py-4 shadow-sm transition",
                        isEditing
                          ? "border-emerald-300 bg-emerald-50/60"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {isEditing ? (
                              <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                                Redigeras nu
                              </span>
                            ) : null}
                            <span className="text-xs text-slate-400">
                              Uppdaterat {new Date(savedWorkout.updatedAt).toLocaleDateString("sv-SE")}
                            </span>
                          </div>
                          <h3 className="mt-2 text-lg font-semibold text-slate-950">
                            {savedWorkout.name}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {savedSummary.exerciseCount} övningar · {savedSummary.blockCount} block
                            · {savedSummary.estimatedMinutes} min
                            {savedWorkout.gymName ? ` · ${savedWorkout.gymName}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => runSavedWorkout(savedWorkout)}
                          className={cn(uiButtonClasses.primary, "px-3 py-2 text-xs")}
                        >
                          Kör pass
                        </button>
                        <button
                          type="button"
                          onClick={() => loadSavedWorkout(savedWorkout)}
                          className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
                        >
                          Redigera
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedWorkout(savedWorkout.id)}
                          className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                        >
                          Ta bort
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Builder
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                  Block och flöde
                </h2>
              </div>

              <button
                type="button"
                onClick={openBlockSheet}
                className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
              >
                + Lägg till block
              </button>
            </div>

            {blocks.length === 0 ? (
              <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
                <h3 className="text-lg font-semibold text-slate-950">Börja med ett block</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Lägg till enskild övning, ett superset eller en helt egen övning för att
                  börja bygga passet.
                </p>
                <button
                  type="button"
                  onClick={openBlockSheet}
                  className={cn(uiButtonClasses.primary, "mt-4 w-full")}
                >
                  Lägg till första blocket
                </button>
              </section>
            ) : (
              <div className="space-y-4">
                {blocks.map((block, blockIndex) => {
                  const expanded = expandedBlockIndex === blockIndex;
                  const canMoveUp = blockIndex > 0;
                  const canMoveDown = blockIndex < blocks.length - 1;

                  if (block.type === "superset") {
                    return (
                      <article
                        key={`block-${blockIndex}-${block.title ?? "superset"}`}
                        className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                                Superset
                              </span>
                              <span className="text-xs text-slate-400">Block {blockIndex + 1}</span>
                            </div>

                            <h3 className="mt-2 text-lg font-semibold text-slate-950">
                              {block.title ?? `Superset ${blockIndex + 1}`}
                            </h3>

                            <p className="mt-1 text-sm text-slate-500">
                              {block.rounds ?? 1} varv · {block.exercises.length} övningar
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedBlockIndex((previous) =>
                                previous === blockIndex ? null : blockIndex,
                              )
                            }
                            className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
                          >
                            {expanded ? "Dölj" : "Visa"}
                          </button>
                        </div>

                        <div className="mt-4">
                          <PreviewSupersetFlow
                            blockType="superset"
                            exercises={block.exercises}
                            restAfterRound={block.restAfterRound}
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                            Vila mellan övningar: {block.restBetweenExercises ?? 0}s
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                            Vila efter varv: {block.restAfterRound ?? 0}s
                          </span>
                        </div>

                        {expanded ? (
                          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-slate-700">
                                  Varv
                                </span>
                                <input
                                  value={String(block.rounds ?? 1)}
                                  onChange={(event) =>
                                    updateSupersetBlock(blockIndex, {
                                      rounds: toPositiveInteger(event.target.value, block.rounds ?? 1),
                                    })
                                  }
                                  inputMode="numeric"
                                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-slate-700">
                                  Vila mellan övningar
                                </span>
                                <input
                                  value={String(block.restBetweenExercises ?? 0)}
                                  onChange={(event) =>
                                    updateSupersetBlock(blockIndex, {
                                      restBetweenExercises: Math.max(
                                        0,
                                        toPositiveInteger(event.target.value, block.restBetweenExercises ?? 15),
                                      ),
                                    })
                                  }
                                  inputMode="numeric"
                                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-slate-700">
                                  Vila efter varv
                                </span>
                                <input
                                  value={String(block.restAfterRound ?? 0)}
                                  onChange={(event) =>
                                    updateSupersetBlock(blockIndex, {
                                      restAfterRound: Math.max(
                                        0,
                                        toPositiveInteger(event.target.value, block.restAfterRound ?? 45),
                                      ),
                                    })
                                  }
                                  inputMode="numeric"
                                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                                />
                              </label>
                            </div>

                            <div className="space-y-3">
                              {block.exercises.map((exercise, exerciseIndex) => {
                                const timed =
                                  typeof exercise.duration === "number" &&
                                  exercise.duration > 0 &&
                                  (!exercise.reps || exercise.reps <= 0);

                                return (
                                  <div
                                    key={`${exercise.id}-${exerciseIndex}`}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                        {exerciseIndex === 0 ? "A1" : "A2"}
                                      </span>
                                      <h4 className="text-base font-semibold text-slate-950">
                                        {exercise.name}
                                      </h4>
                                      {exercise.isCustom ? (
                                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                          Egen
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                      <label className="block">
                                        <span className="mb-2 block text-sm font-medium text-slate-700">
                                          Set
                                        </span>
                                        <input
                                          value={String(exercise.sets)}
                                          disabled
                                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 outline-none"
                                        />
                                      </label>
                                      <label className="block">
                                        <span className="mb-2 block text-sm font-medium text-slate-700">
                                          {timed ? "Tid (sek)" : "Reps"}
                                        </span>
                                        <input
                                          value={timed ? String(exercise.duration ?? 30) : String(exercise.reps ?? 10)}
                                          onChange={(event) =>
                                            updateSupersetExercise(
                                              blockIndex,
                                              exerciseIndex,
                                              timed
                                                ? { duration: toPositiveInteger(event.target.value, exercise.duration ?? 30) }
                                                : { reps: toPositiveInteger(event.target.value, exercise.reps ?? 10) },
                                            )
                                          }
                                          inputMode="numeric"
                                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                                        />
                                      </label>
                                      <label className="block">
                                        <span className="mb-2 block text-sm font-medium text-slate-700">
                                          Vila
                                        </span>
                                        <input
                                          value={String(exercise.rest)}
                                          onChange={(event) =>
                                            updateSupersetExercise(blockIndex, exerciseIndex, {
                                              rest: Math.max(0, toPositiveInteger(event.target.value, exercise.rest)),
                                            })
                                          }
                                          inputMode="numeric"
                                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                                        />
                                      </label>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <BlockActions
                              onMoveUp={() => moveBlock(blockIndex, "up")}
                              onMoveDown={() => moveBlock(blockIndex, "down")}
                              onRemove={() => removeBlock(blockIndex)}
                              canMoveUp={canMoveUp}
                              canMoveDown={canMoveDown}
                            />
                          </div>
                        ) : null}
                      </article>
                    );
                  }

                  const exercise = block.exercises[0];
                  if (!exercise) {
                    return null;
                  }

                  const timed =
                    typeof exercise.duration === "number" &&
                    exercise.duration > 0 &&
                    (!exercise.reps || exercise.reps <= 0);

                  return (
                    <article
                      key={`${exercise.id}-${blockIndex}`}
                      className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                              Enskild övning
                            </span>
                            <span className="text-xs text-slate-400">Block {blockIndex + 1}</span>
                            {exercise.isCustom ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                Egen
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-2 text-lg font-semibold text-slate-950">
                            {exercise.name}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {exercise.sets} set · {timed ? `${exercise.duration ?? 0}s` : `${exercise.reps ?? 0} reps`} · vila {exercise.rest}s
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedBlockIndex((previous) =>
                              previous === blockIndex ? null : blockIndex,
                            )
                          }
                          className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
                        >
                          {expanded ? "Dölj" : "Visa"}
                        </button>
                      </div>

                      {expanded ? (
                        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-slate-700">
                                Set
                              </span>
                              <input
                                value={String(exercise.sets)}
                                onChange={(event) =>
                                  updateSingleExercise(blockIndex, {
                                    sets: toPositiveInteger(event.target.value, exercise.sets),
                                  })
                                }
                                inputMode="numeric"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-slate-700">
                                {timed ? "Tid (sek)" : "Reps"}
                              </span>
                              <input
                                value={timed ? String(exercise.duration ?? 30) : String(exercise.reps ?? 10)}
                                onChange={(event) =>
                                  updateSingleExercise(
                                    blockIndex,
                                    timed
                                      ? { duration: toPositiveInteger(event.target.value, exercise.duration ?? 30) }
                                      : { reps: toPositiveInteger(event.target.value, exercise.reps ?? 10) },
                                  )
                                }
                                inputMode="numeric"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-slate-700">
                                Vila (sek)
                              </span>
                              <input
                                value={String(exercise.rest)}
                                onChange={(event) =>
                                  updateSingleExercise(blockIndex, {
                                    rest: Math.max(0, toPositiveInteger(event.target.value, exercise.rest)),
                                  })
                                }
                                inputMode="numeric"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                              />
                            </label>
                          </div>

                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-700">
                              Beskrivning / anteckning
                            </span>
                            <textarea
                              value={exercise.description ?? ""}
                              onChange={(event) =>
                                updateSingleExercise(blockIndex, {
                                  description: event.target.value,
                                })
                              }
                              className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                              placeholder="Valfri instruktion eller notering"
                            />
                          </label>

                          <BlockActions
                            onMoveUp={() => moveBlock(blockIndex, "up")}
                            onMoveDown={() => moveBlock(blockIndex, "down")}
                            onRemove={() => removeBlock(blockIndex)}
                            canMoveUp={canMoveUp}
                            canMoveDown={canMoveDown}
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        <div
          aria-hidden="true"
          className="h-[calc(env(safe-area-inset-bottom)+10rem)] sm:h-[calc(env(safe-area-inset-bottom)+8.5rem)]"
        />
      </div>

      <StickyActionBar>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={saveBuilder}
            className={cn(uiButtonClasses.secondary, "min-h-10 flex-1 py-2.5")}
          >
            Spara pass
          </button>
          <button
            type="button"
            onClick={previewWorkout}
            className={cn(uiButtonClasses.primary, "min-h-10 flex-1 py-2.5")}
          >
            Förhandsgranska
          </button>
        </div>
      </StickyActionBar>

      <SheetShell
        open={addSheetOpen}
        title="Lägg till block"
        subtitle="Välj hur du vill bygga nästa del av passet."
        onClose={() => setAddSheetOpen(false)}
      >
        <div className="space-y-3">
          {[
            {
              kind: "single" as AddBlockKind,
              title: "Lägg till enskild övning",
              description: "Välj en övning från katalogen och lägg den som eget block.",
            },
            {
              kind: "superset" as AddBlockKind,
              title: "Lägg till superset",
              description: "Bygg ett block med två övningar som körs i varv.",
            },
            {
              kind: "custom" as AddBlockKind,
              title: "Lägg till egen övning",
              description: "Skapa en helt egen övning med egna set, reps eller tid.",
            },
          ].map((option) => (
            <button
              key={option.kind}
              type="button"
              onClick={() => {
                setAddSheetOpen(false);

                if (option.kind === "single") {
                  setCatalogPickerOpen(true);
                  return;
                }

                if (option.kind === "superset") {
                  setSupersetSheetOpen(true);
                  return;
                }

                setCustomSheetOpen(true);
              }}
              className="w-full rounded-[28px] border border-slate-200 bg-white px-5 py-4 text-left transition hover:bg-slate-50"
            >
              <h3 className="text-base font-semibold text-slate-950">{option.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{option.description}</p>
            </button>
          ))}
        </div>
      </SheetShell>

      <SheetShell
        open={catalogPickerOpen}
        title="Lägg till övning"
        subtitle="Välj en katalogövning som passar det gym du använder."
        onClose={() => {
          setCatalogPickerOpen(false);
          setCatalogSearch("");
        }}
      >
        <div className="space-y-4">
          <input
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="Sök övning"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
          />

          <div className="space-y-3">
            {availableCatalogExercises.map((item) => (
              <div key={item.id} className="rounded-[28px] border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {item.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => addSingleCatalogBlock(item)}
                    className={cn(uiButtonClasses.primary, "shrink-0")}
                  >
                    Lägg till
                  </button>
                </div>
              </div>
            ))}

            {availableCatalogExercises.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                Inga övningar matchade sökningen eller valt gym.
              </div>
            ) : null}
          </div>
        </div>
      </SheetShell>

      <SheetShell
        open={customSheetOpen}
        title="Egen övning"
        subtitle="Skapa en egen övning som sedan beter sig som ett vanligt block."
        onClose={() => setCustomSheetOpen(false)}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Namn</span>
            <input
              value={customExerciseDraft.name}
              onChange={(event) =>
                setCustomExerciseDraft((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              placeholder="Till exempel Bulgarian split squat"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setCustomExerciseDraft((previous) => ({ ...previous, mode: "reps" }))
              }
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                customExerciseDraft.mode === "reps"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700",
              )}
            >
              Reps
            </button>
            <button
              type="button"
              onClick={() =>
                setCustomExerciseDraft((previous) => ({ ...previous, mode: "time" }))
              }
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                customExerciseDraft.mode === "time"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700",
              )}
            >
              Tid
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Set</span>
              <input
                value={customExerciseDraft.sets}
                onChange={(event) =>
                  setCustomExerciseDraft((previous) => ({
                    ...previous,
                    sets: event.target.value,
                  }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                {customExerciseDraft.mode === "reps" ? "Reps" : "Tid (sek)"}
              </span>
              <input
                value={
                  customExerciseDraft.mode === "reps"
                    ? customExerciseDraft.reps
                    : customExerciseDraft.duration
                }
                onChange={(event) =>
                  setCustomExerciseDraft((previous) => ({
                    ...previous,
                    [previous.mode === "reps" ? "reps" : "duration"]: event.target.value,
                  }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Vila</span>
              <input
                value={customExerciseDraft.rest}
                onChange={(event) =>
                  setCustomExerciseDraft((previous) => ({
                    ...previous,
                    rest: event.target.value,
                  }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              Beskrivning
            </span>
            <textarea
              value={customExerciseDraft.description}
              onChange={(event) =>
                setCustomExerciseDraft((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              placeholder="Valfri instruktion eller anteckning"
            />
          </label>

          <button
            type="button"
            onClick={addCustomSingleBlock}
            className={cn(uiButtonClasses.primary, "w-full")}
          >
            Lägg till övning
          </button>
        </div>
      </SheetShell>

      <SheetShell
        open={supersetSheetOpen}
        title="Nytt superset"
        subtitle="Välj två övningar och ange hur blocket ska köras."
        onClose={() => setSupersetSheetOpen(false)}
      >
        <div className="space-y-4">
          <input
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="Sök övning"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Övning 1</span>
              <select
                value={supersetDraft.firstExerciseId}
                onChange={(event) =>
                  setSupersetDraft((previous) => ({
                    ...previous,
                    firstExerciseId: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              >
                <option value="">Välj övning</option>
                {availableCatalogExercises.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Övning 2</span>
              <select
                value={supersetDraft.secondExerciseId}
                onChange={(event) =>
                  setSupersetDraft((previous) => ({
                    ...previous,
                    secondExerciseId: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              >
                <option value="">Välj övning</option>
                {availableCatalogExercises.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Varv</span>
              <input
                value={supersetDraft.rounds}
                onChange={(event) =>
                  setSupersetDraft((previous) => ({ ...previous, rounds: event.target.value }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Vila mellan övningar
              </span>
              <input
                value={supersetDraft.restBetweenExercises}
                onChange={(event) =>
                  setSupersetDraft((previous) => ({
                    ...previous,
                    restBetweenExercises: event.target.value,
                  }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Vila efter varv
              </span>
              <input
                value={supersetDraft.restAfterRound}
                onChange={(event) =>
                  setSupersetDraft((previous) => ({
                    ...previous,
                    restAfterRound: event.target.value,
                  }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={addSupersetBlock}
            className={cn(uiButtonClasses.primary, "w-full")}
          >
            Lägg till superset
          </button>
        </div>
      </SheetShell>
    </main>
  );
}
