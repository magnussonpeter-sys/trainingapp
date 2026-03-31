import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
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
    } = body;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
    }

    const result = await pool.query(
      `
      INSERT INTO user_settings (
        user_id, sex, age, weight_kg, height_cm, experience_level, training_goal
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id)
      DO UPDATE SET
        sex = EXCLUDED.sex,
        age = EXCLUDED.age,
        weight_kg = EXCLUDED.weight_kg,
        height_cm = EXCLUDED.height_cm,
        experience_level = EXCLUDED.experience_level,
        training_goal = EXCLUDED.training_goal,
        updated_at = NOW()
      RETURNING *
      `,
      [userId, sex, age, weight_kg, height_cm, experience_level, training_goal]
    );

    return NextResponse.json({ ok: true, settings: result.rows[0] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
}