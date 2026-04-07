"use client";

// Home = navet i appen
// Fokus:
// - snabb start
// - resume av pass
// - tydlig sync-status
// - två tydliga val: AI / eget pass

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { getWorkoutDraft } from "@/lib/workout-flow/workout-draft-store";
import { getPendingSyncQueue } from "@/lib/workout-flow/pending-sync-store";

type AuthUser = {
  id?: string | number | null;
  name?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getDisplayName(user: AuthUser | null) {
  if (!user) return "där";

  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "där"
  );
}

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [hasDraft, setHasDraft] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // 🔐 Hämta användare
  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json().catch(() => null);
        const u = data?.user ?? null;

        if (!isMounted) return;

        if (u?.id) {
          setUser(u);
          setUserId(String(u.id));
        }
      } catch {
        // ignore
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  // 📦 Kolla draft + sync
  useEffect(() => {
    if (!userId) return;

    try {
      const draft = getWorkoutDraft(userId);
      setHasDraft(!!draft);

      const queue = getPendingSyncQueue(userId);
      setPendingCount(queue.length);
    } catch {
      setHasDraft(false);
      setPendingCount(0);
    }
  }, [userId]);

  return (
    <main className={uiPageShellClasses.page}>
      <div className={uiPageShellClasses.content}>
        <div className={uiPageShellClasses.stack}>
          {/* HEADER */}
          <section className={cn(uiCardClasses.section, "overflow-hidden")}>
            <div className="bg-slate-900 px-6 py-6 text-white">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-300">
                Hej
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                {getDisplayName(user)}
              </h1>

              <p className="mt-3 text-sm text-slate-300">
                Vad vill du göra idag?
              </p>
            </div>

            <div className="px-6 py-5 space-y-3">
              {/* Resume */}
              {hasDraft ? (
                <button
                  onClick={() => router.push("/workout/run")}
                  className={cn(uiButtonClasses.primary, "w-full")}
                >
                  Fortsätt pass
                </button>
              ) : null}

              {/* Start */}
              <button
                onClick={() => router.push("/workout/preview")}
                className={cn(uiButtonClasses.primary, "w-full")}
              >
                Starta pass
              </button>
            </div>
          </section>

          {/* SYNC STATUS */}
          {pendingCount > 0 ? (
            <section className={uiCardClasses.success}>
              <p className="font-medium">
                {pendingCount} pass väntar på synk
              </p>
              <p className="mt-1 text-sm">
                De skickas automatiskt när du har internet.
              </p>
            </section>
          ) : null}

          {/* VAL */}
          <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Skapa pass
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => router.push("/workout/preview")}
                className={cn(uiButtonClasses.secondary, "w-full")}
              >
                AI-pass
              </button>

              <button
                onClick={() => router.push("/workout/custom")}
                className={cn(uiButtonClasses.secondary, "w-full")}
              >
                Eget pass
              </button>
            </div>
          </section>

          {/* NAV */}
          <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => router.push("/history")}
                className={uiButtonClasses.secondary}
              >
                Historik
              </button>

              <button
                onClick={() => router.push("/settings")}
                className={uiButtonClasses.secondary}
              >
                Inställningar
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}