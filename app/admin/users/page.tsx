"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("sv-SE");
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  // Enkel form för att admin ska kunna skapa användare manuellt
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [newStatus, setNewStatus] = useState<"active" | "disabled">("active");
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadPage() {
    setLoading(true);
    setPageError(null);

    try {
      // Läs aktuell user från säkra auth-endpointen
      const meResponse = await fetch("/api/auth/me", {
        credentials: "include",
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
        setPageError("Du saknar adminbehörighet.");
        setAuthUser(user);
        setLoading(false);
        return;
      }

      setAuthUser(user);

      // Hämta användarlistan
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
      console.error("Admin page load failed:", error);
      setPageError("Kunde inte läsa admin-sidan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

      return bTime - aTime;
    });
  }, [users]);

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setCreateMessage(null);
    setCreating(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
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
        setCreateMessage(data.error ?? "Kunde inte skapa användare.");
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
      setCreateMessage("Kunde inte skapa användare.");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateUser(
    userId: string,
    nextRole: "user" | "admin",
    nextStatus: "active" | "disabled"
  ) {
    setSavingUserId(userId);
    setPageError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          role: nextRole,
          status: nextStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPageError(data.error ?? "Kunde inte uppdatera användaren.");
        return;
      }

      const updatedUser = data.user as AdminUserRow;

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === updatedUser.id ? updatedUser : user
        )
      );
    } catch (error) {
      console.error("Update user failed:", error);
      setPageError("Kunde inte uppdatera användaren.");
    } finally {
      setSavingUserId(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Admin – användare</h1>
        <p className="mt-4 text-sm text-gray-600">Laddar...</p>
      </main>
    );
  }

  if (!authUser || authUser.role !== "admin") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Admin – användare</h1>
        <p className="mt-4 text-sm text-red-600">
          {pageError ?? "Du saknar behörighet till denna sida."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Admin – användare</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enkel första adminvy för användarhantering.
        </p>
      </div>

      {pageError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </div>
      ) : null}

      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Skapa användare</h2>

        <form onSubmit={handleCreateUser} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Namn</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2"
              placeholder="Valfritt namn"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>E-post</span>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2"
              placeholder="namn@exempel.se"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Lösenord</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2"
              placeholder="Minst 8 tecken"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Roll</span>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
              className="rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Status</span>
            <select
              value={newStatus}
              onChange={(e) =>
                setNewStatus(e.target.value as "active" | "disabled")
              }
              className="rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creating ? "Skapar..." : "Skapa användare"}
            </button>
          </div>
        </form>

        {createMessage ? (
          <p className="mt-3 text-sm text-gray-700">{createMessage}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Användarlista</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-3 py-2">Namn</th>
                <th className="px-3 py-2">E-post</th>
                <th className="px-3 py-2">Roll</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Skapad</th>
                <th className="px-3 py-2">Senast inloggad</th>
                <th className="px-3 py-2">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => {
                const isSaving = savingUserId === user.id;

                return (
                  <tr key={user.id} className="border-b border-gray-100 align-top">
                    <td className="px-3 py-3">{user.name || "—"}</td>
                    <td className="px-3 py-3">{user.email}</td>
                    <td className="px-3 py-3">
                      <select
                        value={user.role}
                        disabled={isSaving}
                        onChange={(e) =>
                          void handleUpdateUser(
                            user.id,
                            e.target.value as "user" | "admin",
                            user.status
                          )
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={user.status}
                        disabled={isSaving}
                        onChange={(e) =>
                          void handleUpdateUser(
                            user.id,
                            user.role,
                            e.target.value as "active" | "disabled"
                          )
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1"
                      >
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">{formatDate(user.created_at)}</td>
                    <td className="px-3 py-3">{formatDate(user.last_login_at)}</td>
                    <td className="px-3 py-3 text-gray-500">
                      {isSaving ? "Sparar..." : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}