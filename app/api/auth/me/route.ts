import { NextResponse } from "next/server";
import { getCurrentUserFromSession } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUserFromSession();

    return NextResponse.json({
      ok: true,
      user: user ?? null,
    });
  } catch (error) {
    console.error("Auth me failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}