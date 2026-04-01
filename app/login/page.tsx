"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setMessage("");

    const result = await signIn("credentials", {
      identifier: identifier.trim(),
      password,
      redirect: false,
    });

    if (result?.ok) {
      window.location.href = "/";
      return;
    }

    setMessage("Fel användarnamn/e-post eller lösenord");
    setSubmitting(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold">Logga in</h1>
        <p className="mb-6 text-sm text-gray-600">
          Logga in med e-post eller användarnamn.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="text"
            placeholder="E-post eller användarnamn"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            className="w-full rounded-xl border px-3 py-3 text-base"
          />

          <input
            type="password"
            placeholder="Lösenord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-xl border px-3 py-3 text-base"
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
          >
            {submitting ? "Loggar in..." : "Logga in"}
          </button>

          {message ? <p className="text-sm text-red-600">{message}</p> : null}
        </form>

        <p className="mt-6 text-sm text-gray-600">
          Har du inget konto?{" "}
          <Link href="/register" className="font-medium underline">
            Skapa konto
          </Link>
        </p>
      </div>
    </main>
  );
}