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

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    await ensureAdminEquipmentColumns();
    const body = await req.json();

    const gymId = String(body.gym_id ?? "").trim();
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

    if (!gymId || !normalizedEquipmentType || !label) {
      return NextResponse.json(
        { error: "Gym, typ och namn krävs" },
        { status: 400 },
      );
    }

    const gymCheck = await pool.query(`SELECT id FROM gyms WHERE id = $1`, [gymId]);
    if (gymCheck.rows.length === 0) {
      return NextResponse.json({ error: "Gymmet hittades inte" }, { status: 404 });
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
      INSERT INTO gym_equipment (
        gym_id,
        equipment_type,
        label,
        weights_kg,
        band_level,
        band_levels,
        weight_unit,
        quantity,
        notes
      )
      VALUES ($1, $2, $3, $4::numeric[], $5, $6, 'kg', $7, $8)
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
      [gymId, normalizedEquipmentType, label, normalizedWeights, bandLevel, bandLevels, quantity, notes],
    );

    return NextResponse.json({ equipment: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Admin POST /gym-equipment failed:", error);
    return adminErrorResponse(error);
  }
}
