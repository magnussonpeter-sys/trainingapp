// app/api/workouts/generate/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";

// OpenAI-klient
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Försök tolka AI-svar som JSON.
// Hanterar både rent JSON-svar och kodblock med ```json ... ```
function safeParseJSON(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Försök plocka ut JSON ur kodblock
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        return null;
      }
    }

    return null;
  }
}

// Hjälper debug utan att göra response för tung.
function buildDebugPayload(params: {
  body: Record<string, unknown>;
  prompt: string;
  rawAiText: string;
  parsed: unknown;
  normalizedWorkout: unknown;
}) {
  const { body, prompt, rawAiText, parsed, normalizedWorkout } = params;

  return {
    request: {
      goal: body.goal ?? null,
      durationMinutes: body.durationMinutes ?? null,
      gym: body.gym ?? null,
      gymLabel: body.gymLabel ?? null,
      equipment: Array.isArray(body.equipment) ? body.equipment : [],
    },
    prompt,
    rawAiText,
    parsedAiResponse: parsed,
    normalizedWorkout,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      goal?: string;
      durationMinutes?: number;
      equipment?: string[];
      gym?: string | null;
      gymLabel?: string | null;
      includeDebug?: boolean;
    };

    const goal = typeof body.goal === "string" && body.goal.trim()
      ? body.goal.trim()
      : "allmän styrka";

    const durationMinutes =
      typeof body.durationMinutes === "number" && Number.isFinite(body.durationMinutes)
        ? body.durationMinutes
        : 45;

    const equipment = Array.isArray(body.equipment)
      ? body.equipment.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
      : [];

    // DEBUG 1:
    // Visar exakt vad API-route fick in från frontend innan prompten byggs.
    console.log("🔥 GENERATE ROUTE INPUT:", {
      goal,
      durationMinutes,
      gym: body.gym ?? null,
      gymLabel: body.gymLabel ?? null,
      equipmentFromBody: body.equipment ?? null,
      equipmentFiltered: equipment,
      includeDebug: body.includeDebug ?? false,
    });

    const prompt = `
Skapa ett träningspass som JSON.

Krav:
- duration: cirka ${durationMinutes} minuter
- mål: ${goal}
- utrustning: ${equipment.join(", ") || "okänd"}

Format:
{
  "name": "...",
  "duration": number,
  "exercises": [
    {
      "name": "...",
      "sets": number,
      "reps": number | null,
      "duration": number | null,
      "rest": number
    }
  ]
}

Regler:
- Svara endast med giltig JSON
- Använd null för reps på tidsbaserade övningar
- Använd null för duration på repsbaserade övningar
- Föreslå gärna kroppsviktsövningar även om utrustning finns, om det är lämpligt
- Men använd också tillgänglig utrustning när det är relevant
`.trim();

    // DEBUG 2:
    // Visar den slutliga input som faktiskt skickas till AI:n.
    console.log("🔥 FINAL INPUT TO AI:", {
      goal,
      durationMinutes,
      gym: body.gym ?? null,
      gymLabel: body.gymLabel ?? null,
      equipment,
      prompt,
    });

    const response = await client.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content: "Du är en erfaren personlig tränare som svarar med strikt JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const rawAiText = response.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJSON(rawAiText);

    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          error: "AI-svar kunde inte tolkas",
          debug: {
            request: {
              goal,
              durationMinutes,
              gym: body.gym ?? null,
              gymLabel: body.gymLabel ?? null,
              equipment,
            },
            rawAiText,
          },
        },
        { status: 500 },
      );
    }

    // Viktig fix:
    // Lägg tillbaka gym- och utrustningskontext på workout innan normalisering,
    // så preview-hooken faktiskt kan läsa detta senare.
    const parsedWithContext =
      parsed && typeof parsed === "object"
        ? {
            ...(parsed as Record<string, unknown>),
            goal,
            duration: (parsed as Record<string, unknown>).duration ?? durationMinutes,
            gym: body.gym ?? null,
            gymLabel: body.gymLabel ?? null,
            availableEquipment: equipment,
          }
        : parsed;

    const normalizedWorkout = normalizePreviewWorkout(parsedWithContext);

    if (!normalizedWorkout) {
      return NextResponse.json(
        {
          ok: false,
          error: "Kunde inte normalisera träningspass",
          debug: buildDebugPayload({
            body,
            prompt,
            rawAiText,
            parsed,
            normalizedWorkout: null,
          }),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      workout: normalizedWorkout,
      debug: body.includeDebug
        ? buildDebugPayload({
            body,
            prompt,
            rawAiText,
            parsed,
            normalizedWorkout,
          })
        : undefined,
    });
  } catch (error) {
    console.error("Workout generate error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Kunde inte generera pass",
      },
      { status: 500 },
    );
  }
}