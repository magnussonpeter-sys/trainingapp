import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  type BandLevel,
  type GymEquipmentType,
  isValidBandLevel,
  normalizeGymEquipmentType,
  supportsGymEquipmentWeights,
} from "@/lib/equipment";

type EquipmentType = GymEquipmentType;

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
  // Nya UI:t kan välja flera bandnivåer, men vi behåller gamla fältet också.
  await pool.query(`
    ALTER TABLE gym_equipment
    ADD COLUMN IF NOT EXISTS band_levels TEXT[]
  `);
}

// Normaliserar label så samma utrustning kan matchas robust i databasen.
function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    await ensureBandLevelsColumn();

    const body = await req.json();

    const {
      userId,
      gym_id,
      equipment_type,
      label,
      weights_kg,
      band_level,
      band_levels,
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

    const normalizedEquipmentType = normalizeGymEquipmentType(equipment_type);

    if (!normalizedEquipmentType) {
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

    const normalizedWeights = supportsGymEquipmentWeights(normalizedEquipmentType)
      ? normalizeWeights(weights_kg)
      : null;

    let parsedBandLevel: BandLevel | null = null;
    let parsedBandLevels: BandLevel[] | null = null;

    if (normalizedEquipmentType === "bands") {
      parsedBandLevels = normalizeBandLevels(band_levels);

      if (!parsedBandLevels && !isValidBandLevel(band_level)) {
        return NextResponse.json(
          { ok: false, error: "bands requires at least one band level" },
          { status: 400 }
        );
      }

      parsedBandLevels = parsedBandLevels ?? [band_level];
      parsedBandLevel = parsedBandLevels[0] ?? null;
    }

    // För viktbaserad utrustning vill vi slå ihop samma utrustning till en post.
    if (supportsGymEquipmentWeights(normalizedEquipmentType)) {
      const existingResult = await pool.query(
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
          weight_unit
        FROM gym_equipment
        WHERE gym_id = $1
          AND equipment_type = $2
          AND LOWER(TRIM(label)) = $3
        LIMIT 1
        `,
        [gym_id, normalizedEquipmentType, normalizeLabel(trimmedLabel)]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0] as {
          id: string;
          gym_id: string;
          equipment_type: EquipmentType;
          label: string;
          weights_kg?: number[] | null;
          band_level?: BandLevel | null;
          band_levels?: BandLevel[] | null;
          quantity?: number | null;
          notes?: string | null;
          weight_unit?: string | null;
        };

        const mergedWeights = [
          ...new Set([
            ...((existing.weights_kg ?? []).map((value) => Number(value)) || []),
            ...((normalizedWeights ?? []).map((value) => Number(value)) || []),
          ]),
        ]
          .filter((value) => Number.isFinite(value) && value > 0)
          .sort((a, b) => a - b);

        // Behåll tidigare quantity om ny inte anges, annars använd ny.
        const nextQuantity =
          parsedQuantity == null ? existing.quantity ?? null : parsedQuantity;

        // Behåll tidigare notes om ny inte anges, annars använd ny.
        const nextNotes =
          trimmedNotes == null ? existing.notes ?? null : trimmedNotes;

        const updateResult = await pool.query(
          `
          UPDATE gym_equipment
          SET
            weights_kg = $1::numeric[],
            quantity = $2,
            notes = $3,
            label = $4,
            band_level = $5,
            band_levels = $6
          WHERE id = $7
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
            mergedWeights.length > 0 ? mergedWeights : null,
            nextQuantity,
            nextNotes,
            trimmedLabel,
            parsedBandLevel,
            parsedBandLevels,
            existing.id,
          ]
        );

        return NextResponse.json({
          ok: true,
          equipment: updateResult.rows[0],
          merged: true,
        });
      }
    }

    // För övriga typer skapar vi ny rad som tidigare.
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
      VALUES ($1, $2, $3, $4::numeric[], $5, $6, $7, $8, $9)
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
        gym_id,
        normalizedEquipmentType,
        trimmedLabel,
        normalizedWeights,
        parsedBandLevel,
        parsedBandLevels,
        "kg",
        parsedQuantity,
        trimmedNotes,
      ]
    );

    return NextResponse.json({
      ok: true,
      equipment: result.rows[0],
      merged: false,
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
