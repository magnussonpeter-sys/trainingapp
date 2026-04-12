// app/api/workouts/generate/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";

// 🔹 OBS: använd din befintliga env-setup
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔹 Hjälpfunktion – fallback om AI svarar konstigt
function safeParseJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { goal, durationMinutes, equipment } = body;

    // 🔹 Enkel prompt (du har troligen mer avancerad i repo – behåll den om du vill)
    const prompt = `
Skapa ett träningspass som JSON.

Krav:
- duration: cirka ${durationMinutes} minuter
- mål: ${goal}
- utrustning: ${equipment?.join(", ") || "okänd"}

Format:
{
  "name": "...",
  "duration": number,
  "exercises": [
    {
      "name": "...",
      "sets": number,
      "reps": number (eller null om tidsbaserad),
      "duration": number (eller null om reps),
      "rest": number
    }
  ]
}
`;

    const response = await client.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content: "Du är en erfaren personlig tränare.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const rawText = response.choices?.[0]?.message?.content ?? "";

    const parsed = safeParseJSON(rawText);

    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "AI-svar kunde inte tolkas" },
        { status: 500 }
      );
    }

    // 🔥 VIKTIGT STEG (SPRINT 1)
    // ALLT går via normalizer → vi får blocks automatiskt
    const normalizedWorkout = normalizePreviewWorkout(parsed);

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