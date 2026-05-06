import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizedUserId } from "@/lib/server-auth";
import { postponeWeeklyPlanSession } from "@/lib/planning/weekly-plan-repository";

const postponeSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  newDate: z.string().min(10),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = postponeSchema.parse(body);
    const user = await requireAuthorizedUserId(parsed.userId);
    const result = await postponeWeeklyPlanSession(user.id, parsed.sessionId, parsed.newDate);

    return NextResponse.json({
      ok: true,
      settings: result.settings,
      plannedSessions: result.plannedSessions,
      state: result.state,
      status: result.status,
      context: result.context,
    });
  } catch (error) {
    console.error("POST /api/weekly-plan/postpone error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Ogiltig flytt av pass", issues: error.issues },
        { status: 400 },
      );
    }

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
      { ok: false, error: "Kunde inte flytta det planerade passet" },
      { status: 500 },
    );
  }
}
