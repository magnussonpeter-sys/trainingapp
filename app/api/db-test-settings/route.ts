import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Skapa tabell
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        sex TEXT,
        age INTEGER,
        weight_kg NUMERIC,
        height_cm NUMERIC,
        experience_level TEXT,
        training_goal TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. Index (bra att ha även om PK finns)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id
      ON user_settings (user_id);
    `);

    // 3. Constraints (säkert skapade)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_sex_check'
        ) THEN
          ALTER TABLE user_settings
          ADD CONSTRAINT user_settings_sex_check
          CHECK (
            sex IS NULL OR sex IN ('male','female','other','na')
          );
        END IF;
      END$$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_experience_check'
        ) THEN
          ALTER TABLE user_settings
          ADD CONSTRAINT user_settings_experience_check
          CHECK (
            experience_level IS NULL OR
            experience_level IN ('beginner','novice','intermediate','advanced')
          );
        END IF;
      END$$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_goal_check'
        ) THEN
          ALTER TABLE user_settings
          ADD CONSTRAINT user_settings_goal_check
          CHECK (
            training_goal IS NULL OR
            training_goal IN ('strength','hypertrophy','health','body_composition')
          );
        END IF;
      END$$;
    `);

    // 4. Debug: visa kolumner
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'user_settings'
      ORDER BY ordinal_position;
    `);

    const result = await client.query("SELECT NOW() as current_time");

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      message: "user_settings migration körd",
      dbTime: result.rows[0].current_time,
      columns: columns.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("DB test settings failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}