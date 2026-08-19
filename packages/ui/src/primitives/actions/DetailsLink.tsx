import { ChevronRight } from "lucide-react";
import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../styles/cn";

export interface DetailsLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
}

export function DetailsLink({
  children = "View details",
  className,
  ref,
  ...props
}: DetailsLinkProps) {
  return (
    <a
      ref={ref}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-sm font-medium whitespace-nowrap text-accent transition-colors duration-150 hover:text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
    </a>
  );
}
