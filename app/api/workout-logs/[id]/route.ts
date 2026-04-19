import { NextResponse } from "next/server";
import { deleteWorkoutLogById } from "@/lib/workout-log-repository";
import { requireAuthorizedUserId } from "@/lib/server-auth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");
    const user = await requireAuthorizedUserId(requestedUserId);

    // Next 16 route params är async.
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing workout log id" },
        { status: 400 }
      );
    }

    const result = await deleteWorkoutLogById(user.id, id);

    if (!result.deleted) {
      return NextResponse.json(
        { ok: false, error: "Workout log not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: true,
    });
  } catch (error) {
    console.error("DELETE /api/workout-logs/[id] error:", error);

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
      {
        ok: false,
        error: "Failed to delete workout log",
      },
      { status: 500 }
    );
  }
}
