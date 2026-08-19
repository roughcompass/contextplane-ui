import { useId, type HTMLAttributes, type ReactNode, type Ref } from "react";

import { cn } from "../../styles/cn";
import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";

export type PageWidth = "narrow" | "settings" | "standard" | "full";

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
  width?: PageWidth;
}

const widthClasses: Record<PageWidth, string> = {
  narrow: "max-w-[600px]",
  settings: "max-w-[800px]",
  standard: "max-w-[1200px]",
  full: "max-w-none",
};

export function PageContainer({
  className,
  ref,
  width = "standard",
  ...props
}: PageContainerProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "mx-auto w-full px-3 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-10",
        widthClasses[width],
        className,
      )}
      {...props}
    />
  );
}

export interface PageHeaderProps extends HTMLAttributes<HTMLElement> {
  actions?: ReactNode;
  breadcrumbs?: readonly BreadcrumbItem[];
  description?: ReactNode;
  eyebrow?: string;
  metadata?: ReactNode;
  ref?: Ref<HTMLElement>;
  title: string;
}

export function PageHeader({
  actions,
  breadcrumbs,
  className,
  description,
  eyebrow,
  metadata,
  ref,
  title,
  ...props
}: PageHeaderProps) {
  const titleId = useId();

  return (
    <header
      ref={ref}
      aria-labelledby={titleId}
      className={cn("mb-8 space-y-5", className)}
      {...props}
    >
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? (
            <p className="mb-2 mt-3  text-xs font-semibold tracking-[0.04em] text-accent uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 id={titleId} className="text-4xl font-bold tracking-tight text-foreground capitalize">
            {title}
          </h1>
          {description ? (
            <div className="mt-1 max-w-full text-base leading-6 text-muted">{description}</div>
          ) : null}
          {metadata ? <div className="mt-2 flex flex-wrap gap-2">{metadata}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
