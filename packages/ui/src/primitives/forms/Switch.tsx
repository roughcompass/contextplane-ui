import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "../../styles/cn";

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "aria-label" | "children" | "onChange" | "onClick" | "role"
> {
  checked: boolean;
  checkedLabel?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  ref?: Ref<HTMLButtonElement>;
  uncheckedLabel?: string;
}

export function Switch({
  checked,
  checkedLabel = "On",
  className,
  label,
  onCheckedChange,
  ref,
  type = "button",
  uncheckedLabel = "Off",
  ...props
}: SwitchProps) {
  return (
    <button
      ref={ref}
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground",
        "transition-colors duration-150 hover:bg-surface-muted motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type={type}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 motion-reduce:transition-none",
          checked ? "border-accent bg-accent" : "border-border-strong bg-surface-muted",
        )}
      >
        <span
          className={cn(
            "absolute left-1 top-1 size-4 rounded-full transition-transform duration-150 motion-reduce:transition-none",
            checked ? "translate-x-5 bg-accent-foreground" : "translate-x-0 bg-foreground",
          )}
        />
      </span>
      <span aria-hidden="true">{checked ? checkedLabel : uncheckedLabel}</span>
    </button>
  );
}
