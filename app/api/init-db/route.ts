import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
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
