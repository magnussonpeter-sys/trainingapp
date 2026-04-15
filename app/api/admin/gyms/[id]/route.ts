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

async function ensureAdminGymColumns() {
  await pool.query(`
    ALTER TABLE gyms
    ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await pool.query(`
    ALTER TABLE gym_equipment
    ADD COLUMN IF NOT EXISTS band_levels TEXT[]
  `);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    await ensureAdminGymColumns();
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Ogiltigt gym-id" }, { status: 400 });
    }

    const gymResult = await pool.query(
      `
      SELECT
        g.id,
        g.user_id,
        g.name,
        g.description,
        g.is_shared,
        g.created_at,
        owner.email AS owner_email,
        owner.name AS owner_name
      FROM gyms g
      LEFT JOIN app_users owner ON owner.id::text = g.user_id
      WHERE g.id = $1
      LIMIT 1
      `,
      [id],
    );

    if (gymResult.rows.length === 0) {
      return NextResponse.json({ error: "Gymmet hittades inte" }, { status: 404 });
    }

    const equipmentResult = await pool.query(
      `
      SELECT
        id,
        gym_id,
        equipment_type,
        label,
        weights_kg,
        band_level,
        band_levels,
        quantity,
        notes,
        created_at
      FROM gym_equipment
      WHERE gym_id = $1
      ORDER BY created_at ASC, id ASC
      `,
      [id],
    );

    return NextResponse.json({
      gym: {
        ...gymResult.rows[0],
        equipment: equipmentResult.rows,
      },
    });
  } catch (error) {
    console.error("Admin GET /gyms/[id] failed:", error);
    return adminErrorResponse(error);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    await ensureAdminGymColumns();
    const { id } = await context.params;
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const description =
      body.description == null ? null : String(body.description).trim() || null;
    const isShared = Boolean(body.is_shared);

    if (!id) {
      return NextResponse.json({ error: "Ogiltigt gym-id" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "Gymmet måste ha ett namn" }, { status: 400 });
    }

    const result = await pool.query(
      `
      UPDATE gyms
      SET name = $2,
          description = $3,
          is_shared = $4
      WHERE id = $1
      RETURNING id, user_id, name, description, is_shared, created_at
      `,
      [id, name, description, isShared],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Gymmet hittades inte" }, { status: 404 });
    }

    return NextResponse.json({ gym: result.rows[0] });
  } catch (error) {
    console.error("Admin PATCH /gyms/[id] failed:", error);
    return adminErrorResponse(error);
  }
}

