import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      `INSERT INTO workouts (exercise_name, reps, sets, difficulty, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      ["Push-up", 12, 3, "medium", "Testpass från seed-route"]
    );

    return NextResponse.json({
      ok: true,
      workout: result.rows[0],
    });
  } catch (error) {
    console.error("Seed workout failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
