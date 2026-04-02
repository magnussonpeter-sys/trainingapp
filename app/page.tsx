"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  // Lokal state för formuläret
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // UI-state för feedback
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Login via NextAuth credentials
      const result = await signIn("credentials", {
        identifier,
        password,
        redirect: false,
      });

      if (result?.ok) {
        window.location.href = "/home";
        return;
      }

      setError("Felaktiga inloggningsuppgifter");
    } catch (loginError) {
      console.error("Login failed:", loginError);
      setError("Något gick fel vid inloggning");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f3f4f6",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          padding: 24,
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Logga in
        </h1>

        <p style={{ color: "#4b5563", marginBottom: 20 }}>
          Logga in för att se dina pass, gym och träningshistorik.
        </p>

        <form
          onSubmit={handleLogin}
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          <input
            type="text"
            placeholder="E-post eller användarnamn"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #d1d5db",
            }}
          />

          <input
            type="password"
            placeholder="Lösenord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #d1d5db",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: 12,
              borderRadius: 12,
              border: "none",
              background: "#111827",
              color: "white",
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Loggar in..." : "Logga in"}
          </button>
        </form>

        {error ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
            }}
          >
            {error}
          </div>
        ) : null}

        <p style={{ marginTop: 16, color: "#4b5563" }}>
          Har du inget konto?{" "}
          <Link href="/register" style={{ color: "#111827", fontWeight: 600 }}>
            Skapa konto
          </Link>
        </p>
      </div>
    </main>
  );
}