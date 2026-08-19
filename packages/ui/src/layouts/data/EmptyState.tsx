import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../styles/cn";

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  action?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  ref?: Ref<HTMLDivElement>;
  title: ReactNode;
}

export function EmptyState({
  action,
  className,
  description,
  icon: Icon,
  ref,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div ref={ref} className={cn("px-6 py-12 text-center", className)} {...props}>
      {Icon ? <Icon aria-hidden="true" className="mx-auto size-8 text-subtle" /> : null}
      <p className={cn("text-sm font-medium text-foreground", Icon && "mt-3")}>{title}</p>
      {description ? (
        <div className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted">{description}</div>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
