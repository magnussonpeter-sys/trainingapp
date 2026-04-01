import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "email + password required" },
        { status: 400 }
      );
    }

    // Kolla om e-post redan används
    const existing = await pool.query(
      "SELECT id FROM app_users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { ok: false, error: "E-postadressen används redan" },
        { status: 400 }
      );
    }

    // Hasha lösenordet säkert
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO app_users (id, email, password_hash, name, role, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, name, role, status
      `,
      [randomUUID(), email.trim(), hash, name?.trim() || null, "user", "active"]
    );

    return NextResponse.json({
      ok: true,
      user: result.rows[0],
    });
  } catch (e) {
    console.error("create-user failed:", e);

    return NextResponse.json(
      { ok: false, error: "Kunde inte skapa användare" },
      { status: 500 }
    );
  }
}