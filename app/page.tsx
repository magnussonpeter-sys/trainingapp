"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const result = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });

    if (result?.ok) {
      window.location.href = "/home";
    } else {
      setError("Felaktiga inloggningsuppgifter");
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 400, margin: "0 auto" }}>
      <h1>Logga in</h1>

      <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
        <input
          placeholder="E-post eller namn"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />

        <input
          type="password"
          placeholder="Lösenord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">Logga in</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}