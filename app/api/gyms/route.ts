import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuthorizedUserId } from "@/lib/server-auth";

async function ensureGymSharingColumn() {
  // Enkel delningsflagga nu gör att vi kan bygga UI utan att låsa framtida delningsflöden.
  await pool.query(`
    ALTER TABLE gyms
    ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE
  `);
}

async function ensureBandLevelsColumn() {
  // Gymöversikten ska kunna visa flera valda bandnivåer när de finns.
  await pool.query(`
    ALTER TABLE gym_equipment
    ADD COLUMN IF NOT EXISTS band_levels TEXT[]
  `);
}

export async function GET(req: NextRequest) {
  try {
    await ensureGymSharingColumn();
    await ensureBandLevelsColumn();

    const requestedUserId = req.nextUrl.searchParams.get("userId");
    const user = await requireAuthorizedUserId(requestedUserId);

    const result = await pool.query(
      `
      SELECT
        g.id,
        g.user_id,
        g.name,
        g.description,
        g.is_shared,
        g.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ge.id,
              'gym_id', ge.gym_id,
              'equipment_type', ge.equipment_type,
              'label', ge.label,
              'notes', ge.notes,
              'weights_kg', ge.weights_kg,
              'band_level', ge.band_level,
              'band_levels', ge.band_levels,
              'quantity', ge.quantity
            )
            ORDER BY ge.created_at ASC
          ) FILTER (WHERE ge.id IS NOT NULL),
          '[]'::json
        ) AS equipment
      FROM gyms g
      LEFT JOIN gym_equipment ge ON ge.gym_id = g.id
      WHERE g.user_id = $1
      GROUP BY g.id
      ORDER BY g.created_at DESC
      `,
      [user.id]
    );

    return NextResponse.json({
      ok: true,
      gyms: result.rows,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

    console.error("GET gyms failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureGymSharingColumn();

    const body = await req.json();
    const { userId: requestedUserId, name, description, is_shared } = body;
    const user = await requireAuthorizedUserId(
      typeof requestedUserId === "string" ? requestedUserId : null,
    );

    if (!name || !String(name).trim()) {
      return NextResponse.json(
        { ok: false, error: "Gym name is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
      INSERT INTO gyms (user_id, name, description, is_shared)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, name, description, is_shared, created_at
      `,
      [
        user.id,
        String(name).trim(),
        description ? String(description).trim() : null,
        Boolean(is_shared),
      ]
    );

    return NextResponse.json({
      ok: true,
      gym: {
        ...result.rows[0],
        equipment: [],
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

    console.error("POST gym failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
