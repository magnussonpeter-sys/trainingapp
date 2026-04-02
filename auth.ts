import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

// Typ för user i session
type AppAuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
};

// ENV-admin (bootstrap)
const ENV_ADMIN_USERNAME =
  process.env.ADMIN_USERNAME?.trim().toLowerCase() ?? "";

const ENV_ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";

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

        if (!identifier || !password) return null;

        const normalized = identifier.toLowerCase();

        // 🔐 1. ENV ADMIN (bootstrap)
        if (ENV_ADMIN_USERNAME && ENV_ADMIN_PASSWORD_HASH) {
          if (normalized === ENV_ADMIN_USERNAME) {
            const ok = await bcrypt.compare(
              password,
              ENV_ADMIN_PASSWORD_HASH
            );

            if (ok) {
              return {
                id: "env-admin",
                email: `${ENV_ADMIN_USERNAME}@local`,
                name: "Admin",
                role: "admin",
                status: "active",
              } satisfies AppAuthUser;
            }
          }
        }

        // 👤 2. VANLIG USER (DB)
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
        if (!user) return null;

        if (user.status !== "active") return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        await pool.query(
          `UPDATE app_users SET last_login_at = NOW() WHERE id = $1`,
          [user.id]
        );

        return {
          id: String(user.id),
          email: String(user.email),
          name: user.name,
          role: user.role ?? "user",
          status: user.status ?? "active",
        } satisfies AppAuthUser;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as AppAuthUser;
        token.id = u.id;
        token.role = u.role;
        token.status = u.status;
        token.email = u.email;
        token.name = u.name;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).status = token.status;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
      }
      return session;
    },
  },

  pages: {
    signIn: "/", // login ligger på startsidan
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };