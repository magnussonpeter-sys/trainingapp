"use client";

// Liten editorrad för ett enskilt preview-kort.
// Använder delad stepper så att formspråket blir konsekvent i appen.

import InlineNumberStepper from "@/components/shared/inline-number-stepper";

type PreviewInlineEditorProps = {
  timedExercise: boolean;
  sets: number;
  reps?: number;
  duration?: number;
  rest: number;
  onDecreaseSets: () => void;
  onIncreaseSets: () => void;
  onDecreaseReps?: () => void;
  onIncreaseReps?: () => void;
  onDecreaseDuration?: () => void;
  onIncreaseDuration?: () => void;
  onDecreaseRest: () => void;
  onIncreaseRest: () => void;
};

function formatDuration(seconds?: number) {
  if (typeof seconds !== "number" || seconds <= 0) {
    return "—";
  }

  return `${seconds} sek`;
}

function formatRest(seconds: number) {
  return `${seconds} sek`;
}

export default function PreviewInlineEditor({
  timedExercise,
  sets,
  reps,
  duration,
  rest,
  onDecreaseSets,
  onIncreaseSets,
  onDecreaseReps,
  onIncreaseReps,
  onDecreaseDuration,
  onIncreaseDuration,
  onDecreaseRest,
  onIncreaseRest,
}: PreviewInlineEditorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <InlineNumberStepper
        label="Set"
        value={sets}
        onDecrease={onDecreaseSets}
        onIncrease={onIncreaseSets}
        decreaseDisabled={sets <= 1}
        helperText="Antal arbetsset"
      />

      {timedExercise ? (
        <InlineNumberStepper
          label="Tid"
          value={formatDuration(duration)}
          onDecrease={onDecreaseDuration ?? (() => undefined)}
          onIncrease={onIncreaseDuration ?? (() => undefined)}
          decreaseDisabled={!onDecreaseDuration || (duration ?? 0) <= 5}
          increaseDisabled={!onIncreaseDuration}
          helperText="Tid per set"
        />
      ) : (
        <InlineNumberStepper
          label="Reps"
          value={typeof reps === "number" && reps > 0 ? reps : "—"}
          onDecrease={onDecreaseReps ?? (() => undefined)}
          onIncrease={onIncreaseReps ?? (() => undefined)}
          decreaseDisabled={!onDecreaseReps || (reps ?? 0) <= 1}
          increaseDisabled={!onIncreaseReps}
          helperText="Rekommenderade reps"
        />
      )}

      <InlineNumberStepper
        label="Vila"
        value={formatRest(rest)}
        onDecrease={onDecreaseRest}
        onIncrease={onIncreaseRest}
        decreaseDisabled={rest <= 0}
        helperText="Vila mellan set"
      />
    </div>
  );
}