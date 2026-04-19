import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    // Init-routes ska bara kunna köras av admin.
    await requireAdmin();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      ALTER TABLE gyms
      ADD COLUMN IF NOT EXISTS user_id UUID
    `);

    await pool.query(`
      ALTER TABLE gyms
      ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await pool.query(`
      ALTER TABLE workout_sessions
      ADD COLUMN IF NOT EXISTS user_id UUID
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'gyms_user_id_fkey'
        ) THEN
          ALTER TABLE gyms
          ADD CONSTRAINT gyms_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'workout_sessions_user_id_fkey'
        ) THEN
          ALTER TABLE workout_sessions
          ADD CONSTRAINT workout_sessions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
        END IF;
      END
      $$;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_gyms_user_id
      ON gyms(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_id
      ON workout_sessions(user_id)
    `);

    return NextResponse.json({
      ok: true,
      message: "auth database step 1 complete",
    });
  } catch (error) {
    console.error("Init auth DB failed:", error);

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
