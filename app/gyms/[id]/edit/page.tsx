"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ConfirmSheet from "@/components/shared/confirm-sheet";
import type { AuthUser, Gym } from "@/lib/gyms";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function EditGymPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const gymId = String(params?.id ?? "").trim();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchGym(userId: string) {
    const response = await fetch(`/api/gyms/${gymId}?userId=${userId}`, {
      cache: "no-store",
      credentials: "include",
    });
    const data = await response.json();

    if (!response.ok || !data?.ok || !data?.gym) {
      throw new Error(data?.error || "Kunde inte hämta gymmet.");
    }

    const nextGym = data.gym as Gym;
    setGym(nextGym);
    setName(nextGym.name);
    setDescription(nextGym.description ?? "");
    setIsShared(Boolean(nextGym.is_shared));
  }

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

        const nextUser = data.user as AuthUser;
        setAuthUser(nextUser);
        setAuthChecked(true);
        await fetchGym(String(nextUser.id));
      } catch (authError) {
        console.error("Auth check failed on /gyms/[id]/edit:", authError);
        if (isMounted) {
          setError(
            authError instanceof Error
              ? authError.message
              : "Kunde inte öppna gymmet.",
          );
        }
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    if (gymId) {
      void checkAuth();
    }

    return () => {
      isMounted = false;
    };
  }, [gymId, router]);

  async function handleSave() {
    if (!authUser?.id) {
      return;
    }

    if (!name.trim()) {
      setError("Ange ett namn på gymmet.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch(`/api/gyms/${gymId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: String(authUser.id),
          name: name.trim(),
          description: description.trim() || null,
          is_shared: isShared,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte spara gymmet.");
      }

      router.replace(`/gyms/${gymId}`);
    } catch (saveError) {
      console.error("Update gym failed:", saveError);
      setError(
        saveError instanceof Error ? saveError.message : "Kunde inte spara gymmet.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!authUser?.id) {
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);

      const response = await fetch(`/api/gyms/${gymId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: String(authUser.id) }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte ta bort gymmet.");
      }

      router.replace("/gyms");
    } catch (deleteError) {
      console.error("Delete gym failed:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Kunde inte ta bort gymmet.",
      );
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (!authChecked) {
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
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, uiPageShellClasses.stack)}>
        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Redigera gym
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {gym?.name ?? "Gym"}
              </h1>
            </div>

            <Link href={`/gyms/${gymId}`} className={uiButtonClasses.ghostDark}>
              Avbryt
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Namn
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Beskrivning
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
              />
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(event) => setIsShared(event.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-lime-500 focus:ring-lime-300"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  Dela detta gym med andra användare
                </span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">
                  Delade gym kan användas av flera användare. Du kan utveckla detta
                  vidare senare med inbjudningar och faktisk åtkomststyrning.
                </span>
              </span>
            </label>
          </div>
        </section>

        {error ? <div className={uiCardClasses.danger}>{error}</div> : null}

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className={uiButtonClasses.primary}
          >
            {isSaving ? "Sparar..." : "Spara"}
          </button>
          <Link href={`/gyms/${gymId}`} className={uiButtonClasses.secondary}>
            Avbryt
          </Link>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition active:scale-[0.99]"
          >
            Ta bort
          </button>
        </div>
      </div>

      <ConfirmSheet
        open={showDeleteConfirm}
        title="Ta bort gym?"
        description="Gymmet och all kopplad utrustning tas bort."
        confirmLabel={isDeleting ? "Tar bort..." : "Ta bort"}
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </main>
  );
}

