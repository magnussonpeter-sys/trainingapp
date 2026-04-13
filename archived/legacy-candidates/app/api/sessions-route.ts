import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const sessionsResult = await pool.query(`
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
      LIMIT 20
    `);

    return NextResponse.json({
      ok: true,
      sessions: sessionsResult.rows,
    });
  } catch (error) {
    console.error("GET sessions failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();

  try {
    const body = await req.json();
    const { notes, exercises } = body;

    if (!Array.isArray(exercises) || exercises.length === 0) {
      return NextResponse.json(
        { ok: false, error: "At least one exercise is required" },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    const sessionResult = await client.query(
      `INSERT INTO workout_sessions (notes)
       VALUES ($1)
       RETURNING *`,
      [notes ?? null]
    );

    const session = sessionResult.rows[0];

    for (const exercise of exercises) {
      await client.query(
        `INSERT INTO workout_exercises
         (session_id, exercise_name, reps, sets, difficulty, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          session.id,
          exercise.exercise_name,
          exercise.reps ?? null,
          exercise.sets ?? null,
          exercise.difficulty ?? null,
          exercise.notes ?? null,
        ]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST session failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
