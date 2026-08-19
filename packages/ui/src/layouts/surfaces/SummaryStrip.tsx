import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../styles/cn";

export interface SummaryItem {
  detail?: ReactNode;
  id: string;
  label: string;
  value: ReactNode;
}

export interface SummaryStripProps extends HTMLAttributes<HTMLElement> {
  items: readonly SummaryItem[];
  label: string;
  ref?: Ref<HTMLElement>;
}

export function SummaryStrip({ className, items, label, ref, ...props }: SummaryStripProps) {
  return (
    <section
      ref={ref}
      aria-label={label}
      className={cn(
        "grid overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
      {...props}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "min-w-0 px-6 py-5",
            index > 0 && "border-t border-border-subtle lg:border-t-0 lg:border-l",
            index === 1 && "sm:border-t-0 sm:border-l",
            index === 2 && "sm:border-l-0 lg:border-l",
            index === 3 && "sm:border-l",
          )}
        >
          <p className="text-xs font-medium text-muted">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {item.value}
          </p>
          {item.detail ? <div className="mt-1 text-xs text-muted">{item.detail}</div> : null}
        </div>
      ))}
    </section>
  );
}
