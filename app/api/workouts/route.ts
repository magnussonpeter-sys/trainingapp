import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    // Legacy-workouts ska inte vara publikt läsbara.
    await requireAdmin();

    const result = await pool.query(
      "SELECT * FROM workouts ORDER BY performed_at DESC LIMIT 20"
    );

    return NextResponse.json({
      ok: true,
      workouts: result.rows,
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
    // Legacy-workouts ska inte kunna skrivas av anonyma klienter.
    await requireAdmin();

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
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled" || error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

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
