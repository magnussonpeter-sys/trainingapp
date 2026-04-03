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

// Enkel måltext för mer naturliga svar.
function getGoalLabel(goal: GoalType) {
  switch (goal) {
    case "strength":
      return "styrka";
    case "hypertrophy":
      return "muskelbyggnad";
    case "health":
      return "hälsa och funktion";
    case "body_composition":
      return "kroppssammansättning";
    default:
      return "träning";
  }
}

// Sanerar kort text så UI inte får för långa rubriker.
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

// Fallback om AI-anropet fallerar.
function buildFallbackResponse(
  goal: GoalType,
  analysis: GoalAnalysis
): GoalReviewResponse {
  const goalLabel = getGoalLabel(goal);
  const firstFocus =
    analysis.focusAreas[0]?.title ??
    "fortsätt bygga jämn träning med hållbar progression";

  const headline =
    analysis.evaluation.status === "on_track"
      ? "Du är på rätt väg"
      : analysis.evaluation.status === "needs_attention"
      ? "Det viktigaste nu är att justera upplägget"
      : "Du har en grund att bygga vidare på";

  const nextFocus = sanitizeShortText(
    firstFocus,
    "Fortsätt med jämn träning och hållbar progression",
    120
  );

  const comment =
    analysis.evaluation.status === "on_track"
      ? `Din träning ser i stora drag tillräckligt bra ut för målet ${goalLabel}. Fortsätt bygga vidare med små steg framåt, utan att tappa kontinuiteten.`
      : analysis.evaluation.status === "needs_attention"
      ? `Just nu matchar träningen inte målet ${goalLabel} tillräckligt bra. Det viktigaste är att förbättra det område som ligger längst efter, särskilt om frekvens eller total träningsmängd är för låg.`
      : `Du har en okej grund för målet ${goalLabel}, men du behöver sannolikt göra träningen lite mer konsekvent eller lite bättre riktad mot målet för att få tydligare resultat.`;

  return {
    ok: true,
    headline,
    nextFocus,
    comment,
  };
}

// Enkel validering av request-body.
function isGoalReviewRequest(value: unknown): value is GoalReviewRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeValue = value as GoalReviewRequest;

  return (
    typeof maybeValue.goal === "string" &&
    !!maybeValue.analysis &&
    typeof maybeValue.analysis === "object"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isGoalReviewRequest(body)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ogiltigt request-format.",
        },
        { status: 400 }
      );
    }

    const { goal, analysis } = body;

    // Om ingen API-nyckel finns får användaren ändå något användbart.
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(buildFallbackResponse(goal, analysis));
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const goalLabel = getGoalLabel(goal);

    // Vi ber modellen vara väldigt konkret kring vad som behöver ändras.
    const prompt = `
Du är en tydlig men pedagogisk träningscoach i en svensk träningsapp.

Användarens mål: ${goalLabel}

Analysdata:
- status: ${analysis.evaluation.status}
- overallScore: ${analysis.evaluation.overallScore}
- weeklyFrequency: ${analysis.metrics.weeklyFrequency}
- completedWorkouts28d: ${analysis.metrics.completedWorkouts28d}
- totalSets28d: ${analysis.metrics.totalSets28d}
- uniqueExercises28d: ${analysis.metrics.uniqueExercises28d}
- averageWorkoutMinutes: ${analysis.metrics.averageWorkoutMinutes}
- consistencyScore: ${analysis.metrics.consistencyScore}
- progressionScore: ${analysis.metrics.progressionScore}
- volumeScore: ${analysis.metrics.volumeScore}
- recoveryScore: ${analysis.metrics.recoveryScore}
- exerciseVarietyScore: ${analysis.metrics.exerciseVarietyScore}
- strengths: ${analysis.evaluation.strengths.join(" | ")}
- gaps: ${analysis.evaluation.gaps.join(" | ")}
- focusAreas: ${analysis.focusAreas
      .map((area) => `${area.title}: ${area.reason}`)
      .join(" | ")}
- recommendations: ${analysis.recommendations
      .map((rec) => `${rec.title}: ${rec.description}`)
      .join(" | ")}

Svara på svenska som JSON med exakt dessa nycklar:
{
  "headline": "...",
  "nextFocus": "...",
  "comment": "..."
}

Regler:
- Var konkret.
- Förklara tydligt om användaren tränar för lite, för ojämnt eller med för låg total volym för målet.
- Om analysen visar brister, säg uttryckligen vad användaren behöver göra för att komma närmare målet.
- Undvik fluff, tomma peppfraser och vaga formuleringar.
- headline max 80 tecken.
- nextFocus max 110 tecken.
- comment max 500 tecken.
`.trim();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const text = response.output_text?.trim() ?? "";

    if (!text) {
      return NextResponse.json(buildFallbackResponse(goal, analysis));
    }

    let parsed: {
      headline?: unknown;
      nextFocus?: unknown;
      comment?: unknown;
    } | null = null;

    try {
      parsed = JSON.parse(text) as {
        headline?: unknown;
        nextFocus?: unknown;
        comment?: unknown;
      };
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return NextResponse.json(buildFallbackResponse(goal, analysis));
    }

    return NextResponse.json({
      ok: true,
      headline: sanitizeShortText(
        parsed.headline,
        buildFallbackResponse(goal, analysis).headline,
        80
      ),
      nextFocus: sanitizeShortText(
        parsed.nextFocus,
        buildFallbackResponse(goal, analysis).nextFocus,
        110
      ),
      comment: sanitizeShortText(
        parsed.comment,
        buildFallbackResponse(goal, analysis).comment,
        500
      ),
    } satisfies GoalReviewResponse);
  } catch (error) {
    console.error("goal-review POST error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Kunde inte skapa AI-kommentar.",
      },
      { status: 500 }
    );
  }
}