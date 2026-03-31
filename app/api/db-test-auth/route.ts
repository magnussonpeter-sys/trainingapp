import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const client = await pool.connect();

  try {
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