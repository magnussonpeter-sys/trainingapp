// app/api/workouts/generate/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getWorkoutSummaryForAI,
  type ExerciseSummaryForAI,
  type WorkoutSummaryForAI,
} from "@/lib/workout-summary";
import {
  getAvailableExercises,
  normalizeEquipmentList,
  type ExerciseCatalogItem,
  type MovementPattern,
} from "@/lib/exercise-catalog";
import {
  validateAndNormalizeAiExercises,
  type AiExerciseCandidate,
} from "@/lib/ai-exercise-validation";
import { pool } from "@/lib/db";

type AiWorkoutResponse = {
  name?: string;
  aiComment?: string;
  exercises?: AiExerciseCandidate[];
};

type GoalProfile = {
  normalizedGoal: string;
  goalTags: string[];
  preferredPatterns: MovementPattern[];
};

type CandidateScoreBreakdown = {
  goal: number;
  feedback: number;
  adherence: number;
  novelty: number;
  recovery: number;
  preferenceAdjustment: number;
  repetitionPenalty: number;
  riskPenalty: number;
};

type ScoredCandidate = {
  id: string;
  name: string;
  description: string;
  movementPattern: MovementPattern;
  primaryMuscles: string[];
  requiredEquipment: string[];
  riskLevel: ExerciseCatalogItem["riskLevel"];
  defaultSets: number;
  defaultReps?: number;
  defaultDuration?: number;
  defaultRest: number;
  primaryGoalTags?: string[];
  score: number;
  scoreBreakdown: CandidateScoreBreakdown;
  history: {
    completedCount: number;
    recent7dCount: number;
    recent14dCount: number;
    avgRating: number | null;
    avgExtraReps: number | null;
    lastCompletedAt: string | null;
    lastWeight: number | null;
    lastReps: number | null;
  };
  reasonSummary: string[];
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

  if (
    normalizedGoal.includes("body") ||
    normalizedGoal.includes("komposition") ||
    normalizedGoal.includes("fett")
  ) {
    return `
Målfokus: kroppskomposition
- Prioritera stora muskelgrupper och effektiva flerledsövningar
- Håll tempot bra men utan att offra kvalitet
- Kombinera gärna under- och överkropp i samma pass
`;
  }

  return `
Målfokus: ${goal}
- Anpassa passet på ett rimligt och konservativt sätt efter detta mål
- Prioritera säkra, allmänt accepterade övningar
`;
}

