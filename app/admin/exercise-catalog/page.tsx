"use client";

import Link from "next/link";

import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AdminExerciseCatalogPlaceholderPage() {
  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, uiPageShellClasses.stack)}>
        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <Link href="/admin" className="text-sm font-medium text-slate-500">
            ← Tillbaka till admin
          </Link>
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Övningskatalog
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Kommer senare
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Katalogen är fortfarande kodbaserad i appen. Admin-UI för live-redigering
            byggs när katalogen flyttas till en mer dynamisk modell.
          </p>
          <div className="mt-5">
            <Link href="/admin" className={uiButtonClasses.secondary}>
              Tillbaka till admin
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

