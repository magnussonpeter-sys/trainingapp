"use client";

import BottomNav from "@/components/navigation/BottomNav";
import AppTopBar from "@/components/app-shell/app-top-bar";

type AppPageProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
  isAdmin?: boolean;
  rightSlot?: React.ReactNode;
  showBottomNav?: boolean;
};

// Appens gemensamma sidskal enligt Fas A.
export default function AppPage({
  children,
  title = "Träningsapp",
  subtitle,
  backHref,
  backLabel,
  onLogout,
  isLoggingOut,
  isAdmin = false,
  rightSlot,
  showBottomNav = true,
}: AppPageProps) {
  return (
    <>
      <main className={`min-h-screen bg-slate-50 text-slate-950 ${showBottomNav ? "pb-28" : ""}`.trim()}>
        <AppTopBar
          title={title}
          subtitle={subtitle}
          backHref={backHref}
          backLabel={backLabel}
          onLogout={onLogout}
          isLoggingOut={isLoggingOut}
          rightSlot={rightSlot}
        />

        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {children}
        </div>
      </main>

      {showBottomNav ? <BottomNav isAdmin={isAdmin} /> : null}
    </>
  );
}