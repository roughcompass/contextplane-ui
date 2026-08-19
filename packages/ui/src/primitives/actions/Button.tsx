import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "../../styles/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inset";
export type ButtonSize = "default" | "compact" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-accent text-accent-foreground hover:bg-accent-strong active:bg-accent-strong",
  secondary:
    "border-border-strong bg-surface text-foreground hover:border-accent hover:bg-accent-subtle",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-surface-muted",
  danger: "border-danger/40 bg-surface text-danger hover:border-danger hover:bg-danger-subtle",
  inset:
    "border-black/10 bg-black/10 text-foreground hover:border-black/20 hover:bg-black/15 active:bg-black/20 dark:border-black/20 dark:bg-black/20 dark:hover:bg-black/30 dark:active:bg-black/35",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-4",
  compact: "h-11 px-3",
  icon: "size-11 justify-center p-0",
};

export function Button({
  className,
  ref,
  size = "default",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
