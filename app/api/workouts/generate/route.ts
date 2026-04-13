// app/api/workouts/generate/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { pool } from "@/lib/db";
import {
  getAvailableExercises,
  getAvailableProgressionTracks,
} from "@/lib/exercise-catalog";
import { getWorkoutLogsByUser } from "@/lib/workout-log-repository";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  validateGeneratedWorkout,
  type AiGeneratedWorkoutCandidate,
} from "@/lib/workout-flow/validate-generated-workout";
import type {
  ConfidenceScore,
  MuscleBudgetEntry,
} from "@/lib/planning/muscle-budget";
import type { WorkoutFocus } from "@/types/workout";

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
  userId: string | null;
  gym: string | null;
  gymLabel: string | null;
  equipment: string[];
  gymEquipmentDetails: unknown;
  confidenceScore: ConfidenceScore | null;
  nextFocus: WorkoutFocus | null;
  splitStyle: string | null;
  weeklyBudget: unknown;
  weeklyPlan: unknown;
  generationContext: unknown;
  prompt: string;
  rawAiText: string;
  parsed: unknown;
  validated: unknown;
  normalizedWorkout: unknown;
}) {
  const {
    goal,
    durationMinutes,
    userId,
    gym,
    gymLabel,
    equipment,
    gymEquipmentDetails,
    confidenceScore,
    nextFocus,
    splitStyle,
    weeklyBudget,
    weeklyPlan,
    generationContext,
    prompt,
    rawAiText,
    parsed,
    validated,
    normalizedWorkout,
  } = params;

  return {
    request: {
      userId,
      goal,
      durationMinutes,
      gym,
      gymLabel,
      equipment,
      gymEquipmentDetails,
      confidenceScore,
      nextFocus,
      splitStyle,
      weeklyBudget,
      weeklyPlan,
    },
    generationContext,
    prompt,
    rawAiText,
    parsedAiResponse: parsed,
    validatedWorkout: validated,
    normalizedWorkout,
  };
}

type UserSettingsSummary = {
  sex?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  experience_level?: string | null;
  training_goal?: string | null;
};

type GymEquipmentPromptItem = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  weights_kg?: number[] | null;
  quantity?: number | null;
};

type WeeklyPlanPromptItem = {
  date?: string | null;
  dayLabel?: string | null;
  focus?: WorkoutFocus | null;
  type?: "training" | "recovery" | null;
};

type WeeklyBudgetPromptItem = Pick<
  MuscleBudgetEntry,
  | "group"
  | "label"
  | "priority"
  | "targetSets"
  | "completedSets"
  | "effectiveSets"
  | "remainingSets"
  | "recent4WeekAvgSets"
>;

