import type { HTMLAttributes, Ref } from "react";

import { cn } from "../../styles/cn";

export type SkeletonTone = "default" | "strong";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
  tone?: SkeletonTone;
}

const toneClasses: Record<SkeletonTone, string> = {
  default: "bg-surface-muted",
  strong: "bg-border",
};

export function Skeleton({ className, ref, tone = "default", ...props }: SkeletonProps) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("motion-safe:animate-pulse rounded", toneClasses[tone], className)}
      {...props}
    />
  );
}
