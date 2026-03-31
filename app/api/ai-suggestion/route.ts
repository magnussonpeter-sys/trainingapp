import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Difficulty = "easy" | "medium" | "hard";

type ExerciseSuggestion = {
  name: string;
  reps: number;
  sets: number;
  difficulty: Difficulty;
  notes: string;
};

type ProgramKey = "A" | "B" | "C";

const PROGRAMS: Record<
  ProgramKey,
  { title: string; description: string; exercises: ExerciseSuggestion[] }
> = {
  A: {
    title: "Program A",
    description: "Baspass: press, drag, ben och core",
    exercises: [
      { name: "Push-up", reps: 10, sets: 3, difficulty: "medium", notes: "Bra basövning för press" },
      { name: "Bordsrodd", reps: 8, sets: 3, difficulty: "medium", notes: "Balans till armhävningar" },
      { name: "Knäböj", reps: 15, sets: 3, difficulty: "medium", notes: "Helkropp och puls" },
      { name: "Planka", reps: 30, sets: 3, difficulty: "medium", notes: "Sekunder" },
    ],
  },
  B: {
    title: "Program B",
    description: "Lite mer drag, benstabilitet och puls",
    exercises: [
      { name: "Gummibandsrodd", reps: 12, sets: 3, difficulty: "easy", notes: "Bra dragövning hemma" },
      { name: "Utfall", reps: 10, sets: 3, difficulty: "medium", notes: "Per ben" },
      { name: "Mountain climbers", reps: 30, sets: 3, difficulty: "medium", notes: "Sekunder" },
      { name: "Planka", reps: 30, sets: 3, difficulty: "medium", notes: "Sekunder" },
    ],
  },
  C: {
    title: "Program C",
    description: "Lite mer tryck och explosivitet",
    exercises: [
      { name: "Push-up", reps: 12, sets: 3, difficulty: "medium", notes: "Kan göras strikt eller lätt lutande" },
      { name: "Jump squat", reps: 10, sets: 3, difficulty: "hard", notes: "Explosivt" },
      { name: "Bordsrodd", reps: 8, sets: 3, difficulty: "medium", notes: "Kontrollerad dragövning" },
      { name: "Planka", reps: 35, sets: 3, difficulty: "medium", notes: "Sekunder" },
    ],
  },
};

function detectLastProgram(notes: string | null): ProgramKey | null {
  if (!notes) return null;
  if (notes.startsWith("Program A")) return "A";
  if (notes.startsWith("Program B")) return "B";
  if (notes.startsWith("Program C")) return "C";
  return null;
}

function getNextProgram(lastProgram: ProgramKey | null): ProgramKey {
  if (lastProgram === "A") return "B";
  if (lastProgram === "B") return "C";
  if (lastProgram === "C") return "A";
  return "A";
}

function adjustExercises(
  exercises: ExerciseSuggestion[],
  avgDifficulty: Difficulty | null
): ExerciseSuggestion[] {
  return exercises.map((exercise) => {
    let reps = exercise.reps;
    let difficulty = exercise.difficulty;
    let notes = exercise.notes;

    if (avgDifficulty === "easy") {
      if (exercise.name === "Planka" || exercise.name === "Mountain climbers") {
        reps += 5;
      } else {
        reps += 2;
      }
      notes = `${notes} • Progression: lite högre belastning`;
    }

    if (avgDifficulty === "hard") {
      if (exercise.name === "Planka" || exercise.name === "Mountain climbers") {
        reps = Math.max(20, reps - 5);
      } else {
        reps = Math.max(6, reps - 2);
      }
      difficulty = exercise.difficulty === "hard" ? "medium" : exercise.difficulty;
      notes = `${notes} • Återhämtning: något lättare idag`;
    }

    return {
      ...exercise,
      reps,
      difficulty,
      notes,
    };
  });
}

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        ws.id,
        ws.performed_at,
        ws.notes,
        COALESCE(
          json_agg(
            json_build_object(
              'id', we.id,
              'exercise_name', we.exercise_name,
              'reps', we.reps,
              'sets', we.sets,
              'difficulty', we.difficulty,
              'notes', we.notes
            )
          ) FILTER (WHERE we.id IS NOT NULL),
          '[]'
        ) AS exercises
      FROM workout_sessions ws
      LEFT JOIN workout_exercises we ON we.session_id = ws.id
      GROUP BY ws.id
      ORDER BY ws.performed_at DESC
      LIMIT 3
    `);

    const sessions = result.rows;
    const latest = sessions[0] ?? null;
    const lastProgram = detectLastProgram(latest?.notes ?? null);
    const nextProgram = getNextProgram(lastProgram);

    const lastExercises = Array.isArray(latest?.exercises) ? latest.exercises : [];
    const difficulties = lastExercises
      .map((e: any) => e.difficulty)
      .filter((d: any) => d === "easy" || d === "medium" || d === "hard") as Difficulty[];

    let avgDifficulty: Difficulty | null = null;
    if (difficulties.length > 0) {
      const hardCount = difficulties.filter((d) => d === "hard").length;
      const easyCount = difficulties.filter((d) => d === "easy").length;

      if (hardCount >= Math.ceil(difficulties.length / 2)) avgDifficulty = "hard";
      else if (easyCount >= Math.ceil(difficulties.length / 2)) avgDifficulty = "easy";
      else avgDifficulty = "medium";
    }

    const baseProgram = PROGRAMS[nextProgram];
    const adjustedExercises = adjustExercises(baseProgram.exercises, avgDifficulty);

    let coachMessage = `${baseProgram.title} föreslås idag.`;
    if (avgDifficulty === "easy") {
      coachMessage += " Senaste passet såg lätt ut, så förslaget är lite upptrappat.";
    } else if (avgDifficulty === "hard") {
      coachMessage += " Senaste passet såg tungt ut, så dagens förslag är något lättare.";
    } else {
      coachMessage += " Belastningen hålls ungefär oförändrad.";
    }

    return NextResponse.json({
      ok: true,
      suggestion: {
        programKey: nextProgram,
        title: baseProgram.title,
        description: baseProgram.description,
        coachMessage,
        exercises: adjustedExercises,
      },
    });
  } catch (error) {
    console.error("AI suggestion failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}