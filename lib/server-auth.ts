import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";

// Gemensam typ för aktuell användare på serversidan.
export type CurrentUser = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  displayName: string;
  role: "user" | "admin";
  status: "active" | "disabled";
};

// Enkel fallback så UI alltid får något att visa.
function buildDisplayName(user: {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  displayName?: string | null;
}) {
  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "Där"
  );
}

// Hämtar aktuell user från NextAuth-session.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  const user = session.user as {
    id?: string;
    email?: string | null;
    name?: string | null;
    username?: string | null;
    displayName?: string | null;
    role?: "user" | "admin";
    status?: "active" | "disabled";
  };

  if (!user.id) {
    return null;
  }

  return {
    id: String(user.id),
    email: user.email ?? null,
    name: user.name ?? null,
    username: user.username ?? null,
    displayName: buildDisplayName(user),
    role: user.role ?? "user",
    status: user.status ?? "active",
  };
}

// Kräver inloggad och aktiv användare.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  if (user.status !== "active") {
    throw new Error("Account disabled");
  }

  return user;
}

// Kräver admin och aktiv användare.
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();

  if (user.role !== "admin") {
    throw new Error("Forbidden");
  }

  return user;
}