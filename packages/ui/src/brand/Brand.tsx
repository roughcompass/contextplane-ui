import type { HTMLAttributes, Ref } from "react";

import { ContextMark } from "../shell/ContextMark";
import { cn } from "../styles/cn";
import { BRAND } from "./constants";

export interface BrandProps extends HTMLAttributes<HTMLSpanElement> {
  markClassName?: string;
  nameClassName?: string;
  ref?: Ref<HTMLSpanElement>;
}

export function Brand({ className, markClassName, nameClassName, ref, ...props }: BrandProps) {
  return (
    <span ref={ref} className={cn("flex min-w-0 items-center gap-2", className)} {...props}>
      <ContextMark className={cn("size-8 shrink-0", markClassName)} />
      <span
        className={cn(
          "truncate text-sm font-semibold tracking-tight text-foreground",
          nameClassName,
        )}
      >
        {BRAND.name}
      </span>
    </span>
  );
}
