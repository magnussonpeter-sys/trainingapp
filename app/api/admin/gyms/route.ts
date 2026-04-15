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

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    await ensureAdminGymColumns();

    const result = await pool.query(
      `
      SELECT
        g.id,
        g.user_id,
        g.name,
        g.description,
        g.is_shared,
        g.created_at,
        g.created_at AS updated_at,
        owner.email AS owner_email,
        owner.name AS owner_name,
        COUNT(ge.id)::int AS equipment_count
      FROM gyms g
      LEFT JOIN app_users owner ON owner.id::text = g.user_id
      LEFT JOIN gym_equipment ge ON ge.gym_id = g.id
      GROUP BY g.id, owner.email, owner.name
      ORDER BY g.created_at DESC
      `,
    );

    return NextResponse.json({ gyms: result.rows });
  } catch (error) {
    console.error("Admin GET /gyms failed:", error);
    return adminErrorResponse(error);
  }
}

