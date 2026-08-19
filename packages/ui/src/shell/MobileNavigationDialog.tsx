import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { Brand } from "../brand/Brand";
import { Button } from "../primitives/actions/Button";
import { SearchableSelect } from "../primitives/forms/SearchableSelect";
import { AppSidebar } from "./AppSidebar";
import type { NavigationSection, TenantOption } from "./types";

export interface MobileNavigationDialogProps {
  activeHref: string;
  activeTenantId: string;
  footer?: ReactNode;
  navigation: readonly NavigationSection[];
  onOpenChange: (open: boolean) => void;
  onTenantChange?: (tenantId: string) => void;
  open: boolean;
  tenants: readonly TenantOption[];
}

export function MobileNavigationDialog({
  activeHref,
  activeTenantId,
  footer,
  navigation,
  onOpenChange,
  onTenantChange,
  open,
  tenants,
}: MobileNavigationDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Primary navigation"
      className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,calc(100dvw-2rem))] max-w-none overflow-hidden border-0 bg-surface p-0 text-foreground backdrop:bg-overlay open:flex open:flex-col lg:hidden"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
        <a className="flex items-center gap-2 rounded-md" href="/">
          <Brand />
        </a>
        <Button
          ref={closeButtonRef}
          aria-label="Close navigation"
          onClick={() => onOpenChange(false)}
          size="icon"
          title="Close navigation"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>
      <div className="shrink-0 border-b border-border px-4 py-4">
        <SearchableSelect
          allowEmpty={false}
          disabled={!onTenantChange || tenants.length < 2}
          label="Active tenant"
          onValueChange={(value) => {
            onTenantChange?.(value);
            onOpenChange(false);
          }}
          options={tenants.map((tenant) => ({ label: tenant.name, value: tenant.id }))}
          searchPlaceholder="Search tenants"
          value={activeTenantId}
        />
      </div>
      <AppSidebar
        activeHref={activeHref}
        className="min-h-0 flex-1"
        footer={footer}
        navigation={navigation}
        onNavigate={() => onOpenChange(false)}
      />
    </dialog>
  );
}
