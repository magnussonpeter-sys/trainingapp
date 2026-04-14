import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

async function ensureUserSettingsColumns() {
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS avoid_supersets BOOLEAN DEFAULT FALSE
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS primary_priority_muscle TEXT
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS secondary_priority_muscle TEXT
  `);
}

export async function GET(req: NextRequest) {
  try {
    await ensureUserSettingsColumns();
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
    }

    const result = await pool.query(
      `SELECT * FROM user_settings WHERE user_id = $1`,
      [userId]
    );

    return NextResponse.json({
      ok: true,
      settings: result.rows[0] ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userId,
      sex,
      age,
      weight_kg,
      height_cm,
      experience_level,
      training_goal,
      avoid_supersets,
      primary_priority_muscle,
      secondary_priority_muscle,
    } = body;

    await ensureUserSettingsColumns();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
    }

    const result = await pool.query(
      `
      INSERT INTO user_settings (
        user_id, sex, age, weight_kg, height_cm, experience_level, training_goal, avoid_supersets, primary_priority_muscle, secondary_priority_muscle
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id)
      DO UPDATE SET
        sex = EXCLUDED.sex,
        age = EXCLUDED.age,
        weight_kg = EXCLUDED.weight_kg,
        height_cm = EXCLUDED.height_cm,
        experience_level = EXCLUDED.experience_level,
        training_goal = EXCLUDED.training_goal,
        avoid_supersets = EXCLUDED.avoid_supersets,
        primary_priority_muscle = EXCLUDED.primary_priority_muscle,
        secondary_priority_muscle = EXCLUDED.secondary_priority_muscle,
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        sex,
        age,
        weight_kg,
        height_cm,
        experience_level,
        training_goal,
        Boolean(avoid_supersets),
        primary_priority_muscle ?? null,
        secondary_priority_muscle ?? null,
      ]
    );

    return NextResponse.json({ ok: true, settings: result.rows[0] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
