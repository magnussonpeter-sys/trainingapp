"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";

export default function LandingPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data?.user) {
          // Hård navigation minskar risken för router/HMR-race i dev.
          window.location.replace("/home");
          return;
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        if (isMounted) {
          setLoadingPage(false);
        }
      }
    }

    void checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setError("");
    setStatusMessage("Försöker logga in...");

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier || !password) {
      setError("Fyll i användarnamn eller e-post samt lösenord");
      setStatusMessage("");
      setSubmitting(false);
      return;
    }

    try {
      const result = await signIn("credentials", {
        identifier: trimmedIdentifier,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError("Fel användarnamn/e-post eller lösenord");
        setStatusMessage("");
        setSubmitting(false);
        return;
      }

      const meRes = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include",
      });

      const meData = await meRes.json();

      if (meRes.ok && meData?.user) {
        setStatusMessage("Inloggning lyckades, skickar vidare...");
        window.location.replace("/home");
        return;
      }

      setError("Inloggningen lyckades inte skapa en giltig session");
      setStatusMessage("");
    } catch (err) {
      console.error("Login failed:", err);
      setError("Kunde inte logga in");
      setStatusMessage("");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingPage) {
    return <main className="p-6">Laddar...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="mb-2 text-sm text-gray-500">Välkommen</p>
        <h1 className="mb-2 text-3xl font-bold">Träningsapp</h1>
        <p className="mb-6 text-sm text-gray-600">
          Logga in med e-post eller användarnamn för att fortsätta.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="identifier"
              className="mb-1 block text-sm font-medium"
            >
              E-post eller användarnamn
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="E-post eller användarnamn"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border px-3 py-3 text-base"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium"
            >
              Lösenord
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Lösenord"
              autoComplete="current-password"
              className="w-full rounded-xl border px-3 py-3 text-base"
            />
          </div>

          {statusMessage ? (
            <p className="text-sm text-gray-600">{statusMessage}</p>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
          >
            {submitting ? "Loggar in..." : "Logga in"}
          </button>
        </form>
      </div>
    </main>
  );
}