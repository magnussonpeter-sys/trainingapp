"use client";

import AppTopBar from "@/components/navigation/AppTopBar";
import BottomNav from "@/components/navigation/BottomNav";

type AppLayoutProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
  isAdmin?: boolean;
};

export default function AppLayout({
  children,
  title = "Träningsapp",
  subtitle,
  onLogout,
  isLoggingOut,
  isAdmin,
}: AppLayoutProps) {
  return (
    <>
      <main className="min-h-screen bg-slate-50 pb-28 text-slate-950">
        <AppTopBar
          title={title}
          subtitle={subtitle}
          onLogout={onLogout}
          isLoggingOut={isLoggingOut}
        />

        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {children}
        </div>
      </main>

      <BottomNav isAdmin={isAdmin} />
    </>
  );
}