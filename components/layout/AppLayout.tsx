"use client";

import AppPage from "@/components/app-shell/app-page";

type AppLayoutProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
  isAdmin?: boolean;
  backHref?: string;
  backLabel?: string;
  rightSlot?: React.ReactNode;
  showBottomNav?: boolean;
};

// Kompatibilitetslager så befintliga sidor fortsätter fungera.
export default function AppLayout({
  children,
  title = "Träningsapp",
  subtitle,
  onLogout,
  isLoggingOut,
  isAdmin,
  backHref,
  backLabel,
  rightSlot,
  showBottomNav = true,
}: AppLayoutProps) {
  return (
    <AppPage
      title={title}
      subtitle={subtitle}
      onLogout={onLogout}
      isLoggingOut={isLoggingOut}
      isAdmin={isAdmin}
      backHref={backHref}
      backLabel={backLabel}
      rightSlot={rightSlot}
      showBottomNav={showBottomNav}
    >
      {children}
    </AppPage>
  );
}