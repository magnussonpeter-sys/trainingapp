"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Enkel typ för menylänk så komponenten blir lätt att återanvända.
type AppTopBarItem = {
  href: string;
  label: string;
};

// Props hålls små och tydliga så topbaren kan användas på flera sidor.
type AppTopBarProps = {
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  menuItems?: AppTopBarItem[];
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
  rightSlot?: React.ReactNode;
};

const DEFAULT_MENU_ITEMS: AppTopBarItem[] = [
  { href: "/settings", label: "Inställningar" },
  { href: "/gyms", label: "Hantera gym" },
  { href: "/history", label: "Träningshistorik" },
];

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
    // Stänger menyn om man trycker utanför.
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    // Stäng menyn med Escape för bättre mobil/desktop-känsla.
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

  async function handleLogoutClick() {
    // Stäng menyn direkt så UI känns kvickt.
    setIsMenuOpen(false);

    if (!onLogout) {
      return;
    }

    await onLogout();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3 px-4 pb-3 pt-safe pt-4 sm:px-6">
        <div className="min-w-0 flex-1">
          {/* Valfri tillbaka-länk för undersidor */}
          {backHref ? (
            <Link
              href={backHref}
              className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
            >
              <span aria-hidden="true">←</span>
              <span>{backLabel}</span>
            </Link>
          ) : null}

          {/* Titelrad */}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </h1>

            {/* Kort undertext om sidan */}
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Plats för extra knapp/badge om det behövs senare */}
          {rightSlot ? <div>{rightSlot}</div> : null}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:shadow-md active:scale-[0.98]"
              aria-label="Öppna meny"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
            >
              ☰
            </button>

            {isMenuOpen ? (
              <div
                className="absolute right-0 top-14 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                role="menu"
              >
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    Meny
                  </p>
                </div>

                {menuItems.map((item, index) => (
                  <Link
                    key={`${item.href}-${index}`}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="block border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
                    role="menuitem"
                  >
                    {item.label}
                  </Link>
                ))}

                {onLogout ? (
                  <button
                    type="button"
                    onClick={handleLogoutClick}
                    disabled={isLoggingOut}
                    className="block w-full px-4 py-3 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    role="menuitem"
                  >
                    {isLoggingOut ? "Loggar ut..." : "Logga ut"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}