"use client";

// Tunnare preview-sida enligt Sprint 2.
// Fokus:
// - samma draft hela vägen
// - snabb mobilvänlig justering
// - tydlig huvudhandling
// - färdigare UX i preview
// Sprint 1:
// - läs workout via blocks i stället för platt exercises-lista
// - behåll samma UI och globalt styrbar design

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AddExerciseSheet from "@/components/preview/add-exercise-sheet";
import PreviewExerciseList from "@/components/preview/preview-exercise-list";
import PreviewHeader from "@/components/preview/preview-header";
import PreviewMetaRow from "@/components/preview/preview-meta-row";
import ReplaceExerciseSheet from "@/components/preview/replace-exercise-sheet";
import ConfirmSheet from "@/components/shared/confirm-sheet";
import { useWorkoutPreview } from "@/hooks/use-workout-preview";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import type { Exercise } from "@/types/workout";

// Liten klass-hjälpare för att hålla sidan ren.
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Plattar ut alla övningar från samtliga block.
// I sprint 1 används i praktiken bara straight_sets,
// men detta gör sidan redo för framtida blocktyper.
function getAllExercises(
  workout: {
    blocks?: Array<{
      exercises?: Exercise[];
    }>;
  } | null,
): Exercise[] {
  if (!workout?.blocks?.length) {
    return [];
  }

  return workout.blocks.flatMap((block) => block.exercises ?? []);
}

function PreviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const userId = searchParams.get("userId") ?? "";

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addMode, setAddMode] = useState<"catalog" | "custom">("catalog");
  const [replaceExerciseId, setReplaceExerciseId] = useState<string | null>(null);
  const [removeExerciseId, setRemoveExerciseId] = useState<string | null>(null);

  const {
    workout,
    loading,
    error,
    setError,
    summary,
    removeExercise,
    moveExercise,
    incrementSets,
    decrementSets,
    incrementReps,
    decrementReps,
    incrementDuration,
    decrementDuration,
    incrementRest,
    decrementRest,
    catalogSearch,
    setCatalogSearch,
    filteredCatalogExercises,
    addCatalogExercise,
    replaceWithCatalogExercise,
    customName,
    setCustomName,
    customSets,
    setCustomSets,
    customReps,
    setCustomReps,
    customDuration,
    setCustomDuration,
    customRest,
    setCustomRest,
    customDescription,
    setCustomDescription,
    addCustomExercise,
  } = useWorkoutPreview({
    userId,
  });

  // Alla övningar i passet, oavsett block.
  const allExercises = useMemo(() => getAllExercises(workout), [workout]);

  const currentReplaceExerciseName = useMemo(() => {
    if (!replaceExerciseId) {
      return "";
    }

    return allExercises.find((exercise) => exercise.id === replaceExerciseId)?.name ?? "";
  }, [allExercises, replaceExerciseId]);

  const dynamicSubtitle = useMemo(() => {
    if (!workout) {
      return "";
    }

    if (summary.exerciseCount <= 4) {
      return "Kort och fokuserat pass.";
    }

    if (summary.timedExercises > 0) {
      return "Blandning av reps och tidsstyrda moment.";
    }

    return "Stabilt pass med tydlig struktur.";
  }, [summary, workout]);

  function scrollToBottomSoon() {
    requestAnimationFrame(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  function handleOpenAddSheet(mode: "catalog" | "custom" = "catalog") {
    setAddMode(mode);
    setError(null);
    setShowAddSheet(true);
  }

  function handleStartWorkout() {
    if (!workout || allExercises.length === 0) {
      return;
    }

    router.push(`/workout/run?userId=${encodeURIComponent(userId)}`);
  }

  if (!userId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Preview saknar användare</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Kunde inte läsa in användaren för preview.
          </p>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className={cn(uiButtonClasses.primary, "mt-4")}
          >
            Till hem
          </button>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Laddar preview...</p>
        </section>
      </main>
    );
  }

  if (!workout) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Inget pass hittades</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Inget pass hittades. Gå tillbaka till hem och skapa ett nytt pass.
          </p>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className={cn(uiButtonClasses.primary, "mt-4")}
          >
            Till hem
          </button>
        </section>
      </main>
    );
  }

  const startDisabled = allExercises.length === 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="space-y-6">
        <PreviewHeader
          workoutName={workout.name}
          onBack={() => router.push("/home")}
        />

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                Känsla
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
                {workout.name}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{dynamicSubtitle}</p>
            </div>

