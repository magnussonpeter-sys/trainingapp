import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Hitta och ta bort foreign key på gyms.user_id om den finns
    const fkResult = await client.query(`
      SELECT con.conname AS constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'gyms'
        AND con.contype = 'f'
        AND pg_get_constraintdef(con.oid) ILIKE '%(user_id)%';
    `);

    for (const row of fkResult.rows) {
      await client.query(`
        ALTER TABLE gyms
        DROP CONSTRAINT IF EXISTS "${row.constraint_name}";
      `);
    }

    // 2. Ändra gyms.user_id till TEXT
    const gymsUserIdTypeCheck = await client.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'gyms'
        AND column_name = 'user_id'
      LIMIT 1;
    `);

    if (gymsUserIdTypeCheck.rows.length > 0) {
      const currentType = gymsUserIdTypeCheck.rows[0].data_type;

      if (currentType !== "text" && currentType !== "character varying") {
        await client.query(`
          ALTER TABLE gyms
          ALTER COLUMN user_id TYPE TEXT
          USING user_id::text;
        `);
      }
    }

    await client.query(`
      ALTER TABLE gyms
      ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // 3. Lägg till kolumner i gym_equipment
    await client.query(`
      ALTER TABLE gym_equipment
      ADD COLUMN IF NOT EXISTS weights_kg NUMERIC[];
    `);

    await client.query(`
      ALTER TABLE gym_equipment
      ADD COLUMN IF NOT EXISTS band_level TEXT;
    `);

    await client.query(`
      ALTER TABLE gym_equipment
      ADD COLUMN IF NOT EXISTS band_levels TEXT[];
    `);

    await client.query(`
      ALTER TABLE gym_equipment
      ADD COLUMN IF NOT EXISTS quantity INTEGER;
    `);

    await client.query(`
      ALTER TABLE gym_equipment
      ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'kg';
    `);

    await client.query(`
      ALTER TABLE gym_equipment
      ADD COLUMN IF NOT EXISTS notes TEXT;
    `);

    // 4. Migrera från specific_weights om kolumnen finns
    const specificWeightsColumnCheck = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'gym_equipment'
        AND column_name = 'specific_weights'
      LIMIT 1;
    `);

    if (specificWeightsColumnCheck.rows.length > 0) {
      await client.query(`
        UPDATE gym_equipment
        SET weights_kg = (
          SELECT ARRAY(
            SELECT jsonb_array_elements_text(specific_weights)::numeric
          )
        )
        WHERE specific_weights IS NOT NULL
          AND weights_kg IS NULL;
      `);
    }

    // 5. Index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gym_equipment_gym_id
      ON gym_equipment (gym_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gyms_user_id
      ON gyms (user_id);
    `);

    // 6. Constraints
    const equipmentTypeColumnCheck = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'gym_equipment'
        AND column_name = 'equipment_type'
      LIMIT 1;
    `);

    if (equipmentTypeColumnCheck.rows.length > 0) {
      // Släpp först gamla constrainten så äldre värden kan migreras till nya typer.
      await client.query(`
        ALTER TABLE gym_equipment
        DROP CONSTRAINT IF EXISTS gym_equipment_type_check;
      `);

      // Normalisera äldre equipment-typer innan vi sätter den nya constrainten.
      // Det här gör routen bakåtkompatibel för befintliga databaser.
      await client.query(`
        UPDATE gym_equipment
        SET equipment_type = CASE
          WHEN LOWER(TRIM(equipment_type)) = 'cable' THEN 'cable_machine'
          WHEN LOWER(TRIM(equipment_type)) = 'dumbbells' THEN 'dumbbell'
          WHEN LOWER(TRIM(equipment_type)) = 'kettlebells' THEN 'kettlebell'
          WHEN LOWER(TRIM(equipment_type)) = 'machines' THEN 'machine'
          WHEN LOWER(TRIM(equipment_type)) = 'boxes' THEN 'box'
          ELSE LOWER(TRIM(equipment_type))
        END
        WHERE equipment_type IS NOT NULL;
      `);

      // Sista fallback för okända äldre värden så migreringen inte fastnar.
      await client.query(`
        UPDATE gym_equipment
        SET equipment_type = 'other'
        WHERE equipment_type IS NOT NULL
          AND equipment_type NOT IN (
            'dumbbell',
            'barbell',
            'ez_bar',
            'trap_bar',
            'bench',
            'rack',
            'smith_machine',
            'kettlebell',
            'pullup_bar',
            'dip_bars',
            'cable_machine',
            'machine',
            'bands',
            'rings',
            'box',
            'medicine_ball',
            'bodyweight',
            'other'
          );
      `);

      await client.query(`
        DO $$
        BEGIN
          -- Återskapa constrainten så äldre installationer får nya typer utan manuell SQL.
          ALTER TABLE gym_equipment
          ADD CONSTRAINT gym_equipment_type_check
          CHECK (
            equipment_type IN (
              'dumbbell',
              'barbell',
              'ez_bar',
              'trap_bar',
              'bench',
              'rack',
              'smith_machine',
              'kettlebell',
              'pullup_bar',
              'dip_bars',
              'cable_machine',
              'machine',
              'bands',
              'rings',
              'box',
              'medicine_ball',
              'bodyweight',
              'other'
            )
          );
        END
        $$;
      `);
    }

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'gym_equipment_band_level_check'
        ) THEN
          ALTER TABLE gym_equipment
          ADD CONSTRAINT gym_equipment_band_level_check
          CHECK (
            band_level IS NULL OR
            band_level IN ('light', 'medium', 'heavy')
          );
        END IF;
      END
      $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'gym_equipment_quantity_check'
        ) THEN
          ALTER TABLE gym_equipment
          ADD CONSTRAINT gym_equipment_quantity_check
          CHECK (
            quantity IS NULL OR quantity > 0
          );
        END IF;
      END
      $$;
    `);

    // 7. Debug-info
    const gymsColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'gyms'
      ORDER BY ordinal_position;
    `);

    const gymEquipmentColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'gym_equipment'
      ORDER BY ordinal_position;
    `);

    const remainingFks = await client.query(`
      SELECT con.conname AS constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'gyms'
        AND con.contype = 'f';
    `);

    const result = await client.query("SELECT NOW() as current_time");

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      message: "Migration körd",
      dbTime: result.rows[0].current_time,
      gymsColumns: gymsColumns.rows,
      gymEquipmentColumns: gymEquipmentColumns.rows,
      remainingGymForeignKeys: remainingFks.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("DB test failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
