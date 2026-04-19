import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  const client = await pool.connect();

  try {
    // Maintenance-routes ska bara vara tillgängliga för admin.
    await requireAdmin();
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email TEXT UNIQUE,
        username TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email
      ON users (email);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username
      ON users (username);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_token
      ON sessions (session_token);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id
      ON sessions (user_id);
    `);

    const usersColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);

    const sessionsColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sessions'
      ORDER BY ordinal_position;
    `);

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      message: "Auth-tabeller skapade",
      usersColumns: usersColumns.rows,
      sessionsColumns: sessionsColumns.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("DB auth test failed:", error);

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
  } finally {
    client.release();
  }
}