async function getUserSettingsSummary(userId: string) {
  const result = await pool.query<UserSettingsSummary>(
    `
      select
        sex,
        age,
        weight_kg,
        height_cm,
        experience_level,
        training_goal
      from user_settings
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

function buildRecentWorkoutSummary(logs: unknown[]) {
  return logs.slice(0, 3).map((log) => {
    const record = log as {
      workoutName?: string;
      completedAt?: string;
      durationSeconds?: number;
      exercises?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        extraReps?: number | null;
        timedEffort?: string | null;
      }>;
    };

    return {
      workoutName: record.workoutName ?? "Okänt pass",
      completedAt: record.completedAt ?? null,
      durationMinutes:
        typeof record.durationSeconds === "number"
          ? Math.max(1, Math.round(record.durationSeconds / 60))
          : null,
      topExercises: Array.isArray(record.exercises)
        ? record.exercises.slice(0, 4).map((exercise) => ({
            exerciseId: exercise.exerciseId ?? null,
            exerciseName: exercise.exerciseName ?? null,
            extraReps: exercise.extraReps ?? null,
            timedEffort: exercise.timedEffort ?? null,
          }))
        : [],
    };
  });
}

function buildRecentExercisePreferences(logs: unknown[]) {
  const recentExerciseIds = new Set<string>();
  const recentExerciseNames = new Set<string>();

  for (const log of logs.slice(0, 3)) {
    const record = log as {
      exercises?: Array<{
        exerciseId?: string;
        exerciseName?: string;
      }>;
    };

    if (!Array.isArray(record.exercises)) {
      continue;
    }

    for (const exercise of record.exercises) {
      if (typeof exercise.exerciseId === "string" && exercise.exerciseId.trim()) {
        recentExerciseIds.add(exercise.exerciseId.trim());
      }

      if (
        typeof exercise.exerciseName === "string" &&
        exercise.exerciseName.trim()
      ) {
        recentExerciseNames.add(exercise.exerciseName.trim());
      }
    }
  }

  return {
    recentExerciseIds: Array.from(recentExerciseIds),
    recentExerciseNames: Array.from(recentExerciseNames),
  };
}

function buildAvailableExercisePrompt(
  availableExercises: ReturnType<typeof getAvailableExercises>,
) {
  return availableExercises
    .map((exercise) => {
      const dose =
        typeof exercise.defaultDuration === "number" && !exercise.defaultReps
          ? `${exercise.defaultSets} x ${exercise.defaultDuration}s`
          : `${exercise.defaultSets} x ${exercise.defaultReps ?? 10}`;

      return [
        `- id: ${exercise.id}`,
        `namn: ${exercise.name}`,
        `mönster: ${exercise.movementPattern}`,
        `utrustning: ${exercise.requiredEquipment.join(", ")}`,
        `standard: ${dose}`,
        `vila: ${exercise.defaultRest}s`,
      ].join(" | ");
    })
    .join("\n");
}

function buildProgressionTrackPrompt(availableEquipment: string[]) {
  const availableExercises = getAvailableExercises(availableEquipment);
  const availableExerciseNames = new Map(
    availableExercises.map((exercise) => [exercise.id, exercise.name]),
  );
  const tracks = getAvailableProgressionTracks(availableEquipment);

  if (tracks.length === 0) {
    return "inga tydliga progressionstrappor tillgängliga i denna miljö";
  }

  return tracks
    .map((track) => {
      const stepNames = track.availableStepIds
        .map((stepId) => availableExerciseNames.get(stepId) ?? stepId)
        .join(" -> ");

      return `- ${track.name}: ${stepNames}. Syfte: ${track.intent}`;
    })
    .join("\n");
}

function buildGenerationPrompt(params: {
  availableExercisePrompt: string;
  durationMinutes: number;
  equipment: string[];
  gymEquipmentDetails: GymEquipmentPromptItem[];
  goal: string;
  gym: string | null;
  gymLabel: string | null;
  confidenceScore: ConfidenceScore | null;
  nextFocus: WorkoutFocus | null;
  recentExerciseIds: string[];
  recentExerciseNames: string[];
  recentWorkouts: unknown[];
  settings: UserSettingsSummary | null;
  splitStyle: string | null;
  weeklyBudget: WeeklyBudgetPromptItem[];
  weeklyPlan: WeeklyPlanPromptItem[];
}) {
  const recentWorkoutText =
    params.recentWorkouts.length > 0
      ? JSON.stringify(params.recentWorkouts, null, 2)
      : "[]";

  const settingsText = params.settings
    ? JSON.stringify(params.settings, null, 2)
    : "null";

  const equipmentText =
    params.equipment.length > 0 ? params.equipment.join(", ") : "bodyweight";
  const gymEquipmentDetailText =
    params.gymEquipmentDetails.length > 0
      ? JSON.stringify(params.gymEquipmentDetails, null, 2)
      : "[]";
  const recentExerciseIdsText =
    params.recentExerciseIds.length > 0
      ? params.recentExerciseIds.join(", ")
      : "inga";
  const recentExerciseNamesText =
    params.recentExerciseNames.length > 0
      ? params.recentExerciseNames.join(", ")
      : "inga";
  const weeklyPlanText =
    params.weeklyPlan.length > 0
      ? JSON.stringify(params.weeklyPlan, null, 2)
      : "[]";
  const weeklyBudgetText =
    params.weeklyBudget.length > 0
      ? JSON.stringify(params.weeklyBudget, null, 2)
      : "[]";
  const nextFocusText = params.nextFocus ?? "full_body";
  const confidenceText = params.confidenceScore ?? "medium";
  const splitStyleText = params.splitStyle ?? "adaptive";
  const progressionTrackText = buildProgressionTrackPrompt(params.equipment);

  return `
Skapa ett evidensbaserat träningspass som strikt JSON.

Du får själv bestämma blockstruktur och ordning, men passet måste vara realistiskt, välbalanserat och följa grundläggande träningsprinciper.

Kontext:
- mål: ${params.goal}
- passlängd: cirka ${params.durationMinutes} minuter
- gym-id: ${params.gym ?? "saknas"}
- gymnamn: ${params.gymLabel ?? "saknas"}
- tillgänglig utrustning: ${equipmentText}
- registrerade vikter/utrustningsdetaljer i gymmet: ${gymEquipmentDetailText}
- användarinställningar: ${settingsText}
- senaste passhistorik: ${recentWorkoutText}
- senaste övnings-id:n: ${recentExerciseIdsText}
- senaste övningsnamn: ${recentExerciseNamesText}
- rekommenderat fokus för nästa pass: ${nextFocusText}
- confidence score för planeringen: ${confidenceText}
- föreslagen split-stil denna vecka: ${splitStyleText}
- veckans muskelbudget och återstående set: ${weeklyBudgetText}
- enkel veckoplan för kommande 7 dagar: ${weeklyPlanText}

Tillgängliga övningar från katalogen:
${params.availableExercisePrompt}

Kända progressionsstegar i denna miljö:
${progressionTrackText}

Output-format:
{
  "name": "...",
  "duration": number,
  "rationale": "kort motivering",
  "blocks": [
    {
      "type": "straight_sets",
      "title": "...",
      "purpose": "kort syfte",
      "exercises": [
        {
          "id": "måste vara ett id från katalogen ovan",
          "name": "matchande namn",
          "sets": number,
          "reps": number | null,
          "duration": number | null,
          "rest": number,
          "suggestedWeight": number | null,
          "movementPattern": "movement pattern från katalogen",
          "intensityTag": "primary | secondary | accessory | finisher",
          "rationale": "kort motivering"
        }
      ]
    }
  ]
}

Viktiga regler:
- Svara endast med giltig JSON
- Inga markdown-block, inga förklaringar utanför JSON
- Använd blocks, inte top-level exercises om du inte absolut måste
- Använd bara övningar från kataloglistan ovan
- När en relevant progressionstege finns, välj gärna ett steg som passar användarens nivå i stället för att bara höja reps på obestämd tid
- Prioritera stora flerledsövningar tidigt när målet eller passets längd motiverar det
- Anpassa vila, dos och övningsval till träningsmålet
- Om utrustning finns ska den användas men utan att förstöra passets kvalitet
- Undvik dubbletter och nästan identiska övningar i samma pass
- När likvärdiga alternativ finns ska du variera bort från övningar och variantgrupper som användes i de senaste 1-3 passen
- Behåll bara samma övning som nyligen om den är tydligt bäst givet mål, utrustning eller progression
- Låt veckoplanen påverka passets huvudfokus. Om nästa fokus är upper_body, lower_body, core eller full_body ska passet tydligt kännas som detta utan att bli obalanserat
- Prioritera muskelgrupper som fortfarande har återstående veckobudget, men håll passet realistiskt inom vald passlängd
- Vid låg confidence score ska du vara mer konservativ med volym, komplexitet och övningssvårighet
- Passet ska kännas coachat, inte slumpat
`.trim();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      goal?: string;
      durationMinutes?: number;
      equipment?: string[];
      gymEquipmentDetails?: GymEquipmentPromptItem[];
      gym?: string | null;
      gymLabel?: string | null;
      confidenceScore?: ConfidenceScore | null;
      nextFocus?: WorkoutFocus | null;
      splitStyle?: string | null;
      weeklyBudget?: WeeklyBudgetPromptItem[];
      weeklyPlan?: WeeklyPlanPromptItem[];
      includeDebug?: boolean;
    };

    const goal =
      typeof body.goal === "string" && body.goal.trim()
        ? body.goal.trim()
        : "allmän styrka";
    const userId =
      typeof body.userId === "string" && body.userId.trim()
        ? body.userId.trim()
        : null;

    const durationMinutes =
      typeof body.durationMinutes === "number" &&
      Number.isFinite(body.durationMinutes)
        ? body.durationMinutes
        : 45;

    const equipment = normalizeEquipmentList(body.equipment);
    const gymEquipmentDetails = Array.isArray(body.gymEquipmentDetails)
      ? body.gymEquipmentDetails
      : [];
    const gym =
      typeof body.gym === "string" && body.gym.trim() ? body.gym.trim() : null;
    const gymLabel =
      typeof body.gymLabel === "string" && body.gymLabel.trim()
        ? body.gymLabel.trim()
        : null;
    const nextFocus =
      body.nextFocus === "upper_body" ||
      body.nextFocus === "lower_body" ||
      body.nextFocus === "core" ||
      body.nextFocus === "full_body"
        ? body.nextFocus
        : null;
    const confidenceScore =
      body.confidenceScore === "high" ||
      body.confidenceScore === "medium" ||
      body.confidenceScore === "low"
        ? body.confidenceScore
        : null;
    const splitStyle =
      typeof body.splitStyle === "string" && body.splitStyle.trim()
        ? body.splitStyle.trim()
        : null;
    const weeklyBudget = Array.isArray(body.weeklyBudget) ? body.weeklyBudget : [];
    const weeklyPlan = Array.isArray(body.weeklyPlan) ? body.weeklyPlan : [];

    const equipmentText = equipment.length > 0 ? equipment.join(", ") : "bodyweight";
    const hasEquipment =
      equipment.length > 0 &&
      !(equipment.length === 1 && equipment[0] === "bodyweight");

    // Behåll gärna denna logg tills allt känns stabilt.
    console.log("🔥 GENERATE ROUTE INPUT:", {
      userId,
      goal,
      durationMinutes,
      gym,
      gymLabel,
      equipmentFromBody: body.equipment ?? null,
      equipmentFiltered: equipment,
      gymEquipmentDetails,
      confidenceScore,
      nextFocus,
      splitStyle,
      weeklyBudget,
      weeklyPlan,
      includeDebug: body.includeDebug ?? false,
    });

    const availableExercises = getAvailableExercises(equipment);
    const [settings, recentLogs] = userId
      ? await Promise.all([
          getUserSettingsSummary(userId),
          getWorkoutLogsByUser(userId, 3),
        ])
      : [null, []];
    const recentWorkouts = buildRecentWorkoutSummary(recentLogs);
    const recentExercisePreferences = buildRecentExercisePreferences(recentLogs);
    const availableExercisePrompt = buildAvailableExercisePrompt(availableExercises);
    const generationContext = {
      userId,
      settings,
      recentWorkouts,
      recentExercisePreferences,
      availableExerciseCount: availableExercises.length,
      gymEquipmentDetails,
      confidenceScore,
      nextFocus,
      splitStyle,
      weeklyBudget,
      weeklyPlan,
      hasEquipment,
    };
    const prompt = buildGenerationPrompt({
      availableExercisePrompt,
      durationMinutes,
      equipment,
      gymEquipmentDetails,
      goal,
      gym,
      gymLabel,
      confidenceScore,
      nextFocus,
      recentExerciseIds: recentExercisePreferences.recentExerciseIds,
      recentExerciseNames: recentExercisePreferences.recentExerciseNames,
      recentWorkouts,
      settings,
      splitStyle,
      weeklyBudget,
      weeklyPlan,
    });

    console.log("🔥 FINAL INPUT TO AI:", {
      userId,
      goal,
      durationMinutes,
      gym,
      gymLabel,
      equipment,
      gymEquipmentDetails,
      confidenceScore,
      nextFocus,
      splitStyle,
      weeklyBudget,
      weeklyPlan,
      generationContext,
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
    const parsed = safeParseJSON(rawAiText) as AiGeneratedWorkoutCandidate | null;

    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          error: "AI-svar kunde inte tolkas",
          debug: {
            request: {
              userId,
              goal,
              durationMinutes,
              gym,
              gymLabel,
              equipment,
              gymEquipmentDetails,
              confidenceScore,
              nextFocus,
              splitStyle,
              weeklyBudget,
              weeklyPlan,
            },
            generationContext,
            rawAiText,
          },
        },
        { status: 500 },
      );
    }

    const validated = validateGeneratedWorkout({
      availableEquipment: equipment,
      candidate: parsed,
      durationMinutes,
      goal:
        goal === "strength" ||
        goal === "hypertrophy" ||
        goal === "health" ||
        goal === "body_composition"
          ? goal
          : "health",
      gym,
      gymLabel,
      recentExerciseIds: recentExercisePreferences.recentExerciseIds,
      recentVariantGroups: recentExercisePreferences.recentExerciseIds
        .map((exerciseId) => availableExercises.find((item) => item.id === exerciseId)?.variantGroup)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    });

    // Lägg tillbaka gym- och utrustningskontext på workout innan normalisering,
    // så preview och senare flöden kan läsa detta stabilt.
    const parsedWithContext = {
      ...validated.workout,
      goal,
      duration: validated.workout.duration ?? durationMinutes,
      gym,
      gymLabel,
      plannedFocus: nextFocus,
      availableEquipment: equipment,
    };

    const normalizedWorkout = normalizePreviewWorkout(parsedWithContext);

    if (!normalizedWorkout) {
      return NextResponse.json(
        {
          ok: false,
          error: "Kunde inte normalisera träningspass",
          debug: buildDebugPayload({
            goal,
            durationMinutes,
            userId,
            gym,
            gymLabel,
            equipment,
            gymEquipmentDetails,
            confidenceScore,
            nextFocus,
            splitStyle,
            weeklyBudget,
            weeklyPlan,
            generationContext,
            prompt,
            rawAiText,
            parsed,
            validated,
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
            userId,
            gym,
            gymLabel,
            equipment,
            gymEquipmentDetails,
            confidenceScore,
            nextFocus,
            splitStyle,
            weeklyBudget,
            weeklyPlan,
            generationContext,
            prompt,
            rawAiText,
            parsed,
            validated,
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
