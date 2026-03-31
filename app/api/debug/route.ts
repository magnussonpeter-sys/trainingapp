import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    // Hämta alla tabeller
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const result: Record<string, any[]> = {};

    for (const row of tables.rows) {
      const tableName = row.table_name;

      const columns = await pool.query(
        `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        `,
        [tableName]
      );

      result[tableName] = columns.rows;
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}