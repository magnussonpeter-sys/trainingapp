"use client";

// Renderar hela övningslistan i preview.
// Håller page.tsx tunn genom att list-rendering bor här.

import PreviewExerciseCard from "@/components/preview/preview-exercise-card";
import type { Exercise } from "@/types/workout";

type PreviewExerciseListProps = {
  exercises: Exercise[];

  // Inline-edit
  onIncreaseSets: (exerciseId: string) => void;
  onDecreaseSets: (exerciseId: string) => void;
  onIncreaseReps: (exerciseId: string) => void;
  onDecreaseReps: (exerciseId: string) => void;
  onIncreaseDuration: (exerciseId: string) => void;
  onDecreaseDuration: (exerciseId: string) => void;
  onIncreaseRest: (exerciseId: string) => void;
  onDecreaseRest: (exerciseId: string) => void;

  // Actions
  onMoveExerciseUp: (exerciseId: string) => void;
  onMoveExerciseDown: (exerciseId: string) => void;
  onReplaceExercise: (exerciseId: string) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onAddFirstExercise: () => void;
};

function isTimedExercise(exercise: Exercise) {
  return (
    typeof exercise.duration === "number" &&
    exercise.duration > 0 &&
    (!exercise.reps || exercise.reps <= 0)
  );
}

export default function PreviewExerciseList({
  exercises,
  onIncreaseSets,
  onDecreaseSets,
  onIncreaseReps,
  onDecreaseReps,
  onIncreaseDuration,
  onDecreaseDuration,
  onIncreaseRest,
  onDecreaseRest,
  onMoveExerciseUp,
  onMoveExerciseDown,
  onReplaceExercise,
  onRemoveExercise,
  onAddFirstExercise,
}: PreviewExerciseListProps) {
  if (exercises.length === 0) {
    return (
      <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
        <p className="text-base font-semibold tracking-tight text-slate-900">
          Inga övningar ännu
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Lägg till första övningen innan du startar passet.
        </p>

        <button
          type="button"
          onClick={onAddFirstExercise}
          className="mt-4 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          Lägg till första övningen
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {exercises.map((exercise, index) => {
        const timedExercise = isTimedExercise(exercise);

        return (
          <PreviewExerciseCard
            key={exercise.id}
            index={index}
            total={exercises.length}
            name={exercise.name}
            description={exercise.description}
            sets={exercise.sets}
            reps={exercise.reps ?? undefined}
            duration={exercise.duration ?? undefined}
            rest={exercise.rest}
            timedExercise={timedExercise}
            onDecreaseSets={() => onDecreaseSets(exercise.id)}
            onIncreaseSets={() => onIncreaseSets(exercise.id)}
            onDecreaseReps={() => onDecreaseReps(exercise.id)}
            onIncreaseReps={() => onIncreaseReps(exercise.id)}
            onDecreaseDuration={() => onDecreaseDuration(exercise.id)}
            onIncreaseDuration={() => onIncreaseDuration(exercise.id)}
            onDecreaseRest={() => onDecreaseRest(exercise.id)}
            onIncreaseRest={() => onIncreaseRest(exercise.id)}
            onMoveUp={() => onMoveExerciseUp(exercise.id)}
            onMoveDown={() => onMoveExerciseDown(exercise.id)}
            onReplace={() => onReplaceExercise(exercise.id)}
            onRemove={() => onRemoveExercise(exercise.id)}
          />
        );
      })}
    </section>
  );
}