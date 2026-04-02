import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

// Enkel typ för auth-user i appen
type AppAuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
};

// Läs bootstrap-admin från env på servern
const ENV_ADMIN_USERNAME =
  process.env.ADMIN_USERNAME?.trim().toLowerCase() ?? "";

const ENV_ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt", // Vi kör JWT-sessioner
  },

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

        // Skydda mot tomma fält
        if (!identifier || !password) {
          return null;
        }

        const normalizedIdentifier = identifier.toLowerCase();

        // 1) Först: tillåt bootstrap-admin från env
        // Detta är en reserv/admin-ingång och inte huvudspåret långsiktigt.
        if (ENV_ADMIN_USERNAME && ENV_ADMIN_PASSWORD_HASH) {
          const isEnvAdminUser =
            normalizedIdentifier === ENV_ADMIN_USERNAME;

          if (isEnvAdminUser) {
            const isValidEnvPassword = await bcrypt.compare(
              password,
              ENV_ADMIN_PASSWORD_HASH
            );

            if (isValidEnvPassword) {
              return {
                id: "env-admin", // Syntetiskt id för bootstrap-admin
                email: `${ENV_ADMIN_USERNAME}@local.admin`,
                name: "Bootstrap Admin",
                role: "admin",
                status: "active",
              } satisfies AppAuthUser;
            }
          }
        }

        // 2) Annars: vanlig login mot databasen
        // Tillåt login med e-post eller nuvarande name-fält
        // På sikt bör detta ersättas av ett separat username-fält
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

        // Blockera inaktiverade användare
        if ((user.status ?? "active") !== "active") {
          return null;
        }

        // Kontrollera lösenord mot hash
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
          return null;
        }

        // Uppdatera senaste inloggning
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

  callbacks: {
    // Lägg extra data i JWT
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

    // Exponera samma data i session.user
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

  pages: {
    signIn: "/", // Startsidan är login-sida
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };