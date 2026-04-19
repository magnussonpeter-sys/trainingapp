import { NextResponse } from "next/server";
import { getWorkoutSummaryForAI } from "@/lib/workout-summary";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    await requireAdmin();

    const userId = "3"; // byt!
    const summary = await getWorkoutSummaryForAI(userId);

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled" || error.message === "Forbidden") {
        return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
      }
    }

    return NextResponse.json({ error: "Serverfel" }, { status: 500 });
  }
}
