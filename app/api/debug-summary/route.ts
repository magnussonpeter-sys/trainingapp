import { NextResponse } from "next/server";
import { getWorkoutSummaryForAI } from "@/lib/workout-summary";

export async function GET() {
  const userId = "3"; // byt!

  const summary = await getWorkoutSummaryForAI(userId);

  return NextResponse.json(summary);
}