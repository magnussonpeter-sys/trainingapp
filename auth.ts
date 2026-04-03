import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { pool } from "@/lib/db";

// Små hjälptyper för auth-flödet.
type AppRole = "user" | "admin";
type AppStatus = "active" | "disabled";

type AppAuthUser = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  displayName: string;
  role: AppRole;
  status: AppStatus;
};

// ENV-admin för bootstrap.
const ENV_ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim().toLowerCase() ?? "";
const ENV_ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";

// Bygger ett säkert visningsnamn som alltid finns.
function buildDisplayName(params: {
  name?: string | null;
  username?: string | null;
  email?: string | null;
}) {
  const trimmedName = params.name?.trim() ?? "";
  const trimmedUsername = params.username?.trim() ?? "";
  const emailPrefix = params.email?.split("@")[0]?.trim() ?? "";

  return trimmedName || trimmedUsername || emailPrefix || "Användare";
}

// Bygger en auth-user i ett ställe så callbackarna blir enkla.
function createAppAuthUser(params: {
  id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  role?: AppRole | null;
  status?: AppStatus | null;
}): AppAuthUser {
  const name = params.name?.trim() || null;
  const username = params.username?.trim() || null;
  const displayName = buildDisplayName({
    name,
    username,
    email: params.email,
  });

  return {
    id: params.id,
    email: params.email,
    name,
    // Om separat username inte finns ännu använder vi display fallback.
    username: username ?? displayName,
    displayName,
    role: params.role ?? "user",
    status: params.status ?? "active",
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "E-post", type: "text" },
        password: { label: "Lösenord", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier?.trim();
        const password = credentials?.password;

        if (!identifier || !password) {
          return null;
        }

        const normalized = identifier.toLowerCase();

        // 1) ENV-admin för bootstrap.
        if (ENV_ADMIN_USERNAME && ENV_ADMIN_PASSWORD_HASH) {
          if (normalized === ENV_ADMIN_USERNAME) {
            const ok = await bcrypt.compare(password, ENV_ADMIN_PASSWORD_HASH);

            if (ok) {
              return createAppAuthUser({
                id: "env-admin",
                email: `${ENV_ADMIN_USERNAME}@local`,
                name: "Admin",
                username: ENV_ADMIN_USERNAME,
                role: "admin",
                status: "active",
              });
            }
          }
        }

        // 2) Vanlig användare i DB.
        // Vi läser fortsatt från nuvarande name-fält för maximal kompatibilitet.
        const result = await pool.query(
          `
            SELECT id, email, name, password_hash, role, status
            FROM app_users
            WHERE LOWER(email) = LOWER($1)
               OR LOWER(name) = LOWER($1)
            LIMIT 1
          `,
          [identifier]
        );

        const user = result.rows[0];

        if (!user) {
          return null;
        }

        if ((user.status ?? "active") !== "active") {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
          return null;
        }

        // Uppdatera senaste inloggning.
        await pool.query(
          `
            UPDATE app_users
            SET last_login_at = NOW()
            WHERE id = $1
          `,
          [user.id]
        );

        return createAppAuthUser({
          id: String(user.id),
          email: String(user.email),
          name: typeof user.name === "string" ? user.name : null,
          // Tills separat username-kolumn används fullt ut låter vi username följa name/display.
          username: typeof user.name === "string" ? user.name : null,
          role: (user.role ?? "user") as AppRole,
          status: (user.status ?? "active") as AppStatus,
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as AppAuthUser;

        // Små extrafält på token för resten av appen.
        (token as any).id = authUser.id;
        (token as any).role = authUser.role;
        (token as any).status = authUser.status;
        (token as any).email = authUser.email;
        (token as any).name = authUser.name;
        (token as any).username = authUser.username;
        (token as any).displayName = authUser.displayName;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // Lägg in samma data i session.user så server-auth kan läsa dem vidare.
        (session.user as any).id = String((token as any).id ?? "");
        (session.user as any).role = ((token as any).role ?? "user") as AppRole;
        (session.user as any).status = ((token as any).status ?? "active") as AppStatus;
        (session.user as any).username =
          typeof (token as any).username === "string" ? (token as any).username : null;
        (session.user as any).displayName =
          typeof (token as any).displayName === "string"
            ? (token as any).displayName
            : buildDisplayName({
                name: typeof token.name === "string" ? token.name : null,
                username:
                  typeof (token as any).username === "string"
                    ? (token as any).username
                    : null,
                email: typeof token.email === "string" ? token.email : null,
              });

        session.user.email = typeof token.email === "string" ? token.email : null;
        session.user.name = typeof token.name === "string" ? token.name : null;
      }

      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };