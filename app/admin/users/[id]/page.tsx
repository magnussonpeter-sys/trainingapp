"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

type AuthUser = {
  id: string;
  role: "user" | "admin";
  status: "active" | "disabled";
};

type AdminUserDetail = {
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

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = String(params?.id ?? "");

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [newPassword, setNewPassword] = useState("");

  async function loadPage() {
    try {
      setLoading(true);
      setError(null);

      const meResponse = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      const meData = await meResponse.json().catch(() => null);

      if (!meResponse.ok || !meData?.user) {
        router.replace("/login");
        return;
      }

      const currentUser = meData.user as AuthUser;
      setAuthUser(currentUser);

      if (currentUser.role !== "admin") {
        setError("Du saknar adminbehörighet.");
        return;
      }

      const response = await fetch(`/api/admin/users/${userId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.user) {
        throw new Error(data?.error || "Kunde inte hämta användaren.");
      }

      const nextUser = data.user as AdminUserDetail;
      setUser(nextUser);
      setName(nextUser.name ?? "");
      setEmail(nextUser.email);
      setRole(nextUser.role);
      setStatus(nextUser.status);
    } catch (loadError) {
      console.error("Admin user detail load failed:", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Kunde inte läsa användaren.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [userId]);

  async function handleSaveDetails() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          role,
          status,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.user) {
        throw new Error(data?.error || "Kunde inte spara användaren.");
      }

      const nextUser = data.user as AdminUserDetail;
      setUser(nextUser);
      setName(nextUser.name ?? "");
      setEmail(nextUser.email);
      setRole(nextUser.role);
      setStatus(nextUser.status);
      setSuccess("Användaren uppdaterades.");
    } catch (saveError) {
      console.error("Admin update user failed:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Kunde inte spara användaren.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    try {
      setResettingPassword(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: newPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.user) {
        throw new Error(data?.error || "Kunde inte återställa lösenordet.");
      }

      setNewPassword("");
      setSuccess("Lösenordet uppdaterades.");
    } catch (resetError) {
      console.error("Admin reset password failed:", resetError);
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Kunde inte återställa lösenordet.",
      );
    } finally {
      setResettingPassword(false);
    }
  }

  if (loading) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <div className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-500">Laddar användare...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!authUser || authUser.role !== "admin" || !user) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <div className={uiCardClasses.danger}>
            {error ?? "Kunde inte öppna användaren."}
          </div>
        </div>
      </main>
    );
  }

  const isSelf = authUser.id === user.id;

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
          <Link href="/admin/users" className="text-sm font-medium text-slate-500">
            ← Tillbaka till användare
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              {user.name || "Utan namn"}
            </h1>
            {isSelf ? (
              <span className="rounded-full bg-lime-100 px-2.5 py-1 text-xs font-semibold text-lime-800">
                Du
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">{user.email}</p>
          <div className="mt-4 grid gap-2 text-sm text-slate-500 sm:grid-cols-3">
            <p>Skapad: {formatDate(user.created_at)}</p>
            <p>Senast ändrad: {formatDate(user.updated_at)}</p>
            <p>Senast inloggad: {formatDate(user.last_login_at)}</p>
          </div>
        </section>

        {error ? <div className={uiCardClasses.danger}>{error}</div> : null}
        {success ? <div className={uiCardClasses.success}>{success}</div> : null}

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Grunddata
          </h2>
          <div className="mt-4 space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Namn</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">E-post</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Roll</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as "user" | "admin")}
                  disabled={isSelf}
                  className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100 disabled:bg-slate-100"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Status</span>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as "active" | "disabled")
                  }
                  disabled={isSelf}
                  className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100 disabled:bg-slate-100"
                >
                  <option value="active">Aktiv</option>
                  <option value="disabled">Inaktiv</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleSaveDetails()}
              disabled={saving}
              className={cn(uiButtonClasses.primary, "w-full sm:w-auto")}
            >
              {saving ? "Sparar..." : "Spara ändringar"}
            </button>
          </div>
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Återställ lösenord
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Sätt ett nytt lösenord direkt för användaren. Hashning sker alltid på
            servern.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Minst 8 tecken"
              className="min-h-11 flex-1 rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
            />
            <button
              type="button"
              onClick={() => void handleResetPassword()}
              disabled={resettingPassword || newPassword.length < 8}
              className={uiButtonClasses.secondary}
            >
              {resettingPassword ? "Uppdaterar..." : "Sätt nytt lösenord"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

