"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function checkAuth() {
      try {
        // Kolla om användaren redan har en giltig session.
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const data = await res.json();

        if (data?.ok && data.user) {
          router.replace("/home");
          router.refresh();
        }
      } catch {
        // Tyst fail här – sidan ska fortfarande gå att använda.
      }
    }

    void checkAuth();
  }, [router]);

  async function handleLogin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    // Förhindra dubbelklick/dubbla requests.
    if (loading) return;

    setLoading(true);
    setError("");
    setStatusMessage("Försöker logga in...");

    try {
      const trimmedIdentifier = identifier.trim();

      if (!trimmedIdentifier || !password) {
        throw new Error("Fyll i användarnamn/e-post och lösenord");
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Viktigt för session/cookies.
        body: JSON.stringify({
          identifier: trimmedIdentifier,
          password,
          rememberMe,
        }),
      });

      // Hantera både JSON-svar och oväntade felsvar.
      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Kunde inte logga in (${res.status})`);
      }

      setStatusMessage("Inloggning lyckades, skickar vidare...");

      // Viktigt: hård navigering fungerar ofta säkrare på iPhone/Safari
      // direkt efter att en sessionscookie satts.
      window.location.href = "/home";
    } catch (err) {
      setStatusMessage("");
      setError(err instanceof Error ? err.message : "Kunde inte logga in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto flex min-h-screen max-w-md items-center">
        <div className="w-full rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Välkommen</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-950">Träningsapp</h1>
          <p className="mt-2 text-sm text-gray-600">
            Logga in med e-post eller användarnamn för att fortsätta.
          </p>

          <form className="mt-6 space-y-3" onSubmit={handleLogin}>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="E-post eller användarnamn"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border px-3 py-3 text-base"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Lösenord"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border px-3 py-3 text-base"
            />

            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Håll mig inloggad
            </label>

            {statusMessage ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                {statusMessage}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Loggar in..." : "Logga in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}