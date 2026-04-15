"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AddExerciseSheet from "@/components/preview/add-exercise-sheet";
import PreviewBlockCard from "@/components/preview/preview-block-card";
import PreviewSummaryCard from "@/components/preview/preview-summary-card";
import ReplaceExerciseSheet from "@/components/preview/replace-exercise-sheet";
import StickyActionBar from "@/components/app-shell/sticky-action-bar";
import ConfirmSheet from "@/components/shared/confirm-sheet";
import { useWorkoutPreview } from "@/hooks/use-workout-preview";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import type { Exercise } from "@/types/workout";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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
  const showDebug = searchParams.get("debug") === "1";

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addMode, setAddMode] = useState<"catalog" | "custom">("catalog");
  const [replaceExerciseId, setReplaceExerciseId] = useState<string | null>(null);
  const [removeExerciseId, setRemoveExerciseId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(showDebug);

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
    debugInfo,
    aiDebug,
    setBlockType,
    incrementBlockRounds,
    decrementBlockRounds,
    incrementBlockRestBetweenExercises,
    decrementBlockRestBetweenExercises,
    incrementBlockRestAfterRound,
    decrementBlockRestAfterRound,
  } = useWorkoutPreview({
    userId,
  });

  const allExercises = useMemo(() => getAllExercises(workout), [workout]);

  const currentReplaceExerciseName = useMemo(() => {
    if (!replaceExerciseId) {
      return "";
    }

    return allExercises.find((exercise) => exercise.id === replaceExerciseId)?.name ?? "";
  }, [allExercises, replaceExerciseId]);

  const debugSupersetSummary = useMemo(() => {
    const parsedAiResponse =
      (aiDebug?.parsedAiResponse as {
        blocks?: unknown;
        superset_considered?: unknown;
        superset_reason?: unknown;
      } | undefined) ?? undefined;
    const normalizedWorkoutDebug =
      (aiDebug?.normalizedWorkout as { blocks?: unknown } | undefined) ?? undefined;
    const validatedWorkoutDebug =
      (aiDebug?.validatedWorkout as { debug?: { warnings?: unknown } } | undefined) ??
      undefined;

    const parsedBlocks = Array.isArray(parsedAiResponse?.blocks)
      ? (parsedAiResponse.blocks as Array<{ type?: unknown }>)
      : [];
    const normalizedBlocks = Array.isArray(normalizedWorkoutDebug?.blocks)
      ? (normalizedWorkoutDebug.blocks as Array<{ type?: unknown }>)
      : [];
    const validationWarnings = Array.isArray(
      validatedWorkoutDebug?.debug?.warnings,
    )
      ? (((validatedWorkoutDebug as { debug?: { warnings?: string[] } })
          ?.debug?.warnings as string[]) ?? [])
      : [];

    const aiSuggestedSuperset = parsedBlocks.some(
      (block) => block?.type === "superset",
    );
    const normalizedHasSuperset = normalizedBlocks.some(
      (block) => block?.type === "superset",
    );
    const validatorCreatedSuperset = validationWarnings.some((warning) =>
      warning.toLowerCase().includes("skapade") &&
      warning.toLowerCase().includes("superset"),
    );

    return {
      aiSuggestedSuperset,
      normalizedHasSuperset,
      validatorCreatedSuperset,
      aiSupersetConsidered: parsedAiResponse?.superset_considered === true,
      aiSupersetReason:
        typeof parsedAiResponse?.superset_reason === "string"
          ? parsedAiResponse.superset_reason
          : "",
    };
  }, [aiDebug]);

  const dynamicSubtitle = useMemo(() => {
    if (!workout) {
      return "";
    }

    if (workout.aiComment?.trim()) {
      return workout.aiComment.trim();
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
    <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-32 sm:px-6">
      <div className="space-y-6">
        <PreviewSummaryCard
          workoutName={workout.name}
          durationMinutes={workout.duration}
          exerciseCount={summary.exerciseCount}
          totalSets={summary.setCount}
          gymLabel={workout.gymLabel ?? undefined}
          subtitle={dynamicSubtitle}
          startDisabled={startDisabled}
          onBack={() => router.push("/home")}
          onStart={handleStartWorkout}
        />

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                Passöversikt
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                Block och flöde
              </h2>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleOpenAddSheet("catalog")}
                className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
              >
                Lägg till
              </button>
              <button
                type="button"
                onClick={() => handleOpenAddSheet("custom")}
                className={cn(uiButtonClasses.secondary, "px-3 py-2 text-xs")}
              >
                Egen
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </section>

        {showDebug && workout ? (
          <section className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
                  AI-debug och validering
                </p>
                <p className="mt-1 text-sm text-amber-900/80">
                  Visa exakt request, prompt, AI-svar och validering.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDebugOpen((previous) => !previous)}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900"
              >
                {debugOpen ? "Dölj debug" : "Visa debug"}
              </button>
            </div>

            {debugOpen ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">AI föreslog superset</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {debugSupersetSummary.aiSuggestedSuperset ? "Ja" : "Nej"}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">Superset i slutligt pass</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {debugSupersetSummary.normalizedHasSuperset ? "Ja" : "Nej"}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">
                    Superset tillagt av valideringen
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {debugSupersetSummary.validatorCreatedSuperset ? "Ja" : "Nej"}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">AI övervägde superset</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {debugSupersetSummary.aiSupersetConsidered ? "Ja" : "Nej"}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">AI:s skäl</p>
                  <p className="mt-1 text-sm text-slate-900">
                    {debugSupersetSummary.aiSupersetReason || "AI gav ingen motivering ännu."}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">workout.gym</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {String(debugInfo.workoutGym)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">workout.gymLabel</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {String(debugInfo.workoutGymLabel)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">availableEquipment på workout</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {JSON.stringify(debugInfo.workoutAvailableEquipment)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">gymsLoaded</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {String(debugInfo.gymsLoaded)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">gymsCount</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {String(debugInfo.gymsCount)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">matchedGymName</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {String(debugInfo.matchedGymName)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">matchedGymEquipment</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {JSON.stringify(debugInfo.matchedGymEquipment)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">extractEquipmentFromWorkout()</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {JSON.stringify(debugInfo.extractedEquipment)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">equipmentSeed</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {JSON.stringify(debugInfo.equipmentSeed)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">availableCatalogCount</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {debugInfo.availableCatalogCount}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-xs font-medium text-slate-500">filteredCatalogCount</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {debugInfo.filteredCatalogCount}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">Första tillgängliga övningar</p>
                  <p className="mt-1 text-sm text-slate-900">
                    {debugInfo.firstAvailableExerciseNames.join(", ")}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">Första filtrerade övningar</p>
                  <p className="mt-1 text-sm text-slate-900">
                    {debugInfo.firstFilteredExerciseNames.join(", ")}
                  </p>
                </div>

                {aiDebug ? (
                  <>
                    <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                      <p className="text-xs font-medium text-slate-500">AI request / context</p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-800">
                        {JSON.stringify(
                          {
                            request: aiDebug.request,
                            generationContext: aiDebug.generationContext,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>

                    <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                      <p className="text-xs font-medium text-slate-500">AI prompt</p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-800">
                        {aiDebug.prompt ?? "Ingen prompt sparad"}
                      </pre>
                    </div>

                    <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                      <p className="text-xs font-medium text-slate-500">Raw AI response</p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-800">
                        {aiDebug.rawAiText ?? "Inget råsvar sparat"}
                      </pre>
                    </div>

                    <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                      <p className="text-xs font-medium text-slate-500">Parsed + validated</p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-800">
                        {JSON.stringify(
                          {
                            parsedAiResponse: aiDebug.parsedAiResponse,
                            validatedWorkout: aiDebug.validatedWorkout,
                            normalizedWorkout: aiDebug.normalizedWorkout,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
                    <p className="text-sm text-slate-700">
                      Ingen AI-debug sparades för detta pass ännu. Generera ett nytt AI-pass så
                      visas request, prompt, råsvar och validering här.
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {workout.blocks.length > 0 ? (
          <div className="space-y-6">
            {workout.blocks.map((block, blockIndex) => (
              <PreviewBlockCard
                key={`${block.type}-${block.title ?? "block"}-${blockIndex}`}
                block={block}
                blockIndex={blockIndex}
                onSetBlockType={setBlockType}
                onIncrementBlockRounds={incrementBlockRounds}
                onDecrementBlockRounds={decrementBlockRounds}
                onIncrementBlockRestBetweenExercises={incrementBlockRestBetweenExercises}
                onDecrementBlockRestBetweenExercises={decrementBlockRestBetweenExercises}
                onIncrementBlockRestAfterRound={incrementBlockRestAfterRound}
                onDecrementBlockRestAfterRound={decrementBlockRestAfterRound}
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
            ))}
          </div>
        ) : (
          <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
            <p className="text-base font-semibold tracking-tight text-slate-900">
              Inga block ännu
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Lägg till första övningen innan du startar passet.
            </p>
            <button
              type="button"
              onClick={() => handleOpenAddSheet("catalog")}
              className={cn(uiButtonClasses.primary, "mt-4")}
            >
              Lägg till första övningen
            </button>
          </section>
        )}
      </div>

      <StickyActionBar>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
              Redo att köra
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">
              {summary.exerciseCount} övningar · {summary.setCount} set · {workout.duration} min
            </p>
          </div>

          <button
            type="button"
            onClick={handleStartWorkout}
            disabled={startDisabled}
            className={cn(uiButtonClasses.primary, "shrink-0 px-5")}
          >
            Starta pass
          </button>
        </div>
      </StickyActionBar>

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
