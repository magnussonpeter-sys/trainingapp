import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId required" },
        { status: 400 }
      );
    }

    // Säkerställ att utrustningen tillhör användaren
    const check = await pool.query(
      `
      SELECT ge.id
      FROM gym_equipment ge
      JOIN gyms g ON ge.gym_id = g.id
      WHERE ge.id = $1 AND g.user_id = $2
      `,
      [id, userId]
    );

    if (check.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Not found or access denied" },
        { status: 404 }
      );
    }

    await pool.query(
      `DELETE FROM gym_equipment WHERE id = $1`,
      [id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE equipment failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}