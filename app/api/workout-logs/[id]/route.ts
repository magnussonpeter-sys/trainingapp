import { NextResponse } from "next/server";
import { deleteWorkoutLogById } from "@/lib/workout-log-repository";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    // Next 16 route params är async.
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing workout log id" },
        { status: 400 }
      );
    }

    const result = await deleteWorkoutLogById(userId, id);

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

    const message =
      error instanceof Error ? error.message : "Unknown delete error";

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to delete workout log",
        details: message,
      },
      { status: 500 }
    );
  }
}