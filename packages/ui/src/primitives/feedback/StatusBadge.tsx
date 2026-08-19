import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../styles/cn";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  ref?: Ref<HTMLSpanElement>;
  tone?: StatusTone;
}

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-surface-muted text-muted",
  info: "bg-info-subtle text-info",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
};

const toneIcons: Record<StatusTone, LucideIcon> = {
  neutral: CircleDot,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function StatusBadge({
  children,
  className,
  ref,
  tone = "neutral",
  ...props
}: StatusBadgeProps) {
  const Icon = toneIcons[tone];

  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
      {children}
    </span>
  );
}
