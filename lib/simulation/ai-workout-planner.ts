import OpenAI from "openai";

import {
  createSimulationVariantGroup,
  toPlannerDebugExercise,
} from "@/lib/simulation/exercise-identity";
import { clamp, round, type SeededRandom } from "@/lib/simulation/random";
import type { SyntheticExercisePlan } from "@/lib/simulation/simulate-exercise";
import type {
  SimulationDayPlan,
  SimulationPlannerDebugExercise,
  SimulationUserProfile,
  SimulationUserState,
} from "@/lib/simulation/types";

type AiExercisePlan = {
  exerciseId?: string;
  exerciseName?: string;
  category?: SyntheticExercisePlan["category"];
  difficulty?: number;
  plannedSets?: number;
  plannedReps?: number | null;
  plannedDurationSec?: number | null;
  plannedWeightKg?: number | null;
  baseLoadScore?: number;
  variantGroup?: string;
};

type AiWorkoutPlanResponse = {
  exercises?: AiExercisePlan[];
};

export type AiSimulationPlannerResult =
  | {
      source: "ai";
      exercises: SyntheticExercisePlan[];
      rawExercises: SimulationPlannerDebugExercise[];
      message: string;
      model: string;
    }
  | {
      source: "unavailable" | "invalid_response" | "error";
      exercises: null;
      message: string;
      model?: string;
    };

function normalizeExerciseId(name: string, index: number) {
  return (
    name
      .toLowerCase()
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `ai_exercise_${index + 1}`
  );
}

function normalizeCategory(value: unknown): SyntheticExercisePlan["category"] {
  if (
    value === "compound" ||
    value === "accessory" ||
    value === "core" ||
    value === "conditioning"
  ) {
    return value;
  }

  return "accessory";
}

function normalizeAiExercises(
  exercises: AiExercisePlan[] | undefined,
  params: {
    dayPlan: SimulationDayPlan;
    profile: SimulationUserProfile;
    random: SeededRandom;
    state: SimulationUserState;
  },
): SyntheticExercisePlan[] {
  const targetCount = clamp(Math.round(params.dayPlan.targetDurationMin / 12), 2, 6);

  return (exercises ?? [])
    .slice(0, targetCount)
    .map((exercise, index) => {
      const exerciseName = exercise.exerciseName?.trim() || `AI-övning ${index + 1}`;
      const category = normalizeCategory(exercise.category);
      const difficulty = clamp(exercise.difficulty ?? params.random.between(45, 76), 25, 95);
      const plannedSets = clamp(Math.round(exercise.plannedSets ?? (category === "compound" ? 3 : 2)), 1, 5);
      const plannedReps =
        typeof exercise.plannedReps === "number" && Number.isFinite(exercise.plannedReps)
          ? clamp(Math.round(exercise.plannedReps), 3, 20)
          : undefined;
      const plannedDurationSec =
        typeof exercise.plannedDurationSec === "number" &&
        Number.isFinite(exercise.plannedDurationSec)
          ? clamp(Math.round(exercise.plannedDurationSec), 10, 180)
          : undefined;
      const plannedWeightKg =
        typeof exercise.plannedWeightKg === "number" &&
        Number.isFinite(exercise.plannedWeightKg)
          ? round(Math.max(0, exercise.plannedWeightKg), 1)
          : plannedReps != null
            ? round(Math.max(2.5, params.state.strengthLevel * (difficulty / 160)), 1)
            : undefined;

      const baseExercise = {
        exerciseId: exercise.exerciseId?.trim() || normalizeExerciseId(exerciseName, index),
        exerciseName,
      };

      return {
        ...baseExercise,
        variantGroup: exercise.variantGroup?.trim() || createSimulationVariantGroup(baseExercise),
        difficulty,
        plannedSets,
        plannedReps,
        plannedDurationSec,
        plannedWeightKg,
        baseLoadScore: clamp(exercise.baseLoadScore ?? difficulty / 4, 6, 28),
        category,
      };
    });
}

