import type { ReactNode } from "react";

import { RequestFailure } from "@repo/ui/primitives";

import { apiFailureKind } from "./apiFailureKind";
import { ContextplaneApiError } from "./client";

/**
 * A failed read, told apart from a refused one.
 *
 * ## Retrying a 403 forever
 *
 * `GET /v1/admin/audit` requires the `auditor` role. An administrator without it
 * — the ordinary case — saw *"Audit history unavailable. The service did not
 * return audit history for the active tenant"* and a **Retry request** button.
 * Every word of that is wrong about what happened: the service answered, it
 * answered definitively, and pressing retry will produce the same answer for as
 * long as somebody keeps pressing. A reader concludes the product is broken.
 *
 * DESIGN.md asks that *"loading, no-data, no-results, unavailable, partial,
 * stale, and failure states are intentionally distinct"*. A refusal and an
 * outage are two of those, and they were one.
 *
 * ## Three states, and only one of them is worth retrying
 *
 * - **Refused** — the caller is not permitted. The service is working. Naming
 *   the missing permission is the whole content, and there is no retry, because
 *   there is nothing to retry.
 * - **Not built here** — `501`. A capability this deployment does not implement
 *   is a permanent answer until somebody implements it, and a retry button
 *   promises otherwise.
 * - **Failed** — anything else. Transient until shown otherwise, so it keeps the
 *   retry it always had.
 *
 * ## Branching on the code, not the message
 *
 * `CLAUDE.md` is explicit that failures are parsed as `errors: [{path, code,
 * message}]` and that callers *"branch on `code`, never display-text
 * `message`"*. `status` is used alongside it because the two disagree usefully:
 * a `401` carries `unauthenticated` and a `403` carries several codes depending
 * on which guard refused, and both are refusals to a reader.
 *
 * The service's own sentence is still shown. It names the role that was missing,
 * which is the one thing a caller needs and the one thing this component cannot
 * know.
 */

interface ApiFailureProps {
  /** What is still true despite the failure. Nothing was written, usually. */
  children: ReactNode;
  error: unknown;
  /** Omitted for a refusal and a 501 — both are answers, not outages. */
  onRetry: () => void;
  /** What could not be loaded, in the reader's terms. "Audit history", not "the request". */
  subject: string;
}

export function ApiFailure({ children, error, onRetry, subject }: ApiFailureProps) {
  const apiError = error instanceof ContextplaneApiError ? error : null;
  const kind = apiFailureKind(error);
  const detail = apiError?.message?.trim();

  if (kind === "refused") {
    return (
      <RequestFailure
        requestId={apiError?.requestId ?? null}
        title={`You do not have access to ${subject}`}
        variant="warning"
      >
        {/* The service names which permission is missing; this cannot, and
            guessing would be worse than quoting. */}
        <p>{detail || "The resolved identity is not permitted to read this."}</p>
        <p className="mt-2">{children}</p>
      </RequestFailure>
    );
  }

  if (kind === "not-built") {
    return (
      <RequestFailure
        requestId={apiError?.requestId ?? null}
        title={`This deployment does not provide ${subject}`}
        variant="info"
      >
        <p>{detail || "The service reports the capability is not implemented."}</p>
        <p className="mt-2">{children}</p>
      </RequestFailure>
    );
  }

  return (
    <RequestFailure
      onRetry={onRetry}
      requestId={apiError?.requestId ?? null}
      title={`${subject} could not be loaded`}
      variant="danger"
    >
      {children}
    </RequestFailure>
  );
}
