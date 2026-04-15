"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

type AuthUser = {
  id: string;
  role: "user" | "admin";
  status: "active" | "disabled";
};

type AdminGymRow = {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  is_shared: boolean;
  owner_email: string | null;
  owner_name: string | null;
  equipment_count: number;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AdminGymsPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [gyms, setGyms] = useState<AdminGymRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sharingFilter, setSharingFilter] = useState<"all" | "shared" | "private">(
    "all",
  );

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      try {
        const meResponse = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        const meData = await meResponse.json().catch(() => null);

        if (!meResponse.ok || !meData?.user) {
          router.replace("/login");
          return;
        }

        const user = meData.user as AuthUser;
        if (!isMounted) return;
        setAuthUser(user);

        if (user.role !== "admin") {
          setError("Du saknar adminbehörighet.");
          return;
        }

        const response = await fetch("/api/admin/gyms", {
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok || !Array.isArray(data?.gyms)) {
          throw new Error(data?.error || "Kunde inte hämta gym.");
        }

        if (isMounted) {
          setGyms(data.gyms as AdminGymRow[]);
        }
      } catch (loadError) {
        console.error("Admin gyms load failed:", loadError);
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Kunde inte läsa gym.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const filteredGyms = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return gyms.filter((gym) => {
      if (sharingFilter === "shared" && !gym.is_shared) {
        return false;
      }
      if (sharingFilter === "private" && gym.is_shared) {
        return false;
      }
      if (!searchValue) {
        return true;
      }
      return (
        gym.name.toLowerCase().includes(searchValue) ||
        (gym.owner_email ?? "").toLowerCase().includes(searchValue) ||
        (gym.owner_name ?? "").toLowerCase().includes(searchValue)
      );
    });
  }, [gyms, search, sharingFilter]);

  if (loading) {
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

  if (!authUser || authUser.role !== "admin") {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.contentWide}>
          <div className={uiCardClasses.danger}>
            {error ?? "Du saknar behörighet till denna sida."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.contentWide, uiPageShellClasses.stack)}>
        <section
          className={cn(
            uiCardClasses.section,
            uiCardClasses.sectionPadded,
            "bg-[radial-gradient(circle_at_top,_rgba(190,242,100,0.28),_rgba(255,255,255,1)_66%)]",
          )}
        >
          <Link href="/admin" className="text-sm font-medium text-slate-500">
            ← Tillbaka till admin
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Gym
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Se ägare, delningsstatus och utrustningsmängd utan att lämna adminflödet.
          </p>
        </section>

        {error ? <div className={uiCardClasses.danger}>{error}</div> : null}

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök gym eller ägare"
              className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
            />
            <select
              value={sharingFilter}
              onChange={(event) =>
                setSharingFilter(event.target.value as typeof sharingFilter)
              }
              className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
            >
              <option value="all">Alla gym</option>
              <option value="shared">Delade</option>
              <option value="private">Privata</option>
            </select>
          </div>

          <div className="mt-5 space-y-3">
            {filteredGyms.map((gym) => (
              <Link
                key={gym.id}
                href={`/admin/gyms/${gym.id}`}
                className={cn(
                  uiCardClasses.base,
                  "block p-4 transition hover:border-lime-300 hover:shadow-md",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">
                        {gym.name}
                      </h3>
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
                    {gym.description ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {gym.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>Ägare: {gym.owner_name || gym.owner_email || "Okänd"}</span>
                      <span>{gym.equipment_count} utrustningsposter</span>
                    </div>
                  </div>
                  <span className="text-slate-300">›</span>
                </div>
              </Link>
            ))}

            {filteredGyms.length === 0 ? (
              <div className={cn(uiCardClasses.soft, "text-sm text-slate-600")}>
                Inga gym matchar filtret.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

