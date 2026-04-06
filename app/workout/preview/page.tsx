"use client";

// Preview-sida = tunn container.
// All huvudsaklig logik ligger i hooken.

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useWorkoutPreview } from "@/hooks/use-workout-preview";

type SessionUserWithId = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export default function PreviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // NextAuths standardtyp saknar id, så vi läser ut det via en lokal typ.
  const userId = (session?.user as SessionUserWithId | undefined)?.id ?? "";

  const { workout, loading, updateExercise, removeExercise } =
    useWorkoutPreview({
      userId,
    });

  // Vänta tills sessionen är färdig innan vi försöker visa innehåll.
  if (status === "loading") {
    return <div className="p-4">Laddar...</div>;
  }

  // Om ingen användare finns ska sidan inte försöka jobba vidare.
  if (!userId) {
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">
            Kunde inte läsa in användaren.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Till startsidan
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return <div className="p-4">Laddar...</div>;
  }

  if (!workout) {
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Inget pass hittades.</p>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Till hem
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      {/* Header */}
      <h1 className="mb-2 text-xl font-semibold">{workout.name}</h1>
      <p className="mb-4 text-sm text-slate-500">
        {workout.duration} min • {workout.exercises.length} övningar
      </p>

      {/* Lista */}
      <div className="space-y-3">
        {workout.exercises.map((exercise: any, index: number) => (
          <div
            key={exercise.id}
            className="rounded-xl border bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{exercise.name}</h2>

              <button
                type="button"
                onClick={() => removeExercise(index)}
                className="text-sm text-red-500"
              >
                Ta bort
              </button>
            </div>

            <div className="mt-2 flex gap-3 text-sm">
              <button
                type="button"
                onClick={() =>
                  updateExercise(index, { sets: exercise.sets + 1 })
                }
                className="rounded bg-slate-100 px-2 py-1"
              >
                Sets: {exercise.sets}
              </button>

              <button
                type="button"
                onClick={() =>
                  updateExercise(index, { rest: exercise.rest + 10 })
                }
                className="rounded bg-slate-100 px-2 py-1"
              >
                Vila: {exercise.rest}s
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() => router.push("/workout/run")}
        className="fixed bottom-4 left-4 right-4 rounded-xl bg-black py-3 text-white"
      >
        Starta pass
      </button>
    </main>
  );
}