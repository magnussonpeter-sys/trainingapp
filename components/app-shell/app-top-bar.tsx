"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import AppMenuSheet, { type AppMenuItem } from "@/components/app-shell/app-menu-sheet";

type AppTopBarProps = {
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  menuItems?: AppMenuItem[];
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
  rightSlot?: React.ReactNode;
};

// Standardmeny för appens vanligaste sidor.
const DEFAULT_MENU_ITEMS: AppMenuItem[] = [
  { href: "/settings", label: "Inställningar" },
  { href: "/gyms", label: "Hantera gym" },
  { href: "/history", label: "Träningshistorik" },
];

// Ny topbar enligt app-shell-strukturen.
export default function AppTopBar({
  title = "Träningsapp",
  subtitle,
  backHref,
  backLabel = "Tillbaka",
  menuItems = DEFAULT_MENU_ITEMS,
  onLogout,
  isLoggingOut = false,
  rightSlot,
}: AppTopBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
            >
              <span aria-hidden="true">←</span>
              <span>{backLabel}</span>
            </Link>
          ) : null}

          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </h1>

            {subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {rightSlot ? <div>{rightSlot}</div> : null}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
              aria-label="Öppna meny"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
            >
              ☰
            </button>

            <AppMenuSheet
              isOpen={isMenuOpen}
              items={menuItems}
              onClose={() => setIsMenuOpen(false)}
              onLogout={onLogout}
              isLoggingOut={isLoggingOut}
            />
          </div>
        </div>
      </div>
    </header>
  );
}