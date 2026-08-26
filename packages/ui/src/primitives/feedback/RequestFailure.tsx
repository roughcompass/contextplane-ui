import { RefreshCw } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { Button } from "../actions/Button";
import { Notice, type NoticeVariant } from "./Notice";

export interface RequestFailureProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  children: ReactNode;
  /**
   * Omit when retrying cannot succeed.
   *
   * Required until a permission failure showed what that costs: a caller with no
   * way to suppress the button rendered "Retry request" beside *"you do not have
   * the auditor role"*, which invites a reader to press it forever and reads as a
   * flaky service rather than a settled answer. Not every failure is transient,
   * and a component that assumed so made every caller assert that it was.
   */
  onRetry?: () => void;
  ref?: Ref<HTMLDivElement>;
  requestId?: string | null;
  retryLabel?: string;
  title: string;
  variant?: NoticeVariant;
}

export function RequestFailure({
  children,
  onRetry,
  ref,
  requestId,
  retryLabel = "Retry request",
  title,
  variant = "danger",
  ...props
}: RequestFailureProps) {
  return (
    <Notice
      {...(ref === undefined ? {} : { ref })}
      action={
        onRetry ? (
          <Button onClick={onRetry} variant="inset">
            <RefreshCw aria-hidden="true" className="size-4" />
            {retryLabel}
          </Button>
        ) : null
      }
      title={title}
      variant={variant}
      {...props}
    >
      <div>{children}</div>
      {requestId ? (
        <p className="mt-2 text-xs">
          Request ID: <code>{requestId}</code>
        </p>
      ) : null}
    </Notice>
  );
}
