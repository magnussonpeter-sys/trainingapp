import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { pool } from "@/lib/db";

// Request från avslutssidan i /run.
const requestSchema = z.object({
  userId: z.string().min(1),
  workoutName: z.string().min(1),
  totalCompletedSets: z.number().int().min(0),
  totalVolume: z.number().min(0),
  timedExercises: z.number().int().min(0),
  durationMinutes: z.number().int().min(0),
  weightedSetCount: z.number().int().min(0).optional(),
  bodyweightSetCount: z.number().int().min(0).optional(),
});

const responseSchema = z.object({
  title: z.string().min(1),
  achieved: z.string().min(1),
  historicalContext: z.string().min(1),
  nextStep: z.string().min(1),
  nextSessionTiming: z.string().min(1),
  coachNote: z.string().min(1),
  scienceMinute: z.string().min(1),
});

type FinishAnalysis = z.infer<typeof responseSchema>;

type RecentWorkoutRow = {
  workoutName: string;
  completedAt: string;
  durationSeconds: number | null;
  exerciseCount: number;
  setCount: number;
  totalVolume: number;
};

type GoalRow = {
  training_goal: string | null;
};

function parseDateMs(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function countWithinDays(rows: RecentWorkoutRow[], days: number) {
  const now = Date.now();
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  return rows.filter((row) => {
    const completedAtMs = parseDateMs(row.completedAt);
    return completedAtMs > 0 && now - completedAtMs <= thresholdMs;
  }).length;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getDeterministicFallback(params: {
  goal: string | null;
  totalCompletedSets: number;
  totalVolume: number;
  durationMinutes: number;
  recentWorkouts: RecentWorkoutRow[];
  weightedSetCount?: number;
  bodyweightSetCount?: number;
}): FinishAnalysis {
  const {
    goal,
    totalCompletedSets,
    totalVolume,
    durationMinutes,
    recentWorkouts,
    weightedSetCount = 0,
    bodyweightSetCount = 0,
  } = params;

  const recent7d = countWithinDays(recentWorkouts, 7);
  const recent14d = countWithinDays(recentWorkouts, 14);
  const avgRecentSets = Math.round(
    average(recentWorkouts.map((item) => item.setCount)),
  );
  const avgRecentVolume = Math.round(
    average(recentWorkouts.map((item) => item.totalVolume)),
  );

  const normalizedGoal = goal?.trim().toLowerCase() ?? "";

  const highLoad =
    totalCompletedSets >= 16 ||
    totalVolume >= Math.max(5000, avgRecentVolume + 1200) ||
    durationMinutes >= 70;

  const lowLoad =
    totalCompletedSets <= 8 &&
    totalVolume <= Math.max(2500, avgRecentVolume * 0.8) &&
    bodyweightSetCount === 0;

  let title = "Stabil träningsstimulans";
  let achieved =
    "Det här passet gav en tydlig träningssignal och ligger inom ett användbart spann för fortsatt progression.";
  let historicalContext =
    recentWorkouts.length > 0
      ? `Du har genomfört ${recent7d} pass senaste 7 dagarna och ${recent14d} senaste 14 dagarna. Det här passet ligger ungefär i linje med din senaste träningsnivå.`
      : "Det finns ännu begränsad historik, så bedömningen utgår mest från detta pass.";

  let nextStep =
    "Behåll ungefär samma upplägg nästa gång och försök skapa liten progression i minst en huvudövning.";
  let nextSessionTiming =
    highLoad
      ? "Sikta på nästa liknande pass om ungefär 48 timmar."
      : "Nästa pass kan oftast fungera inom 24–48 timmar.";
  let coachNote =
    "Prioritera jämn träningsfrekvens och små, upprepade förbättringar framför stora hopp från pass till pass.";
  let scienceMinute =
    "Dagens pass gav en tydlig träningssignal genom tillräcklig volym och meningsfull ansträngning. Den viktigaste mekanismen nu är fortsatt kontinuitet så att stimulansen upprepas över tid.";

  if (bodyweightSetCount > 0 && weightedSetCount === 0) {
    achieved =
      "Det här passet gav en användbar träningssignal även utan extern belastning, framför allt genom arbetsset och upplevd ansträngning.";
    scienceMinute =
      "När ett pass bygger på kroppsvikt är extern volym i kilo ett svagare mått än antal arbetsset och faktisk ansträngning. Effekten avgörs därför mer av hur utmanande seten var än av registrerad vikt.";
  }

  if (highLoad) {
    title = "Hög träningsbelastning";
    achieved =
      "Det här passet ser ut att ha gett en stark träningsstimulans, särskilt genom relativt hög total volym och/eller många set.";
    historicalContext =
      recentWorkouts.length > 0
        ? `Jämfört med dina senaste pass var detta åt den tyngre sidan. Ditt snitt har legat kring cirka ${avgRecentSets || 0} set per pass, och nu låg du på ${totalCompletedSets}.`
        : "Det här ser ut som ett ganska krävande pass även utan mycket historik att jämföra med.";
    nextStep =
      "Nästa pass bör antingen vara något lättare, eller lika tungt men med bättre kvalitet i utförandet snarare än ännu mer volym.";
    nextSessionTiming =
      "Planera nästa liknande styrkepass om cirka 48 timmar, särskilt om du känner tydlig trötthet eller muskelömhet.";
    coachNote =
      "Stark progression byggs ofta bäst genom att växla mellan tunga och mer moderata pass snarare än att pressa maximal belastning varje gång.";
    scienceMinute =
      "Hög träningsbelastning ökar den akuta stimulansen, men adaptation sker främst när du hinner återhämta dig till nästa kvalitativa pass. Mer är därför inte alltid bättre om återhämtningen inte hänger med.";
  } else if (lowLoad) {
    title = "Låg till måttlig belastning";
    achieved =
      "Passet gav sannolikt viss effekt, men det ligger i den lägre delen av spannet för tydlig progression om detta blir din normala nivå.";
    historicalContext =
      recentWorkouts.length > 0
        ? `Jämfört med din senaste historik var detta något lättare än vanligt. Ditt ungefärliga snitt har varit kring ${avgRecentSets || 0} set per pass.`
        : "Det finns ännu begränsad historik, men själva passet ser relativt lätt ut.";
    nextStep =
      "Nästa pass bör öka stimulansen något, till exempel med fler set, lite högre belastning eller bättre närhet till failure i huvudövningarna.";
    nextSessionTiming =
      "Nästa pass kan ofta fungera redan inom cirka 24 timmar om kroppen känns återhämtad.";
    coachNote =
      "Om målet är styrka eller muskeltillväxt behöver passen över tid ligga på en nivå som är tydligt utmanande, inte bara genomförbara.";
    scienceMinute =
      "Lägre belastning kan fortfarande vara värdefull, men progression kräver att passen över tid når en tillräckligt utmanande nivå. Effekten formas alltså mer av den samlade veckostimulansen än av ett enstaka lätt pass.";
  }

  if (normalizedGoal.includes("styrka")) {
    nextStep =
      "Om målet är styrka bör nästa pass helst prioritera god kvalitet i huvudlyften och liten belastningsökning i någon central övning.";
    coachNote =
      "För styrka är det oftast bättre att göra små viktökningar med bra teknik än att jaga mycket extra volym i varje pass.";
    scienceMinute =
      "För styrkeutveckling är kvaliteten i de belastade repetitionerna central. Små, återkommande ökningar med stabil teknik brukar ge bättre långsiktig effekt än stora hopp i vikt eller volym.";
  }

  if (
    normalizedGoal.includes("hypertrofi") ||
    normalizedGoal.includes("muskel")
  ) {
    nextStep =
      "Om målet är muskeltillväxt bör nästa pass antingen matcha eller något överträffa dagens totala stimulans i relevanta muskelgrupper.";
    coachNote =
      "För hypertrofi är jämn veckovolym, tillräcklig ansträngning och återkommande progression viktigare än enstaka extremt hårda pass.";
    scienceMinute =
      "För hypertrofi byggs resultat främst av tillräcklig ansträngning och återkommande träningsvolym över veckan. Ett pass bidrar alltså mest när det passar in i en jämn kedja av liknande stimulans.";
  }

  return {
    title,
    achieved,
    historicalContext,
    nextStep,
    nextSessionTiming,
    coachNote,
    scienceMinute,
  };
}

async function getTrainingGoal(userId: string) {
  const result = await pool.query<GoalRow>(
    `
      select training_goal
      from user_settings
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  return result.rows[0]?.training_goal?.trim() || null;
}

async function getRecentWorkouts(userId: string) {
  const result = await pool.query<RecentWorkoutRow>(
    `
      select
        wl.workout_name as "workoutName",
        wl.completed_at as "completedAt",
        wl.duration_seconds as "durationSeconds",
        coalesce(
          (
            select count(*)
            from workout_log_exercises wle
            where wle.workout_log_id = wl.id
          ),
          0
        )::int as "exerciseCount",
        coalesce(
          (
            select count(*)
            from workout_log_sets wls
            join workout_log_exercises wle
              on wle.id = wls.workout_log_exercise_id
            where wle.workout_log_id = wl.id
          ),
          0
        )::int as "setCount",
        coalesce(
          (
            select sum(coalesce(wls.actual_weight, 0) * coalesce(wls.actual_reps, 0))
            from workout_log_sets wls
            join workout_log_exercises wle
              on wle.id = wls.workout_log_exercise_id
            where wle.workout_log_id = wl.id
          ),
          0
        )::float8 as "totalVolume"
      from workout_logs wl
      where wl.user_id = $1
        and wl.status = 'completed'
      order by wl.completed_at desc
      limit 8
    `,
    [userId],
  );

  return result.rows;
}

function buildPrompt(params: {
  goal: string | null;
  recentWorkouts: RecentWorkoutRow[];
  totalCompletedSets: number;
  totalVolume: number;
  timedExercises: number;
  durationMinutes: number;
  workoutName: string;
  weightedSetCount?: number;
  bodyweightSetCount?: number;
}) {
  const {
    goal,
    recentWorkouts,
    totalCompletedSets,
    totalVolume,
    timedExercises,
    durationMinutes,
    workoutName,
  } = params;

  const recent7d = countWithinDays(recentWorkouts, 7);
  const recent14d = countWithinDays(recentWorkouts, 14);

  return `
Du är en svensk, evidensbaserad träningscoach för styrketräning.

Uppgift:
Analysera ett precis avslutat träningspass och ge korta, tydliga PT-råd på svenska.

Viktiga regler:
- title ska vara sidans huvudinsikt, alltså en mycket kort coachande slutsats i en enda mening.
- title får inte vara en generisk rubrik som "Kort analys av passet", "Sammanfattning", "Bra jobbat" eller liknande.
- title ska säga något konkret om belastning, träningssignal, kontinuitet eller nästa steg.
- Om total volym är 0 men passet innehåller kroppsviktsset får du inte tolka det som att träningsstimulansen automatiskt var låg.
- Fokusera bara på träningseffekt, progression, återhämtning och plan framåt.
- Nämn inte vätska, kost eller sömn.
- Bygg resonemanget på stark praktisk evidens för styrketräning:
  - progressiv överbelastning
  - tillräcklig träningsvolym över tid
  - rimlig frekvens per muskelgrupp över veckan
  - att passen behöver vara tillräckligt utmanande för progression
- Svara kort, konkret och pedagogiskt.
- Varje fält ska helst vara 1–2 meningar.
- Undvik upprepningar mellan fälten.
- Anpassa råden till målet om det finns.
- Anpassa råden till historiken om den finns.
- Undvik att låtsas veta detaljer som inte finns i datan.

Returnera ENDAST giltig JSON med exakt dessa fält:
{
  "title": string,
  "achieved": string,
  "historicalContext": string,
  "nextStep": string,
  "nextSessionTiming": string,
  "coachNote": string,
  "scienceMinute": string
}

Data:
- Mål: ${goal ?? "okänt"}
- Dagens pass: ${workoutName}
- Genomförda set: ${totalCompletedSets}
- Total volym: ${Math.round(totalVolume)}
- Antal tidsövningar: ${timedExercises}
- Passlängd: ${durationMinutes} minuter
- Antal set med extern vikt: ${params.weightedSetCount ?? 0}
- Antal kroppsviktsset utan extern vikt: ${params.bodyweightSetCount ?? 0}
- Antal pass senaste 7 dagar: ${recent7d}
- Antal pass senaste 14 dagar: ${recent14d}
- Senaste pass:
${JSON.stringify(recentWorkouts, null, 2)}
`.trim();
}

async function getAiAnalysis(params: {
  goal: string | null;
  recentWorkouts: RecentWorkoutRow[];
  totalCompletedSets: number;
  totalVolume: number;
  timedExercises: number;
  durationMinutes: number;
  workoutName: string;
  weightedSetCount?: number;
  bodyweightSetCount?: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Du är en kortfattad svensk träningscoach som skriver tydliga, praktiska och evidensbaserade råd.",
      },
      {
        role: "user",
        content: buildPrompt(params),
      },
    ],
    temperature: 0.4,
  });

  const rawContent = completion.choices[0]?.message?.content;

  if (!rawContent) {
    return null;
  }

  const parsedJson = JSON.parse(rawContent) as unknown;
  const parsed = responseSchema.safeParse(parsedJson);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const [goal, recentWorkouts] = await Promise.all([
      getTrainingGoal(parsed.userId),
      getRecentWorkouts(parsed.userId),
    ]);

    const fallback = getDeterministicFallback({
      goal,
      totalCompletedSets: parsed.totalCompletedSets,
      totalVolume: parsed.totalVolume,
      durationMinutes: parsed.durationMinutes,
      recentWorkouts,
      weightedSetCount: parsed.weightedSetCount ?? 0,
      bodyweightSetCount: parsed.bodyweightSetCount ?? 0,
    });

    let analysis: FinishAnalysis = fallback;
    let source: "ai" | "fallback" = "fallback";

    try {
      const aiAnalysis = await getAiAnalysis({
        goal,
        recentWorkouts,
        totalCompletedSets: parsed.totalCompletedSets,
        totalVolume: parsed.totalVolume,
        timedExercises: parsed.timedExercises,
        durationMinutes: parsed.durationMinutes,
        workoutName: parsed.workoutName,
        weightedSetCount: parsed.weightedSetCount ?? 0,
        bodyweightSetCount: parsed.bodyweightSetCount ?? 0,
      });

      if (aiAnalysis) {
        analysis = aiAnalysis;
        source = "ai";
      }
    } catch (error) {
      console.error("workout-finish-analysis ai error:", error);
    }

    return NextResponse.json({
      ok: true,
      source,
      analysis,
      history: {
        recent7d: countWithinDays(recentWorkouts, 7),
        recent14d: countWithinDays(recentWorkouts, 14),
        recentCount: recentWorkouts.length,
      },
    });
  } catch (error) {
    console.error("workout-finish-analysis route error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid finish analysis payload",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to build finish analysis",
      },
      { status: 500 },
    );
  }
}
