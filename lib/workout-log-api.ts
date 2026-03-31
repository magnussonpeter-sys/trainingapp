import type { CreateWorkoutLogInput } from "@/lib/workout-log-db-types";

export async function saveWorkoutLogToApi(input: CreateWorkoutLogInput) {
  // Skickar träningspasset till servern för att sparas i databasen.
  const response = await fetch("/api/workout-logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  // Försök läsa JSON-svar, men krascha inte om svaret är tomt eller ogiltigt.
  const data = await response.json().catch(() => null);

  // Om servern svarar med fel, försök ge så tydligt felmeddelande som möjligt.
  if (!response.ok || !data?.ok) {
    const errorMessage =
      data?.details ??
      data?.error ??
      `Failed to save workout log (${response.status})`;

    throw new Error(errorMessage);
  }

  // Returnerar id för det sparade träningspasset.
  return data as { ok: true; id: string };
}