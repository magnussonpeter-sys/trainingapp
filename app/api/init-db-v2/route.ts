import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    // Init-routes ska bara kunna köras av admin.
    await requireAdmin();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workout_sessions (
        id SERIAL PRIMARY KEY,
        performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        notes TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS workout_exercises (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        exercise_name TEXT NOT NULL,
        reps INTEGER,
        sets INTEGER,
        difficulty TEXT,
        notes TEXT
      )
    `);

    return NextResponse.json({
      ok: true,
      message: "workout_sessions and workout_exercises are ready",
    });
  } catch (error) {
    console.error("Init DB v2 failed:", error);

    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled" || error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
