import { NextResponse } from "next/server";

// Loggar ut användaren genom att rensa NextAuth-cookies.
// Vi kör JWT-sessioner, så ingen databassession behöver tas bort.
export async function POST() {
  try {
    const response = NextResponse.json({ ok: true });

    // Cookie i lokal utveckling.
    response.cookies.set("next-auth.session-token", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      expires: new Date(0),
    });

    // Secure-variant som används vid https/produktion.
    response.cookies.set("__Secure-next-auth.session-token", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires: new Date(0),
    });

    // Hjälpcookies som NextAuth kan sätta.
    response.cookies.set("next-auth.callback-url", "", {
      sameSite: "lax",
      secure: false,
      path: "/",
      expires: new Date(0),
    });

    response.cookies.set("__Secure-next-auth.callback-url", "", {
      sameSite: "lax",
      secure: true,
      path: "/",
      expires: new Date(0),
    });

    response.cookies.set("next-auth.csrf-token", "", {
      sameSite: "lax",
      secure: false,
      path: "/",
      expires: new Date(0),
    });

    response.cookies.set("__Host-next-auth.csrf-token", "", {
      sameSite: "lax",
      secure: true,
      path: "/",
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error("Logout failed:", error);

    return NextResponse.json(
      { ok: false, error: "Kunde inte logga ut" },
      { status: 500 }
    );
  }
}