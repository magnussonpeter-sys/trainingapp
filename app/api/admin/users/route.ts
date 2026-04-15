import { randomUUID } from "crypto";

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

// Enkel hjälpfunktion för enhetligt errorsvar
function adminErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown error";

  if (message === "Unauthorized") {
    return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  }

  if (message === "Forbidden") {
    return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
  }

  if (message === "Account disabled") {
    return NextResponse.json({ error: "Kontot är inaktiverat" }, { status: 403 });
  }

  return NextResponse.json({ error: "Serverfel" }, { status: 500 });
}

// Hämtar lista över användare för admin
export async function GET() {
  try {
    await requireAdmin();

    const result = await pool.query(
      `
      SELECT
        id,
        email,
        name,
        role,
        status,
        created_at,
        updated_at,
        last_login_at
      FROM app_users
      ORDER BY created_at DESC
      `
    );

    return NextResponse.json({
      users: result.rows,
    });
  } catch (error) {
    console.error("Admin GET /users failed:", error);

    return adminErrorResponse(error);
  }
}

// Skapar ny användare manuellt som admin
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name =
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : null;
    const role: "user" | "admin" = body.role === "admin" ? "admin" : "user";
    const status: "active" | "disabled" =
      body.status === "disabled" ? "disabled" : "active";

    // Enkel server-side validering
    if (!email || !password) {
      return NextResponse.json(
        { error: "E-post och lösenord krävs" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Lösenord måste vara minst 8 tecken" },
        { status: 400 }
      );
    }

    const existing = await pool.query(
      `
      SELECT id
      FROM app_users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "E-postadressen används redan" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO app_users (
        id,
        email,
        password_hash,
        name,
        role,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING
        id,
        email,
        name,
        role,
        status,
        created_at,
        updated_at,
        last_login_at
      `,
      [randomUUID(), email, passwordHash, name, role, status]
    );

    return NextResponse.json(
      {
        user: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Admin POST /users failed:", error);

    return adminErrorResponse(error);
  }
}
