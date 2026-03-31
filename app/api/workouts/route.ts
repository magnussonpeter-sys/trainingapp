import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT * FROM workouts ORDER BY performed_at DESC LIMIT 20"
    );

    return NextResponse.json({
      ok: true,
      workouts: result.rows,
    });
  } catch (error) {
    console.error("GET workouts failed:", error);
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
  try {
    const body = await req.json();
    const { exercise_name, reps, sets, difficulty, notes } = body;

    const result = await pool.query(
      `INSERT INTO workouts (exercise_name, reps, sets, difficulty, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [exercise_name, reps, sets, difficulty, notes]
    );

    return NextResponse.json({
      ok: true,
      workout: result.rows[0],
    });
  } catch (error) {
    console.error("POST workout failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
