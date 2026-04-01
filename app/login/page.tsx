"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        // Kolla om användaren redan har en giltig session.
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data?.user) {
          // Använd hård navigation här för att undvika Next-router/HMR-problem i dev.
          window.location.replace("/home");
          return;
        }
      } catch (error) {
        console.error("Auth check failed:", error);
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

  async function handleLogin(e: FormEvent) {
    e.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setMessage("");

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier || !password) {
      setMessage("Fyll i användarnamn eller e-post samt lösenord");
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
        setMessage("Fel användarnamn/e-post eller lösenord");
        setSubmitting(false);
        return;
      }

      // Verifiera att sessionen verkligen finns innan redirect.
      const meRes = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include",
      });

      const meData = await meRes.json();

      if (meRes.ok && meData?.user) {
        // Hård navigation även här för att undvika router-race i dev.
        window.location.replace("/home");
        return;
      }

      setMessage("Inloggningen lyckades inte skapa en giltig session");
    } catch (error) {
      console.error("Login failed:", error);
      setMessage("Kunde inte logga in");
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
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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