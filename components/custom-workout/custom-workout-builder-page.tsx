"use client";

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
  BODYWEIGHT_GYM_ID,
  BUILDER_FOCUS_MUSCLE_OPTIONS,
  buildWorkoutFromBuilder,
  buildGymEquipmentPromptDetails,
  buildWorkoutSummary,
  cloneBlocks,
  createCustomSingleBlock,
  createSingleBlock,
  createSupersetBlock,
  getEquipmentIdsForGym,
  getAvailableCatalogExercisesForGym,
  getDefaultCustomExerciseDraft,
  getDefaultSupersetDraft,
  inferFocusFromMuscles,
  toPositiveInteger,
  type BuilderFocusMuscle,
  type CustomExerciseDraft,
  type SupersetDraft,
} from "@/lib/custom-workout-builder-utils";
import {
  getSavedCustomWorkouts,
  upsertSavedCustomWorkout,
  type SavedCustomWorkout,
} from "@/lib/custom-workout-library-storage";
import type { ExerciseCatalogItem } from "@/lib/exercise-catalog";
import type { Gym } from "@/lib/gyms";
import { getStoredHomeGymId, storeHomeGymId } from "@/hooks/use-home-preferences";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { applyExerciseProgression } from "@/lib/workout-flow/exercise-progression";
import { saveWorkoutDraft } from "@/lib/workout-flow/workout-draft-store";
import type { Exercise, WorkoutBlock } from "@/types/workout";

type AuthUser = {
  id: number | string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
};

type UserSettingsGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

