"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setMessage(data.error || "Kunde inte skapa användare");
        setLoading(false);
        return;
      }

      const loginResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (loginResult?.ok) {
        window.location.href = "/";
        return;
      }

      setMessage("Användare skapad, men automatisk inloggning misslyckades.");
    } catch (error) {
      console.error(error);
      setMessage("Något gick fel vid registrering");
    } finally {
      setLoading(false);
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
        <h1 style={{ marginTop: 0 }}>Skapa konto</h1>
        <p style={{ color: "#555" }}>
          Registrera en användare för att få egna gym, pass och AI-förslag.
        </p>

        <form onSubmit={handleRegister} style={{ display: "grid", gap: 12 }}>
          <input
            placeholder="Namn"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #d1d5db",
            }}
          />

          <input
            type="email"
            placeholder="E-post"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
              padding: 14,
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {loading ? "Skapar konto..." : "Skapa konto"}
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
          Har du redan konto?{" "}
          <Link href="/login" style={{ color: "#2563eb" }}>
            Logga in
          </Link>
        </p>
      </div>
    </main>
  );
}