function roundTo(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getDaysSince(dateString: string | null) {
  if (!dateString) {
    return null;
  }

  const timestamp = new Date(dateString).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const diffMs = Date.now() - timestamp;
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
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

function buildGoalProfile(goal: string): GoalProfile {
  const normalizedGoal = goal.trim().toLowerCase();

  if (
    normalizedGoal.includes("styrka") ||
    normalizedGoal.includes("strong") ||
    normalizedGoal.includes("max")
  ) {
    return {
      normalizedGoal,
      goalTags: ["styrka"],
      preferredPatterns: [
        "squat",
        "hinge",
        "horizontal_push",
        "horizontal_pull",
        "vertical_pull",
        "vertical_push",
      ],
    };
  }

  if (
    normalizedGoal.includes("hypertrofi") ||
    normalizedGoal.includes("muskel") ||
    normalizedGoal.includes("bygga")
  ) {
    return {
      normalizedGoal,
      goalTags: ["hypertrofi", "styrka"],
      preferredPatterns: [
        "horizontal_push",
        "horizontal_pull",
        "squat",
        "hinge",
        "lunge",
        "vertical_pull",
        "vertical_push",
      ],
    };
  }

  if (
    normalizedGoal.includes("body") ||
    normalizedGoal.includes("komposition") ||
    normalizedGoal.includes("fett")
  ) {
    return {
      normalizedGoal,
      goalTags: ["kroppskomposition", "hypertrofi", "allmän hälsa"],
      preferredPatterns: [
        "squat",
        "hinge",
        "horizontal_push",
        "horizontal_pull",
        "lunge",
        "core",
      ],
    };
  }

  if (
    normalizedGoal.includes("uthåll") ||
    normalizedGoal.includes("kondition") ||
    normalizedGoal.includes("fitness")
  ) {
    return {
      normalizedGoal,
      goalTags: ["uthållighet", "allmän hälsa"],
      preferredPatterns: [
        "lunge",
        "squat",
        "horizontal_push",
        "horizontal_pull",
        "core",
        "carry",
      ],
    };
  }

  return {
    normalizedGoal,
    goalTags: ["allmän hälsa", "styrka"],
    preferredPatterns: [
      "squat",
      "hinge",
      "horizontal_push",
      "horizontal_pull",
      "vertical_pull",
      "core",
    ],
  };
}

function getHistoryMap(summary: WorkoutSummaryForAI) {
  return new Map<string, ExerciseSummaryForAI>(
    summary.exercises.map((exercise) => [exercise.exerciseId, exercise])
  );
}

function getRiskPenalty(riskLevel: ExerciseCatalogItem["riskLevel"]) {
  if (riskLevel === "high") return 1.9;
  if (riskLevel === "medium") return 0.9;
  return 0.25;
}

function buildReasonSummary(
  exercise: ExerciseCatalogItem,
  history: ExerciseSummaryForAI | undefined,
  breakdown: CandidateScoreBreakdown,
  goalProfile: GoalProfile,
  summary: WorkoutSummaryForAI
) {
  const reasons: string[] = [];
  const pattern7d =
    summary.movementPatternLoad7d[exercise.movementPattern]?.completedExercises ??
    0;

  if (
    Array.isArray(exercise.primaryGoalTags) &&
    exercise.primaryGoalTags.some((tag) => goalProfile.goalTags.includes(tag))
  ) {
    reasons.push("matchar målet bra");
  }

  if (goalProfile.preferredPatterns.includes(exercise.movementPattern)) {
    reasons.push(`bra rörelsemönster för ${goalProfile.normalizedGoal}`);
  }

  if ((history?.avgRating ?? 0) >= 4) {
    reasons.push("har fått bra betyg tidigare");
  }

  if ((history?.avgExtraReps ?? 0) >= 2) {
    reasons.push("har tolererats väl tidigare");
  }

  if ((history?.recent7dCount ?? 0) === 0 && (history?.recent14dCount ?? 0) === 0) {
    reasons.push("ger variation jämfört med senaste veckorna");
  }

  if (pattern7d >= 3) {
    reasons.push("mönstret har belastats ganska mycket nyligen");
  }

  if (breakdown.riskPenalty >= 1.5) {
    reasons.push("högre teknisk/riskmässig kostnad");
  }

  return reasons.slice(0, 4);
}

function scoreCatalogExercise(params: {
  exercise: ExerciseCatalogItem;
  summary: WorkoutSummaryForAI;
  goalProfile: GoalProfile;
  preferredExerciseIds: Set<string>;
  avoidExerciseIds: Set<string>;
}) {
  const { exercise, summary, goalProfile, preferredExerciseIds, avoidExerciseIds } =
    params;

  const history = getHistoryMap(summary).get(exercise.id);
  const daysSinceLast = getDaysSince(history?.lastCompletedAt ?? null);
  const pattern7d =
    summary.movementPatternLoad7d[exercise.movementPattern]?.completedExercises ??
    0;
  const pattern14d =
    summary.movementPatternLoad14d[exercise.movementPattern]?.completedExercises ??
    0;

  let goalScore = 0;

  if (
    Array.isArray(exercise.primaryGoalTags) &&
    exercise.primaryGoalTags.some((tag) => goalProfile.goalTags.includes(tag))
  ) {
    goalScore += 3.2;
  }

  if (goalProfile.preferredPatterns.includes(exercise.movementPattern)) {
    goalScore += 1.1;
  }

  let feedbackScore = 0;

  if (history?.avgRating !== null && history?.avgRating !== undefined) {
    feedbackScore += (history.avgRating - 3) * 1.3;
  }

  if (history?.avgExtraReps !== null && history?.avgExtraReps !== undefined) {
    if (history.avgExtraReps >= 2) {
      feedbackScore += Math.min(history.avgExtraReps, 4) * 0.35 + 0.4;
    } else if (history.avgExtraReps <= 0.5) {
      feedbackScore -= 1.1;
    }
  }

  // Liten bonus för övningar som användaren faktiskt genomfört flera gånger.
  const adherenceScore = Math.min(history?.completedCount ?? 0, 8) * 0.12;

  // Lite exploration-bonus för övningar som inte är överanvända.
  let noveltyScore = 0.6;

  if (history) {
    if (history.recent7dCount === 0 && history.recent14dCount === 0) {
      noveltyScore = 1.4;
    } else if (history.recent7dCount === 0 && history.recent14dCount <= 1) {
      noveltyScore = 0.7;
    } else {
      noveltyScore = 0;
    }
  }

  // Sänk score om samma rörelsemönster belastats mycket nyligen.
  const recoveryScore = Math.max(-2.5, 1.4 - pattern7d * 0.75 - pattern14d * 0.2);

  let repetitionPenalty =
    (history?.recent7dCount ?? 0) * 1.15 +
    Math.max((history?.recent14dCount ?? 0) - 1, 0) * 0.35;

  if (daysSinceLast !== null && daysSinceLast <= 2) {
    repetitionPenalty += 1.4;
  }

  let preferenceAdjustment = 0;

  if (preferredExerciseIds.has(exercise.id)) {
    preferenceAdjustment += 1.5;
  }

  if (avoidExerciseIds.has(exercise.id)) {
    preferenceAdjustment -= 2.5;
  }

  const riskPenalty = getRiskPenalty(exercise.riskLevel);

  const scoreBreakdown: CandidateScoreBreakdown = {
    goal: roundTo(goalScore),
    feedback: roundTo(feedbackScore),
    adherence: roundTo(adherenceScore),
    novelty: roundTo(noveltyScore),
    recovery: roundTo(recoveryScore),
    preferenceAdjustment: roundTo(preferenceAdjustment),
    repetitionPenalty: roundTo(repetitionPenalty),
    riskPenalty: roundTo(riskPenalty),
  };

  const score = roundTo(
    goalScore +
      feedbackScore +
      adherenceScore +
      noveltyScore +
      recoveryScore +
      preferenceAdjustment -
      repetitionPenalty -
      riskPenalty
  );

  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description,
    movementPattern: exercise.movementPattern,
    primaryMuscles: exercise.primaryMuscles,
    requiredEquipment: exercise.requiredEquipment,
    riskLevel: exercise.riskLevel,
    defaultSets: exercise.defaultSets,
    defaultReps: exercise.defaultReps,
    defaultDuration: exercise.defaultDuration,
    defaultRest: exercise.defaultRest,
    primaryGoalTags: exercise.primaryGoalTags,
    score,
    scoreBreakdown,
    history: {
      completedCount: history?.completedCount ?? 0,
      recent7dCount: history?.recent7dCount ?? 0,
      recent14dCount: history?.recent14dCount ?? 0,
      avgRating: history?.avgRating ?? null,
      avgExtraReps: history?.avgExtraReps ?? null,
      lastCompletedAt: history?.lastCompletedAt ?? null,
      lastWeight: history?.lastWeight ?? null,
      lastReps: history?.lastReps ?? null,
    },
    reasonSummary: buildReasonSummary(
      exercise,
      history,
      scoreBreakdown,
      goalProfile,
      summary
    ),
  } satisfies ScoredCandidate;
}

function selectPromptCandidates(
  scoredCandidates: ScoredCandidate[],
  targetExerciseCount: number
) {
  const maxCandidates = Math.max(14, Math.min(24, targetExerciseCount * 4));
  const selected: ScoredCandidate[] = [];
  const patternCounts = new Map<MovementPattern, number>();

  for (const candidate of scoredCandidates) {
    if (selected.length >= maxCandidates) {
      break;
    }

    const currentPatternCount = patternCounts.get(candidate.movementPattern) ?? 0;

    // Håll lite balans redan innan AI får listan.
    if (currentPatternCount >= 4) {
      continue;
    }

    selected.push(candidate);
    patternCounts.set(candidate.movementPattern, currentPatternCount + 1);
  }

  return selected;
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

    // Läs API-nyckeln inne i requesten så att dev-servern inte råkar hålla kvar
    // en gammal klient med gammalt env-värde.
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY saknas på serversidan." },
        { status: 500 }
      );
    }

    // Visar bara prefix i logg för snabb felsökning.
    console.log("OPENAI key prefix:", apiKey.slice(0, 12));

    const client = new OpenAI({ apiKey });

    const safeUserId = String(userId);
    const safeDurationMinutes = sanitizeDurationMinutes(durationMinutes);

    // Utrustning kan komma som string[] eller som objekt från gym_equipment.
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
    const goalProfile = buildGoalProfile(effectiveGoal);
    const preferredExerciseIds = new Set(summary.preferredExerciseIds ?? []);
    const avoidExerciseIds = new Set(summary.avoidExerciseIds ?? []);

    const scoredCandidates = availableCatalog
      .map((exercise) =>
        scoreCatalogExercise({
          exercise,
          summary,
          goalProfile,
          preferredExerciseIds,
          avoidExerciseIds,
        })
      )
      .sort((a, b) => b.score - a.score);

    const promptCandidates = selectPromptCandidates(
      scoredCandidates,
      targetExerciseCount
    );

    const compactPromptCandidates = promptCandidates.map((candidate, index) => ({
      rank: index + 1,
      id: candidate.id,
      name: candidate.name,
      description: candidate.description,
      movementPattern: candidate.movementPattern,
      primaryMuscles: candidate.primaryMuscles,
      requiredEquipment: candidate.requiredEquipment,
      riskLevel: candidate.riskLevel,
      defaultSets: candidate.defaultSets,
      defaultReps: candidate.defaultReps,
      defaultDuration: candidate.defaultDuration,
      defaultRest: candidate.defaultRest,
      score: candidate.score,
      scoreBreakdown: candidate.scoreBreakdown,
      reasonSummary: candidate.reasonSummary,
      history: candidate.history,
    }));

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
      promptCandidates: compactPromptCandidates,
      recentExerciseIds: summary.recentExerciseIds,
      avoidExerciseIds: summary.avoidExerciseIds,
      preferredExerciseIds: summary.preferredExerciseIds,
    };

    const prompt = `
Du är en expert på evidensbaserad styrketräning.

Uppgift:
Bygg ett träningspass på svenska för användaren.

HÅRDA REGLER:
1. Du får ENDAST använda övningar från listan "KANDIDATÖVNINGAR".
2. Du får INTE skapa nya övningar, nya varianter eller egna namn.
3. Varje övning måste identifieras med exakt id från listan.
4. Samma id får inte förekomma mer än en gång.
5. Undvik snarlika övningar i samma pass.
6. Prioritera övningar med högre score om det inte förstör balans i passet.
7. Försök skapa variation jämfört med de senaste 7-14 dagarna.
8. Anpassa till ungefär ${safeDurationMinutes} minuter.
9. Lägg till en kort kommentar i fältet "aiComment" på svenska.
10. "aiComment" ska vara max 2-3 meningar.
11. "aiComment" ska kort beskriva vad användaren tränat hittills och vad målet med dagens pass är.
12. Svara med ENDAST giltig JSON.

ANVÄNDARENS MÅL:
${effectiveGoal}

MÅLSPECIFIK STYRNING:
${buildGoalSpecificInstructions(effectiveGoal)}

TID:
${safeDurationMinutes} minuter

REGISTRERAD UTRUSTNING:
${rawEquipmentList.join(", ") || "ingen angiven"}

NORMALISERAD UTRUSTNING:
${normalizedEquipment.join(", ") || "bodyweight"}

ÖNSKAT ANTAL ÖVNINGAR:
${targetExerciseCount}

SAMMANFATTNING AV TIDIGARE TRÄNING:
${JSON.stringify(
  {
    recentWorkouts: summary.recentWorkouts,
    adherence: summary.adherence,
    recentExerciseIds: summary.recentExerciseIds,
    avoidExerciseIds: summary.avoidExerciseIds,
    preferredExerciseIds: summary.preferredExerciseIds,
    topPositiveExercises: summary.topPositiveExercises,
    topNegativeExercises: summary.topNegativeExercises,
    movementPatternLoad7d: summary.movementPatternLoad7d,
    movementPatternLoad14d: summary.movementPatternLoad14d,
  },
  null,
  2
)}

KANDIDATÖVNINGAR:
${JSON.stringify(compactPromptCandidates, null, 2)}

VIKTIGA PRINCIPER:
- Högre score betyder bättre helhetsval just idag
- Om ett rörelsemönster redan belastats mycket nyligen, sprid belastningen
- Om en övning har låg rating eller låg tolerans, nedprioritera den tydligt
- Om en övning har bra rating eller bra marginal, kan den prioriteras
- Undvik att bygga nästan samma pass som nyligen genomförts
- Prioritera robusta, säkra och välkända övningar

Returnera ENDAST JSON i exakt detta format:
{
  "name": "Passnamn",
  "aiComment": "Kort kommentar på max 2-3 meningar.",
  "exercises": [
    {
      "id": "string från KANDIDATÖVNINGAR",
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
            request: {
              userId: safeUserId,
              goal: effectiveGoal,
              durationMinutes: safeDurationMinutes,
              normalizedEquipment,
              targetExerciseCount,
            },
            history: summary,
            candidateSelection: {
              totalAvailableCount: availableCatalog.length,
              promptCandidateIds: compactPromptCandidates.map((item) => item.id),
              scoredCandidates: scoredCandidates.slice(0, 40),
            },
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
            request: {
              userId: safeUserId,
              goal: effectiveGoal,
              durationMinutes: safeDurationMinutes,
              normalizedEquipment,
              targetExerciseCount,
            },
            history: summary,
            candidateSelection: {
              totalAvailableCount: availableCatalog.length,
              promptCandidateIds: compactPromptCandidates.map((item) => item.id),
              scoredCandidates: scoredCandidates.slice(0, 40),
            },
            prompt,
            rawAiText,
          },
        },
        { status: 502 }
      );
    }

    const validationResult = validateAndNormalizeAiExercises({
      aiExercises: Array.isArray(parsed.exercises) ? parsed.exercises : [],
      availableEquipment: rawEquipmentList,
      targetExerciseCount,
    });

    const normalizedExercises = validationResult.exercises;

    if (normalizedExercises.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "AI returnerade inga övningar som kunde valideras mot tillgänglig utrustning.",
          debug: {
            aiInput,
            request: {
              userId: safeUserId,
              goal: effectiveGoal,
              durationMinutes: safeDurationMinutes,
              normalizedEquipment,
              targetExerciseCount,
            },
            history: summary,
            candidateSelection: {
              totalAvailableCount: availableCatalog.length,
              promptCandidateIds: compactPromptCandidates.map((item) => item.id),
              scoredCandidates: scoredCandidates.slice(0, 40),
            },
            prompt,
            rawAiText,
            parsedAiResponse: parsed,
            validation: validationResult.debug,
          },
        },
        { status: 502 }
      );
    }

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
        // Behåll detta för att din nuvarande preview-debug ska fortsätta fungera.
        aiInput,
        request: {
          userId: safeUserId,
          goal: effectiveGoal,
          durationMinutes: safeDurationMinutes,
          normalizedEquipment,
          targetExerciseCount,
        },
        history: summary,
        candidateSelection: {
          totalAvailableCount: availableCatalog.length,
          promptCandidateIds: compactPromptCandidates.map((item) => item.id),
          scoredCandidates: scoredCandidates.slice(0, 40),
        },
        prompt,
        rawAiText,
        parsedAiResponse: parsed,
        validation: validationResult.debug,
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