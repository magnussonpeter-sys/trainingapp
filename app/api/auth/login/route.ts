import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  AUTH_COOKIE_NAME,
  generateSessionToken,
  hashPassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const identifier = String(body.identifier ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const rememberMe = Boolean(body.rememberMe);

    if (!identifier || !password) {
      return NextResponse.json(
        { ok: false, error: "Identifier och lösenord krävs" },
        { status: 400 }
      );
    }

    const userLookup = await pool.query(
      `
      SELECT id, email, username, password_hash
      FROM users
      WHERE LOWER(email) = $1 OR LOWER(username) = $1
      LIMIT 1
      `,
      [identifier]
    );

    if (userLookup.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Ingen användare hittades" },
        { status: 401 }
      );
    }

    const user = userLookup.rows[0];
    const passwordHash = hashPassword(password);

    if (user.password_hash !== passwordHash) {
      return NextResponse.json(
        { ok: false, error: "Fel lösenord" },
        { status: 401 }
      );
    }

    const sessionToken = generateSessionToken();
    const maxAgeSeconds = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

    await pool.query(
      `
      INSERT INTO sessions (user_id, session_token, expires_at)
      VALUES ($1, $2, $3)
      `,
      [user.id, sessionToken, expiresAt]
    );

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });

    // Secure-flaggan ska bara krävas i produktion så lokal utveckling fortsätter fungera.
    const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.append(
      "Set-Cookie",
      `${AUTH_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`,
    );

    return response;
  } catch (error) {
    console.error("Login failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
