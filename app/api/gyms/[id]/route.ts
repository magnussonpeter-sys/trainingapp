import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuthorizedUserId } from "@/lib/server-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function ensureGymSharingColumn() {
  // Håll delningsflaggan tillgänglig i alla gym-endpoints så UI:t kan vara konsekvent.
  await pool.query(`
    ALTER TABLE gyms
    ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE
  `);
}

async function ensureBandLevelsColumn() {
  // Håll detaljvyn kompatibel med både gamla och nya band-fält.
  await pool.query(`
    ALTER TABLE gym_equipment
    ADD COLUMN IF NOT EXISTS band_levels TEXT[]
  `);
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await ensureGymSharingColumn();
    await ensureBandLevelsColumn();

    const { id } = await params;
    const gymId = String(id).trim();
    const requestedUserId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
    const user = await requireAuthorizedUserId(requestedUserId);

    if (!gymId) {
      return NextResponse.json(
        { ok: false, error: "Ogiltigt gym-id" },
        { status: 400 }
      );
    }

    // Hämta själva gymet först.
    const gymResult = await pool.query(
      `
      SELECT id, user_id, name, description, is_shared, created_at
      FROM gyms
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [gymId, user.id]
    );

    if (gymResult.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Gym not found or access denied" },
        { status: 404 }
      );
    }

    // Hämta all utrustning kopplad till gymet.
    const equipmentResult = await pool.query(
      `
      SELECT
        id,
        gym_id,
        equipment_type,
        label,
        min_weight,
        max_weight,
        weight_unit,
        quantity,
        notes,
        specific_weights,
        weights_kg,
        band_level,
        band_levels,
        created_at
      FROM gym_equipment
      WHERE gym_id = $1
      ORDER BY created_at ASC, id ASC
      `,
      [gymId]
    );

    const gym = {
      ...gymResult.rows[0],
      equipment: equipmentResult.rows,
    };

    return NextResponse.json({
      ok: true,
      gym,
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

    console.error("GET gym failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    await ensureGymSharingColumn();

    const { id } = await params;
    const body = await req.json();
    const requestedUserId = String(body.userId ?? "").trim();
    const user = await requireAuthorizedUserId(requestedUserId);
    const name = String(body.name ?? "").trim();
    const isShared = Boolean(body.is_shared);
    const description =
      body.description == null ? null : String(body.description).trim();

    const gymId = String(id).trim();

    if (!gymId) {
      return NextResponse.json(
        { ok: false, error: "Ogiltigt gym-id" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
      UPDATE gyms
      SET name = $1,
          description = $2,
          is_shared = $3
      WHERE id = $4
        AND user_id = $5
      RETURNING id, user_id, name, description, is_shared, created_at
      `,
      [name, description, isShared, gymId, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Gym not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      gym: result.rows[0],
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

    console.error("PATCH gym failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const requestedUserId = String(body.userId ?? "").trim();
    const user = await requireAuthorizedUserId(requestedUserId);

    const gymId = String(id).trim();

    if (!gymId) {
      return NextResponse.json(
        { ok: false, error: "Ogiltigt gym-id" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
      DELETE FROM gyms
      WHERE id = $1
        AND user_id = $2
      RETURNING id
      `,
      [gymId, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Gym not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
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

    console.error("DELETE gym failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
