import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

// 🧠 Hämtar aktuell user från session (server-side)
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user) return null;

  return {
    id: (session.user as any).id,
    role: (session.user as any).role,
    status: (session.user as any).status,
  };
}

// 🔒 Säker helper för admin-routes
export async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized");
  }

  return user;
}