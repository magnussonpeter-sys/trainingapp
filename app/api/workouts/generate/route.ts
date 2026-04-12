// app/api/workouts/generate/route.ts

import { NextResponse } from "next/server";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 🔹 Här kör du din befintliga AI/generator-logik
    const generated = await generateWorkoutInternal(body); // ← din befintliga funktion

    // 🔹 VIKTIGT: normalisera till nya modellen (blocks)
    const normalizedWorkout = normalizePreviewWorkout(generated);

    if (!normalizedWorkout) {
      return NextResponse.json(
        { ok: false, error: "Kunde inte normalisera träningspass" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      workout: normalizedWorkout,
    });
  } catch (error) {
    console.error("Workout generate error:", error);

    return NextResponse.json(
      { ok: false, error: "Kunde inte generera pass" },
      { status: 500 }
    );
  }
}