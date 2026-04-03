import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/server-auth";

// Returnerar aktuell inloggad user i ett konsekvent format.
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        user: null,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    user,
  });
}