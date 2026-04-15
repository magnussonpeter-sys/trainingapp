"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

type AuthUser = {
  id: string;
  role: "user" | "admin";
  status: "active" | "disabled";
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const sections = [
  {
    href: "/admin/users",
    title: "Användare",
    description: "Hantera roller, status, lösenord och grunddata för användare.",
  },
  {
    href: "/admin/gyms",
    title: "Gym",
    description: "Se gym, ägare, delningsstatus och utrustning på ett ställe.",
  },
  {
    href: "/admin/exercise-catalog",
    title: "Övningskatalog",
    description: "Kommer senare. Förbered plats för framtida katalogadmin.",
    disabled: true,
  },
];

export default function AdminHomePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAdmin() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.user) {
          router.replace("/login");
          return;
        }

        const user = data.user as AuthUser;
        if (user.role !== "admin") {
          setError("Du saknar adminbehörighet.");
        }

        if (isMounted) {
          setAuthUser(user);
        }
      } catch (loadError) {
        console.error("Admin home load failed:", loadError);
        if (isMounted) {
          setError("Kunde inte öppna admin.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadAdmin();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <div className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-500">Laddar admin...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!authUser || authUser.role !== "admin") {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <div className={uiCardClasses.danger}>
            {error ?? "Du saknar behörighet till admin."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, uiPageShellClasses.stack)}>
        <section
          className={cn(
            uiCardClasses.section,
            uiCardClasses.sectionPadded,
            "bg-[radial-gradient(circle_at_top,_rgba(190,242,100,0.28),_rgba(255,255,255,1)_66%)]",
          )}
        >
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Adminpanel
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            En enkel startpunkt för användare, gym och framtida kataloghantering.
          </p>
          <div className="mt-5">
            <Link href="/home" className={uiButtonClasses.ghostDark}>
              Tillbaka till appen
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          {sections.map((section) =>
            section.disabled ? (
              <div
                key={section.title}
                className={cn(uiCardClasses.section, uiCardClasses.sectionPadded, "opacity-75")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                        {section.title}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        Kommer senare
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {section.description}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <Link
                key={section.href}
                href={section.href}
                className={cn(
                  uiCardClasses.section,
                  uiCardClasses.sectionPadded,
                  "block transition hover:border-lime-300 hover:shadow-md",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                      {section.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {section.description}
                    </p>
                  </div>
                  <span className="text-slate-300">›</span>
                </div>
              </Link>
            ),
          )}
        </section>
      </div>
    </main>
  );
}

