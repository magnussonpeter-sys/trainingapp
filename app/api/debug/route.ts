import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    await requireAdmin();

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
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled" || error.message === "Forbidden") {
        return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
      }
    }

    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
