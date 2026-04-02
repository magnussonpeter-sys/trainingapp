"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function RegisterPage() {
  // Enkel lokal state för formuläret
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI-state för feedback
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      // Skapa användaren via befintligt API
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

      // Hantera fel från API:t
      if (!data.ok) {
        setMessage(data.error || "Kunde inte skapa användare");
        setLoading(false);
        return;
      }

      // Viktigt: auth.ts förväntar sig identifier, inte email
      const loginResult = await signIn("credentials", {
        identifier: email, // Login sker med identifier enligt nuvarande auth.ts
        password,
        redirect: false,
      });

      if (loginResult?.ok) {
        window.location.href = "/";
        return;
      }

      setMessage("Användare skapad, men automatisk inloggning misslyckades.");
    } catch (error) {
      console.error("Register failed:", error);
      setMessage("Något gick fel vid registrering");
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
          Skapa konto
        </h1>

        <p style={{ color: "#4b5563", marginBottom: 20 }}>
          Registrera en användare för att få egna gym, pass och AI-förslag.
        </p>

        <form
          onSubmit={handleRegister}
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          <input
            type="text"
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
            {loading ? "Skapar konto..." : "Skapa konto"}
          </button>
        </form>

        {message && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              color: "#111827",
            }}
          >
            {message}
          </div>
        )}

        <p style={{ marginTop: 16, color: "#4b5563" }}>
          Har du redan konto?{" "}
          <Link href="/" style={{ color: "#111827", fontWeight: 600 }}>
            Logga in
          </Link>
        </p>
      </div>
    </main>
  );
}