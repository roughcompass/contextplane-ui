import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../styles/cn";

export type NoticeVariant = "info" | "success" | "warning" | "danger";

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  action?: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
  title: string;
  variant?: NoticeVariant;
}

const variantClasses: Record<NoticeVariant, string> = {
  info: "border-info/25 bg-info-subtle text-info",
  success: "border-success/25 bg-success-subtle text-success",
  warning: "border-warning/25 bg-warning-subtle text-warning",
  danger: "border-danger/25 bg-danger-subtle text-danger",
};

const variantIcons: Record<NoticeVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export function Notice({
  action,
  children,
  className,
  ref,
  role,
  title,
  variant = "info",
  ...props
}: NoticeProps) {
  const Icon = variantIcons[variant];

  return (
    <div
      ref={ref}
      role={role ?? (variant === "danger" ? "alert" : undefined)}
      className={cn(
        "flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 gap-3">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <div className="mt-1 text-sm leading-6 text-foreground/80">{children}</div>
        </div>
      </div>
      {action ? <div className="shrink-0 sm:pl-4">{action}</div> : null}
    </div>
  );
}
