import type { Ref, SVGProps } from "react";

export interface ContextMarkProps extends SVGProps<SVGSVGElement> {
  ref?: Ref<SVGSVGElement>;
}

export function ContextMark({ className, ref, ...props }: ContextMarkProps) {
  return (
    <svg
      ref={ref}
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 32 32"
      {...props}
    >
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <circle cx="10" cy="11" r="2.5" className="fill-accent-foreground" />
      <circle cx="22" cy="10" r="2.5" className="fill-accent-foreground" />
      <circle cx="17" cy="22" r="2.5" className="fill-accent-foreground" />
      <path
        d="m12.2 12.2 3.6 7.5m4.3-7.8-2.1 7.7M12.5 10.8l7-.5"
        className="stroke-accent-foreground"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}
