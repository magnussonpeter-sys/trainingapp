import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

// Hjälper till att normalisera textfält.
function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const email = normalizeText(body?.email);
    const password = normalizeText(body?.password);
    const name = normalizeText(body?.name);
    const registrationCode = normalizeText(body?.registrationCode);

    // Gemensam registreringskod från env.
    const expectedRegistrationCode =
      process.env.REGISTRATION_CODE?.trim() ?? "";

    // Grundvalidering.
    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "E-post och lösenord krävs" },
        { status: 400 }
      );
    }

    // Om ingen kod är satt i env vill vi hellre blockera än råka öppna registrering.
    if (!expectedRegistrationCode) {
      console.error("REGISTRATION_CODE saknas i miljövariablerna.");

      return NextResponse.json(
        { ok: false, error: "Registrering är inte aktiverad just nu" },
        { status: 500 }
      );
    }

    // Koden måste anges.
    if (!registrationCode) {
      return NextResponse.json(
        { ok: false, error: "Registreringskod krävs" },
        { status: 400 }
      );
    }

    // Fel kod ska stoppa registreringen.
    if (registrationCode !== expectedRegistrationCode) {
      return NextResponse.json(
        { ok: false, error: "Fel registreringskod" },
        { status: 403 }
      );
    }

    // Kolla om e-post redan används.
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

    // Hasha lösenordet säkert.
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
        INSERT INTO app_users (id, email, password_hash, name, role, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, name, role, status
      `,
      [randomUUID(), email, hash, name || null, "user", "active"]
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