import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

// 🔌 DB-anslutning (återanvänd din befintliga om du har en)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 🧠 NextAuth config
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt", // Vi kör JWT (ingen DB-session)
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: {},
        password: {},
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing credentials");
        }

        // 🔍 Hämta user från DB (inkl role + status)
        const result = await pool.query(
          `
          SELECT id, email, password_hash, role, status
          FROM app_users
          WHERE email = $1
          `,
          [credentials.email]
        );

        const user = result.rows[0];

        if (!user) {
          throw new Error("User not found");
        }

        // 🔒 Blockera disabled users
        if (user.status !== "active") {
          throw new Error("User is disabled");
        }

        // 🔑 Verifiera lösenord
        const isValid = await bcrypt.compare(
          credentials.password,
          user.password_hash
        );

        if (!isValid) {
          throw new Error("Invalid password");
        }

        // 📝 Uppdatera last_login_at (bra för admin senare)
        await pool.query(
          `
          UPDATE app_users
          SET last_login_at = NOW()
          WHERE id = $1
          `,
          [user.id]
        );

        // 🔁 Returnera data som ska in i JWT
        return {
          id: user.id,
          email: user.email,
          role: user.role ?? "user", // fallback
          status: user.status ?? "active",
        };
      },
    }),
  ],

  callbacks: {
    // 🧠 JWT skapas / uppdateras
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.status = (user as any).status;
      }
      return token;
    },

    // 📦 Vad som exponeras till klienten
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
    signIn: "/", // din login-sida
  },

  secret: process.env.NEXTAUTH_SECRET,
};

// 🚀 Export (Next.js 13/14)
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };