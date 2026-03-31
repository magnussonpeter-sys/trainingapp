import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId || !userId.trim()) {
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
      SELECT
        g.id,
        g.user_id,
        g.name,
        g.description,
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
      [userId.trim()]
    );

    return NextResponse.json({
      ok: true,
      gyms: result.rows,
    });
  } catch (error) {
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
    const body = await req.json();
    const { userId, name, description } = body;

    if (!userId || !String(userId).trim()) {
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    if (!name || !String(name).trim()) {
      return NextResponse.json(
        { ok: false, error: "Gym name is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
      INSERT INTO gyms (user_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, name, description, created_at
      `,
      [
        String(userId).trim(),
        String(name).trim(),
        description ? String(description).trim() : null,
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