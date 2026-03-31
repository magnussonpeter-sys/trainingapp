"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkAuth() {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();

      if (data?.ok && data.user) {
        router.replace("/home");
      }
    }

    void checkAuth();
  }, [router]);

  async function handleLogin() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
          rememberMe,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte logga in");
      }

      router.replace("/home");
    } catch (err) {
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

          <div className="mt-6 space-y-3">
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="E-post eller användarnamn"
              className="w-full rounded-xl border px-3 py-3 text-base"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Lösenord"
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

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Loggar in..." : "Logga in"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}