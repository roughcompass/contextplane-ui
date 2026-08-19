import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../styles/cn";

export interface DetailLayoutProps extends HTMLAttributes<HTMLDivElement> {
  aside: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function DetailLayout({ aside, children, className, ref, ...props }: DetailLayoutProps) {
  return (
    <div
      ref={ref}
      className={cn("grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]", className)}
      {...props}
    >
      <div className="min-w-0">{children}</div>
      <aside className="min-w-0 xl:sticky xl:top-24">{aside}</aside>
    </div>
  );
}
