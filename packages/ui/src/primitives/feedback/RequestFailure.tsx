import { RefreshCw } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { Button } from "../actions/Button";
import { Notice, type NoticeVariant } from "./Notice";

export interface RequestFailureProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  children: ReactNode;
  onRetry: () => void;
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
        <Button onClick={onRetry} variant="inset">
          <RefreshCw aria-hidden="true" className="size-4" />
          {retryLabel}
        </Button>
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
