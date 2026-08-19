import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../styles/cn";

export interface DataToolbarProps extends HTMLAttributes<HTMLDivElement> {
  actions?: ReactNode;
  filters?: ReactNode;
  ref?: Ref<HTMLDivElement>;
  resultSummary?: ReactNode;
  search?: ReactNode;
}

export function DataToolbar({
  actions,
  className,
  filters,
  ref,
  resultSummary,
  search,
  ...props
}: DataToolbarProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-4 border-y border-border-subtle bg-surface-muted px-4 py-4",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
        {search ? <div className="w-full sm:max-w-sm">{search}</div> : null}
        {filters ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{filters}</div>
        ) : null}
      </div>
      {resultSummary || actions ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          {resultSummary ? (
            <div aria-atomic="true" aria-live="polite" className="min-w-0 text-xs text-muted">
              {resultSummary}
            </div>
          ) : null}
          {actions ? (
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto sm:shrink-0">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
