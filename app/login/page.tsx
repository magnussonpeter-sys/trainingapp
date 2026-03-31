"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.ok) {
      window.location.href = "/";
    } else {
      setMessage("Fel e-post eller lösenord");
    }
  }

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: 20,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Logga in</h1>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <input
            type="email"
            placeholder="E-post"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #d1d5db",
            }}
          />

          <button
            type="submit"
            style={{
              padding: 14,
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            Logga in
          </button>
        </form>

        {message && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "#eff6ff",
              color: "#1e3a8a",
            }}
          >
            {message}
          </div>
        )}

        <p style={{ marginTop: 16 }}>
          Har du inget konto?{" "}
          <Link href="/register" style={{ color: "#2563eb" }}>
            Skapa konto
          </Link>
        </p>
      </div>
    </main>
  );
}