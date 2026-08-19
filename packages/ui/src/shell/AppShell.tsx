import { useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from "react";

import { cn } from "../styles/cn";
import { AppHeader, type ColorTheme } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { MobileNavigationDialog } from "./MobileNavigationDialog";
import type { NavigationSection, TenantOption, UserSummary } from "./types";

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  activeHref: string;
  activeTenantId: string;
  children: ReactNode;
  gettingStartedButtonRef?: Ref<HTMLButtonElement>;
  navigation: readonly NavigationSection[];
  navigationFooter?: ReactNode;
  onOpenGettingStarted?: () => void;
  onTenantChange?: (tenantId: string) => void;
  onThemeToggle?: () => void;
  ref?: Ref<HTMLDivElement>;
  tenants: readonly TenantOption[];
  theme?: ColorTheme;
  user: UserSummary;
}

export function AppShell({
  activeHref,
  activeTenantId,
  children,
  className,
  gettingStartedButtonRef,
  navigation,
  navigationFooter,
  onOpenGettingStarted,
  onTenantChange,
  onThemeToggle,
  ref,
  tenants,
  theme = "light",
  user,
  ...props
}: AppShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  function setNavigationOpen(open: boolean) {
    setMobileNavigationOpen(open);
    if (!open) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  return (
    <div ref={ref} className={cn("min-h-screen bg-canvas", className)} {...props}>
      <a
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <AppHeader
        activeTenantId={activeTenantId}
        menuButtonRef={menuButtonRef}
        onOpenNavigation={() => setNavigationOpen(true)}
        tenants={tenants}
        theme={theme}
        user={user}
        {...(gettingStartedButtonRef ? { gettingStartedButtonRef } : {})}
        {...(onOpenGettingStarted ? { onOpenGettingStarted } : {})}
        {...(onTenantChange ? { onTenantChange } : {})}
        {...(onThemeToggle ? { onThemeToggle } : {})}
      />
      <div className="pt-16 lg:pl-64">
        <AppSidebar
          activeHref={activeHref}
          className="fixed inset-y-0 left-0 top-16 hidden w-64 border-r border-border lg:flex"
          footer={navigationFooter}
          navigation={navigation}
        />
        <main id="main-content" className="min-h-[calc(100vh-4rem)]" tabIndex={-1}>
          {children}
        </main>
      </div>
      <MobileNavigationDialog
        activeHref={activeHref}
        activeTenantId={activeTenantId}
        footer={navigationFooter}
        navigation={navigation}
        onOpenChange={setNavigationOpen}
        open={mobileNavigationOpen}
        tenants={tenants}
        {...(onTenantChange ? { onTenantChange } : {})}
      />
    </div>
  );
}
