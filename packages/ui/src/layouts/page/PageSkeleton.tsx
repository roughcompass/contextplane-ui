import type { HTMLAttributes, Ref } from "react";

import { Skeleton } from "../../primitives/feedback/Skeleton";
import { cn } from "../../styles/cn";
import { PageContainer } from "./Page";

export interface PageSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  controls?: 2 | 4 | 5;
  ref?: Ref<HTMLDivElement>;
  rows?: number;
}

const controlGridClasses: Record<NonNullable<PageSkeletonProps["controls"]>, string> = {
  2: "sm:grid-cols-2",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-5",
};

export function PageSkeleton({
  className,
  controls = 4,
  ref,
  rows = 5,
  ...props
}: PageSkeletonProps) {
  return (
    <div
      ref={ref}
      aria-busy="true"
      aria-label="Loading page"
      className={className}
      role="status"
      {...props}
    >
      <span className="sr-only">Loading page</span>
      <PageContainer>
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-5 w-[min(40rem,90%)]" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-52 max-w-full rounded-full" />
          </div>
        </div>

        <div className="mt-6 space-y-6" aria-hidden="true">
          <div className="rounded-lg border border-border bg-surface p-6">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-3 h-4 w-[min(36rem,90%)]" />
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="px-6 py-5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="mt-3 h-4 w-[min(32rem,85%)]" />
            </div>
            <div
              className={cn(
                "grid gap-3 border-y border-border-subtle bg-surface-muted px-4 py-4",
                controlGridClasses[controls],
              )}
            >
              {Array.from({ length: controls }, (_, index) => (
                <div key={index}>
                  <Skeleton className="mb-2 h-3 w-20" tone="strong" />
                  <Skeleton className="h-11 w-full" tone="strong" />
                </div>
              ))}
            </div>
            <div className="overflow-hidden">
              <div className="grid grid-cols-4 gap-4 border-b border-border bg-surface-muted px-5 py-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-3 w-20 max-w-full" tone="strong" />
                ))}
              </div>
              {Array.from({ length: rows }, (_, index) => (
                <div
                  key={index}
                  className={cn(
                    "grid min-h-14 grid-cols-4 items-center gap-4 px-5",
                    index < rows - 1 && "border-b border-border-subtle",
                  )}
                >
                  <Skeleton className="h-4 w-32 max-w-full" />
                  <Skeleton className="h-4 w-24 max-w-full" />
                  <Skeleton className="h-4 w-20 max-w-full" />
                  <Skeleton className="h-6 w-24 max-w-full rounded-full" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
