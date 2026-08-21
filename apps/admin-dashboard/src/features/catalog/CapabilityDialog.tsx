import { Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  Button,
  Notice,
  RequestFailure,
  SearchableSelect,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  assertEntity,
  createCatalogEntity,
  entityWriteIntents,
  getCapability,
  getGoverningBinding,
  type CatalogCapabilitySummary,
  type CatalogEntityType,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type EntityWriteIntent,
} from "../../shared/api";
import { CapabilityConnectionsPanel } from "./CapabilityConnectionsPanel";
import { CapabilityEvidencePanel } from "./CapabilityEvidencePanel";
import { CapabilityOverviewPanel } from "./CapabilityOverviewPanel";

export type CapabilityDialogTarget =
  { entityType: CatalogEntityType; mode: "create" } | { capabilityId: string; mode: "detail" };

/** What each creatable type is called in the copy the operator reads. */
/**
 * How the write reaches the catalog.
 *
 * `direct` is the dedicated create route — `POST /v1/capabilities`,
 * `/v1/concepts`, `/v1/operations` — which takes a name and mints a row. It is
 * the right surface for a producer registering something they own outright, and
 * it is ungoverned: nothing reviews it.
 *
 * The other three are the generic `POST /v1/entities`, which routes by intent:
 * an observation stages a claim, a request opens an owner review entry, and only
 * an authorized approval writes canon. Both surfaces write the same table; which
 * one an operator wants depends on whether the write should be reviewed, so the
 * form asks rather than choosing.
 */
const routeSelectOptions: readonly { label: string; value: string }[] = [
  { label: "Register directly — writes the row, unreviewed", value: "direct" },
  { label: "Observation — stages a claim for review", value: "observation" },
  { label: "Request — opens an owner review entry", value: "request" },
  { label: "Authorized approval — writes canon", value: "authorized_approval" },
];

type WriteRoute = "direct" | "observation" | "request" | "authorized_approval";

function isGoverned(route: WriteRoute): route is EntityWriteIntent {
  return (entityWriteIntents as readonly string[]).includes(route);
}

const entityTypeLabels: Readonly<Record<CatalogEntityType, string>> = {
  capability: "capability",
  concept: "concept",
  operation: "operation",
};

type CapabilityPanel = "connections" | "evidence" | "impact" | "interface" | "overview";

interface CapabilityDialogProps {
  apiTenantId?: string;
  client: ContextplaneClient;
  onClose: () => void;
  onCreated: (capability: CatalogCapabilitySummary) => void;
  target: CapabilityDialogTarget;
  tenantName: string;
}

export const catalogInputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
export const catalogLabelClassName = "block text-xs font-medium text-muted";

function panelFromLocation(): CapabilityPanel {
  const value = new URLSearchParams(window.location.search).get("panel");
  return value === "connections" ||
    value === "evidence" ||
    value === "impact" ||
    value === "interface"
    ? value
    : "overview";
}

function safeFailure(error: unknown): { description: string; requestId: string | null } {
  if (error instanceof ContextplaneApiError) {
    return {
      description:
        error.status === 403
          ? "The current credential cannot access this entity."
          : error.status === 404
            ? "This entity no longer exists or is not visible."
            : "The entity could not be loaded from the service.",
      requestId: error.requestId,
    };
  }
  return { description: "The entity could not be loaded from the service.", requestId: null };
}

