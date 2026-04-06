"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkoutPreview } from "@/hooks/use-workout-preview";

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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
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
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition active:scale-[0.98]"
        >
          −
        </button>

        <div className="min-w-[74px] text-center text-sm font-semibold text-slate-900">
          {value}
        </div>

        <button
          type="button"
          onClick={onIncrease}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition active:scale-[0.98]"
        >
          +
        </button>
      </div>
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

        <div className="grid grid-cols-3 gap-2">
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

  const {
    workout,
    loading,
    summary,
    removeExercise,
    moveExercise,
    incrementSets,
    decrementSets,
    incrementRest,
    decrementRest,
  } = useWorkoutPreview({
    userId,
  });

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
        {/* Toppsektion */}
        <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Föreslaget AI-pass
              </p>

              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {workout.name}
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Granska snabbt, justera några detaljer och starta när det känns
                rätt. Ändringarna sparas direkt i samma draft.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/home")}
              className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Tillbaka
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetaChip label="Tid" value={`${workout.duration} min`} />
            <MetaChip label="Övningar" value={String(summary.exerciseCount)} />
            <MetaChip label="Totala set" value={String(summary.totalSets)} />
            <MetaChip
              label="Gym"
              value={workout.gymLabel?.trim() || "Valt gym"}
            />
          </div>
        </section>

        {/* Snabbhint */}
        <section className="mt-4 rounded-[24px] border border-indigo-100 bg-indigo-50/70 p-4">
          <p className="text-sm leading-6 text-indigo-900">
            Snabbt tips: justera främst <strong>set</strong> och{" "}
            <strong>vila</strong> här. Byten och att lägga till övningar tar vi
            i nästa steg av Sprint 2.
          </p>
        </section>

        {/* Övningslista */}
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
            />
          ))}
        </section>
      </div>

      {/* Sticky bottom CTA */}
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