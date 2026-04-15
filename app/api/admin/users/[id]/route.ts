import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

function adminErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

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

async function getActiveAdminCount() {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM app_users
    WHERE role = 'admin' AND status = 'active'
    `,
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Ogiltigt användar-id" }, { status: 400 });
    }

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
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Användaren hittades inte" }, { status: 404 });
    }

    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Admin GET /users/[id] failed:", error);
    return adminErrorResponse(error);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await requireAdmin();
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Ogiltigt användar-id" }, { status: 400 });
    }

    const body = await req.json();
    const email =
      typeof body.email === "string" && body.email.trim().length > 0
        ? body.email.trim().toLowerCase()
        : undefined;
    const name =
      body.name === null
        ? null
        : typeof body.name === "string"
          ? body.name.trim() || null
          : undefined;
    const role =
      body.role === "admin" || body.role === "user" ? body.role : undefined;
    const status =
      body.status === "active" || body.status === "disabled"
        ? body.status
        : undefined;
    const password =
      typeof body.password === "string" && body.password.length > 0
        ? body.password
        : undefined;

    if (
      email === undefined &&
      name === undefined &&
      role === undefined &&
      status === undefined &&
      password === undefined
    ) {
      return NextResponse.json(
        { error: "Ingen giltig uppdatering skickades in" },
        { status: 400 },
      );
    }

    const currentUserResult = await pool.query(
      `
      SELECT
        id,
        email,
        name,
        role,
        status,
        password_hash
      FROM app_users
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    if (currentUserResult.rows.length === 0) {
      return NextResponse.json({ error: "Användaren hittades inte" }, { status: 404 });
    }

    const currentUser = currentUserResult.rows[0] as {
      id: string;
      email: string;
      name: string | null;
      role: "user" | "admin";
      status: "active" | "disabled";
      password_hash: string;
    };

    const nextRole = role ?? currentUser.role;
    const nextStatus = status ?? currentUser.status;

    if (id === adminUser.id && nextStatus === "disabled") {
      return NextResponse.json(
        { error: "Du kan inte inaktivera ditt eget konto" },
        { status: 400 },
      );
    }

    if (id === adminUser.id && nextRole === "user") {
      return NextResponse.json(
        { error: "Du kan inte ta bort din egen adminbehörighet" },
        { status: 400 },
      );
    }

    const wouldRemoveActiveAdmin =
      currentUser.role === "admin" &&
      currentUser.status === "active" &&
      (nextRole !== "admin" || nextStatus !== "active");

    if (wouldRemoveActiveAdmin) {
      const activeAdminCount = await getActiveAdminCount();
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "Det måste finnas minst en aktiv admin i systemet" },
          { status: 400 },
        );
      }
    }

    if (email && email !== currentUser.email) {
      const existing = await pool.query(
        `
        SELECT id
        FROM app_users
        WHERE LOWER(email) = LOWER($1)
          AND id <> $2
        LIMIT 1
        `,
        [email, id],
      );

      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "E-postadressen används redan" },
          { status: 400 },
        );
      }
    }

    let passwordHash = currentUser.password_hash;
    if (password !== undefined) {
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Lösenord måste vara minst 8 tecken" },
          { status: 400 },
        );
      }

      // Reset görs server-side så plaintext aldrig lagras.
      passwordHash = await bcrypt.hash(password, 10);
    }

    const result = await pool.query(
      `
      UPDATE app_users
      SET
        email = $2,
        name = $3,
        role = $4,
        status = $5,
        password_hash = $6,
        updated_at = NOW()
      WHERE id = $1
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
      [
        id,
        email ?? currentUser.email,
        name === undefined ? currentUser.name : name,
        nextRole,
        nextStatus,
        passwordHash,
      ],
    );

    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Admin PATCH /users/[id] failed:", error);
    return adminErrorResponse(error);
  }
}

