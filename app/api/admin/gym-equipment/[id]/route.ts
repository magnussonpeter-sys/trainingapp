import { NextRequest, NextResponse } from "next/server";

import { pool } from "@/lib/db";
import {
  type BandLevel,
  type GymEquipmentType,
  isValidBandLevel,
  normalizeGymEquipmentType,
  supportsGymEquipmentWeights,
} from "@/lib/equipment";
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

type EquipmentType = GymEquipmentType;

function normalizeWeights(input: unknown): number[] | null {
  if (input == null || !Array.isArray(input)) return null;

  const numbers = input
    .map((item) => {
      if (typeof item === "number") return item;
      if (typeof item === "string") return Number(item.replace(",", "."));
      return NaN;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  if (numbers.length === 0) return null;
  return [...new Set(numbers)].sort((a, b) => a - b);
}

function normalizeBandLevels(input: unknown): BandLevel[] | null {
  if (!Array.isArray(input)) return null;
  const levels = input.filter((item): item is BandLevel => isValidBandLevel(item));
  if (levels.length === 0) return null;
  return [...new Set(levels)];
}

async function ensureAdminEquipmentColumns() {
  await pool.query(`
    ALTER TABLE gym_equipment
    ADD COLUMN IF NOT EXISTS band_levels TEXT[]
  `);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    await ensureAdminEquipmentColumns();
    const { id } = await context.params;
    const body = await req.json();
    const equipmentType = body.equipment_type;
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const notes =
      body.notes == null ? null : String(body.notes).trim() || null;
    const quantity =
      body.quantity == null || body.quantity === ""
        ? null
        : Number.isFinite(Number(body.quantity)) && Number(body.quantity) > 0
          ? Number(body.quantity)
          : null;

    const normalizedEquipmentType = normalizeGymEquipmentType(equipmentType);

    if (!id || !normalizedEquipmentType || !label) {
      return NextResponse.json(
        { error: "Typ och namn krävs" },
        { status: 400 },
      );
    }

    const check = await pool.query(`SELECT id FROM gym_equipment WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Utrustningen hittades inte" }, { status: 404 });
    }

    const normalizedWeights = supportsGymEquipmentWeights(normalizedEquipmentType)
      ? normalizeWeights(body.weights_kg)
      : null;

    let bandLevel: BandLevel | null = null;
    let bandLevels: BandLevel[] | null = null;
    if (normalizedEquipmentType === "bands") {
      bandLevels = normalizeBandLevels(body.band_levels);
      if (!bandLevels && !isValidBandLevel(body.band_level)) {
        return NextResponse.json(
          { error: "Minst en bandnivå krävs" },
          { status: 400 },
        );
      }
      bandLevels = bandLevels ?? [body.band_level];
      bandLevel = bandLevels[0] ?? null;
    }

    const result = await pool.query(
      `
      UPDATE gym_equipment
      SET equipment_type = $2,
          label = $3,
          weights_kg = $4::numeric[],
          band_level = $5,
          band_levels = $6,
          quantity = $7,
          notes = $8,
          weight_unit = 'kg'
      WHERE id = $1
      RETURNING
        id,
        gym_id,
        equipment_type,
        label,
        weights_kg,
        band_level,
        band_levels,
        quantity,
        notes
      `,
      [id, normalizedEquipmentType, label, normalizedWeights, bandLevel, bandLevels, quantity, notes],
    );

    return NextResponse.json({ equipment: result.rows[0] });
  } catch (error) {
    console.error("Admin PATCH /gym-equipment/[id] failed:", error);
    return adminErrorResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Ogiltigt utrustnings-id" }, { status: 400 });
    }

    const result = await pool.query(
      `DELETE FROM gym_equipment WHERE id = $1 RETURNING id`,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Utrustningen hittades inte" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin DELETE /gym-equipment/[id] failed:", error);
    return adminErrorResponse(error);
  }
}
