"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function RegisterPage() {
  // Lokal state för formuläret.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");

  // UI-state för feedback och lösenordsvisning.
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegistrationCode, setShowRegistrationCode] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      // Skapa användaren via API.
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          registrationCode,
        }),
      });

      const data = await res.json();

      // Hantera fel från API:t.
      if (!data.ok) {
        setMessage(data.error || "Kunde inte skapa användare");
        setLoading(false);
        return;
      }

      // Login via samma auth-spår som övriga appen.
      const loginResult = await signIn("credentials", {
        identifier: email,
        password,
        redirect: false,
      });

      if (loginResult?.ok) {
        window.location.href = "/home";
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
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-6 text-[var(--app-text)]">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        {/* Vänstersida för lite tydligare appkänsla */}
        <section className="hidden rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-8 shadow-sm lg:block">
          <div className="inline-flex rounded-full border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 py-1 text-sm font-medium text-[var(--app-accent-strong)]">
            Träningsapp
          </div>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-[var(--app-text-strong)]">
            Skapa ett konto och kom igång med smartare träning.
          </h1>

          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--app-text-muted)]">
            Spara dina gym, följ din träningshistorik och få AI-genererade pass
            anpassade efter mål, utrustning och tid.
          </p>

          <div className="mt-8 rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-6">
            <h2 className="text-lg font-semibold text-[var(--app-text-strong)]">
              Personligt upplägg
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">
              Ett konto ger dig egna inställningar, mål, historik och bättre
              AI-förslag över tid.
            </p>
          </div>
        </section>

        {/* Registreringsdelen */}
        <section className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-8">
          <div className="inline-flex rounded-full border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 py-1 text-sm font-medium text-[var(--app-accent-strong)]">
            Träningsapp
          </div>

          <h2 className="mt-6 text-3xl font-bold tracking-tight text-[var(--app-text-strong)]">
            Skapa konto
          </h2>

          <p className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">
            Registrera dig för att få egna gym, pass och AI-förslag.
          </p>

          <form onSubmit={handleRegister} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--app-text-strong)]">
                Namn
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ditt namn"
                className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-[var(--app-text-strong)] outline-none transition placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--app-text-strong)]">
                E-post
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="namn@mail.se"
                className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-[var(--app-text-strong)] outline-none transition placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--app-text-strong)]">
                Lösenord
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Välj ett lösenord"
                  className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 pr-24 text-[var(--app-text-strong)] outline-none transition placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--app-accent-strong)] transition hover:bg-[var(--app-accent-soft)]"
                  aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                >
                  {showPassword ? "Dölj" : "Visa"}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--app-text-strong)]">
                Registreringskod
              </label>
              <div className="relative">
                <input
                  type={showRegistrationCode ? "text" : "password"}
                  value={registrationCode}
                  onChange={(e) => setRegistrationCode(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="Ange registreringskod"
                  className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 pr-24 text-[var(--app-text-strong)] outline-none transition placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowRegistrationCode((current) => !current)
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--app-accent-strong)] transition hover:bg-[var(--app-accent-soft)]"
                  aria-label={
                    showRegistrationCode
                      ? "Dölj registreringskod"
                      : "Visa registreringskod"
                  }
                >
                  {showRegistrationCode ? "Dölj" : "Visa"}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                Du behöver en giltig kod för att kunna skapa konto.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[var(--app-accent)] px-4 py-3 font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Skapar konto..." : "Skapa konto"}
            </button>

            {message ? (
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-4 py-3 text-sm text-[var(--app-text-strong)]">
                {message}
              </div>
            ) : null}
          </form>

          <p className="mt-6 text-sm text-[var(--app-text-muted)]">
            Har du redan konto?{" "}
            <Link
              href="/"
              className="font-medium text-[var(--app-accent-strong)] underline-offset-4 hover:underline"
            >
              Logga in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}