import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    // Init-route ska bara kunna köras av admin.
    await requireAdmin();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS workouts (
        id SERIAL PRIMARY KEY,
        performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        exercise_name TEXT NOT NULL,
        reps INTEGER,
        sets INTEGER,
        difficulty TEXT,
        notes TEXT
      )
    `);

    return NextResponse.json({
      ok: true,
      message: "workouts table is ready",
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled" || error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

    console.error("Init DB failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
