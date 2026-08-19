import { ChevronRight } from "lucide-react";
import type { HTMLAttributes, Ref } from "react";

import { cn } from "../../styles/cn";

export interface BreadcrumbItem {
  href?: string;
  label: string;
}

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  items: readonly BreadcrumbItem[];
  ref?: Ref<HTMLElement>;
}

export function Breadcrumbs({ className, items, ref, ...props }: BreadcrumbsProps) {
  return (
    <nav ref={ref} aria-label="Breadcrumb" className={cn("min-w-0", className)} {...props}>
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted">
        {items.map((item, index) => {
          const current = index === items.length - 1;

          return (
            <li key={item.href ?? item.label} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-subtle" />
              ) : null}
              {current || !item.href ? (
                <span
                  aria-current={current ? "page" : undefined}
                  className={cn("truncate", current && "font-medium text-foreground")}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  className="truncate rounded-sm hover:text-accent hover:underline"
                  href={item.href}
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
