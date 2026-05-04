import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUserId } from "@/lib/server-auth";
import { getWeeklyPlanStateForUser } from "@/lib/planning/weekly-plan-repository";

export async function GET(request: NextRequest) {
  try {
    const requestedUserId = request.nextUrl.searchParams.get("userId");
    const user = await requireAuthorizedUserId(requestedUserId);
    const result = await getWeeklyPlanStateForUser(user.id);

    return NextResponse.json({
      ok: true,
      settings: result.settings,
      plannedSessions: result.plannedSessions,
      state: result.state,
    });
  } catch (error) {
    console.error("GET /api/weekly-plan error:", error);

    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

    return NextResponse.json(
      { ok: false, error: "Kunde inte läsa veckoplanen" },
      { status: 500 },
    );
  }
}

