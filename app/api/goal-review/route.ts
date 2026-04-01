// app/api/goal-review/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { GoalAnalysis, GoalType } from "@/lib/goal-analysis";

type GoalReviewRequest = {
  goal: GoalType;
  analysis: GoalAnalysis;
};

type GoalReviewResponse = {
  ok: true;
  comment: string;
  headline: string;
  nextFocus: string;
};

function sanitizeShortText(value: unknown, fallback: string, maxLength = 220) {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return fallback;
  }

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 3).trim()}...`;
}

/**
 * Enkel fallback om AI-anropet inte fungerar.
 * Då får användaren fortfarande något användbart i UI.
 */
function buildFallbackResponse(goal: GoalType, analysis: GoalAnalysis): GoalReviewResponse {
  const status = analysis.evaluation.status;

  const goalLabelMap: Record<GoalType, string> = {
    strength: "styrka",
    hypertrophy: "hypertrofi",
    health: "hälsa",
    body_composition: "kroppskomposition",
  };

  const headline =
    status === "on_track"
      ? "Du är på rätt väg"
      : status === "needs_attention"
      ? "Det viktigaste nu är regelbundenhet"
      : "Du har en bra grund att bygga vidare på";

  const nextFocus =
    analysis.focusAreas[0]?.title ??
    "Fortsätt med jämn träning och hållbar progression";

  const comment =
    status === "on_track"
      ? `Din träning ser stabil ut för målet ${goalLabelMap[goal]}. Nästa steg är att fortsätta bygga vidare utan att göra upplägget mer komplicerat än nödvändigt.`
      : status === "needs_attention"
      ? `Just nu bör du förenkla och prioritera kontinuitet mot målet ${goalLabelMap[goal]}. När rytmen sitter blir det mycket lättare att förbättra resten.`
      : `Du har en stabil grund för målet ${goalLabelMap[goal]}, men du kan få bättre effekt genom att fokusera lite tydligare på det viktigaste området just nu.`;

  return {
    ok: true,
    headline,
    nextFocus,
    comment,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GoalReviewRequest;
    const { goal, analysis } = body ?? {};

    if (!goal || !analysis) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing goal or analysis",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(buildFallbackResponse(goal, analysis));
    }

    const client = new OpenAI({ apiKey });

    const prompt = `
Du är en erfaren träningscoach.

Skriv en mycket kort coach-kommentar på svenska baserat på en redan strukturerad analys.
Du ska INTE räkna om något själv. Du ska bara tolka analysen pedagogiskt.

Krav:
- Var konkret, varm och tydlig
- Skriv för en vanlig användare, inte som en forskningsrapport
- Undvik fluff
- Ge inte medicinska råd
- Fokusera på vad som är viktigast just nu
- Anpassa tonen till målet
- Bygg bara på datan nedan

Returnera ENDAST giltig JSON enligt exakt detta format:
{
  "headline": "kort rubrik, max 10 ord",
  "nextFocus": "en kort mening om viktigaste fokus just nu, max 18 ord",
  "comment": "2-3 meningar, max cirka 420 tecken"
}

Mål:
${goal}

Analys:
${JSON.stringify(analysis, null, 2)}
`.trim();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const rawText =
      typeof response.output_text === "string" ? response.output_text : "";

    let parsed: {
      headline?: unknown;
      nextFocus?: unknown;
      comment?: unknown;
    } | null = null;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return NextResponse.json(buildFallbackResponse(goal, analysis));
    }

    return NextResponse.json({
      ok: true,
      headline: sanitizeShortText(parsed.headline, "Din AI-coach säger"),
      nextFocus: sanitizeShortText(
        parsed.nextFocus,
        analysis.focusAreas[0]?.title ?? "Fortsätt bygga vidare steg för steg",
        120
      ),
      comment: sanitizeShortText(
        parsed.comment,
        buildFallbackResponse(goal, analysis).comment,
        420
      ),
    });
  } catch (error) {
    console.error("Kunde inte skapa goal review:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Kunde inte skapa AI-utvärdering.",
      },
      { status: 500 }
    );
  }
}