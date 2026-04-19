import { NextResponse } from "next/server";
import { getWorkoutLogsByUser } from "@/lib/workout-log-repository";
import { requireAdmin } from "@/lib/server-auth";

export async function GET() {
  try {
    await requireAdmin();
    const logs = await getWorkoutLogsByUser("test-user", 5);

    return NextResponse.json({
      ok: true,
      count: logs.length,
      logs,
    });
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
