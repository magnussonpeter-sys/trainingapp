import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const ALLOWED_EQUIPMENT_TYPES = [
  "dumbbell",
  "barbell",
  "bench",
  "rack",
  "kettlebell",
  "machine",
  "cable",
  "bands",
  "rings",
  "bodyweight",
  "other",
] as const;

const ALLOWED_BAND_LEVELS = ["light", "medium", "heavy"] as const;

type EquipmentType = (typeof ALLOWED_EQUIPMENT_TYPES)[number];
type BandLevel = (typeof ALLOWED_BAND_LEVELS)[number];

function isValidEquipmentType(value: unknown): value is EquipmentType {
  return (
    typeof value === "string" &&
    ALLOWED_EQUIPMENT_TYPES.includes(value as EquipmentType)
  );
}

function isValidBandLevel(value: unknown): value is BandLevel {
  return (
    typeof value === "string" &&
    ALLOWED_BAND_LEVELS.includes(value as BandLevel)
  );
}

function isWeightBasedType(type: EquipmentType) {
  return type === "dumbbell" || type === "kettlebell" || type === "barbell";
}

function normalizeWeights(input: unknown): number[] | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;

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

async function ensureBandLevelsColumn() {
  // Gör fler-val för gummiband möjligt utan att bryta äldre data.
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
    await ensureBandLevelsColumn();

    const { id } = await context.params;
    const body = await req.json();
    const userId = String(body?.userId ?? "").trim();
    const equipmentType = body?.equipment_type;
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    const notes =
      body?.notes == null ? null : String(body.notes).trim() || null;
    const quantity =
      body?.quantity == null || body.quantity === ""
        ? null
        : Number.isFinite(Number(body.quantity)) && Number(body.quantity) > 0
          ? Number(body.quantity)
          : null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId required" },
        { status: 400 }
      );
    }

    if (!isValidEquipmentType(equipmentType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid equipment_type" },
        { status: 400 }
      );
    }

    if (!label) {
      return NextResponse.json(
        { ok: false, error: "label required" },
        { status: 400 }
      );
    }

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

    const normalizedWeights = isWeightBasedType(equipmentType)
      ? normalizeWeights(body?.weights_kg)
      : null;

    let bandLevel: BandLevel | null = null;
    let bandLevels: BandLevel[] | null = null;
    if (equipmentType === "bands") {
      bandLevels = normalizeBandLevels(body?.band_levels);

      if (!bandLevels && !isValidBandLevel(body?.band_level)) {
        return NextResponse.json(
          { ok: false, error: "bands requires at least one band level" },
          { status: 400 }
        );
      }
      bandLevels = bandLevels ?? [body.band_level];
      bandLevel = bandLevels[0] ?? null;
    }

    const result = await pool.query(
      `
      UPDATE gym_equipment
      SET equipment_type = $1,
          label = $2,
          weights_kg = $3::numeric[],
          band_level = $4,
          band_levels = $5,
          quantity = $6,
          notes = $7,
          weight_unit = 'kg'
      WHERE id = $8
      RETURNING
        id,
        gym_id,
        equipment_type,
        label,
        weights_kg,
        band_level,
        band_levels,
        quantity,
        notes,
        weight_unit
      `,
      [
        equipmentType,
        label,
        normalizedWeights,
        bandLevel,
        bandLevels,
        quantity,
        notes,
        id,
      ]
    );

    return NextResponse.json({ ok: true, equipment: result.rows[0] });
  } catch (error) {
    console.error("PATCH equipment failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

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