<PreviewMetaRow
  durationMinutes={workout.duration}
  exerciseCount={summary.exerciseCount}
  totalSets={summary.setCount}
  timedExercises={summary.timedExercises}
  gymLabel={workout.gymLabel ?? undefined}
/>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleOpenAddSheet("catalog")}
                className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900"
              >
                Lägg till övning
              </button>

              <button
                type="button"
                onClick={() => handleOpenAddSheet("custom")}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Egen övning
              </button>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>
        </section>

<PreviewExerciseList
  exercises={allExercises}
  onIncreaseSets={incrementSets}
  onDecreaseSets={decrementSets}
  onIncreaseReps={incrementReps}
  onDecreaseReps={decrementReps}
  onIncreaseDuration={incrementDuration}
  onDecreaseDuration={decrementDuration}
  onIncreaseRest={incrementRest}
  onDecreaseRest={decrementRest}
  onMoveExerciseUp={(exerciseId) => moveExercise(exerciseId, "up")}
  onMoveExerciseDown={(exerciseId) => moveExercise(exerciseId, "down")}
  onReplaceExercise={(exerciseId) => {
    setError(null);
    setReplaceExerciseId(exerciseId);
  }}
  onRemoveExercise={(exerciseId) => {
    setError(null);
    setRemoveExerciseId(exerciseId);
  }}
  onAddFirstExercise={() => handleOpenAddSheet("catalog")}
/>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className={cn(uiButtonClasses.secondary, "flex-1")}
          >
            Tillbaka
          </button>

          <button
            type="button"
            onClick={handleStartWorkout}
            disabled={startDisabled}
            className={cn(uiButtonClasses.primary, "flex-1")}
          >
            Starta pass
          </button>
        </div>
      </div>

      <AddExerciseSheet
        open={showAddSheet}
        mode={addMode}
        onModeChange={setAddMode}
        onClose={() => setShowAddSheet(false)}
        catalogSearch={catalogSearch}
        onCatalogSearchChange={setCatalogSearch}
        catalogItems={filteredCatalogExercises}
        onAddCatalogExercise={(item) => {
          const didAdd = addCatalogExercise(item);
          if (didAdd) {
            setShowAddSheet(false);
            scrollToBottomSoon();
          }
        }}
        customName={customName}
        onCustomNameChange={setCustomName}
        customSets={customSets}
        onCustomSetsChange={setCustomSets}
        customReps={customReps}
        onCustomRepsChange={setCustomReps}
        customDuration={customDuration}
        onCustomDurationChange={setCustomDuration}
        customRest={customRest}
        onCustomRestChange={setCustomRest}
        customDescription={customDescription}
        onCustomDescriptionChange={setCustomDescription}
        onAddCustomExercise={() => {
          const didAdd = addCustomExercise();
          if (didAdd) {
            setShowAddSheet(false);
            scrollToBottomSoon();
          }
        }}
        error={error}
      />

      <ReplaceExerciseSheet
        open={Boolean(replaceExerciseId)}
        exerciseName={currentReplaceExerciseName}
        catalogSearch={catalogSearch}
        onCatalogSearchChange={setCatalogSearch}
        catalogItems={filteredCatalogExercises}
        onReplaceWithCatalogExercise={(item) => {
          if (!replaceExerciseId) {
            return;
          }

          const didReplace = replaceWithCatalogExercise(replaceExerciseId, item);
          if (didReplace) {
            setReplaceExerciseId(null);
            scrollToBottomSoon();
          }
        }}
        onClose={() => setReplaceExerciseId(null)}
        error={error}
      />

      <ConfirmSheet
        open={Boolean(removeExerciseId)}
        title="Ta bort övning?"
        description="Övningen tas bort från passet. Du kan lägga till den igen senare."
        confirmLabel="Ta bort"
        cancelLabel="Avbryt"
        onConfirm={() => {
          if (!removeExerciseId) {
            return;
          }

          removeExercise(removeExerciseId);
          setRemoveExerciseId(null);
        }}
        onCancel={() => setRemoveExerciseId(null)}
      />
    </main>
  );
}

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Laddar preview...</p>
          </section>
        </main>
      }
    >
      <PreviewPageContent />
    </Suspense>
  );
}