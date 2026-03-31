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
  return typeof value === "string" &&
    ALLOWED_EQUIPMENT_TYPES.includes(value as EquipmentType);
}

function isValidBandLevel(value: unknown): value is BandLevel {
  return typeof value === "string" &&
    ALLOWED_BAND_LEVELS.includes(value as BandLevel);
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userId,
      gym_id,
      equipment_type,
      label,
      weights_kg,
      band_level,
      quantity,
      notes,
    } = body;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId required" },
        { status: 400 }
      );
    }

    if (!gym_id || !equipment_type) {
      return NextResponse.json(
        { ok: false, error: "gym_id and equipment_type required" },
        { status: 400 }
      );
    }

    if (!isValidEquipmentType(equipment_type)) {
      return NextResponse.json(
        { ok: false, error: "Invalid equipment_type" },
        { status: 400 }
      );
    }

    const gymCheck = await pool.query(
      `SELECT id FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, userId]
    );

    if (gymCheck.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Gym not found or access denied" },
        { status: 403 }
      );
    }

    const trimmedLabel =
      typeof label === "string" && label.trim() ? label.trim() : null;

    if (!trimmedLabel) {
      return NextResponse.json(
        { ok: false, error: "label required" },
        { status: 400 }
      );
    }

    const trimmedNotes =
      typeof notes === "string" && notes.trim() ? notes.trim() : null;

    const parsedQuantity =
      quantity == null || quantity === ""
        ? null
        : Number.isFinite(Number(quantity)) && Number(quantity) > 0
          ? Number(quantity)
          : null;

    const normalizedWeights = isWeightBasedType(equipment_type)
      ? normalizeWeights(weights_kg)
      : null;

    let parsedBandLevel: BandLevel | null = null;

    if (equipment_type === "bands") {
      if (!isValidBandLevel(band_level)) {
        return NextResponse.json(
          { ok: false, error: "bands requires band_level" },
          { status: 400 }
        );
      }
      parsedBandLevel = band_level;
    }

    const result = await pool.query(
      `
      INSERT INTO gym_equipment (
        gym_id,
        equipment_type,
        label,
        weights_kg,
        band_level,
        weight_unit,
        quantity,
        notes
      )
      VALUES ($1, $2, $3, $4::numeric[], $5, $6, $7, $8)
      RETURNING
        id,
        gym_id,
        equipment_type,
        label,
        weights_kg,
        band_level,
        quantity,
        notes,
        weight_unit
      `,
      [
        gym_id,
        equipment_type,
        trimmedLabel,
        normalizedWeights,
        parsedBandLevel,
        "kg",
        parsedQuantity,
        trimmedNotes,
      ]
    );

    return NextResponse.json({
      ok: true,
      equipment: result.rows[0],
    });
  } catch (error) {
    console.error("POST equipment failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}