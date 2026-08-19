import { StatusBadge, type StatusBadgeProps } from "./StatusBadge";

export interface ImpactBadgeProps extends Omit<StatusBadgeProps, "children" | "tone"> {
  highImpact: boolean;
}

export function ImpactBadge({ highImpact, ...props }: ImpactBadgeProps) {
  return (
    <StatusBadge tone={highImpact ? "warning" : "neutral"} {...props}>
      {highImpact ? "High impact" : "No high-impact flag"}
    </StatusBadge>
  );
}
