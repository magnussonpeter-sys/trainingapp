"use client";

// Tunnare preview-sida enligt Sprint 2.
// Fokus:
// - samma draft hela vägen
// - snabb mobilvänlig justering
// - en tydlig huvudhandling

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AddExerciseSheet from "@/components/preview/add-exercise-sheet";
import PreviewExerciseList from "@/components/preview/preview-exercise-list";
import PreviewHeader from "@/components/preview/preview-header";
import PreviewMetaRow from "@/components/preview/preview-meta-row";
import ReplaceExerciseSheet from "@/components/preview/replace-exercise-sheet";
import ConfirmSheet from "@/components/shared/confirm-sheet";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { useWorkoutPreview } from "@/hooks/use-workout-preview";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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

  const currentReplaceExerciseName = useMemo(() => {
    if (!workout || !replaceExerciseId) {
      return "";
    }

    return (
      workout.exercises.find((exercise) => exercise.id === replaceExerciseId)
        ?.name ?? ""
    );
  }, [replaceExerciseId, workout]);

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

  function handleStartWorkout() {
    router.push(`/workout/run?userId=${encodeURIComponent(userId)}`);
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm leading-6 text-slate-600">
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
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm leading-6 text-slate-600">
              Laddar preview...
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (!workout) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm leading-6 text-slate-600">
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
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-28">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6">
        <PreviewHeader
          workoutName={workout.name}
          onBack={() => router.push("/home")}
        />

        <PreviewMetaRow
          durationMinutes={workout.duration}
          exerciseCount={summary.exerciseCount}
          totalSets={summary.totalSets}
          gymLabel={workout.gym?.trim() || "Valt gym"}
        />

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Känsla
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {dynamicSubtitle}
          </p>

          <button
            type="button"
            onClick={() => {
              setAddMode("catalog");
              setError(null);
              setShowAddSheet(true);
            }}
            className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900"
          >
            Lägg till övning
          </button>
        </section>

        {error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </section>
        ) : null}

        <PreviewExerciseList
          exercises={workout.exercises}
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
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
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
            className={cn(uiButtonClasses.primary, "flex-[1.4]")}
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
          }
        }}
        error={error}
      />

      <ReplaceExerciseSheet
        open={Boolean(replaceExerciseId)}
        currentExerciseName={currentReplaceExerciseName}
        search={catalogSearch}
        onSearchChange={setCatalogSearch}
        catalogItems={filteredCatalogExercises}
        onReplace={(item) => {
          if (!replaceExerciseId) {
            return;
          }

          const didReplace = replaceWithCatalogExercise(replaceExerciseId, item);

          if (didReplace) {
            setReplaceExerciseId(null);
          }
        }}
        onClose={() => setReplaceExerciseId(null)}
        error={error}
      />

      <ConfirmSheet
        open={Boolean(removeExerciseId)}
        title="Ta bort övning?"
        description="Övningen tas bort från passet, men du kan lägga till en ny direkt efteråt."
        confirmLabel="Ta bort"
        destructive
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
    <Suspense fallback={null}>
      <PreviewPageContent />
    </Suspense>
  );
}