type UserSettingsResponse = {
  ok?: boolean;
  settings?: {
    training_goal?: UserSettingsGoal | null;
  } | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function createSavedWorkoutFromBuilder(params: {
  workoutId: string | null;
  name: string;
  targetDurationMinutes: number | null;
  selectedGymId: string;
  selectedGym: Gym | null;
  blocks: WorkoutBlock[];
  existingWorkout?: SavedCustomWorkout | null;
}) {
  return {
    id: params.workoutId ?? crypto.randomUUID(),
    name: params.name.trim() || "Eget pass",
    targetDurationMinutes: params.targetDurationMinutes,
    gymId: params.selectedGymId,
    gymName: params.selectedGym?.name ?? null,
    blocks: cloneBlocks(params.blocks),
    createdAt: params.existingWorkout?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies SavedCustomWorkout;
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

function applyProgressionToGeneratedBlocks(params: {
  blocks: WorkoutBlock[];
  selectedGym: Gym | null;
  userId: string;
  goal: UserSettingsGoal | null;
}) {
  const gymEquipmentItems = Array.isArray(params.selectedGym?.equipment)
    ? params.selectedGym.equipment
    : [];

  return params.blocks.map((block) => ({
    ...block,
    exercises: block.exercises.map((exercise) =>
      applyExerciseProgression({
        exercise,
        userId: params.userId,
        goal: params.goal,
        gymEquipmentItems,
      }),
    ),
  }));
}

function SheetShell(props: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!props.open) {
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
                {props.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{props.subtitle}</p>
            </div>

            <button type="button" onClick={props.onClose} className={uiButtonClasses.secondary}>
              Stäng
            </button>
          </div>
        </div>

        <div className="max-h-[calc(88vh-132px)] overflow-y-auto px-5 py-4">
          {props.children}
        </div>
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

export default function CustomWorkoutBuilderPage(props: {
  initialSavedWorkoutId?: string | null;
  initialMode?: "new" | null;
}) {
  const router = useRouter();
  const requestedWorkoutId = props.initialSavedWorkoutId ?? null;
  const forceNewBuilder = props.initialMode === "new";

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedCustomWorkout[]>([]);
  const [selectedGymId, setSelectedGymId] = useState(BODYWEIGHT_GYM_ID);
  const [workoutName, setWorkoutName] = useState("Eget pass");
  const [targetDurationInput, setTargetDurationInput] = useState("");
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [editingSavedWorkoutId, setEditingSavedWorkoutId] = useState<string | null>(null);
  const [trainingGoal, setTrainingGoal] = useState<UserSettingsGoal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isGeneratingAiWorkout, setIsGeneratingAiWorkout] = useState(false);
  const [aiFocusMuscles, setAiFocusMuscles] = useState<BuilderFocusMuscle[]>([]);
  const [expandedBlockIndex, setExpandedBlockIndex] = useState<number | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [customSheetOpen, setCustomSheetOpen] = useState(false);
  const [supersetSheetOpen, setSupersetSheetOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [customExerciseDraft, setCustomExerciseDraft] = useState<CustomExerciseDraft>(
    getDefaultCustomExerciseDraft(),
  );
  const [supersetDraft, setSupersetDraft] = useState<SupersetDraft>(getDefaultSupersetDraft());

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
        const gymsData = await gymsRes.json().catch(() => null);
        const settingsData = (await settingsRes.json().catch(() => null)) as UserSettingsResponse | null;
        const fetchedGyms =
          gymsRes.ok && gymsData?.ok && Array.isArray(gymsData.gyms)
            ? (gymsData.gyms as Gym[])
            : [];
        const nextGyms = [getBodyweightGym(userId), ...fetchedGyms.map(normalizeGym)];
        const nextSavedWorkouts = getSavedCustomWorkouts(userId);
        const builderDraft = getCustomWorkoutBuilderDraft(userId);
        const requestedWorkout =
          requestedWorkoutId
            ? nextSavedWorkouts.find((workout) => workout.id === requestedWorkoutId) ?? null
            : null;

        if (!isMounted) {
          return;
        }

        setAuthUser(user);
        setTrainingGoal(
          settingsRes.ok &&
            settingsData?.ok &&
            typeof settingsData.settings?.training_goal === "string"
            ? settingsData.settings.training_goal
            : null,
        );
        setGyms(nextGyms);
        setSavedWorkouts(nextSavedWorkouts);

        if (requestedWorkout) {
          // Vid redigering av sparat pass ska biblioteket inte blandas in i builderutkastet.
          setWorkoutName(requestedWorkout.name);
          setTargetDurationInput(
            requestedWorkout.targetDurationMinutes
              ? String(requestedWorkout.targetDurationMinutes)
              : "",
          );
          setSelectedGymId(requestedWorkout.gymId || BODYWEIGHT_GYM_ID);
          setBlocks(cloneBlocks(requestedWorkout.blocks));
          setEditingSavedWorkoutId(requestedWorkout.id);
          setExpandedBlockIndex(null);
          setSaveMessage(null);
          setError(null);
        } else if (!forceNewBuilder && builderDraft) {
          setWorkoutName(builderDraft.name);
          setTargetDurationInput(
            builderDraft.targetDurationMinutes ? String(builderDraft.targetDurationMinutes) : "",
          );
          setSelectedGymId(builderDraft.gymId || BODYWEIGHT_GYM_ID);
          setBlocks(cloneBlocks(builderDraft.blocks));
          setEditingSavedWorkoutId(null);
          setExpandedBlockIndex(null);
          setSaveMessage(null);
          setError(
            requestedWorkoutId
              ? "Det sparade passet hittades inte längre. Ditt lokala utkast öppnades i stället."
              : null,
          );
        } else {
          if (forceNewBuilder) {
            // Ett explicit "nytt pass" ska inte återställa tidigare utkast av misstag.
            clearCustomWorkoutBuilderDraft(userId);
          }
          setWorkoutName("Eget pass");
          setTargetDurationInput("");
          setSelectedGymId(getStoredHomeGymId(userId) ?? BODYWEIGHT_GYM_ID);
          setBlocks([]);
          setEditingSavedWorkoutId(null);
          setExpandedBlockIndex(null);
          setSaveMessage(null);
          setError(
            requestedWorkoutId
              ? "Det sparade passet hittades inte längre. Du kan bygga ett nytt pass i stället."
              : forceNewBuilder
                ? null
              : null,
          );
        }
      } catch (loadError) {
        console.error("Failed to load custom workout builder", loadError);
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
  }, [forceNewBuilder, requestedWorkoutId, router]);

  const selectedGym = useMemo(() => {
    return gyms.find((gym) => gym.id === selectedGymId) ?? null;
  }, [gyms, selectedGymId]);

  const availableCatalogExercises = useMemo(() => {
    const available = getAvailableCatalogExercisesForGym(selectedGym);
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
  const builderTitle = editingSavedWorkoutId ? "Redigera pass" : "Bygg nytt pass";

  useEffect(() => {
    if (!authChecked || !authUser) {
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

    // Builderns val ska fortsätta styra senaste använda gym i resten av appen.
    storeHomeGymId(String(authUser.id), selectedGymId || BODYWEIGHT_GYM_ID);
  }, [authUser?.id, selectedGymId]);

  function persistSavedWorkout() {
    if (!authUser) {
      return null;
    }

    if (!canSave) {
      setError("Lägg till minst ett block innan du sparar passet.");
      return null;
    }

    const existingWorkout =
      savedWorkouts.find((item) => item.id === editingSavedWorkoutId) ?? null;
    const workoutId =
      editingSavedWorkoutId ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2));
    const savedWorkout = createSavedWorkoutFromBuilder({
      workoutId,
      name: workoutName,
      targetDurationMinutes,
      selectedGymId,
      selectedGym,
      blocks,
      existingWorkout,
    });
    const nextSavedWorkouts = upsertSavedCustomWorkout(String(authUser.id), savedWorkout);

    setSavedWorkouts(nextSavedWorkouts);
    setEditingSavedWorkoutId(savedWorkout.id);
    setSaveMessage(
      existingWorkout ? "Passet uppdaterades." : "Passet sparades i dina egna pass.",
    );
    setError(null);

    if (requestedWorkoutId !== savedWorkout.id) {
      router.replace(`/workout/custom/builder?id=${encodeURIComponent(savedWorkout.id)}`);
    }

    return savedWorkout;
  }

  function openBlockSheet() {
    setAddSheetOpen(true);
    setSaveMessage(null);
    setError(null);
  }

  function appendBlock(block: WorkoutBlock) {
    setBlocks((previous) => {
      const next = [...previous, block];
      setExpandedBlockIndex(next.length - 1);
      return next;
    });
  }

  function addSingleCatalogBlock(item: ExerciseCatalogItem) {
    appendBlock(createSingleBlock(item));
    setCatalogPickerOpen(false);
    setCatalogSearch("");
    setError(null);
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

  function updateSingleExercise(blockIndex: number, patch: Partial<Exercise>) {
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

  function resetBuilder() {
    if (!authUser) {
      return;
    }

    clearCustomWorkoutBuilderDraft(String(authUser.id));
    setWorkoutName("Eget pass");
    setTargetDurationInput("");
    setSelectedGymId(getStoredHomeGymId(String(authUser.id)) ?? BODYWEIGHT_GYM_ID);
    setBlocks([]);
    setEditingSavedWorkoutId(null);
    setExpandedBlockIndex(null);
    setSaveMessage("Utkastet rensades.");
    setError(null);
    router.replace("/workout/custom/builder");
  }

  function previewWorkout() {
    if (!authUser) {
      return;
    }

    const savedWorkout = persistSavedWorkout();
    if (!savedWorkout) {
      return;
    }

    const workout = buildWorkoutFromBuilder({
      name: savedWorkout.name,
      targetDurationMinutes: savedWorkout.targetDurationMinutes,
      selectedGym,
      blocks,
    });

    saveWorkoutDraft(String(authUser.id), workout);
    router.push(`/workout/preview?userId=${encodeURIComponent(String(authUser.id))}`);
  }

  function toggleAiFocusMuscle(muscle: BuilderFocusMuscle) {
    setAiFocusMuscles((current) => {
      if (current.includes(muscle)) {
        return current.filter((item) => item !== muscle);
      }

      if (current.length >= 5) {
        return current;
      }

      return [...current, muscle];
    });
  }

  async function generateWorkoutWithAi() {
    if (!authUser) {
      return;
    }

    if (!targetDurationMinutes) {
      setError("Ange önskad passlängd innan du genererar ett pass med AI.");
      return;
    }

    if (
      blocks.length > 0 &&
      !window.confirm("Det nuvarande utkastet ersätts av ett AI-genererat pass. Fortsätta?")
    ) {
      return;
    }

    try {
      setIsGeneratingAiWorkout(true);
      setError(null);
      setSaveMessage(null);

      const isBodyweightGym = selectedGym?.id === BODYWEIGHT_GYM_ID;
      const payload = {
        userId: String(authUser.id),
        goal: trainingGoal ?? "health",
        durationMinutes: targetDurationMinutes,
        equipment: getEquipmentIdsForGym(selectedGym),
        gym: isBodyweightGym ? null : String(selectedGym?.id ?? ""),
        gymLabel: isBodyweightGym
          ? "Kroppsvikt / utan gym"
          : selectedGym?.name ?? null,
        gymEquipmentDetails: buildGymEquipmentPromptDetails(selectedGym),
        nextFocus: inferFocusFromMuscles(aiFocusMuscles),
        focusMuscles: aiFocusMuscles,
      };

      const response = await fetch("/api/workouts/generate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || !data?.workout || !Array.isArray(data.workout.blocks)) {
        throw new Error(data?.error || "Kunde inte generera pass med AI.");
      }

      const progressedBlocks = applyProgressionToGeneratedBlocks({
        blocks: cloneBlocks(data.workout.blocks as WorkoutBlock[]),
        selectedGym,
        userId: String(authUser.id),
        goal: trainingGoal,
      });

      setWorkoutName(
        typeof data.workout.name === "string" && data.workout.name.trim()
          ? data.workout.name.trim()
          : workoutName,
      );
      setTargetDurationInput(String(data.workout.duration ?? targetDurationMinutes));
      setBlocks(progressedBlocks);
      setExpandedBlockIndex(null);
      setSaveMessage("AI-pass genererat. Granska blocken och spara när det känns rätt.");
      setError(null);
    } catch (generateError) {
      console.error("AI custom workout generation failed:", generateError);
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Kunde inte generera pass med AI.",
      );
    } finally {
      setIsGeneratingAiWorkout(false);
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
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Eget pass
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {builderTitle}
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  {editingSavedWorkoutId
                    ? "Du redigerar ett sparat pass. Ändringar påverkar bara detta pass när du sparar."
                    : "Bygg ditt pass med övningar, block och supersets. Håll översikten ren och öppna detaljer först när du behöver dem."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActionMenuOpen(true)}
                className={cn(uiButtonClasses.secondary, "shrink-0 px-3 py-2 text-xs")}
              >
                Meny
              </button>
            </div>

            {editingSavedWorkoutId ? (
              <div className="mt-4 inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                Redigerar sparat pass
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Passnamn</span>
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

          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                AI-builder
              </p>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Generera pass med AI
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Välj gym, ange passlängd och markera upp till 5 muskelgrupper som
                ska få extra fokus i det här passet.
              </p>
              <p className="text-sm text-slate-500">
                Mål från inställningar:{" "}
                <span className="font-medium text-slate-700">
                  {trainingGoal ?? "hälsa / standard"}
                </span>
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {BUILDER_FOCUS_MUSCLE_OPTIONS.map((option) => {
                const selected = aiFocusMuscles.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleAiFocusMuscle(option.value)}
                    className={cn(
                      "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition",
                      selected
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-600",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-sm text-slate-500">
              {aiFocusMuscles.length > 0
                ? `${aiFocusMuscles.length} av 5 valda fokusmuskler.`
                : "Inga fokusmuskler valda. Då utgår AI främst från ditt träningsmål."}
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                {selectedGym?.name ?? "Kroppsvikt / utan gym"} ·{" "}
                {targetDurationMinutes ? `${targetDurationMinutes} min` : "ingen passlängd vald ännu"}
              </div>
              <button
                type="button"
                onClick={() => void generateWorkoutWithAi()}
                disabled={isGeneratingAiWorkout}
                className={cn(uiButtonClasses.primary, "w-full sm:w-auto disabled:opacity-60")}
              >
                {isGeneratingAiWorkout ? "Genererar pass..." : "Generera med AI"}
              </button>
            </div>
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
                  Lägg till enskild övning, ett superset eller en helt egen övning för att börja
                  bygga passet.
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
                                        toPositiveInteger(event.target.value, block.restBetweenExercises ?? 0),
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
                                        toPositiveInteger(event.target.value, block.restAfterRound ?? 0),
                                      ),
                                    })
                                  }
                                  inputMode="numeric"
                                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                                />
                              </label>
                            </div>

                            <div className="space-y-3">
                              {block.exercises.map((exercise, exerciseIndex) => (
                                <div
                                  key={`${exercise.id}-${exerciseIndex}`}
                                  className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"
                                >
                                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                                    Övning {exerciseIndex + 1}
                                  </p>
                                  <label className="mt-3 block">
                                    <span className="mb-2 block text-sm font-medium text-slate-700">
                                      Namn
                                    </span>
                                    <input
                                      value={exercise.name}
                                      onChange={(event) =>
                                        updateSupersetExercise(blockIndex, exerciseIndex, {
                                          name: event.target.value,
                                        })
                                      }
                                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                                    />
                                  </label>

                                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                    <label className="block">
                                      <span className="mb-2 block text-sm font-medium text-slate-700">
                                        Set
                                      </span>
                                      <input
                                        value={String(exercise.sets)}
                                        onChange={(event) =>
                                          updateSupersetExercise(blockIndex, exerciseIndex, {
                                            sets: toPositiveInteger(event.target.value, exercise.sets),
                                          })
                                        }
                                        inputMode="numeric"
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="mb-2 block text-sm font-medium text-slate-700">
                                        Reps
                                      </span>
                                      <input
                                        value={exercise.reps ?? ""}
                                        onChange={(event) =>
                                          updateSupersetExercise(blockIndex, exerciseIndex, {
                                            reps: toPositiveInteger(event.target.value, exercise.reps ?? 8),
                                            duration: undefined,
                                          })
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
                              ))}
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

                  return (
                    <article
                      key={`block-${blockIndex}-${exercise.id}`}
                      className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                              Enskild övning
                            </span>
                            {exercise.isCustom ? (
                              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                Egen
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-2 text-lg font-semibold text-slate-950">
                            {exercise.name}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {exercise.sets} set ·{" "}
                            {typeof exercise.duration === "number"
                              ? `${exercise.duration}s`
                              : `${exercise.reps ?? 0} reps`}{" "}
                            · vila {exercise.rest}s
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
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-700">
                              Namn
                            </span>
                            <input
                              value={exercise.name}
                              onChange={(event) =>
                                updateSingleExercise(blockIndex, { name: event.target.value })
                              }
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-700">
                              Beskrivning
                            </span>
                            <textarea
                              value={exercise.description ?? ""}
                              onChange={(event) =>
                                updateSingleExercise(blockIndex, {
                                  description: event.target.value,
                                })
                              }
                              rows={3}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                            />
                          </label>

                          <div className="grid gap-3 sm:grid-cols-4">
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
                                Reps
                              </span>
                              <input
                                value={exercise.reps ?? ""}
                                onChange={(event) =>
                                  updateSingleExercise(blockIndex, {
                                    reps: toPositiveInteger(event.target.value, exercise.reps ?? 10),
                                    duration: undefined,
                                  })
                                }
                                inputMode="numeric"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-slate-700">
                                Tid
                              </span>
                              <input
                                value={exercise.duration ?? ""}
                                onChange={(event) =>
                                  updateSingleExercise(blockIndex, {
                                    duration: toPositiveInteger(
                                      event.target.value,
                                      exercise.duration ?? 30,
                                    ),
                                    reps: undefined,
                                  })
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
                                  updateSingleExercise(blockIndex, {
                                    rest: Math.max(0, toPositiveInteger(event.target.value, exercise.rest)),
                                  })
                                }
                                inputMode="numeric"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-400"
                              />
                            </label>
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
                })}
              </div>
            )}
          </section>
        </div>
        <div
          aria-hidden="true"
          className="h-[calc(env(safe-area-inset-bottom)+8.5rem)] sm:h-[calc(env(safe-area-inset-bottom)+7.5rem)]"
        />
      </div>

      <StickyActionBar>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={previewWorkout}
            className={cn(uiButtonClasses.primary, "w-full")}
          >
            Förhandsgranska
          </button>
        </div>
      </StickyActionBar>

      <SheetShell
        open={actionMenuOpen}
        title="Passmeny"
        subtitle="Hantera buildern utan att huvudytan skyms."
        onClose={() => setActionMenuOpen(false)}
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setActionMenuOpen(false);
              router.push("/workout/custom");
            }}
            className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm"
          >
            <p className="text-base font-semibold text-slate-950">Tillbaka till mina pass</p>
            <p className="mt-1 text-sm text-slate-600">Gå tillbaka till biblioteket med sparade pass.</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setActionMenuOpen(false);
              persistSavedWorkout();
            }}
            className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm"
          >
            <p className="text-base font-semibold text-slate-950">Spara pass</p>
            <p className="mt-1 text-sm text-slate-600">Spara eller uppdatera passet i ditt bibliotek.</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setActionMenuOpen(false);
              resetBuilder();
            }}
            className="w-full rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4 text-left shadow-sm"
          >
            <p className="text-base font-semibold text-rose-700">Rensa utkast</p>
            <p className="mt-1 text-sm text-rose-600">Tar bort det lokala utkastet men lämnar sparade pass orörda.</p>
          </button>
        </div>
      </SheetShell>

      <SheetShell
        open={addSheetOpen}
        title="Lägg till block"
        subtitle="Välj vilken typ av block du vill lägga till i passet."
        onClose={() => setAddSheetOpen(false)}
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setAddSheetOpen(false);
              setCatalogPickerOpen(true);
            }}
            className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm"
          >
            <p className="text-base font-semibold text-slate-950">Lägg till enskild övning</p>
            <p className="mt-1 text-sm text-slate-600">Välj en övning från katalogen.</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setAddSheetOpen(false);
              setSupersetSheetOpen(true);
            }}
            className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm"
          >
            <p className="text-base font-semibold text-slate-950">Lägg till superset</p>
            <p className="mt-1 text-sm text-slate-600">Bygg ett block med två övningar.</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setAddSheetOpen(false);
              setCustomSheetOpen(true);
            }}
            className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm"
          >
            <p className="text-base font-semibold text-slate-950">Lägg till egen övning</p>
            <p className="mt-1 text-sm text-slate-600">Skapa en egen övning för det här passet.</p>
          </button>
        </div>
      </SheetShell>

      <SheetShell
        open={catalogPickerOpen}
        title="Välj övning"
        subtitle="Sök i övningskatalogen och lägg till en övning i passet."
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
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
          />

          <div className="space-y-3">
            {availableCatalogExercises.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                onClick={() => addSingleCatalogBlock(exercise)}
                className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm"
              >
                <p className="text-base font-semibold text-slate-950">{exercise.name}</p>
                <p className="mt-1 text-sm text-slate-600">{exercise.description}</p>
              </button>
            ))}
          </div>
        </div>
      </SheetShell>

      <SheetShell
        open={customSheetOpen}
        title="Egen övning"
        subtitle="Skapa en helt egen övning för det här passet."
        onClose={() => {
          setCustomSheetOpen(false);
          setCustomExerciseDraft(getDefaultCustomExerciseDraft());
        }}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Namn</span>
            <input
              value={customExerciseDraft.name}
              onChange={(event) =>
                setCustomExerciseDraft((previous) => ({ ...previous, name: event.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Beskrivning</span>
            <textarea
              rows={3}
              value={customExerciseDraft.description}
              onChange={(event) =>
                setCustomExerciseDraft((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Typ</span>
              <select
                value={customExerciseDraft.mode}
                onChange={(event) =>
                  setCustomExerciseDraft((previous) => ({
                    ...previous,
                    mode: event.target.value as CustomExerciseDraft["mode"],
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
              >
                <option value="reps">Reps</option>
                <option value="time">Tid</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Set</span>
              <input
                value={customExerciseDraft.sets}
                onChange={(event) =>
                  setCustomExerciseDraft((previous) => ({ ...previous, sets: event.target.value }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {customExerciseDraft.mode === "reps" ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Reps</span>
                <input
                  value={customExerciseDraft.reps}
                  onChange={(event) =>
                    setCustomExerciseDraft((previous) => ({ ...previous, reps: event.target.value }))
                  }
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Tid (sek)</span>
                <input
                  value={customExerciseDraft.duration}
                  onChange={(event) =>
                    setCustomExerciseDraft((previous) => ({
                      ...previous,
                      duration: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Vila</span>
              <input
                value={customExerciseDraft.rest}
                onChange={(event) =>
                  setCustomExerciseDraft((previous) => ({ ...previous, rest: event.target.value }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
          </div>

          <button type="button" onClick={addCustomSingleBlock} className={cn(uiButtonClasses.primary, "w-full")}>
            Lägg till egen övning
          </button>
        </div>
      </SheetShell>

      <SheetShell
        open={supersetSheetOpen}
        title="Skapa superset"
        subtitle="Välj två övningar och ställ in varv samt vila."
        onClose={() => {
          setSupersetSheetOpen(false);
          setSupersetDraft(getDefaultSupersetDraft());
        }}
      >
        <div className="space-y-4">
          <div className="grid gap-3">
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
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
              >
                <option value="">Välj första övningen</option>
                {availableCatalogExercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
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
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
              >
                <option value="">Välj andra övningen</option>
                {availableCatalogExercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
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
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Vila mellan</span>
              <input
                value={supersetDraft.restBetweenExercises}
                onChange={(event) =>
                  setSupersetDraft((previous) => ({
                    ...previous,
                    restBetweenExercises: event.target.value,
                  }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Vila efter varv</span>
              <input
                value={supersetDraft.restAfterRound}
                onChange={(event) =>
                  setSupersetDraft((previous) => ({
                    ...previous,
                    restAfterRound: event.target.value,
                  }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-400"
              />
            </label>
          </div>

          <button type="button" onClick={addSupersetBlock} className={cn(uiButtonClasses.primary, "w-full")}>
            Lägg till superset
          </button>
        </div>
      </SheetShell>
    </main>
  );
}
