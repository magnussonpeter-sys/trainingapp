"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

type AuthUser = {
  id: string;
  role: "user" | "admin";
  status: "active" | "disabled";
};

type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("sv-SE");
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "admin">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">(
    "all",
  );

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [newStatus, setNewStatus] = useState<"active" | "disabled">("active");

  async function loadPage() {
    setLoading(true);
    setPageError(null);

    try {
      const meResponse = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });

      if (!meResponse.ok) {
        router.replace("/login");
        return;
      }

      const meData = await meResponse.json();
      const user = meData.user as AuthUser | null;

      if (!user) {
        router.replace("/login");
        return;
      }

      if (user.role !== "admin") {
        setAuthUser(user);
        setPageError("Du saknar adminbehörighet.");
        setLoading(false);
        return;
      }

      setAuthUser(user);

      const usersResponse = await fetch("/api/admin/users", {
        credentials: "include",
      });
      const usersData = await usersResponse.json();

      if (!usersResponse.ok) {
        setPageError(usersData.error ?? "Kunde inte hämta användare.");
        setLoading(false);
        return;
      }

      setUsers(Array.isArray(usersData.users) ? usersData.users : []);
    } catch (error) {
      console.error("Admin users load failed:", error);
      setPageError("Kunde inte läsa användare.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const filteredUsers = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return [...users]
      .filter((user) => {
        if (roleFilter !== "all" && user.role !== roleFilter) {
          return false;
        }

        if (statusFilter !== "all" && user.status !== statusFilter) {
          return false;
        }

        if (!searchValue) {
          return true;
        }

        return (
          user.email.toLowerCase().includes(searchValue) ||
          (user.name ?? "").toLowerCase().includes(searchValue)
        );
      })
      .sort((left, right) => {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [roleFilter, search, statusFilter, users]);

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCreateMessage(null);
    setCreating(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setCreateMessage(data.error ?? "Kunde inte skapa användaren.");
        return;
      }

      setCreateMessage("Användare skapad.");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("user");
      setNewStatus("active");
      await loadPage();
    } catch (error) {
      console.error("Create user failed:", error);
      setCreateMessage("Kunde inte skapa användaren.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.contentWide}>
          <div className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-500">Laddar användare...</p>
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
            {pageError ?? "Du saknar behörighet till denna sida."}
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href="/admin" className="text-sm font-medium text-slate-500">
                ← Tillbaka till admin
              </Link>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Användare
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sök, filtrera och gå vidare till detaljvyn för uppdateringar och
                lösenordsreset.
              </p>
            </div>
          </div>
        </section>

        {pageError ? <div className={uiCardClasses.danger}>{pageError}</div> : null}

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Skapa användare
          </h2>
          <form onSubmit={handleCreateUser} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Namn</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                placeholder="Valfritt namn"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">E-post</span>
              <input
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                placeholder="namn@mail.se"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Lösenord</span>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                placeholder="Minst 8 tecken"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Roll</span>
                <select
                  value={newRole}
                  onChange={(event) => setNewRole(event.target.value as "user" | "admin")}
                  className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Status</span>
                <select
                  value={newStatus}
                  onChange={(event) =>
                    setNewStatus(event.target.value as "active" | "disabled")
                  }
                  className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
                >
                  <option value="active">Aktiv</option>
                  <option value="disabled">Inaktiv</option>
                </select>
              </label>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className={cn(uiButtonClasses.primary, "w-full sm:w-auto")}
              >
                {creating ? "Skapar..." : "Skapa användare"}
              </button>
            </div>
          </form>

          {createMessage ? (
            <p className="mt-3 text-sm text-slate-600">{createMessage}</p>
          ) : null}
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök användare"
              className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
            />
            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value as typeof roleFilter)
              }
              className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
            >
              <option value="all">Alla roller</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as typeof statusFilter)
              }
              className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
            >
              <option value="all">Alla statusar</option>
              <option value="active">Aktiv</option>
              <option value="disabled">Inaktiv</option>
            </select>
          </div>

          <div className="mt-5 space-y-3">
            {filteredUsers.map((user) => (
              <Link
                key={user.id}
                href={`/admin/users/${user.id}`}
                className={cn(
                  uiCardClasses.base,
                  "block p-4 transition hover:border-lime-300 hover:shadow-md",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-slate-950">
                        {user.name || "Utan namn"}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {user.role}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          user.status === "active"
                            ? "bg-lime-100 text-lime-800"
                            : "bg-rose-100 text-rose-700",
                        )}
                      >
                        {user.status === "active" ? "Aktiv" : "Inaktiv"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{user.email}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>Skapad {formatDate(user.created_at)}</span>
                      <span>Senast inloggad {formatDate(user.last_login_at)}</span>
                    </div>
                  </div>
                  <span className="text-slate-300">›</span>
                </div>
              </Link>
            ))}

            {filteredUsers.length === 0 ? (
              <div className={cn(uiCardClasses.soft, "text-sm text-slate-600")}>
                Inga användare matchar filtret.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

