"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// En enkel typ för bottennavigationens länkar.
type BottomNavItem = {
  href: string;
  label: string;
  icon: string;
};

// Props hålls små så komponenten blir lätt att återanvända.
type BottomNavProps = {
  isAdmin?: boolean;
};

// Standardval för vanliga användare.
function getBaseItems(): BottomNavItem[] {
  return [
    { href: "/home", label: "Hem", icon: "🏠" },
    { href: "/history", label: "Historik", icon: "📈" },
    { href: "/gyms", label: "Gym", icon: "🏋️" },
    { href: "/settings", label: "Inställningar", icon: "⚙️" },
  ];
}

export default function BottomNav({ isAdmin = false }: BottomNavProps) {
  const pathname = usePathname();

  // Lägg bara till admin-länk för admin-användare.
  const items = isAdmin
    ? [...getBaseItems(), { href: "/admin/users", label: "Admin", icon: "🛡️" }]
    : getBaseItems();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
      aria-label="Bottennavigation"
    >
      <div className="mx-auto grid w-full max-w-3xl grid-cols-4 gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
        {items.slice(0, 4).map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/home" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-center transition ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
              aria-current={isActive ? "page" : undefined}
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
  );
}