function normalizeRawAiExercises(exercises: AiExercisePlan[] | undefined) {
  return (exercises ?? []).map((exercise, index) => {
    const exerciseName = exercise.exerciseName?.trim() || `AI-övning ${index + 1}`;
    const exerciseId = exercise.exerciseId?.trim() || normalizeExerciseId(exerciseName, index);
    const variantGroup =
      exercise.variantGroup?.trim() || createSimulationVariantGroup({ exerciseId, exerciseName });

    return toPlannerDebugExercise({ exerciseId, exerciseName, variantGroup });
  });
}

function buildPrompt(params: {
  dayPlan: SimulationDayPlan;
  recentExercises?: SimulationPlannerDebugExercise[];
  profile: SimulationUserProfile;
  state: SimulationUserState;
}) {
  const recentExerciseLines = (params.recentExercises ?? [])
    .slice(0, 18)
    .map((exercise) => `- ${exercise.exerciseName} (${exercise.aggregationKey})`)
    .join("\n");

  return `
Du är träningsappens passgenerator i ett simuleringslabb.
Skapa ett kompakt träningspass som JSON för en virtuell användare.

Returnera endast giltig JSON:
{
  "exercises": [
    {
      "exerciseId": "snake_case_id",
      "exerciseName": "svenskt namn",
      "category": "compound | accessory | core | conditioning",
      "difficulty": number,
      "plannedSets": number,
      "plannedReps": number | null,
      "plannedDurationSec": number | null,
      "plannedWeightKg": number | null,
      "baseLoadScore": number,
      "variantGroup": "stabil_variantnyckel"
    }
  ]
}

Regler:
- Välj 2-6 övningar beroende på duration.
- Använd bara utrustning som finns tillgänglig.
- Anpassa belastning till readiness, fatigue, erfarenhet och mål.
- Vid låg readiness eller hög fatigue: enklare pass, färre tunga baslyft.
- Variera övningsvariant över 7-14 dagar när målet och utrustningen tillåter det.
- Återanvänd inte exakt samma variant för ofta om en likvärdig variant finns.
- Detta är testdata för simulering, så var realistisk men kortfattad.

Data:
- mål: ${params.profile.goal}
- erfarenhet: ${params.profile.experienceLevel}
- duration: ${params.dayPlan.targetDurationMin} min
- utrustning: ${params.profile.availableEquipmentIds.join(", ")}
- readiness: ${params.state.readiness}
- fatigue: ${params.state.fatigue}
- soreness: ${params.state.soreness}
- motivation: ${params.state.motivation}
- strengthLevel: ${params.state.strengthLevel}
- workCapacity: ${params.state.workCapacity}
- nyligen valda övningar senaste 14 dagar:
${recentExerciseLines || "- inga ännu"}
`.trim();
}

export async function planAiSimulationWorkout(params: {
  dayPlan: SimulationDayPlan;
  recentExercises?: SimulationPlannerDebugExercise[];
  profile: SimulationUserProfile;
  random: SeededRandom;
  state: SimulationUserState;
}): Promise<AiSimulationPlannerResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_SIMULATION_MODEL?.trim() || "gpt-5.4-mini";

  if (!apiKey) {
    return {
      source: "unavailable",
      exercises: null,
      message: "OPENAI_API_KEY saknas, syntetisk fallback användes.",
    };
  }

  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Du skapar korta realistiska träningspass som strikt JSON för en deterministisk simulering.",
        },
        {
          role: "user",
          content: buildPrompt(params),
        },
      ],
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return {
        source: "invalid_response",
        exercises: null,
        message: "OpenAI returnerade inget innehåll, syntetisk fallback användes.",
        model,
      };
    }

    const parsed = JSON.parse(content) as AiWorkoutPlanResponse;
    const normalized = normalizeAiExercises(parsed.exercises, params);
    const rawExercises = normalizeRawAiExercises(parsed.exercises);

    if (normalized.length === 0) {
      return {
        source: "invalid_response",
        exercises: null,
        message: "OpenAI-svaret saknade användbara övningar, syntetisk fallback användes.",
        model,
      };
    }

    return {
      source: "ai",
      exercises: normalized,
      rawExercises,
      message: `AI-planerat med ${model}.`,
      model,
    };
  } catch (error) {
    return {
      source: "error",
      exercises: null,
      message:
        error instanceof Error
          ? `OpenAI-fel: ${error.message}`
          : "Okänt OpenAI-fel, syntetisk fallback användes.",
      model,
    };
  }
}
