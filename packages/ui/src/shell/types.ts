import type { ReactNode } from "react";

export interface NavigationItem {
  badge?: string;
  href: string;
  icon?: ReactNode;
  label: string;
}

export interface NavigationSection {
  id: string;
  items: readonly NavigationItem[];
  label: string;
}

export interface TenantOption {
  id: string;
  name: string;
}

export interface UserSummary {
  initials: string;
  name: string;
  role?: string;
}
