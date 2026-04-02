import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";

// Gemensam typ för aktuell inloggad user på servern
export type CurrentUser = {
  id: string;
  role: "user" | "admin";
  status: "active" | "disabled";
};

// Hämtar aktuell user från sessionen server-side
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  const user = session.user as {
    id?: string;
    role?: "user" | "admin";
    status?: "active" | "disabled";
  };

  if (!user.id) {
    return null;
  }

  return {
    id: String(user.id),
    role: user.role ?? "user",
    status: user.status ?? "active",
  };
}

// Kräver inloggad och aktiv användare
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

// Kräver admin och aktiv användare
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();

  if (user.role !== "admin") {
    throw new Error("Forbidden");
  }

  return user;
}