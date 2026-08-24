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
  /**
   * The group heading, or absent for a section that is not a group.
   *
   * Absent is not the same as `""`. A landing entry that belongs to no group has
   * no heading to render, and giving it an empty one would put an unnamed
   * `region` landmark in the navigation — a landmark a screen reader announces
   * and cannot name, which is worse than the entry simply being a list item.
   */
  label?: string;
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
