import { Search } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { Button, Notice, StatusBadge } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  qualifiedHandle,
  resolveEntity,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type EntityResolution,
} from "../shared/api";

interface EntitySearchProps {
  apiTenantId?: string;
  client: ContextplaneClient;
  /** Called with the entity id once a handle resolves to exactly one entity. */
  onResolved: (entityId: string) => void;
}

type State =
  | { kind: "error"; message: string; requestId: string | null }
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "result"; resolution: EntityResolution };

/**
 * Resolve a handle to one entity, from anywhere in the app.
 *
 * This is not a filter over the current page — it asks the service which entity
 * a name refers to. The difference matters at exactly one point: a bare name
 * that two types both carry. The service refuses that rather than resolving it,
 * because picking one would attach the operator's next action to whichever type
 * sorted first with nothing saying a choice had been made. So this surface
 * presents the refusal as what it is — a question — and offers the qualifying
 * types as buttons that re-ask with the handle qualified.
 *
 * The candidates come from `errors[].entity_types`, never from the message.
 */
export function EntitySearch({ apiTenantId, client, onResolved }: EntitySearchProps) {
  const inputId = useId();
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const attempt = useRef(0);

  const context: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  async function resolve(candidate: string) {
    const request = attempt.current + 1;
    attempt.current = request;
    setState({ kind: "pending" });
    try {
      const resolution = await resolveEntity(client, candidate, context);
      if (attempt.current !== request) return;
      if (resolution.outcome === "resolved") {
        setState({ kind: "idle" });
        setHandle("");
        onResolved(resolution.identity.entity_id);
        return;
      }
      setState({ kind: "result", resolution });
    } catch (error) {
      if (attempt.current !== request) return;
      setState({
        kind: "error",
        message:
          error instanceof ContextplaneApiError && error.status === 403
            ? "The current credential cannot resolve entities in this tenant."
            : "The handle could not be resolved. The service did not answer.",
        requestId: error instanceof ContextplaneApiError ? error.requestId : null,
      });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = handle.trim();
    if (!trimmed) return;
    void resolve(trimmed);
  }

  const resolution = state.kind === "result" ? state.resolution : null;

  return (
    <div className="relative min-w-0 flex-1">
      <form className="flex min-w-0 items-center gap-2" onSubmit={submit} role="search">
        <label className="sr-only" htmlFor={inputId}>
          Resolve an entity handle
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
          />
          <input
            className="min-h-10 w-full rounded-md border border-border bg-surface py-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            id={inputId}
            onChange={(event) => {
              setHandle(event.target.value);
              if (state.kind !== "idle") setState({ kind: "idle" });
            }}
            placeholder="namespace:type/name, or a name"
            type="search"
            value={handle}
          />
        </div>
        <Button disabled={state.kind === "pending" || !handle.trim()} size="compact" type="submit">
          {state.kind === "pending" ? "Resolving…" : "Resolve"}
        </Button>
      </form>

      <p aria-live="polite" className="sr-only">
        {state.kind === "pending"
          ? "Resolving the handle."
          : resolution?.outcome === "ambiguous"
            ? `${resolution.handle} names ${resolution.candidates.length} types. Choose one.`
            : resolution?.outcome === "unknown"
              ? `Nothing in this tenant is named ${resolution.handle}.`
              : ""}
      </p>

      {state.kind === "error" ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-2">
          <Notice title="The handle was not resolved" variant="danger">
            {state.message}
            {state.requestId ? (
              <span className="mt-1 block font-mono text-xs">Request ID: {state.requestId}</span>
            ) : null}
          </Notice>
        </div>
      ) : null}

      {resolution?.outcome === "unknown" ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-2">
          <Notice title="No entity by that handle" variant="info">
            Nothing visible to this tenant is named{" "}
            <span className="font-mono">{resolution.handle}</span>. An entity private to another
            tenant stays hidden rather than being reported as missing differently.
          </Notice>
        </div>
      ) : null}

      {resolution?.outcome === "ambiguous" ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-2">
          <Notice title="That name belongs to more than one type" variant="warning">
            <p>
              <span className="font-mono">{resolution.handle}</span> is carried by{" "}
              {resolution.candidates.length > 0
                ? `${resolution.candidates.length} types`
                : "more than one type"}
              . The service declines to pick one, because doing so would attach your next action to
              whichever sorted first with nothing saying a choice had been made.
            </p>
            {resolution.candidates.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {resolution.candidates.map((entityType) => (
                  <Button
                    key={entityType}
                    onClick={() => {
                      const qualified = qualifiedHandle(resolution.handle, entityType);
                      setHandle(qualified);
                      void resolve(qualified);
                    }}
                    size="compact"
                    variant="secondary"
                  >
                    <StatusBadge>{entityType}</StatusBadge>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-2">
                This deployment did not name the types. Qualify the handle yourself as{" "}
                <span className="font-mono">namespace:type/name</span>.
              </p>
            )}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
