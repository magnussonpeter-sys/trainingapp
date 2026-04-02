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

        // Tydliga debug-loggar för felsökning i terminalen
        console.log("=== AUTH AUTHORIZE START ===");
        console.log("identifier raw:", credentials?.identifier);
        console.log("identifier trimmed:", identifier);
        console.log("identifier normalized:", identifier?.toLowerCase());
        console.log("ENV_ADMIN_USERNAME:", ENV_ADMIN_USERNAME);
        console.log("HASH FROM ENV:", ENV_ADMIN_PASSWORD_HASH);
        console.log(
          "ENV_ADMIN_PASSWORD_HASH exists:",
          Boolean(ENV_ADMIN_PASSWORD_HASH)
        );

        // Skydda mot tomma fält
        if (!identifier || !password) {
          console.log("AUTH FAILED: missing identifier or password");
          console.log("=== AUTH AUTHORIZE END ===");
          return null;
        }

        const normalizedIdentifier = identifier.toLowerCase();

        // 1) Först: tillåt bootstrap-admin från env
        // Detta är en reserv/admin-ingång och inte huvudspåret långsiktigt.
        if (ENV_ADMIN_USERNAME && ENV_ADMIN_PASSWORD_HASH) {
          const isEnvAdminUser = normalizedIdentifier === ENV_ADMIN_USERNAME;

          console.log("Checking env admin...");
          console.log("isEnvAdminUser:", isEnvAdminUser);

          if (isEnvAdminUser) {
            const isValidEnvPassword = await bcrypt.compare(
              password,
              ENV_ADMIN_PASSWORD_HASH
            );

            console.log("isValidEnvPassword:", isValidEnvPassword);

            if (isValidEnvPassword) {
              console.log("AUTH SUCCESS: env admin matched");
              console.log("=== AUTH AUTHORIZE END ===");

              return {
                id: "env-admin", // Syntetiskt id för bootstrap-admin
                email: `${ENV_ADMIN_USERNAME}@local.admin`,
                name: "Bootstrap Admin",
                role: "admin",
                status: "active",
              } satisfies AppAuthUser;
            }

            console.log("AUTH FAILED: env admin password mismatch");
          }
        } else {
          console.log("Env admin not configured");
        }

        // 2) Annars: vanlig login mot databasen
        // Tillåt login med e-post eller nuvarande name-fält
        // På sikt bör detta ersättas av ett separat username-fält
        console.log("Falling through to DB login...");

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

        console.log("DB user found:", Boolean(user));

        if (!user) {
          console.log("AUTH FAILED: no DB user found");
          console.log("=== AUTH AUTHORIZE END ===");
          return null;
        }

        console.log("DB user status:", user.status ?? "active");
        console.log("DB user role:", user.role ?? "user");

        // Blockera inaktiverade användare
        if ((user.status ?? "active") !== "active") {
          console.log("AUTH FAILED: DB user is not active");
          console.log("=== AUTH AUTHORIZE END ===");
          return null;
        }

        // Kontrollera lösenord mot hash
        const isValid = await bcrypt.compare(password, user.password_hash);

        console.log("DB password valid:", isValid);

        if (!isValid) {
          console.log("AUTH FAILED: DB password mismatch");
          console.log("=== AUTH AUTHORIZE END ===");
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

        console.log("AUTH SUCCESS: DB user matched");
        console.log("=== AUTH AUTHORIZE END ===");

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

        console.log("JWT callback user:", {
          id: authUser.id,
          email: authUser.email,
          role: authUser.role,
          status: authUser.status,
        });

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

      console.log("SESSION callback:", {
        id: token.id,
        email: token.email,
        role: token.role,
        status: token.status,
      });

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