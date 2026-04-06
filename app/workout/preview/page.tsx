"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkoutPreview } from "@/hooks/use-workout-preview";
import type { ExerciseCatalogItem } from "@/lib/exercise-catalog";

type PreviewExercise = {
  id: string;
  name: string;
  sets: number;
  reps?: number;
  duration?: number;
  rest: number;
  description?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatExerciseType(exercise: PreviewExercise) {
  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    return "Tidsstyrd";
  }

  return "Reps";
}

function formatPrescription(exercise: PreviewExercise) {
  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    return `${exercise.sets} × ${exercise.duration} sek`;
  }

  if (typeof exercise.reps === "number" && exercise.reps > 0) {
    return `${exercise.sets} × ${exercise.reps} reps`;
  }

  return `${exercise.sets} set`;
}

function formatRest(rest: number) {
  return `${rest} sek vila`;
}

function MetaChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-2 shadow-sm",
        accent
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-medium uppercase tracking-[0.14em]",
          accent ? "text-slate-300" : "text-slate-400",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          accent ? "text-white" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Stepper({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
      <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDecrease}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition active:scale-[0.98]"
        >
          −
        </button>

        <div className="min-w-[74px] text-center text-sm font-semibold text-slate-900">
          {value}
        </div>

        <button
          type="button"
          onClick={onIncrease}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition active:scale-[0.98]"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Stäng"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl rounded-t-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200" />

        <div className="px-4 pb-6 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Preview
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {subtitle}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Stäng
            </button>
          </div>

          <div className="mt-5 max-h-[70vh] overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ExerciseCatalogList({
  items,
  actionLabel,
  onSelect,
}: {
  items: ExerciseCatalogItem[];
  actionLabel: string;
  onSelect: (item: ExerciseCatalogItem) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">
                {item.name}
              </h3>

              {item.description ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {item.description}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-2">
                {item.requiredEquipment?.slice(0, 3).map((equipment) => (
                  <span
                    key={`${item.id}-${equipment}`}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    {equipment}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelect(item)}
              className="shrink-0 rounded-2xl bg-slate-950 px-3 py-2 text-sm font-medium text-white"
            >
              {actionLabel}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CustomExerciseForm({
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
  onSubmit,
}: {
  customName: string;
  setCustomName: (value: string) => void;
  customSets: string;
  setCustomSets: (value: string) => void;
  customReps: string;
  setCustomReps: (value: string) => void;
  customDuration: string;
  setCustomDuration: (value: string) => void;
  customRest: string;
  setCustomRest: (value: string) => void;
  customDescription: string;
  setCustomDescription: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-700">
            Namn på övning
          </span>
          <input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
            placeholder="Till exempel Bulgarian split squat"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">Set</span>
            <input
              inputMode="numeric"
              value={customSets}
              onChange={(event) => setCustomSets(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">Reps</span>
            <input
              inputMode="numeric"
              value={customReps}
              onChange={(event) => setCustomReps(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">
              Tid per set (sek)
            </span>
            <input
              inputMode="numeric"
              value={customDuration}
              onChange={(event) => setCustomDuration(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">Vila (sek)</span>
            <input
              inputMode="numeric"
              value={customRest}
              onChange={(event) => setCustomRest(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-700">Beskrivning</span>
          <textarea
            value={customDescription}
            onChange={(event) => setCustomDescription(event.target.value)}
            className="min-h-[100px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            placeholder="Kort instruktion eller notering"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
      >
        Lägg till övning
      </button>
    </div>
  );
}

function ExerciseCard({
  exercise,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onDecreaseSets,
  onIncreaseSets,
  onDecreaseRest,
  onIncreaseRest,
  onRemove,
  onReplace,
}: {
  exercise: PreviewExercise;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDecreaseSets: () => void;
  onIncreaseSets: () => void;
  onDecreaseRest: () => void;
  onIncreaseRest: () => void;
  onRemove: () => void;
  onReplace: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
              Övning {index + 1}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              {exercise.name}
            </h2>
          </div>

          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
            {formatExerciseType(exercise)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
            {formatPrescription(exercise)}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {formatRest(exercise.rest)}
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {exercise.description ? (
          <p className="text-sm leading-6 text-slate-600">
            {exercise.description}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Stepper
            label="Set"
            value={String(exercise.sets)}
            onDecrease={onDecreaseSets}
            onIncrease={onIncreaseSets}
          />

          <Stepper
            label="Vila"
            value={`${exercise.rest}s`}
            onDecrease={onDecreaseRest}
            onIncrease={onIncreaseRest}
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className={cn(
              "rounded-2xl border px-3 py-3 text-sm font-medium transition",
              index === 0
                ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                : "border-slate-200 bg-white text-slate-700 active:scale-[0.99]",
            )}
          >
            Upp
          </button>

          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className={cn(
              "rounded-2xl border px-3 py-3 text-sm font-medium transition",
              index === total - 1
                ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                : "border-slate-200 bg-white text-slate-700 active:scale-[0.99]",
            )}
          >
            Ned
          </button>

          <button
            type="button"
            onClick={onReplace}
            className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-sm font-medium text-indigo-700 transition active:scale-[0.99]"
          >
            Byt
          </button>

          <button
            type="button"
            onClick={onRemove}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-medium text-rose-700 transition active:scale-[0.99]"
          >
            Ta bort
          </button>
        </div>
      </div>
    </article>
  );
}

function PreviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId") ?? "";

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addMode, setAddMode] = useState<"catalog" | "custom">("catalog");
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

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
              className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
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
              className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
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
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 pb-6 pt-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
                  Föreslaget AI-pass
                </p>

                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {workout.name}
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                  Snabbgranska passet, finjustera det som behövs och starta när
                  det känns rätt.
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.push("/home")}
                className="shrink-0 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white"
              >
                Tillbaka
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetaChip label="Tid" value={`${workout.duration} min`} accent />
              <MetaChip
                label="Övningar"
                value={String(summary.exerciseCount)}
                accent
              />
              <MetaChip
                label="Totala set"
                value={String(summary.totalSets)}
                accent
              />
              <MetaChip
                label="Gym"
                value={workout.gymLabel?.trim() || "Valt gym"}
                accent
              />
            </div>
          </div>

          <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Känsla
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {dynamicSubtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setAddMode("catalog");
                setError(null);
                setShowAddSheet(true);
              }}
              className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-left transition active:scale-[0.99]"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-indigo-500">
                Snabbåtgärd
              </p>
              <p className="mt-1 text-sm font-semibold text-indigo-900">
                Lägg till övning
              </p>
              <p className="mt-1 text-sm leading-6 text-indigo-800">
                Katalog eller egen övning.
              </p>
            </button>
          </div>
        </section>

        {error ? (
          <section className="mt-4 rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </section>
        ) : null}

        <section className="mt-4 space-y-4">
          {workout.exercises.map((exercise, index) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              index={index}
              total={workout.exercises.length}
              onMoveUp={() => moveExercise(index, "up")}
              onMoveDown={() => moveExercise(index, "down")}
              onDecreaseSets={() => decrementSets(index)}
              onIncreaseSets={() => incrementSets(index)}
              onDecreaseRest={() => decrementRest(index)}
              onIncreaseRest={() => incrementRest(index)}
              onRemove={() => removeExercise(index)}
              onReplace={() => {
                setError(null);
                setReplaceIndex(index);
              }}
            />
          ))}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
          >
            Avbryt
          </button>

          <button
            type="button"
            onClick={() => router.push("/workout/run")}
            className="flex-[1.4] rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm"
          >
            Starta pass
          </button>
        </div>
      </div>

      <Sheet
        open={showAddSheet}
        title="Lägg till övning"
        subtitle="Välj från katalogen eller skapa en egen övning. Ändringen sparas direkt i samma workout draft."
        onClose={() => {
          setShowAddSheet(false);
          setError(null);
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setAddMode("catalog")}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                addMode === "catalog"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600",
              )}
            >
              Katalog
            </button>
            <button
              type="button"
              onClick={() => setAddMode("custom")}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                addMode === "custom"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600",
              )}
            >
              Egen övning
            </button>
          </div>

          {addMode === "catalog" ? (
            <div className="space-y-4">
              <input
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Sök övning..."
              />

              <ExerciseCatalogList
                items={filteredCatalogExercises}
                actionLabel="Lägg till"
                onSelect={(item) => {
                  const didAdd = addCatalogExercise(item);
                  if (didAdd) {
                    setShowAddSheet(false);
                  }
                }}
              />
            </div>
          ) : (
            <CustomExerciseForm
              customName={customName}
              setCustomName={setCustomName}
              customSets={customSets}
              setCustomSets={setCustomSets}
              customReps={customReps}
              setCustomReps={setCustomReps}
              customDuration={customDuration}
              setCustomDuration={setCustomDuration}
              customRest={customRest}
              setCustomRest={setCustomRest}
              customDescription={customDescription}
              setCustomDescription={setCustomDescription}
              onSubmit={() => {
                const didAdd = addCustomExercise();
                if (didAdd) {
                  setShowAddSheet(false);
                }
              }}
            />
          )}
        </div>
      </Sheet>

      <Sheet
        open={replaceIndex !== null}
        title="Byt övning"
        subtitle="Välj en ny övning från katalogen. Nuvarande övning ersätts direkt i listan."
        onClose={() => {
          setReplaceIndex(null);
          setError(null);
        }}
      >
        <div className="space-y-4">
          <input
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="Sök övning att byta till..."
          />

          <ExerciseCatalogList
            items={filteredCatalogExercises}
            actionLabel="Byt"
            onSelect={(item) => {
              if (replaceIndex === null) {
                return;
              }

              const didReplace = replaceWithCatalogExercise(replaceIndex, item);

              if (didReplace) {
                setReplaceIndex(null);
              }
            }}
          />
        </div>
      </Sheet>
    </main>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<div className="p-4">Laddar preview...</div>}>
      <PreviewPageContent />
    </Suspense>
  );
}