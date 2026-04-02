import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

// DB-anslutning
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Typ för användare i auth-flödet
type AppAuthUser = {
  id: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "disabled";
};

// Läs bootstrap-admin från env
const ENV_ADMIN_USERNAME =
  process.env.ADMIN_USERNAME?.trim().toLowerCase() ?? "";

const ENV_ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";

// NextAuth config
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt", // Vi kör JWT
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: {}, // Behåller samma fältnamn som din login-sida redan skickar
        password: {},
      },

      async authorize(credentials) {
        const identifier = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!identifier || !password) {
          throw new Error("Missing credentials");
        }

        // 1) Bootstrap-admin via env
        // Detta är reservspår för admin, inte huvudspår långsiktigt.
        if (ENV_ADMIN_USERNAME && ENV_ADMIN_PASSWORD_HASH) {
          if (identifier === ENV_ADMIN_USERNAME) {
            const isEnvPasswordValid = await bcrypt.compare(
              password,
              ENV_ADMIN_PASSWORD_HASH
            );

            if (isEnvPasswordValid) {
              return {
                id: "env-admin",
                email: `${ENV_ADMIN_USERNAME}@local.admin`,
                role: "admin",
                status: "active",
              } satisfies AppAuthUser;
            }
          }
        }

        // 2) Vanlig användare från databasen
        const result = await pool.query(
          `
          SELECT id, email, password_hash, role, status
          FROM app_users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [identifier]
        );

        const user = result.rows[0];

        if (!user) {
          throw new Error("User not found");
        }

        // Blockera inaktiverade konton
        if (user.status !== "active") {
          throw new Error("User is disabled");
        }

        // Verifiera lösenord
        const isValid = await bcrypt.compare(
          password,
          user.password_hash
        );

        if (!isValid) {
          throw new Error("Invalid password");
        }

        // Uppdatera senaste login
        await pool.query(
          `
          UPDATE app_users
          SET last_login_at = NOW()
          WHERE id = $1
          `,
          [user.id]
        );

        return {
          id: String(user.id),
          email: String(user.email),
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
        token.id = (user as AppAuthUser).id;
        token.role = (user as AppAuthUser).role;
        token.status = (user as AppAuthUser).status;
      }

      return token;
    },

    // Exponera samma data i session.user
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).status = token.status;
      }

      return session;
    },
  },

  pages: {
    signIn: "/", // login-sidan
  },

  secret: process.env.NEXTAUTH_SECRET,
};

// Export för Next.js route handler
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };