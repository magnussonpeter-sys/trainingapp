import { NextRequest, NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

// Gemensamt errorsvar för admin-routes
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

// Uppdaterar roll/status för en användare
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

    const role =
      body.role === "admin" || body.role === "user" ? body.role : undefined;

    const status =
      body.status === "active" || body.status === "disabled"
        ? body.status
        : undefined;

    if (!role && !status) {
      return NextResponse.json(
        { error: "Ingen giltig uppdatering skickades in" },
        { status: 400 }
      );
    }

    // Skydda mot att admin råkar inaktivera sig själv
    if (id === adminUser.id && status === "disabled") {
      return NextResponse.json(
        { error: "Du kan inte inaktivera ditt eget konto" },
        { status: 400 }
      );
    }

    // Skydda mot att enda admin tas bort senare kan byggas ut,
    // men här stoppar vi åtminstone egen nedgradering direkt.
    if (id === adminUser.id && role === "user") {
      return NextResponse.json(
        { error: "Du kan inte ta bort din egen adminbehörighet" },
        { status: 400 }
      );
    }

    const currentUserResult = await pool.query(
      `
      SELECT id, email, name, role, status
      FROM app_users
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (currentUserResult.rows.length === 0) {
      return NextResponse.json({ error: "Användaren hittades inte" }, { status: 404 });
    }

    const currentUser = currentUserResult.rows[0];

    const nextRole = role ?? currentUser.role;
    const nextStatus = status ?? currentUser.status;

    const result = await pool.query(
      `
      UPDATE app_users
      SET
        role = $2,
        status = $3,
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
      [id, nextRole, nextStatus]
    );

    return NextResponse.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Admin PATCH /users/[id] failed:", error);

    return adminErrorResponse(error);
  }
}