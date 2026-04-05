"use client";

import Link from "next/link";

// Enkel typ för länkar i appmenyn.
export type AppMenuItem = {
  href: string;
  label: string;
};

type AppMenuSheetProps = {
  isOpen: boolean;
  items: AppMenuItem[];
  onClose: () => void;
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
};

// Enkel menyyta som kan återanvändas av topbaren.
export default function AppMenuSheet({
  isOpen,
  items,
  onClose,
  onLogout,
  isLoggingOut = false,
}: AppMenuSheetProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="absolute right-0 top-14 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      role="menu"
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
          Meny
        </p>
      </div>

      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClose}
          className="block border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
          role="menuitem"
        >
          {item.label}
        </Link>
      ))}

      {onLogout ? (
        <button
          type="button"
          onClick={async () => {
            onClose();
            await onLogout();
          }}
          disabled={isLoggingOut}
          className="block w-full px-4 py-3 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          role="menuitem"
        >
          {isLoggingOut ? "Loggar ut..." : "Logga ut"}
        </button>
      ) : null}
    </div>
  );
}