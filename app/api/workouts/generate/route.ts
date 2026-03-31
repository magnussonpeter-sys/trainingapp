import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getWorkoutSummaryForAI } from "@/lib/workout-summary";
import {
  getAvailableExercises,
  normalizeEquipmentList,
} from "@/lib/exercise-catalog";
import {
  validateAndNormalizeAiExercises,
  type AiExerciseCandidate,
} from "@/lib/ai-exercise-validation";
import { pool } from "@/lib/db";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type AiWorkoutResponse = {
  name?: string;
  aiComment?: string; // Kort kommentar från AI om tidigare träning och dagens mål.
  exercises?: AiExerciseCandidate[];
};

function sanitizeDurationMinutes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 45;
  }

  return Math.max(10, Math.min(120, Math.round(value)));
}

function getTargetExerciseCount(durationMinutes: number) {
  if (durationMinutes <= 20) return 4;
  if (durationMinutes <= 30) return 5;
  if (durationMinutes <= 45) return 6;
  if (durationMinutes <= 60) return 7;
  return 8;
}

function normalizeGoal(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildGoalSpecificInstructions(goal: string) {
  const normalizedGoal = goal.trim().toLowerCase();

  if (
    normalizedGoal.includes("styrka") ||
    normalizedGoal.includes("strong") ||
    normalizedGoal.includes("max")
  ) {
    return `
Målfokus: styrka
- Prioritera fler basövningar och välkända flerledsövningar
- Håll ofta reps ungefär i spannet 4-8 för huvudövningar
- Använd oftare lite längre vila i tunga övningar
- Håll totalvolymen rimlig så att passet känns fokuserat
`;
  }

  if (
    normalizedGoal.includes("hypertrofi") ||
    normalizedGoal.includes("muskel") ||
    normalizedGoal.includes("bygga")
  ) {
    return `
Målfokus: hypertrofi
- Prioritera välkända övningar med god muskelkontakt
- Håll ofta reps ungefär i spannet 8-15
- Kombinera flerledsövningar med enstaka isolationsövningar när det passar
- Vila ska oftast vara måttlig snarare än mycket lång
`;
  }

  if (
    normalizedGoal.includes("uthåll") ||
    normalizedGoal.includes("kondition") ||
    normalizedGoal.includes("fitness")
  ) {
    return `
Målfokus: muskulär uthållighet
- Prioritera säkra och tekniskt enkla övningar
- Håll ofta något högre reps eller tidsbaserade block
- Vila kan ofta vara kort till måttlig
- Passet ska flyta smidigt och kännas genomförbart
`;
  }

  if (
    normalizedGoal.includes("allmän") ||
    normalizedGoal.includes("halsa") ||
    normalizedGoal.includes("hälsa")
  ) {
    return `
Målfokus: allmän hälsa
- Prioritera säkra, allmänt accepterade och lättförståeliga övningar
- Sträva efter helkroppsbalans
- Undvik onödigt hög teknisk eller skadebenägen komplexitet
`;
  }

  return `
Målfokus: ${goal}
- Anpassa passet på ett rimligt och konservativt sätt efter detta mål
- Prioritera säkra, allmänt accepterade övningar
`;
}

async function getTrainingGoalForUser(userId: string) {
  const result = await pool.query(
    `
    select training_goal
    from user_settings
    where user_id = $1
    limit 1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return normalizeGoal(result.rows[0]?.training_goal);
}

function extractEquipmentStrings(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const values = new Set<string>();

  for (const item of input) {
    // Acceptera rena strängar direkt.
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) {
        values.add(trimmed);
      }
      continue;
    }

    // Acceptera även gymutrustning som objekt från API/databas.
    if (typeof item === "object" && item !== null) {
      const maybeItem = item as {
        equipment_type?: unknown;
        equipmentType?: unknown;
        label?: unknown;
        name?: unknown;
        type?: unknown;
      };

      const candidates = [
        maybeItem.equipment_type,
        maybeItem.equipmentType,
        maybeItem.label,
        maybeItem.name,
        maybeItem.type,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === "string") {
          const trimmed = candidate.trim();
          if (trimmed) {
            values.add(trimmed);
          }
        }
      }
    }
  }

  return Array.from(values);
}

function sanitizeAiComment(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return null;
  }

  // Håll kommentaren kort även om modellen skulle bli för lång.
  if (cleaned.length <= 240) {
    return cleaned;
  }

  return `${cleaned.slice(0, 237).trim()}...`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, goal, durationMinutes, equipment } = body ?? {};

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    const safeUserId = String(userId);
    const safeDurationMinutes = sanitizeDurationMinutes(durationMinutes);

    // Viktigt:
    // Utrustning kan komma som string[] eller som objekt från gym_equipment.
    // Därför extraherar vi flera tänkbara fält istället för att bara acceptera string[].
    const rawEquipmentList = extractEquipmentStrings(equipment);

    const normalizedEquipment = normalizeEquipmentList(rawEquipmentList);
    const availableCatalog = getAvailableExercises(rawEquipmentList);
    const targetExerciseCount = getTargetExerciseCount(safeDurationMinutes);

    if (availableCatalog.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Ingen kompatibel övning hittades för vald utrustning. Lägg till mer utrustning eller kontrollera utrustningsnamnen.",
          debug: {
            receivedEquipment: equipment ?? null,
            parsedEquipmentList: rawEquipmentList,
            normalizedEquipment,
          },
        },
        { status: 400 }
      );
    }

    const storedGoal = await getTrainingGoalForUser(safeUserId);
    const requestGoal = normalizeGoal(goal);
    const effectiveGoal = storedGoal ?? requestGoal ?? "allmän styrka";

    const summary = await getWorkoutSummaryForAI(safeUserId);

    const recentExerciseIds = summary.recentExerciseIds ?? [];
    const avoidExerciseIds = summary.avoidExerciseIds ?? [];
    const preferredExerciseIds = summary.preferredExerciseIds ?? [];

    const aiInput = {
      userId: safeUserId,
      goal: effectiveGoal,
      durationMinutes: safeDurationMinutes,
      receivedEquipment: equipment ?? null,
      equipmentList: rawEquipmentList,
      normalizedEquipment,
      summary,
      availableCatalog,
      targetExerciseCount,
      recentExerciseIds,
      avoidExerciseIds,
      preferredExerciseIds,
    };

    const prompt = `
Du är en expert på evidensbaserad styrketräning.

Uppgift:
Bygg ett träningspass på svenska för användaren.

HÅRDA REGLER:
1. Du får ENDAST använda övningar från listan "TILLÅTNA ÖVNINGAR".
2. Du får INTE skapa nya övningar, nya varianter eller egna namn.
3. Varje övning måste identifieras med exakt id från listan.
4. Samma id får inte förekomma mer än en gång.
5. Undvik snarlika övningar i samma pass.
6. Prioritera säkra, välkända och allmänt accepterade övningar.
7. Anpassa till ungefär ${safeDurationMinutes} minuter.
8. Lägg till en kort kommentar i fältet "aiComment" på svenska.
9. "aiComment" ska vara max 2-3 meningar.
10. "aiComment" ska kort beskriva vad användaren tränat hittills och vad målet med dagens pass är.
11. Svara med ENDAST giltig JSON.

ANVÄNDARENS MÅL:
${effectiveGoal}

MÅLSPECIFIK STYRNING:
${buildGoalSpecificInstructions(effectiveGoal)}

TID:
${safeDurationMinutes} minuter

REGISTRERAD UTRUSTNING:
${rawEquipmentList.join(", ") || "ingen angiven"}

NORMALISERAD UTRUSTNING:
${normalizedEquipment.join(", ")}

ÖNSKAT ANTAL ÖVNINGAR:
${targetExerciseCount}

SAMMANFATTNING AV TIDIGARE TRÄNING:
${JSON.stringify(summary, null, 2)}

ÖVNINGAR SOM BÖR UNDVIKAS OM ANDRA BRA ALTERNATIV FINNS:
${JSON.stringify(avoidExerciseIds, null, 2)}

ÖVNINGAR SOM NYLIGEN ANVÄNTS OCH INTE SKA ÖVERANVÄNDAS:
${JSON.stringify(recentExerciseIds, null, 2)}

ÖVNINGAR SOM TIDIGARE OFTA VERKAT FUNKA BRA:
${JSON.stringify(preferredExerciseIds, null, 2)}

TILLÅTNA ÖVNINGAR:
${JSON.stringify(availableCatalog, null, 2)}

VIKTIGA PRINCIPER FÖR HISTORIK:
- Försök skapa variation jämfört med de senaste passen
- Om en övning ofta fått låg rating eller låg tolerans, nedprioritera den
- Om en övning ofta fått bra rating eller tydlig marginal, kan den prioriteras
- Om samma övning används igen får progression gärna vara försiktig och rimlig
- Undvik att bygga nästan samma pass som nyligen genomförts

Returnera ENDAST JSON i exakt detta format:
{
  "name": "Passnamn",
  "aiComment": "Kort kommentar på max 2-3 meningar.",
  "exercises": [
    {
      "id": "string från TILLÅTNA ÖVNINGAR",
      "sets": number,
      "reps": number,
      "duration": number,
      "rest": number
    }
  ]
}

Regler för sets/reps/duration/rest:
- För vanliga styrkeövningar: ange sets, reps och rest
- För tidsbaserade core/carry-övningar: ange sets, duration och rest
- För styrkemål: använd ofta något lägre reps och längre vila i huvudövningar
- För hypertrofimål: använd ofta medelhöga reps och måttlig vila
- För allmän hälsa: håll passet enkelt, balanserat och robust
- Använd rimliga standardvärden om du är osäker
- Lägg inte till andra fält än de som efterfrågas
`;

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: prompt,
    });

    const rawAiText = response.output_text?.trim();

    if (!rawAiText) {
      return NextResponse.json(
        {
          ok: false,
          error: "Empty response from OpenAI",
          debug: {
            aiInput,
            prompt,
            rawAiText: "",
          },
        },
        { status: 502 }
      );
    }

    let parsed: AiWorkoutResponse;

    try {
      parsed = JSON.parse(rawAiText);
    } catch {
      console.error("Invalid JSON from OpenAI:", rawAiText);

      return NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON from OpenAI",
          raw: rawAiText,
          debug: {
            aiInput,
            prompt,
            rawAiText,
          },
        },
        { status: 502 }
      );
    }

    const normalizedExercises = validateAndNormalizeAiExercises({
      aiExercises: Array.isArray(parsed.exercises) ? parsed.exercises : [],
      availableEquipment: rawEquipmentList,
      targetExerciseCount,
    });

    if (normalizedExercises.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "AI returnerade inga övningar som kunde valideras mot tillgänglig utrustning.",
          debug: {
            aiInput,
            prompt,
            rawAiText,
            parsedAiResponse: parsed,
          },
        },
        { status: 502 }
      );
    }

    // Fallback om modellen inte skickar med kommentar.
    const fallbackAiComment =
      "Du bygger vidare på dina senaste pass. Målet i dag är att träna balanserat utifrån din historik, din tillgängliga tid och ditt valda mål.";

    const workout = {
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : "AI-genererat pass",
      aiComment: sanitizeAiComment(parsed.aiComment) ?? fallbackAiComment,
      exercises: normalizedExercises,
    };

    return NextResponse.json({
      ok: true,
      workout,
      debug: {
        aiInput,
        prompt,
        rawAiText,
        parsedAiResponse: parsed,
        normalizedWorkout: workout,
      },
    });
  } catch (error) {
    console.error("generate workout error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to generate workout",
      },
      { status: 500 }
    );
  }
}