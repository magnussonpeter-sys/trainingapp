"use client";

// Preview sida = TUNN container
// All logik ligger i hook

import { useWorkoutPreview } from "@/hooks/use-workout-preview";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function PreviewPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const userId = session?.user?.id as string;

  const {
    workout,
    loading,
    updateExercise,
    removeExercise,
  } = useWorkoutPreview({ userId });

  if (loading) {
    return <div className="p-4">Laddar...</div>;
  }

  if (!workout) {
    return <div className="p-4">Inget pass hittades</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      {/* Header */}
      <h1 className="text-xl font-semibold mb-2">{workout.name}</h1>
      <p className="text-sm text-slate-500 mb-4">
        {workout.duration} min • {workout.exercises.length} övningar
      </p>

      {/* Lista */}
      <div className="space-y-3">
        {workout.exercises.map((ex: any, i: number) => (
          <div
            key={ex.id}
            className="rounded-xl bg-white p-4 shadow-sm border"
          >
            <div className="flex justify-between items-center">
              <h2 className="font-medium">{ex.name}</h2>

              <button
                onClick={() => removeExercise(i)}
                className="text-red-500 text-sm"
              >
                Ta bort
              </button>
            </div>

            <div className="mt-2 flex gap-3 text-sm">
              <button
                onClick={() =>
                  updateExercise(i, { sets: ex.sets + 1 })
                }
                className="px-2 py-1 bg-slate-100 rounded"
              >
                Sets: {ex.sets}
              </button>

              <button
                onClick={() =>
                  updateExercise(i, { rest: ex.rest + 10 })
                }
                className="px-2 py-1 bg-slate-100 rounded"
              >
                Vila: {ex.rest}s
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => router.push("/workout/run")}
        className="fixed bottom-4 left-4 right-4 rounded-xl bg-black text-white py-3"
      >
        Starta pass
      </button>
    </main>
  );
}