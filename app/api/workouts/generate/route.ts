// app/api/workouts/generate/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";

// OpenAI-klient.
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

// Säkerställer att equipment-listan blir ren och unik.
function normalizeEquipmentList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const values = new Set<string>();

  for (const item of input) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim().toLowerCase();

    if (!normalized) {
      continue;
    }

    values.add(normalized);
  }

  return Array.from(values);
}

// Hjälper debug utan att göra response för tung.
function buildDebugPayload(params: {
  goal: string;
  durationMinutes: number;
  gym: string | null;
  gymLabel: string | null;
  equipment: string[];
  prompt: string;
  rawAiText: string;
  parsed: unknown;
  normalizedWorkout: unknown;
}) {
  const {
    goal,
    durationMinutes,
    gym,
    gymLabel,
    equipment,
    prompt,
    rawAiText,
    parsed,
    normalizedWorkout,
  } = params;

  return {
    request: {
      goal,
      durationMinutes,
      gym,
      gymLabel,
      equipment,
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

    const goal =
      typeof body.goal === "string" && body.goal.trim()
        ? body.goal.trim()
        : "allmän styrka";

    const durationMinutes =
      typeof body.durationMinutes === "number" &&
      Number.isFinite(body.durationMinutes)
        ? body.durationMinutes
        : 45;

    const equipment = normalizeEquipmentList(body.equipment);
    const gym =
      typeof body.gym === "string" && body.gym.trim() ? body.gym.trim() : null;
    const gymLabel =
      typeof body.gymLabel === "string" && body.gymLabel.trim()
        ? body.gymLabel.trim()
        : null;

    const equipmentText = equipment.length > 0 ? equipment.join(", ") : "bodyweight";
    const hasEquipment =
      equipment.length > 0 &&
      !(equipment.length === 1 && equipment[0] === "bodyweight");

    // Behåll gärna denna logg tills allt känns stabilt.
    console.log("🔥 GENERATE ROUTE INPUT:", {
      goal,
      durationMinutes,
      gym,
      gymLabel,
      equipmentFromBody: body.equipment ?? null,
      equipmentFiltered: equipment,
      includeDebug: body.includeDebug ?? false,
    });

    const prompt = `
Skapa ett träningspass som JSON.

Kontext:
- mål: ${goal}
- passlängd: cirka ${durationMinutes} minuter
- gym-id: ${gym ?? "saknas"}
- gymnamn: ${gymLabel ?? "saknas"}
- tillgänglig utrustning: ${equipmentText}

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

Viktiga regler:
- Svara endast med giltig JSON
- Inga markdown-block, inga förklaringar
- Använd null för reps på tidsbaserade övningar
- Använd null för duration på repsbaserade övningar
- Välj övningar som ger ett så effektivt och välbalanserat pass som möjligt för målet
- Om utrustning finns ska du i första hand använda den när den förbättrar passets kvalitet, progression eller träningsstimulus
- Kroppsviktsövningar får användas när de är ett bättre val funktionellt, tekniskt eller tidsmässigt
- Om utrustning finns ska passet normalt inte domineras av rena kroppsviktsövningar utan tydligt skäl
- Välj övningar som realistiskt kan utföras med den angivna utrustningen
- Skapa ett kompakt, logiskt pass utan onödiga dubbletter
${hasEquipment
  ? "- Utgå från att utrustningen faktiskt finns tillgänglig och användbar"
  : "- Utgå från att passet måste kunna göras helt utan utrustning"}
`.trim();

    console.log("🔥 FINAL INPUT TO AI:", {
      goal,
      durationMinutes,
      gym,
      gymLabel,
      equipment,
      prompt,
    });

    const response = await client.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content:
            "Du är en erfaren personlig tränare som svarar med strikt JSON och optimerar för effektiva, realistiska träningspass.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
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
              gym,
              gymLabel,
              equipment,
            },
            rawAiText,
          },
        },
        { status: 500 },
      );
    }

    // Lägg tillbaka gym- och utrustningskontext på workout innan normalisering,
    // så preview och senare flöden kan läsa detta stabilt.
    const parsedWithContext =
      parsed && typeof parsed === "object"
        ? {
            ...(parsed as Record<string, unknown>),
            goal,
            duration:
              (parsed as Record<string, unknown>).duration ?? durationMinutes,
            gym,
            gymLabel,
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
            goal,
            durationMinutes,
            gym,
            gymLabel,
            equipment,
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
            goal,
            durationMinutes,
            gym,
            gymLabel,
            equipment,
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