"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  // Lokal state för formuläret
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // UI-state för feedback och lösenordsvisning
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <main className="min-h-screen bg-[var(--app-page-bg)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_20px_60px_rgba(15,23,42,0.14)] md:grid-cols-2">
          {/* Enkel vänstersida för lite mer appkänsla */}
          <div className="hidden bg-[var(--app-accent-soft)] p-8 md:flex md:flex-col md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong)]">
                Träningsapp
              </p>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-[var(--app-text-strong)]">
                AI-stödd träning för dina mål, gym och pass.
              </h1>

              <p className="mt-4 text-base leading-7 text-[var(--app-text)]">
                Logga in för att se träningshistorik, sparade gym och få nya
                pass anpassade efter mål, utrustning och tid.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-[var(--app-border)] bg-white/70 p-4 backdrop-blur">
              <p className="text-sm font-medium text-[var(--app-text-strong)]">
                Smidigt upplägg
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--app-text)]">
                Ett konto per användare med personliga inställningar, mål,
                historik och AI-genererade träningspass.
              </p>
            </div>
          </div>

          {/* Login-box */}
          <div className="p-6 sm:p-8 md:p-10">
            <div className="mx-auto max-w-md">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong)] md:hidden">
                Träningsapp
              </p>

              <h2 className="mt-2 text-3xl font-bold text-[var(--app-text-strong)]">
                Logga in
              </h2>

              <p className="mt-3 text-base leading-7 text-[var(--app-text)]">
                Använd e-post eller användarnamn och ditt lösenord.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <div className="space-y-2">
                  <label
                    htmlFor="identifier"
                    className="text-sm font-medium text-[var(--app-text-strong)]"
                  >
                    E-post eller användarnamn
                  </label>

                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="t.ex. peter eller namn@mail.se"
                    className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-[var(--app-text-strong)] outline-none transition placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-[var(--app-text-strong)]"
                  >
                    Lösenord
                  </label>

                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="Ditt lösenord"
                      className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 pr-24 text-[var(--app-text-strong)] outline-none transition placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--app-accent-strong)] transition hover:bg-[var(--app-accent-soft)]"
                      aria-label={
                        showPassword ? "Dölj lösenord" : "Visa lösenord"
                      }
                    >
                      {showPassword ? "Dölj" : "Visa"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-[var(--app-accent)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? "Loggar in..." : "Logga in"}
                </button>
              </form>

              {error ? (
                <div className="mt-5 rounded-2xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] px-4 py-3 text-sm font-medium text-[var(--app-danger-text)]">
                  {error}
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-4 text-sm text-[var(--app-text)]">
                Har du inget konto?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-[var(--app-accent-strong)] hover:underline"
                >
                  Skapa konto
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}