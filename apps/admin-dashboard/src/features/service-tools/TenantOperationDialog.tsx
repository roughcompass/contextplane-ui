import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button, Notice, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  executeAdminOperation,
  type ContextplaneClient,
} from "../../shared/api";
import type { TenantOperationDefinition } from "./tenantOperations";

interface TenantOperationDialogProps {
  apiTenantId?: string;
  client: ContextplaneClient;
  onClose: () => void;
  operation: TenantOperationDefinition;
}

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";

function formatName(name: string): string {
  return name.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function initialValues(
  names: readonly string[] | undefined,
  tenantId: string | undefined,
): Record<string, string> {
  return Object.fromEntries(
    (names ?? []).map((name) => [name, name === "tenant_id" ? (tenantId ?? "") : ""]),
  );
}

function isHighImpact(operation: TenantOperationDefinition): boolean {
  return (
    operation.method === "DELETE" ||
    /activate|discard|lifecycle|reject|reverse|revoke|rollback|supersede|withdraw/.test(
      operation.path,
    )
  );
}

function safeFailure(error: unknown): {
  description: string;
  requestId: string | null;
  title: string;
} {
  if (!(error instanceof ContextplaneApiError)) {
    return {
      description: "The tenant request could not be completed. Review the inputs and try again.",
      requestId: null,
      title: "Request failed",
    };
  }

  const byStatus: Readonly<Record<number, { description: string; title: string }>> = {
    401: { description: "Sign in again before retrying this operation.", title: "Session expired" },
    403: {
      description:
        "The current credential does not have authority for this operation in the selected tenant.",
      title: "Access denied",
    },
    404: {
      description: "The referenced tenant resource no longer exists or is not visible.",
      title: "Resource not found",
    },
    409: {
      description:
        "The requested change conflicts with current service state. Refresh the related workflow before retrying.",
      title: "Change conflicts with current state",
    },
    412: {
      description:
        "This resource changed after it was loaded. Keep the intended change, inspect the latest state, and retry only after review.",
      title: "Newer state is available",
    },
    422: {
      description:
        "One or more identifiers, query values, or JSON fields do not satisfy the service contract.",
      title: "Review the request",
    },
    429: {
      description: "The service is limiting requests. Wait before trying again.",
      title: "Rate limit reached",
    },
    501: {
      description: "This contract operation is not enabled by the current deployment.",
      title: "Capability unavailable",
    },
    503: {
      description: "The tenant service is temporarily unavailable. No success should be assumed.",
      title: "Service unavailable",
    },
  };
  const failure = byStatus[error.status] ?? {
    description: "The service did not complete this request. No success should be assumed.",
    title: "Request failed",
  };
  return { ...failure, requestId: error.requestId };
}

export function TenantOperationDialog({
  apiTenantId,
  client,
  onClose,
  operation,
}: TenantOperationDialogProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [pathValues, setPathValues] = useState<Record<string, string>>(() =>
    initialValues(operation.pathParameters, apiTenantId),
  );
  const [queryValues, setQueryValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (operation.queryParameters ?? []).map((parameter) => [
        parameter.name,
        parameter.defaultValue ?? "",
      ]),
    ),
  );
  const [bodyText, setBodyText] = useState(() =>
    operation.bodyExample === undefined ? "" : JSON.stringify(operation.bodyExample, null, 2),
  );
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [ifMatch, setIfMatch] = useState("");
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const highImpact = isHighImpact(operation);
  const supportsPrecondition = ["DELETE", "PATCH", "PUT"].includes(operation.method);

  const mutation = useMutation({
    mutationFn: async (body: unknown) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        return await executeAdminOperation(
          client,
          {
            ...(body === undefined ? {} : { body }),
            ...(ifMatch.trim() ? { headers: { "If-Match": ifMatch.trim() } } : {}),
            ...(operation.idempotentCreate ? { idempotencyKey: crypto.randomUUID() } : {}),
            method: operation.method,
            path: operation.path,
            pathValues,
            queryValues,
          },
          apiTenantId ? { tenantId: apiTenantId } : {},
          controller.signal,
        );
      } finally {
        abortControllerRef.current = null;
      }
    },
    onSuccess: () => {
      setCompletedAt(new Date().toISOString());
      void queryClient.invalidateQueries({ queryKey: ["contextplane"] });
      showToast({
        message: "The service accepted and completed the requested tenant operation.",
        title: operation.title,
        variant: "success",
      });
    },
  });

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    closeButtonRef.current?.focus();
    return () => abortControllerRef.current?.abort();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBodyError(null);
    let body: unknown = undefined;
    if (operation.bodyExample !== undefined) {
      try {
        body = JSON.parse(bodyText) as unknown;
      } catch {
        setBodyError("Enter valid JSON before continuing.");
        return;
      }
    }
    mutation.mutate(body);
  }

  function close() {
    abortControllerRef.current?.abort();
    dialogRef.current?.close();
  }

  const failure = mutation.isError ? safeFailure(mutation.error) : null;
  const canSubmit =
    !mutation.isPending && (!operation.confirmationRequired || confirmation === "CONFIRM");

  return (
    <dialog
      ref={dialogRef}
      aria-describedby="tenant-operation-description"
      aria-labelledby="tenant-operation-title"
      className="m-0 max-h-dvh w-dvw max-w-none overflow-y-auto border-0 bg-surface p-0 text-foreground backdrop:bg-overlay sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(48rem,calc(100dvw-2rem))] sm:rounded-xl sm:border sm:border-border sm:shadow-2xl"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onClose}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="info">Tenant operation</StatusBadge>
            {operation.method === "GET" ? <StatusBadge>Read only</StatusBadge> : null}
            {highImpact ? <StatusBadge tone="danger">High impact</StatusBadge> : null}
          </div>
          <h2 id="tenant-operation-title" className="mt-3 text-lg font-semibold text-foreground">
            {operation.title}
          </h2>
          <p id="tenant-operation-description" className="mt-1 text-sm text-muted">
            Review the exact target and inputs before sending this service-authoritative request.
          </p>
        </div>
        <Button
          ref={closeButtonRef}
          aria-label="Close operation"
          onClick={close}
          size="icon"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </header>

      <form className="space-y-6 p-6" onSubmit={submit}>
        <div className="rounded-lg border border-border bg-surface-muted p-4">
          <p className="text-xs font-medium tracking-[0.04em] text-muted uppercase">
            Service target
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            <span className="font-semibold text-accent">{operation.method}</span> {operation.path}
          </p>
        </div>

        <Notice title="Permission and tenant scope remain server-side" variant="info">
          The service independently verifies the active credential, selected tenant, visibility,
          ownership, and transition rules. A visible operation is not a grant of authority.
        </Notice>

        {(operation.pathParameters?.length ?? 0) > 0 ? (
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">Resource identifiers</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {operation.pathParameters?.map((name) => (
                <label key={name} className={labelClassName}>
                  {formatName(name)}
                  <input
                    required
                    autoComplete="off"
                    className={`${inputClassName} mt-1.5`}
                    name={name}
                    onChange={(event) =>
                      setPathValues((current) => ({ ...current, [name]: event.target.value }))
                    }
                    value={pathValues[name] ?? ""}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {(operation.queryParameters?.length ?? 0) > 0 ? (
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">Query inputs</legend>
            <p className="mt-1 text-sm text-muted">
              Blank values are omitted. Opaque cursors are sent unchanged.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {operation.queryParameters?.map((parameter) => (
                <label key={parameter.name} className={labelClassName}>
                  {formatName(parameter.name)}
                  <input
                    autoComplete="off"
                    className={`${inputClassName} mt-1.5`}
                    name={parameter.name}
                    onChange={(event) =>
                      setQueryValues((current) => ({
                        ...current,
                        [parameter.name]: event.target.value,
                      }))
                    }
                    value={queryValues[parameter.name] ?? ""}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {supportsPrecondition ? (
          <label className={labelClassName}>
            If-Match precondition
            <span className="mt-1 block font-normal text-muted">
              Optional. Paste the latest ETag when the service provides one; never reuse an older
              version after a conflict.
            </span>
            <input
              autoComplete="off"
              className={`${inputClassName} mt-2 font-mono`}
              onChange={(event) => setIfMatch(event.target.value)}
              placeholder='For example, "revision-tag"'
              value={ifMatch}
            />
          </label>
        ) : null}

        {operation.bodyExample !== undefined ? (
          <label className={labelClassName}>
            Request body
            <span className="mt-1 block font-normal text-muted">
              JSON matching {operation.requestSchema ?? "the documented request schema"}. Empty
              example values must be replaced where the contract requires them.
            </span>
            <textarea
              aria-describedby={bodyError ? "tenant-body-error" : undefined}
              aria-invalid={bodyError ? true : undefined}
              className={`${inputClassName} mt-2 min-h-56 resize-y font-mono leading-6`}
              onChange={(event) => setBodyText(event.target.value)}
              spellCheck={false}
              value={bodyText}
            />
            {bodyError ? (
              <span id="tenant-body-error" className="mt-2 block text-sm font-medium text-danger">
                {bodyError}
              </span>
            ) : null}
          </label>
        ) : null}

        {operation.confirmationRequired ? (
          <div
            className={`rounded-lg border p-4 ${
              highImpact
                ? "border-danger/40 bg-danger-subtle"
                : "border-warning/40 bg-warning-subtle"
            }`}
          >
            <div className="flex gap-3">
              <AlertTriangle
                aria-hidden="true"
                className={`mt-0.5 size-5 shrink-0 ${highImpact ? "text-danger" : "text-warning"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {highImpact
                    ? "This operation can withdraw, replace, or invalidate governed state."
                    : "This operation changes tenant state."}
                </p>
                <label className={`${labelClassName} mt-3`}>
                  Type CONFIRM to enable this operation
                  <input
                    autoComplete="off"
                    className={`${inputClassName} mt-1.5`}
                    onChange={(event) => setConfirmation(event.target.value)}
                    value={confirmation}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {failure ? (
          <Notice title={failure.title} variant="danger">
            {failure.description}
            {failure.requestId ? (
              <span className="mt-2 block font-mono text-xs">Request ID: {failure.requestId}</span>
            ) : null}
          </Notice>
        ) : null}

        {mutation.isSuccess ? (
          <section
            aria-live="polite"
            className="rounded-lg border border-success/40 bg-success-subtle p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <CheckCircle2 aria-hidden="true" className="size-5" />
              Operation completed
            </div>
            {completedAt ? (
              <p className="mt-2 text-xs text-muted">
                Completed <time dateTime={completedAt}>{completedAt}</time>
              </p>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                View structured service response
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-surface p-4 text-xs leading-5 text-foreground">
                {JSON.stringify(mutation.data, null, 2) ?? "No response body"}
              </pre>
            </details>
          </section>
        ) : null}

        <footer className="flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:justify-end">
          <Button onClick={close} type="button" variant="secondary">
            Close
          </Button>
          <Button disabled={!canSubmit} type="submit" variant={highImpact ? "danger" : "primary"}>
            {mutation.isPending
              ? "Running…"
              : operation.method === "GET"
                ? "Run query"
                : "Confirm and run"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
