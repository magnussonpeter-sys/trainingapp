"use client";

type NextExerciseHintProps = {
  nextExerciseName: string;
};

export default function NextExerciseHint({
  nextExerciseName,
}: NextExerciseHintProps) {
  if (!nextExerciseName) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      Nästa övning:{" "}
      <span className="font-medium text-slate-900">{nextExerciseName}</span>
    </div>
  );
}