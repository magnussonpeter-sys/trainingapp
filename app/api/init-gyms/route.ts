import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    // Init-routes ska bara kunna köras av admin.
    await requireAdmin();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gyms (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gym_equipment (
        id SERIAL PRIMARY KEY,
        gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
        equipment_type TEXT NOT NULL,
        label TEXT,
        min_weight NUMERIC,
        max_weight NUMERIC,
        weight_unit TEXT,
        quantity INTEGER,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      ALTER TABLE workout_sessions
      ADD COLUMN IF NOT EXISTS gym_id INTEGER REFERENCES gyms(id) ON DELETE SET NULL
    `);

    return NextResponse.json({
      ok: true,
      message: "gyms, gym_equipment and workout_sessions.gym_id are ready",
    });
  } catch (error) {
    console.error("Init gyms failed:", error);

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
