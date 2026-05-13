import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuthorizedUserId } from "@/lib/server-auth";
import { normalizeSportFocus } from "@/types/training-profile";
import { normalizeWorkoutGenerationMode } from "@/lib/workout-generation/types";

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
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS sport_focus TEXT NOT NULL DEFAULT 'none'
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS generation_mode TEXT NOT NULL DEFAULT 'legacy_ai_chain'
  `);
  await pool.query(`
    UPDATE user_settings
    SET sport_focus = CASE
      WHEN sport_focus = 'skiing' THEN 'alpine_skiing'
      WHEN sport_focus IS NULL THEN 'none'
      WHEN sport_focus NOT IN (
        'none',
        'running',
        'cross_country_skiing',
        'alpine_skiing',
        'cycling',
        'ball_sports',
        'swimming',
        'golf',
        'surf_sports',
        'general_athletic'
      ) THEN 'none'
      ELSE sport_focus
    END
  `);
  await pool.query(`
    UPDATE user_settings
    SET generation_mode = CASE
      WHEN generation_mode IS NULL THEN 'legacy_ai_chain'
      WHEN generation_mode NOT IN ('legacy_ai_chain', 'slot_based_v1', 'hybrid') THEN 'legacy_ai_chain'
      ELSE generation_mode
    END
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
      sport_focus,
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
    const normalizedSportFocus = normalizeSportFocus(sport_focus);
    const normalizedGenerationMode = normalizeWorkoutGenerationMode(
      body.generation_mode,
      "legacy_ai_chain",
    );

    const result = await pool.query(
      `
      INSERT INTO user_settings (
        user_id, sex, age, weight_kg, height_cm, experience_level, training_goal, sport_focus, generation_mode, avoid_supersets, superset_preference, primary_priority_muscle, secondary_priority_muscle, tertiary_priority_muscle
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (user_id)
      DO UPDATE SET
        sex = EXCLUDED.sex,
        age = EXCLUDED.age,
        weight_kg = EXCLUDED.weight_kg,
        height_cm = EXCLUDED.height_cm,
        experience_level = EXCLUDED.experience_level,
        training_goal = EXCLUDED.training_goal,
        sport_focus = EXCLUDED.sport_focus,
        generation_mode = EXCLUDED.generation_mode,
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
        normalizedSportFocus,
        normalizedGenerationMode,
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
