"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Enkel typ för bottennavigationen.
type BottomNavItem = {
  href: string;
  label: string;
  icon: string;
};

type BottomNavProps = {
  isAdmin?: boolean;
};

// Håller matchningen enkel och tydlig.
function isItemActive(pathname: string, href: string) {
  if (href === "/home") {
    return pathname === "/home";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav({ isAdmin = false }: BottomNavProps) {
  const pathname = usePathname() ?? "";

  // Fyra huvudval för vanlig användare.
  const items: BottomNavItem[] = [
    { href: "/home", label: "Hem", icon: "🏠" },
    { href: "/history", label: "Historik", icon: "📈" },
    { href: "/gyms", label: "Gym", icon: "🏋️" },
    { href: isAdmin ? "/admin/users" : "/settings", label: isAdmin ? "Admin" : "Inställn.", icon: isAdmin ? "🛡️" : "⚙️" },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <nav
        className="pointer-events-auto mx-auto w-full max-w-3xl border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85"
        aria-label="Bottennavigation"
      >
        <div className="grid grid-cols-4 gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
          {items.map((item) => {
            const active = isItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-center transition ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="text-lg" aria-hidden="true">
                  {item.icon}
                </span>

                <span className="mt-1 text-[11px] font-semibold leading-tight">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}