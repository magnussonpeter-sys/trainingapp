"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { AuthUser, Gym } from "@/lib/gyms";
import { getGymDisplayCount } from "@/lib/gyms";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function GymsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const sortedGyms = useMemo(() => {
    return [...gyms].sort((left, right) => left.name.localeCompare(right.name, "sv"));
  }, [gyms]);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.user) {
          router.replace("/");
          return;
        }

        if (!isMounted) {
          return;
        }

        setAuthUser(data.user as AuthUser);
        setAuthChecked(true);
      } catch (error) {
        console.error("Auth check failed on /gyms:", error);
        if (isMounted) {
          router.replace("/");
        }
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    void checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    const authUserId = authUser?.id;
    if (!authUserId) {
      return;
    }

    let isMounted = true;

    async function fetchGyms() {
      try {
        setIsLoading(true);
        setPageError(null);

        const response = await fetch(`/api/gyms?userId=${authUserId}`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Kunde inte hämta gym.");
        }

        if (!isMounted) {
          return;
        }

        setGyms(Array.isArray(data.gyms) ? (data.gyms as Gym[]) : []);
      } catch (error) {
        console.error("GET gyms failed:", error);
        if (isMounted) {
          setPageError(
            error instanceof Error ? error.message : "Kunde inte hämta gym.",
          );
          setGyms([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchGyms();

    return () => {
      isMounted = false;
    };
  }, [authUser?.id]);

  if (!authChecked) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.contentWide}>
          <div className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-500">Laddar gym...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.contentWide, "space-y-4")}>
        <section
          className={cn(
            uiCardClasses.section,
            uiCardClasses.sectionPadded,
            "bg-[radial-gradient(circle_at_top,_rgba(190,242,100,0.35),_rgba(255,255,255,1)_62%)]",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Gym
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                Gym
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Välj ett eget eller delat gym för att hålla flödet mot hem, AI-pass
                och run tydligt.
              </p>
            </div>

            <Link href="/home" className={uiButtonClasses.ghostDark}>
              Tillbaka
            </Link>
          </div>

          <div className="mt-5">
            <Link href="/gyms/new" className={cn(uiButtonClasses.primary, "inline-flex items-center")}>
              + Lägg till gym
            </Link>
          </div>
        </section>

        {pageError ? <div className={uiCardClasses.danger}>{pageError}</div> : null}

        <section className="space-y-3">
          {isLoading ? (
            <div className={cn(uiCardClasses.base, uiCardClasses.padded)}>
              <p className="text-sm text-slate-500">Hämtar dina gym...</p>
            </div>
          ) : sortedGyms.length === 0 ? (
            <div className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                Inga gym än
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Lägg till ditt första gym så kan appen anpassa pass efter rätt
                utrustning.
              </p>
              <div className="mt-4">
                <Link href="/gyms/new" className={uiButtonClasses.primary}>
                  Skapa första gymmet
                </Link>
              </div>
            </div>
          ) : (
            sortedGyms.map((gym) => (
              <Link
                key={gym.id}
                href={`/gyms/${gym.id}`}
                className={cn(
                  uiCardClasses.section,
                  uiCardClasses.sectionPadded,
                  "block transition hover:border-lime-300 hover:shadow-md",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                        {gym.name}
                      </h2>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          gym.is_shared
                            ? "bg-lime-100 text-lime-800"
                            : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {gym.is_shared ? "Delat" : "Privat"}
                      </span>
                    </div>

                    {gym.description?.trim() ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {gym.description.trim()}
                      </p>
                    ) : null}
                  </div>

                  <span className="text-slate-300">›</span>
                </div>

                <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                  <span>{getGymDisplayCount(gym)} utrustningsposter</span>
                </div>
              </Link>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
