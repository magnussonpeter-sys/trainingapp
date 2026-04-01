import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

// Enkel typ för appens auth-user.
type AppAuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: {
          label: "E-post eller användarnamn",
          type: "text",
        },
        password: {
          label: "Lösenord",
          type: "password",
        },
      },

      async authorize(credentials) {
        const identifier = credentials?.identifier?.trim();
        const password = credentials?.password;

        // Skydda mot tomma inloggningsfält.
        if (!identifier || !password) {
          return null;
        }

        // Tillåt login med e-post eller nuvarande name-fält.
        // På sikt bör vi lägga till ett separat username-fält i DB.
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

        // Blockera inaktiverade användare.
        if ((user.status ?? "active") !== "active") {
          return null;
        }

        // Kontrollera hashat lösenord.
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
          return null;
        }

        // Uppdatera senaste inloggning.
        await pool.query(
          `
          UPDATE app_users
          SET last_login_at = NOW(), updated_at = NOW()
          WHERE id = $1
          `,
          [user.id]
        );

        return {
          id: String(user.id),
          email: String(user.email),
          name: user.name ? String(user.name) : null,
          role: (user.role ?? "user") as "user" | "admin",
          status: (user.status ?? "active") as "active" | "disabled",
        } satisfies AppAuthUser;
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  secret: process.env.AUTH_SECRET,

  // Behåll login-sidan på startsidan.
  pages: {
    signIn: "/",
  },

  callbacks: {
    // Lägg in det vi behöver i JWT-token.
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as AppAuthUser;
        token.id = authUser.id;
        token.role = authUser.role;
        token.status = authUser.status;
        token.name = authUser.name;
        token.email = authUser.email;
      }

      return token;
    },

    // Exponera samma data i session.user.
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = String(token.id ?? "");
        (session.user as { role?: "user" | "admin" }).role =
          (token.role as "user" | "admin" | undefined) ?? "user";
        (session.user as { status?: "active" | "disabled" }).status =
          (token.status as "active" | "disabled" | undefined) ?? "active";

        session.user.name =
          typeof token.name === "string" ? token.name : null;

        session.user.email =
          typeof token.email === "string" ? token.email : null;
      }

      return session;
    },
  },
};