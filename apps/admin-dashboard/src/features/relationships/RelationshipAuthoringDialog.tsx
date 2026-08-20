import { Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button, Notice, RequestFailure, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  createRelationship,
  getGoverningBinding,
  getRelationship,
  relationshipWriteIntents,
  updateRelationship,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type GovernedRelationship,
  type RelationshipWriteInput,
  type RelationshipWriteIntent,
  type RelationshipWriteResult,
} from "../../shared/api";

/** The refusal code a stale `If-Match` comes back with. */
const PRECONDITION_FAILED = "precondition_failed";

export type RelationshipAuthoringTarget =
  { mode: "create" } | { mode: "edit"; relationshipId: string };

interface RelationshipAuthoringDialogProps {
  apiTenantId?: string;
  client: ContextplaneClient;
  onClose: () => void;
  onWritten: (result: RelationshipWriteResult) => void;
  target: RelationshipAuthoringTarget;
  tenantName: string;
}

interface Draft {
  approvalReference: string;
  destinationEntityId: string;
  intent: RelationshipWriteIntent;
  properties: string;
  sourceEntityId: string;
  subjectType: string;
  validFrom: string;
}

const intentLabels: Readonly<Record<RelationshipWriteIntent, string>> = {
  authorized_approval: "Authorized approval — writes the canonical edge",
  observation: "Observation — stages a claim",
  request: "Request — opens an owner review entry",
};

const emptyDraft: Draft = {
  approvalReference: "",
  destinationEntityId: "",
  intent: "observation",
  properties: "{}",
  sourceEntityId: "",
  subjectType: "",
  validFrom: "",
};

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";

function draftFrom(relationship: GovernedRelationship): Draft {
  return {
    approvalReference: "",
    destinationEntityId: relationship.endpoints.destination_entity_id,
    // A supersession is a canonical write by definition — the staged routes
    // record nothing that names the edge, so offering them here would let an
    // operator "edit" an edge and change nothing about it.
    intent: "authorized_approval",
    properties: JSON.stringify(relationship.properties, null, 2),
    sourceEntityId: relationship.endpoints.source_entity_id,
    subjectType: relationship.relationship_type,
    validFrom: relationship.temporal.effective_from ?? "",
  };
}

/**
 * Author one governed relationship: create an edge, or supersede one.
 *
 * **The validator travels with the draft, not with the adapter.** A read hands
 * back its `ETag`; this component holds it beside the values the operator is
 * editing and sends it as `If-Match`. A stale one comes back `412`, and the
 * draft survives: the newer state is fetched and shown beside what was typed,
 * and nothing is submitted again until the operator says so. An editor that
 * discarded the draft on a conflict would punish the person who lost a race
 * they could not see.
 *
 * **`target_revision` sends the bound `profile_revision_id`.** That is the only
 * revision identifier a client can read, and the field is required. It is also
 * read by nothing on the service — see E19-T5 — so this is what a caller can
 * truthfully attest to rather than the `"1.0.0"` the integration suite happens
 * to send.
 */
