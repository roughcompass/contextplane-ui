import { Search } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../styles/cn";

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "type"
> {
  className?: string;
  controlClassName?: string;
  hideLabel?: boolean;
  inputClassName?: string;
  label: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function SearchField({
  className,
  controlClassName,
  hideLabel = false,
  inputClassName,
  label,
  ref,
  ...props
}: SearchFieldProps) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className={cn("text-xs font-medium text-muted", hideLabel ? "sr-only" : "block")}>
        {label}
      </span>
      <span
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3",
          "focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
          !hideLabel && "mt-1.5",
          controlClassName,
        )}
      >
        <Search aria-hidden="true" className="size-4 shrink-0 text-subtle" />
        <input
          ref={ref}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle",
            inputClassName,
          )}
          type="search"
          {...props}
        />
      </span>
    </label>
  );
}
