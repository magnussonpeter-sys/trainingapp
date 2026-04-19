import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    // Seed-route ska bara vara tillgänglig för admin.
    await requireAdmin();

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
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled" || error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

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
