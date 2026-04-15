"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";

import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
      {!open ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        // Skicka redan inloggade användare direkt vidare för att hålla flödet snabbt.
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await response.json().catch(() => null);

        if (!isMounted) {
          return;
        }

        if (response.ok && data?.user) {
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

  const trimmedIdentifier = useMemo(() => identifier.trim(), [identifier]);
  const formInvalid = trimmedIdentifier.length === 0 || password.length === 0;

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setMessage("");

    if (formInvalid) {
      setMessage("Fyll i e-post eller användarnamn samt lösenord.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await signIn("credentials", {
        identifier: trimmedIdentifier,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setMessage("Fel användarnamn/e-post eller lösenord.");
        setSubmitting(false);
        return;
      }

      const meResponse = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include",
      });
      const meData = await meResponse.json().catch(() => null);

      if (meResponse.ok && meData?.user) {
        window.location.replace("/home");
        return;
      }

      setMessage("Inloggningen lyckades inte skapa en giltig session.");
    } catch (error) {
      console.error("Login failed:", error);
      setMessage("Kunde inte logga in.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingPage) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <div className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-500">Laddar...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center">
        <section className={cn(uiCardClasses.section, "px-5 py-6 sm:px-6 sm:py-7")}>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Träningsapp
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Logga in
            </h1>
            <p className="text-sm text-slate-600">
              AI-pass anpassade efter dig
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="identifier"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                E-post eller användarnamn
              </label>
              <input
                id="identifier"
                type="text"
                placeholder="namn@mail.se eller användarnamn"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Lösenord
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Ange lösenord"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-14 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition active:scale-[0.98]"
                  aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {message ? (
              <div className={uiCardClasses.danger}>{message}</div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || formInvalid}
              className={cn(uiButtonClasses.primary, "w-full shadow-sm")}
            >
              {submitting ? "Loggar in..." : "Logga in"}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
            <p className="text-sm text-slate-600">Har du inget konto?</p>
            <Link
              href="/register"
              className={cn(
                uiButtonClasses.secondary,
                "mt-3 inline-flex min-w-[180px] items-center justify-center",
              )}
            >
              Skapa konto
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

