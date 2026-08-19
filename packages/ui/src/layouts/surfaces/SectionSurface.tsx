import { useId, type HTMLAttributes, type ReactNode, type Ref } from "react";

import { cn } from "../../styles/cn";

export interface SectionSurfaceProps extends HTMLAttributes<HTMLElement> {
  action?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  flush?: boolean;
  footer?: ReactNode;
  ref?: Ref<HTMLElement>;
  title: string;
}

export function SectionSurface({
  action,
  children,
  className,
  description,
  flush = false,
  footer,
  ref,
  title,
  ...props
}: SectionSurfaceProps) {
  const titleId = useId();

  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}
      {...props}
    >
      <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <div className="mt-1 text-sm leading-6 text-muted">{description}</div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn(!flush && "px-6 pb-6")}>{children}</div>
      {footer ? (
        <footer className="border-t border-border-subtle bg-surface-muted px-6 py-4">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
