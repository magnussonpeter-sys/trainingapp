import { NextResponse } from "next/server";
import { getWorkoutLogsByUser } from "@/lib/workout-log-repository";

export async function GET() {
  const logs = await getWorkoutLogsByUser("test-user", 5);

  return NextResponse.json({
    ok: true,
    count: logs.length,
    logs,
  });
}