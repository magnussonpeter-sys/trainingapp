import crypto from "crypto";

// Namn på auth-cookie som används i appen.
export const AUTH_COOKIE_NAME = "training_app_session";

// Hashar lösenord på samma sätt varje gång.
// Viktigt: detta matchar nuvarande login/register-flöde i dina routes.
export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Skapar en slumpmässig session-token för tabellen sessions.
export function generateSessionToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}