export function RelationshipAuthoringDialog({
  apiTenantId,
  client,
  onClose,
  onWritten,
  target,
  tenantName,
}: RelationshipAuthoringDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fieldId = useId();

  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const relationshipId = target.mode === "edit" ? target.relationshipId : null;

  // `null` means "whatever is stored". The draft materializes on the first edit,
  // and again at submit time, so a conflict refetch cannot move it underneath an
  // operator who submitted without typing anything.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState<GovernedRelationship | null>(null);
  const [error, setError] = useState<string | null>(null);

  const binding = useQuery({
    queryFn: ({ signal }) => getGoverningBinding(client, requestContext, signal),
    queryKey: ["contextplane", apiTenantId ?? "credential-default", "governing-binding"],
  });

  const detail = useQuery({
    enabled: relationshipId !== null,
    queryFn: ({ signal }) => getRelationship(client, relationshipId ?? "", requestContext, signal),
    queryKey: ["contextplane", apiTenantId ?? "credential-default", "relationship", relationshipId],
  });

  // Derived, not synchronized. An effect copying the stored row into state would
  // overwrite the operator's edits every time the query refreshed.
  const storedRelationship = detail.data?.relationship ?? null;
  const values = draft ?? (storedRelationship ? draftFrom(storedRelationship) : emptyDraft);
  const etag = detail.data?.etag ?? null;

  function edit(patch: Partial<Draft>) {
    setDraft({ ...values, ...patch });
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    }
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  const mutation = useMutation({
    mutationFn: (input: RelationshipWriteInput) =>
      relationshipId
        ? updateRelationship(
            client,
            relationshipId,
            input,
            requestContext,
            undefined,
            etag ?? undefined,
          )
        : createRelationship(client, input, requestContext),
    onError: async (caught: unknown) => {
      if (caught instanceof ContextplaneApiError && caught.code === PRECONDITION_FAILED) {
        // Keep the draft, refetch, show the newer state. The operator decides
        // what to do about the difference; the app does not decide for them.
        const refreshed = await detail.refetch();
        if (refreshed.data) setConflict(refreshed.data.relationship);
        return;
      }
      setError(
        caught instanceof ContextplaneApiError && caught.status === 403
          ? "The current credential cannot write relationships in this tenant."
          : "The service refused the write. Your entered values remain available for correction.",
      );
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["contextplane"] });
      showToast({
        message:
          result.effect === "canonical_assertion_write"
            ? `The canonical edge is recorded as ${result.relationship_id}.`
            : `The write was routed as ${result.effect.replaceAll("_", " ")}.`,
        title: relationshipId ? "Relationship superseded" : "Relationship written",
        variant: "success",
      });
      onWritten(result);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConflict(null);
    // Pin the draft before writing. Without this, an operator who submitted the
    // stored values unedited would see them replaced by the conflict refetch.
    setDraft(values);

    const revision = binding.data?.profileRevisionId;
    if (!revision) {
      setError(
        "This tenant is not bound to a profile revision, so there is no governance to write against.",
      );
      return;
    }
    if (
      !values.subjectType.trim() ||
      !values.sourceEntityId.trim() ||
      !values.destinationEntityId.trim()
    ) {
      setError("A relationship type and both endpoint IDs are required.");
      return;
    }
    if (values.intent === "authorized_approval" && !values.approvalReference.trim()) {
      setError("An authorized approval must name the approval it rests on.");
      return;
    }

    let properties: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(values.properties || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setError("Properties must be a JSON object.");
        return;
      }
      properties = parsed as Record<string, unknown>;
    } catch {
      setError("Enter valid JSON properties.");
      return;
    }

    mutation.mutate({
      ...(values.approvalReference.trim()
        ? { approvalReference: values.approvalReference.trim() }
        : {}),
      endpoints: {
        destination_entity_id: values.destinationEntityId.trim(),
        source_entity_id: values.sourceEntityId.trim(),
      },
      // A fresh key per user-initiated write. A retry of the identical body is
      // the operator pressing submit again, which is a new intent to write.
      idempotencyKey: crypto.randomUUID(),
      identity: { handle: `${values.subjectType.trim()}/edge` },
      intent: values.intent,
      properties,
      provenance: {
        externalRecordId: relationshipId ?? "operator-authored",
        observedTime: new Date().toISOString(),
        sourceNamespace: "internal",
        sourceSystem: "admin-dashboard",
      },
      subjectType: values.subjectType.trim(),
      targetRevision: { profileRevision: revision },
      temporal: values.validFrom.trim()
        ? { validFrom: values.validFrom.trim() }
        : { validFrom: new Date().toISOString() },
    });
  }

  const title = relationshipId ? "Supersede relationship" : "Create relationship";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${fieldId}-title`}
      className="m-0 max-h-dvh w-dvw max-w-none overflow-y-auto border-0 bg-surface p-0 text-foreground backdrop:bg-overlay sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(48rem,calc(100dvw-2rem))] sm:rounded-xl sm:border sm:border-border sm:shadow-2xl"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onClose}
    >
      <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
            Canonical graph
          </p>
          <h2 id={`${fieldId}-title`} className="mt-1 text-xl font-semibold text-foreground">
            {title}
          </h2>
          {binding.data ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="info">{binding.data.enforcementState}</StatusBadge>
              <span className="break-all font-mono text-xs text-muted">
                {binding.data.profileRevisionId}
              </span>
            </div>
          ) : null}
        </div>
        <Button
          ref={closeRef}
          aria-label="Close relationship editor"
          onClick={close}
          size="icon"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      {detail.isPending && relationshipId ? (
        <div className="p-6" aria-label="Loading relationship" role="status">
          <div className="h-6 w-52 animate-pulse rounded bg-surface-muted" />
        </div>
      ) : detail.isError ? (
        <div className="p-6">
          <RequestFailure onRetry={() => void detail.refetch()} title="Relationship unavailable">
            The relationship could not be read, so there is no stored state to supersede.
          </RequestFailure>
        </div>
      ) : (
        <form className="space-y-5 p-6" onSubmit={submit}>
          <Notice title="Writes governed tenant state" variant="info">
            This form sends a write to {tenantName}. The service routes it by intent, validates it
            against the bound profile, and takes the aggregate lock before the row lands.
          </Notice>

          {binding.data === null ? (
            <Notice title="No profile is bound" variant="warning">
              This tenant has no active or validating binding, so there is no revision to write
              against and no governance to validate the write.
            </Notice>
          ) : null}

          <label className={labelClassName}>
            Intent
            <select
              className={inputClassName}
              disabled={relationshipId !== null}
              onChange={(event) => edit({ intent: event.target.value as RelationshipWriteIntent })}
              value={values.intent}
            >
              {relationshipWriteIntents.map((intent) => (
                <option key={intent} value={intent}>
                  {intentLabels[intent]}
                </option>
              ))}
            </select>
            {relationshipId ? (
              <span className="mt-1 block font-normal text-muted">
                A supersession is a canonical write. The staged routes record nothing naming this
                edge, so they cannot amend it.
              </span>
            ) : null}
          </label>

          <label className={labelClassName}>
            Relationship type
            <input
              className={inputClassName}
              onChange={(event) => edit({ subjectType: event.target.value })}
              placeholder="core:depends_on"
              readOnly={relationshipId !== null}
              value={values.subjectType}
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className={labelClassName}>
              Source entity ID
              <input
                className={inputClassName}
                onChange={(event) => edit({ sourceEntityId: event.target.value })}
                placeholder="UUID"
                readOnly={relationshipId !== null}
                value={values.sourceEntityId}
              />
            </label>
            <label className={labelClassName}>
              Destination entity ID
              <input
                className={inputClassName}
                onChange={(event) => edit({ destinationEntityId: event.target.value })}
                placeholder="UUID"
                readOnly={relationshipId !== null}
                value={values.destinationEntityId}
              />
            </label>
          </div>

          {relationshipId ? (
            <p className="text-xs text-muted">
              Type and endpoints are the assertion&rsquo;s identity, so a supersession cannot change
              them. Moving an edge is retiring one and asserting another.
            </p>
          ) : null}

          <label className={labelClassName}>
            In force from
            <input
              className={inputClassName}
              onChange={(event) => edit({ validFrom: event.target.value })}
              placeholder="ISO-8601 timestamp, or leave blank for now"
              value={values.validFrom}
            />
          </label>

          {values.intent === "authorized_approval" ? (
            <label className={labelClassName}>
              Approval reference
              <input
                className={inputClassName}
                onChange={(event) => edit({ approvalReference: event.target.value })}
                placeholder="The review this write rests on"
                value={values.approvalReference}
              />
            </label>
          ) : null}

          <label className={labelClassName}>
            Properties
            <span className="mt-1 block font-normal text-muted">
              JSON governed by the relationship type this profile declares.
            </span>
            <textarea
              aria-invalid={error ? true : undefined}
              className={`${inputClassName} min-h-32 resize-y font-mono leading-6`}
              onChange={(event) => edit({ properties: event.target.value })}
              spellCheck={false}
              value={values.properties}
            />
          </label>

          {conflict ? (
            <Notice title="This relationship changed while you were editing" variant="warning">
              <p>
                The service refused the write with <span className="font-mono">412</span>. Your
                entered values are untouched. The stored row now reads:
              </p>
              <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-xs">
                <dt className="text-muted">Readiness</dt>
                <dd className="text-foreground">{conflict.readiness_state}</dd>
                <dt className="text-muted">In force from</dt>
                <dd className="text-foreground">{conflict.temporal.effective_from ?? "Not set"}</dd>
                <dt className="text-muted">In force to</dt>
                <dd className="text-foreground">
                  {conflict.temporal.effective_to ?? "Still in force"}
                </dd>
                <dt className="text-muted">Properties</dt>
                <dd className="font-mono break-all text-foreground">
                  {JSON.stringify(conflict.properties)}
                </dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setDraft(draftFrom(conflict));
                    setConflict(null);
                  }}
                  size="compact"
                  variant="secondary"
                >
                  Replace my draft with the newer state
                </Button>
                <Button onClick={() => setConflict(null)} size="compact" variant="secondary">
                  Keep my draft and submit again
                </Button>
              </div>
            </Notice>
          ) : null}

          {error ? (
            <Notice title="Review the relationship" variant="danger">
              {error}
            </Notice>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border-subtle pt-5">
            <Button onClick={close} type="button" variant="secondary">
              Cancel
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              <Plus aria-hidden="true" className="size-4" />
              {mutation.isPending ? "Writing…" : title}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
