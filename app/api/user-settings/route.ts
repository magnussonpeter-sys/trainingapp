import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuthorizedUserId } from "@/lib/server-auth";

async function ensureUserSettingsColumns() {
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS avoid_supersets BOOLEAN DEFAULT FALSE
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS superset_preference TEXT
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS primary_priority_muscle TEXT
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS secondary_priority_muscle TEXT
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS tertiary_priority_muscle TEXT
  `);
}

export async function GET(req: NextRequest) {
  try {
    await ensureUserSettingsColumns();
    const requestedUserId = req.nextUrl.searchParams.get("userId");
    const user = await requireAuthorizedUserId(requestedUserId);

    const result = await pool.query(
      `SELECT * FROM user_settings WHERE user_id = $1`,
      [user.id]
    );

    return NextResponse.json({
      ok: true,
      settings: result.rows[0] ?? null,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

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
      userId: requestedUserId,
      sex,
      age,
      weight_kg,
      height_cm,
      experience_level,
      training_goal,
      avoid_supersets,
      superset_preference,
      primary_priority_muscle,
      secondary_priority_muscle,
      tertiary_priority_muscle,
    } = body;

    await ensureUserSettingsColumns();
    const user = await requireAuthorizedUserId(
      typeof requestedUserId === "string" ? requestedUserId : null,
    );

    // Keep the legacy boolean aligned so older clients still read the right behavior.
    const normalizedSupersetPreference =
      superset_preference === "avoid_all" ||
      superset_preference === "avoid_all_dumbbell" ||
      superset_preference === "allowed"
        ? superset_preference
        : Boolean(avoid_supersets)
          ? "avoid_all"
          : "allowed";

    const result = await pool.query(
      `
      INSERT INTO user_settings (
        user_id, sex, age, weight_kg, height_cm, experience_level, training_goal, avoid_supersets, superset_preference, primary_priority_muscle, secondary_priority_muscle, tertiary_priority_muscle
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (user_id)
      DO UPDATE SET
        sex = EXCLUDED.sex,
        age = EXCLUDED.age,
        weight_kg = EXCLUDED.weight_kg,
        height_cm = EXCLUDED.height_cm,
        experience_level = EXCLUDED.experience_level,
        training_goal = EXCLUDED.training_goal,
        avoid_supersets = EXCLUDED.avoid_supersets,
        superset_preference = EXCLUDED.superset_preference,
        primary_priority_muscle = EXCLUDED.primary_priority_muscle,
        secondary_priority_muscle = EXCLUDED.secondary_priority_muscle,
        tertiary_priority_muscle = EXCLUDED.tertiary_priority_muscle,
        updated_at = NOW()
      RETURNING *
      `,
      [
        user.id,
        sex,
        age,
        weight_kg,
        height_cm,
        experience_level,
        training_goal,
        normalizedSupersetPreference === "avoid_all",
        normalizedSupersetPreference,
        primary_priority_muscle ?? null,
        secondary_priority_muscle ?? null,
        tertiary_priority_muscle ?? null,
      ]
    );

    return NextResponse.json({ ok: true, settings: result.rows[0] });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
