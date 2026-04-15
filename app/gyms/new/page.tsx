"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { AuthUser } from "@/lib/gyms";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function NewGymPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

        if (isMounted) {
          setAuthUser(data.user as AuthUser);
          setAuthChecked(true);
        }
      } catch (authError) {
        console.error("Auth check failed on /gyms/new:", authError);
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

      const response = await fetch("/api/gyms", {
        method: "POST",
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

      if (!response.ok || !data?.ok || !data?.gym?.id) {
        throw new Error(data?.error || "Kunde inte skapa gymmet.");
      }

      router.replace(`/gyms/${data.gym.id}`);
    } catch (saveError) {
      console.error("Create gym failed:", saveError);
      setError(
        saveError instanceof Error ? saveError.message : "Kunde inte skapa gymmet.",
      );
    } finally {
      setIsSaving(false);
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
                Nytt gym
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Lägg till gym
              </h1>
            </div>

            <Link href="/gyms" className={uiButtonClasses.ghostDark}>
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
                placeholder="Ex. Hemmagym eller Nordic Wellness"
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
                placeholder="Kort beskrivning eller plats"
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
                  Delade gym kan användas av flera användare. Vi börjar enkelt med
                  en delningsflagga nu.
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
          <Link href="/gyms" className={uiButtonClasses.secondary}>
            Avbryt
          </Link>
        </div>
      </div>
    </main>
  );
}

