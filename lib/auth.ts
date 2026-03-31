import crypto from "crypto";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";

export const AUTH_COOKIE_NAME = "training_app_session";

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function getCurrentUserFromSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  const result = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.username
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token = $1
      AND s.expires_at > NOW()
    LIMIT 1
    `,
    [sessionToken]
  );

  return result.rows[0] ?? null;
}