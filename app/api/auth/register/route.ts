import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !username || !password) {
      return NextResponse.json(
        { ok: false, error: "Email, användarnamn och lösenord krävs" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Lösenordet måste vara minst 6 tecken" },
        { status: 400 }
      );
    }

    const existing = await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = $1 OR LOWER(username) = $2
      LIMIT 1
      `,
      [email, username]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Email eller användarnamn finns redan" },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);

    const result = await pool.query(
      `
      INSERT INTO users (email, username, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, email, username
      `,
      [email, username, passwordHash]
    );

    return NextResponse.json({
      ok: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Register failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}