function CreateEntityForm({
  client,
  entityType,
  onCreated,
  requestContext,
  tenantName,
}: {
  client: ContextplaneClient;
  entityType: CatalogEntityType;
  onCreated: (capability: CatalogCapabilitySummary) => void;
  requestContext: ContextplaneRequestOptions;
  tenantName: string;
}) {
  const label = entityTypeLabels[entityType];
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const nameId = useId();
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [attributesText, setAttributesText] = useState("{}");
  const [route, setRoute] = useState<WriteRoute>("direct");
  const [approvalReference, setApprovalReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const binding = useQuery({
    enabled: isGoverned(route),
    queryFn: ({ signal }) => getGoverningBinding(client, requestContext, signal),
    queryKey: [
      "contextplane",
      requestContext.tenantId ?? "credential-default",
      "governing-binding",
    ],
  });

  const mutation = useMutation({
    mutationFn: async (attributes: Record<string, unknown>) => {
      if (!isGoverned(route)) {
        const created = await createCatalogEntity(
          client,
          {
            attributes,
            entityType,
            ...(externalId.trim() ? { externalId: externalId.trim() } : {}),
            name: name.trim(),
          },
          requestContext,
        );
        return { created, effect: "registered" as const };
      }
      const governing = binding.data;
      // Unreachable from the form, which will not submit until the binding has
      // resolved. Stated rather than assumed: a governed write with no revision
      // to attest to is the thing this whole task exists to stop sending.
      if (!governing) throw new Error("no governing binding to attest to");
      const result = await assertEntity(
        client,
        {
          ...(approvalReference.trim() ? { approvalReference: approvalReference.trim() } : {}),
          identity: { handle: `core:${entityType}/${name.trim()}` },
          // A fresh key per user-initiated write; a retry of the identical body
          // is the operator pressing submit again, which is a new intent.
          idempotencyKey: crypto.randomUUID(),
          intent: route,
          properties: attributes,
          provenance: {
            externalRecordId: externalId.trim() || "operator-authored",
            observedTime: new Date().toISOString(),
            sourceNamespace: "internal",
            sourceSystem: "admin-dashboard",
          },
          subjectType: `core:${entityType}`,
          targetRevision: {
            bindingRevision: governing.extensionSetDigest,
            profileRevision: governing.profileRevisionId,
          },
          validFrom: new Date().toISOString(),
        },
        requestContext,
      );
      return { effect: result.effect, result };
    },
    onSuccess: (outcome) => {
      void queryClient.invalidateQueries({ queryKey: ["contextplane"] });
      if ("created" in outcome) {
        showToast({
          message: `${outcome.created.name} is now available in the canonical catalog.`,
          title: `${label.charAt(0).toUpperCase()}${label.slice(1)} registered`,
          variant: "success",
        });
        onCreated(outcome.created);
        return;
      }
      // A staged or reviewed write has no row to open yet, so the toast names
      // the effect rather than claiming the entity exists.
      showToast({
        message: `The write was routed as ${outcome.effect.replaceAll("_", " ")}.`,
        title: `${label.charAt(0).toUpperCase()}${label.slice(1)} submitted`,
        variant: "success",
      });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError(`Enter a ${label} name.`);
      return;
    }
    if (route === "authorized_approval" && !approvalReference.trim()) {
      setError("An authorized approval must name the approval it rests on.");
      return;
    }
    if (isGoverned(route) && !binding.data) {
      setError(
        binding.isPending
          ? "Still reading which profile governs this tenant. Try again in a moment."
          : "This tenant is not bound to a profile revision, so there is no governance to write against.",
      );
      return;
    }
    try {
      const value: unknown = JSON.parse(attributesText);
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        setError("Attributes must be a JSON object.");
        return;
      }
      setError(null);
      mutation.mutate(value as Record<string, unknown>);
    } catch {
      setError("Enter valid JSON attributes.");
    }
  }

  return (
    <form className="space-y-5 p-6" onSubmit={submit}>
      <Notice title="Creates canonical tenant state" variant="info">
        This form sends a new {label} to {tenantName}. The service applies entity-type, identity,
        uniqueness, and authorization rules before accepting it.
      </Notice>

      <div className={catalogLabelClassName}>
        <SearchableSelect
          allowEmpty={false}
          label="How this write reaches the catalog"
          onValueChange={(value) => setRoute(value as WriteRoute)}
          options={routeSelectOptions}
          value={route}
        />
        <span className="mt-1 block font-normal text-muted">
          {isGoverned(route)
            ? "The governed surface routes by intent, so the service decides whether this becomes canon or waits for a review."
            : "The dedicated create route writes the row immediately. Nothing reviews it."}
        </span>
      </div>

      {isGoverned(route) && binding.data === null ? (
        <Notice title="No profile is bound" variant="warning">
          This tenant has no active or validating binding, so a governed write has no revision to
          attest to and no governance to validate it. Register directly, or bind a profile first.
        </Notice>
      ) : null}

      {route === "authorized_approval" ? (
        <label className={catalogLabelClassName}>
          Approval reference
          <input
            className={catalogInputClassName}
            onChange={(event) => setApprovalReference(event.target.value)}
            placeholder="The review this write rests on"
            value={approvalReference}
          />
        </label>
      ) : null}
      <label className={catalogLabelClassName} htmlFor={nameId}>
        {label.charAt(0).toUpperCase()}
        {label.slice(1)} name
        <input
          autoFocus
          required
          className={catalogInputClassName}
          id={nameId}
          onChange={(event) => setName(event.target.value)}
          placeholder="Customer identity resolution"
          value={name}
        />
      </label>
      <label className={catalogLabelClassName}>
        External ID
        <input
          className={catalogInputClassName}
          onChange={(event) => setExternalId(event.target.value)}
          placeholder="Optional source identifier"
          value={externalId}
        />
      </label>
      <label className={catalogLabelClassName}>
        Attributes
        <span className="mt-1 block font-normal text-muted">
          Structured JSON governed by the registered schema for this entity type.
        </span>
        <textarea
          aria-invalid={error ? true : undefined}
          className={`${catalogInputClassName} min-h-44 resize-y font-mono leading-6`}
          onChange={(event) => setAttributesText(event.target.value)}
          spellCheck={false}
          value={attributesText}
        />
      </label>
      {error ? (
        <Notice title={`Review the ${label}`} variant="danger">
          {error}
        </Notice>
      ) : null}
      {mutation.isError ? (
        <RequestFailure
          onRetry={() => {
            setError(null);
          }}
          title={`The ${label} was not created`}
        >
          The service rejected the request. Your entered values remain available for correction.
        </RequestFailure>
      ) : null}
      <div className="flex justify-end border-t border-border-subtle pt-5">
        <Button
          disabled={mutation.isPending || (isGoverned(route) && binding.isPending)}
          type="submit"
        >
          <Plus aria-hidden="true" className="size-4" />
          {mutation.isPending ? "Creating…" : `Create ${label}`}
        </Button>
      </div>
    </form>
  );
}

const panels: readonly { id: CapabilityPanel; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Artifacts" },
  { id: "interface", label: "Interface" },
  // "Adoption & subscriptions" until this panel also listed the entity's
  // governed edges. An operator asking what a thing is connected to should not
  // have to know that adoptions and relationships live under different words.
  { id: "connections", label: "Connections" },
  { id: "impact", label: "Version impact" },
];

export function CapabilityDialog({
  apiTenantId,
  client,
  onClose,
  onCreated,
  target,
  tenantName,
}: CapabilityDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState<CapabilityPanel>(panelFromLocation);
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const capabilityId = target.mode === "detail" ? target.capabilityId : null;
  const detail = useQuery({
    enabled: capabilityId !== null,
    queryFn: ({ signal }) => getCapability(client, capabilityId ?? "", requestContext, signal),
    queryKey: [
      "contextplane",
      apiTenantId ?? "credential-default",
      "catalog",
      "capability",
      capabilityId,
    ],
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  function changePanel(nextPanel: CapabilityPanel) {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", nextPanel);
    window.history.replaceState(window.history.state, "", url);
    setPanel(nextPanel);
  }

  const title =
    target.mode === "create"
      ? `Create ${entityTypeLabels[target.entityType]}`
      : detail.data?.name || "Entity detail";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="capability-dialog-title"
      className="m-0 max-h-dvh w-dvw max-w-none overflow-y-auto border-0 bg-surface p-0 text-foreground backdrop:bg-overlay sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(72rem,calc(100dvw-2rem))] sm:rounded-xl sm:border sm:border-border sm:shadow-2xl"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onClose}
    >
      <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
            {target.mode === "create" ? "Canonical catalog" : "Catalog entity"}
          </p>
          <h2 id="capability-dialog-title" className="mt-1 text-xl font-semibold text-foreground">
            {title}
          </h2>
          {detail.data ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="info">{detail.data.lifecycle}</StatusBadge>
              <StatusBadge>{detail.data.entityType}</StatusBadge>
              <span className="break-all font-mono text-xs text-muted">{detail.data.entityId}</span>
            </div>
          ) : null}
        </div>
        <Button
          ref={closeButtonRef}
          aria-label="Close entity"
          onClick={close}
          size="icon"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      {target.mode === "create" ? (
        <CreateEntityForm
          client={client}
          entityType={target.entityType}
          onCreated={onCreated}
          requestContext={requestContext}
          tenantName={tenantName}
        />
      ) : detail.isPending ? (
        <div className="space-y-4 p-6" aria-label="Loading entity" role="status">
          <div className="h-6 w-52 animate-pulse rounded bg-surface-muted" />
          <div className="h-40 animate-pulse rounded bg-surface-muted" />
        </div>
      ) : detail.isError ? (
        <div className="p-6">
          <RequestFailure
            onRetry={() => void detail.refetch()}
            requestId={safeFailure(detail.error).requestId}
            title="Capability unavailable"
          >
            {safeFailure(detail.error).description}
          </RequestFailure>
        </div>
      ) : detail.data ? (
        <>
          <div
            aria-label="Capability tasks"
            className="sticky top-[105px] z-10 flex overflow-x-auto border-b border-border bg-surface px-4"
            role="tablist"
          >
            {panels.map((candidate) => (
              <button
                key={candidate.id}
                aria-controls="capability-panel"
                aria-selected={panel === candidate.id}
                className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  panel === candidate.id
                    ? "border-accent font-semibold text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
                onClick={() => changePanel(candidate.id)}
                role="tab"
                type="button"
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <div id="capability-panel" aria-live="polite" role="tabpanel">
            {panel === "overview" ? (
              <CapabilityOverviewPanel
                capability={detail.data}
                client={client}
                onDeleted={close}
                requestContext={requestContext}
              />
            ) : panel === "connections" ? (
              <CapabilityConnectionsPanel
                capability={detail.data}
                client={client}
                requestContext={requestContext}
              />
            ) : (
              <CapabilityEvidencePanel
                capability={detail.data}
                client={client}
                mode={panel}
                requestContext={requestContext}
              />
            )}
          </div>
        </>
      ) : null}
    </dialog>
  );
}
