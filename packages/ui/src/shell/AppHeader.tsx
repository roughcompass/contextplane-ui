import { CircleHelp, Menu, Moon, Sun } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { Brand } from "../brand/Brand";
import { Button } from "../primitives/actions/Button";
import { SearchableSelect } from "../primitives/forms/SearchableSelect";
import { cn } from "../styles/cn";
import type { TenantOption, UserSummary } from "./types";

export type ColorTheme = "light" | "dark";

export interface AppHeaderProps extends HTMLAttributes<HTMLElement> {
  activeTenantId: string;
  gettingStartedButtonRef?: Ref<HTMLButtonElement>;
  menuButtonRef?: Ref<HTMLButtonElement>;
  onOpenGettingStarted?: () => void;
  onOpenNavigation: () => void;
  onTenantChange?: (tenantId: string) => void;
  onThemeToggle?: () => void;
  ref?: Ref<HTMLElement>;
  /** A shell-wide search surface, rendered between the tenant picker and the actions. */
  search?: ReactNode;
  tenants: readonly TenantOption[];
  theme?: ColorTheme;
  user: UserSummary;
}

export function AppHeader({
  activeTenantId,
  className,
  gettingStartedButtonRef,
  menuButtonRef,
  onOpenGettingStarted,
  onOpenNavigation,
  onTenantChange,
  onThemeToggle,
  ref,
  search,
  tenants,
  theme = "light",
  user,
  ...props
}: AppHeaderProps) {
  return (
    <header
      ref={ref}
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-16 border-b border-border bg-surface/95 backdrop-blur",
        className,
      )}
      {...props}
    >
      <div className="flex h-full items-center">
        <div className="flex h-full min-w-0 items-center gap-3 px-3 sm:px-4 lg:w-64 lg:border-r lg:border-border lg:px-5">
          <Button
            ref={menuButtonRef ?? null}
            aria-label="Open navigation"
            className="lg:hidden"
            onClick={onOpenNavigation}
            size="icon"
            title="Open navigation"
            variant="ghost"
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
          <a
            className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href="/"
          >
            <Brand nameClassName="hidden min-[360px]:block" />
          </a>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 px-3 sm:justify-between sm:px-4 lg:px-6">
          <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
            <SearchableSelect
              allowEmpty={false}
              className="w-48"
              disabled={!onTenantChange || tenants.length < 2}
              hideLabel
              label="Active tenant"
              onValueChange={(value) => onTenantChange?.(value)}
              options={tenants.map((tenant) => ({ label: tenant.name, value: tenant.id }))}
              searchPlaceholder="Search tenants"
              value={activeTenantId}
            />
            {search}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {onOpenGettingStarted ? (
              <Button
                ref={gettingStartedButtonRef ?? null}
                aria-haspopup="dialog"
                aria-label="Open getting started walkthrough"
                onClick={onOpenGettingStarted}
                size="icon"
                title="Open getting started walkthrough"
                variant="ghost"
              >
                <CircleHelp aria-hidden="true" className="size-5" />
              </Button>
            ) : null}
            {onThemeToggle ? (
              <Button
                aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
                onClick={onThemeToggle}
                size="icon"
                title={`Use ${theme === "light" ? "dark" : "light"} theme`}
                variant="ghost"
              >
                {theme === "light" ? (
                  <Moon aria-hidden="true" className="size-5" />
                ) : (
                  <Sun aria-hidden="true" className="size-5" />
                )}
              </Button>
            ) : null}
            <div className="ml-1 flex min-h-11 items-center gap-3 border-l border-border pl-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-accent-strong"
              >
                {user.initials}
              </span>
              <span className="hidden min-w-0 lg:block">
                <span className="block max-w-36 truncate text-sm font-medium text-foreground">
                  {user.name}
                </span>
                {user.role ? (
                  <span className="block max-w-36 truncate text-xs text-muted">{user.role}</span>
                ) : null}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
