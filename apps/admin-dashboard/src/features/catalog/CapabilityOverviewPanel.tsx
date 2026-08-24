import { AlertTriangle, Save, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import {
  Button,
  Notice,
  ResourcePicker,
  SearchableSelect,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  changeCapabilityLifecycle,
  deleteCapability,
  entityWriteIntents,
  getCapability,
  getGoverningBinding,
  setCapabilityVisibility,
  updateCapability,
  listTenants,
  updateEntity,
  type CatalogCapabilityDetail,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type EntityWriteIntent,
} from "../../shared/api";
import { filterOptions, tenantOptions } from "../../shared/pickers/sources";
import { catalogInputClassName, catalogLabelClassName } from "./CapabilityDialog";

/**
 * How an attribute change reaches the catalog. The create's question, asked
 * again for the edit.
 *
 * `direct` is `PATCH /v1/capabilities/{id}`, which the contract describes as a
 * bag of attribute updates applied bi-temporally. Nothing reviews it.
 *
 * The other three are the generic `POST /v1/entities`, which routes by intent:
 * an observation stages a claim, a request opens an owner review entry, and only
 * an authorized approval writes canon. Which one is right depends on whether the
 * change should be reviewed, and that is a fact about the operator's situation
 * rather than something the form can infer.
 */
const editRouteOptions: readonly { label: string; value: string }[] = [
  { label: "Update directly — merges the change, unreviewed", value: "direct" },
  { label: "Observation — stages a claim for review", value: "observation" },
  { label: "Request — opens an owner review entry", value: "request" },
  { label: "Authorized approval — writes canon", value: "authorized_approval" },
];

type EditRoute = "direct" | "observation" | "request" | "authorized_approval";

function isGoverned(route: EditRoute): route is EntityWriteIntent {
  return (entityWriteIntents as readonly string[]).includes(route);
}

interface CapabilityOverviewPanelProps {
  capability: CatalogCapabilityDetail;
  client: ContextplaneClient;
  /**
   * The validator from the read this panel's forms were composed against.
   *
   * Sent as `If-Match` on every write here. `null` when the service returned no
   * header, and then the writes go without one -- which is the behaviour that
   * shipped before, and the contract accepts it with a logged warning rather
   * than a refusal.
   */
  etag: string | null;
  onDeleted: () => void;
  requestContext: ContextplaneRequestOptions;
}

/** The refusal code a stale `If-Match` comes back with. */
const PRECONDITION_FAILED = "precondition_failed";

const visibilityOptions = ["private", "tenant-shared", "public"] as const;
const lifecycleOptions = ["alpha", "beta", "ga", "deprecated", "retired"] as const;
const visibilitySelectOptions = visibilityOptions.map((option) => ({
  label: option,
  value: option,
}));
const lifecycleSelectOptions = lifecycleOptions.map((option) => ({ label: option, value: option }));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function CapabilityOverviewPanel({
  capability,
  client,
  etag,
  onDeleted,
  requestContext,
}: CapabilityOverviewPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [attributesText, setAttributesText] = useState(() =>
    JSON.stringify(capability.attributes, null, 2),
  );
  const [attributesError, setAttributesError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<(typeof visibilityOptions)[number]>("private");
  // A list rather than a comma-separated string, because a picker adds one at a
  // time and rejoining them into text only to split it again on submit would
  // reintroduce the parsing this field exists to remove.
  const [sharedTenants, setSharedTenants] = useState<readonly { id: string; name: string }[]>([]);
  const [tenantToAdd, setTenantToAdd] = useState("");
  const [lifecycle, setLifecycle] = useState(capability.lifecycle);
  const [successor, setSuccessor] = useState("none");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [route, setRoute] = useState<EditRoute>("direct");
  const [approvalReference, setApprovalReference] = useState("");
  // Set when the service refuses a write because the row moved underneath. The
  // operator's entered values are untouched; what is shown beside them is what
  // the entity says now, and the person decides what to do about the difference.
  const [staleAgainst, setStaleAgainst] = useState<CatalogCapabilityDetail | null>(null);

  /**
   * What a stale precondition means for a form the operator is holding.
   *
   * Keep the draft, refetch, show the newer state -- the same choice the
   * relationship authoring dialog made, and for the same reason: discarding the
   * draft would punish the person who lost a race they could not see, and
   * overwriting silently is what `If-Match` exists to prevent. Returns whether
   * it handled the error, so each mutation's own reporting stays its own.
   */
  async function handledAsStale(caught: unknown): Promise<boolean> {
    if (!(caught instanceof ContextplaneApiError) || caught.code !== PRECONDITION_FAILED) {
      return false;
    }
    const current = await getCapability(client, capability.entityId, requestContext).catch(
      () => null,
    );
    setStaleAgainst(current?.capability ?? null);
    return true;
  }

  function refresh(message: string) {
    setReceipt(`${message} · ${new Date().toISOString()}`);
    void queryClient.invalidateQueries({ queryKey: ["contextplane"] });
    showToast({ message, title: capability.name, variant: "success" });
  }

  // One read, two uses: the picker chooses from it and each chosen chip is
  // named from it. Two requests for one collection would be two chances for the
  // chip list and the dropdown to disagree about what a tenant is called.
  const tenantQuery = useQuery({
    enabled: visibility === "tenant-shared",
    queryFn: () => listTenants(client, requestContext),
    queryKey: ["contextplane", requestContext.tenantId ?? "credential-default", "tenants"],
  });
  const allTenantOptions = useMemo(
    () => tenantOptions(tenantQuery.data ?? []),
    [tenantQuery.data],
  );
  const tenantNames = useMemo(
    () => Object.fromEntries(allTenantOptions.map((option) => [option.value, option.label])),
    [allTenantOptions],
  );
  const tenants = useMemo(
    () => async (query: { search: string }) => ({
      items: filterOptions(allTenantOptions, query.search),
      next_cursor: null,
    }),
    [allTenantOptions],
  );

  const binding = useQuery({
    enabled: isGoverned(route),
    queryFn: ({ signal }) => getGoverningBinding(client, requestContext, signal),
    queryKey: [
      "contextplane",
      requestContext.tenantId ?? "credential-default",
      "governing-binding",
    ],
  });

  const updateMutation = useMutation({
    mutationFn: async (attributes: Record<string, unknown>) => {
      if (!isGoverned(route)) {
        await updateCapability(
          client,
          capability.entityId,
          { updates: attributes },
          requestContext,
          undefined,
          etag ?? undefined,
        );
        return { effect: "updated" as const };
      }
      const governing = binding.data;
      // Unreachable from the form, which will not submit until the binding has
      // resolved. Stated rather than assumed, for the same reason the create
      // states it: a governed write with no revision to attest to is the thing
      // the attestation exists to prevent.
      if (!governing) throw new Error("no governing binding to attest to");
      // `updateEntity`, not `assertEntity`: the service reads the write target
      // from the *path*, never from `identity.subject_id`. Posting an edit to
      // the create surface with a subject id in the body does not update
      // anything -- on the approval route it mints a second entity, because
      // that handler is called with `entity_id=None` and falls through to
      // `create_entity`. Caught by reading the handler; the mocked test that
      // asserted the request body could not see it.
      const result = await updateEntity(
        client,
        capability.entityId,
        {
          ...(approvalReference.trim() ? { approvalReference: approvalReference.trim() } : {}),
          // Carried anyway. The path is what the service routes on, and a body
          // that disagreed with it would be a second answer to one question.
          identity: { subjectId: capability.entityId },
          idempotencyKey: crypto.randomUUID(),
          intent: route,
          properties: attributes,
          provenance: {
            externalRecordId: capability.externalId ?? "operator-authored",
            observedTime: new Date().toISOString(),
            sourceNamespace: "internal",
            sourceSystem: "admin-dashboard",
          },
          // Whatever type the entity actually is, not one of the three the
          // create offers: the catalog lists every type a tenant holds, and an
          // edit has to work on the one in front of the operator.
          subjectType: `core:${capability.entityType}`,
          targetRevision: {
            bindingRevision: governing.extensionSetDigest,
            profileRevision: governing.profileRevisionId,
          },
          validFrom: new Date().toISOString(),
        },
        requestContext,
      );
      return { effect: result.effect };
    },
    onError: handledAsStale,
    onSuccess: (outcome) => {
      // A staged or reviewed change has not been applied, so the receipt names
      // what happened instead of claiming the attributes moved.
      refresh(
        outcome.effect === "updated"
          ? "Capability attributes were updated."
          : `The attribute change was routed as ${outcome.effect.replaceAll("_", " ")}.`,
      );
    },
  });
  const visibilityMutation = useMutation({
    mutationFn: () =>
      setCapabilityVisibility(
        client,
        capability.entityId,
        {
          visibility,
          ...(visibility === "tenant-shared"
            ? {
                shared_with_tenants: sharedTenants.map((entry) => entry.id),
              }
            : {}),
        },
        requestContext,
        undefined,
        etag ?? undefined,
      ),
    onError: handledAsStale,
    onSuccess: () => refresh(`Capability visibility changed to ${visibility}.`),
  });
  const lifecycleMutation = useMutation({
    mutationFn: () =>
      changeCapabilityLifecycle(
        client,
        capability.entityId,
        { new_state: lifecycle, successor: successor.trim() || "none" },
        requestContext,
        undefined,
        etag ?? undefined,
      ),
    onError: handledAsStale,
    onSuccess: () => refresh(`Capability lifecycle changed to ${lifecycle}.`),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteCapability(client, capability.entityId, requestContext),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contextplane"] });
      showToast({
        message: `${capability.name} was removed from active catalog state.`,
        title: "Capability deleted",
        variant: "success",
      });
      onDeleted();
    },
  });

  function submitAttributes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStaleAgainst(null);
    if (route === "authorized_approval" && !approvalReference.trim()) {
      setAttributesError("An authorized approval must name the approval it rests on.");
      return;
    }
    if (isGoverned(route) && !binding.data) {
      setAttributesError(
        binding.isPending
          ? "Still reading which profile governs this tenant. Try again in a moment."
          : "This tenant is not bound to a profile revision, so there is no governance to write against.",
      );
      return;
    }
    try {
      const value: unknown = JSON.parse(attributesText);
      if (!isRecord(value)) {
        setAttributesError("Attributes must be a JSON object.");
        return;
      }
      setAttributesError(null);
      updateMutation.mutate(value);
    } catch {
      setAttributesError("Enter valid JSON attributes.");
    }
  }

  const hasFailure =
    updateMutation.isError ||
    visibilityMutation.isError ||
    lifecycleMutation.isError ||
    deleteMutation.isError;

  return (
    <div className="space-y-6 p-6">
      <section aria-labelledby="capability-identity-title">
        <h3 id="capability-identity-title" className="text-base font-semibold text-foreground">
          Identity and current state
        </h3>
        <dl className="mt-4 grid gap-x-8 gap-y-4 rounded-lg border border-border bg-surface-muted p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">Stable ID</dt>
            <dd className="mt-1 break-all font-mono text-sm text-foreground">
              {capability.entityId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">External ID</dt>
            <dd className="mt-1 font-mono text-sm text-foreground">
              {capability.externalId ?? "Not assigned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Entity type</dt>
            <dd className="mt-1 text-sm text-foreground">{capability.entityType}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Lifecycle</dt>
            <dd className="mt-1">
              <StatusBadge tone="info">{capability.lifecycle}</StatusBadge>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-muted">Created</dt>
            <dd className="mt-1 text-sm text-foreground">
              <time dateTime={capability.createdAt}>{capability.createdAt}</time>
            </dd>
          </div>
        </dl>
      </section>

      {receipt ? (
        <Notice title="Service change completed" variant="success">
          {receipt}
        </Notice>
      ) : null}
      {staleAgainst ? (
        <Notice title="This entity changed while you were editing" variant="warning">
          <p>
            The service refused the write with <span className="font-mono">412</span>. Your entered
            values are untouched. Reopen the entity to compose against the current state, or submit
            again to overwrite what is there now.
          </p>
          <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-muted">Lifecycle now</dt>
            <dd className="text-foreground">{staleAgainst.lifecycle}</dd>
            <dt className="text-muted">Attributes now</dt>
            <dd className="font-mono text-xs break-all text-foreground">
              {JSON.stringify(staleAgainst.attributes)}
            </dd>
          </dl>
        </Notice>
      ) : hasFailure ? (
        <Notice title="Change was not completed" variant="danger">
          The service refused or could not complete the requested change. Existing catalog state
          remains authoritative and the entered values are preserved.
        </Notice>
      ) : null}

      <form className="rounded-lg border border-border p-5" onSubmit={submitAttributes}>
        <h3 className="text-base font-semibold text-foreground">Capability attributes</h3>
        <p className="mt-1 text-sm text-muted">
          Update only the structured properties governed by this capability's active profile.
        </p>

        <div className={`${catalogLabelClassName} mt-4`}>
          <SearchableSelect
            allowEmpty={false}
            label="How this change reaches the catalog"
            onValueChange={(value) => setRoute(value as EditRoute)}
            options={editRouteOptions}
            value={route}
          />
          <span className="mt-1 block font-normal text-muted">
            {isGoverned(route)
              ? "The governed surface asserts the whole property set against the tenant's profile revision, so a key you remove here is removed. The service decides whether the change becomes canon or waits for a review."
              : "The direct route merges these keys into the existing attributes. A key you remove here is left as it was; nothing reviews the change."}
          </span>
        </div>

        {isGoverned(route) && binding.data === null ? (
          <Notice title="No profile is bound" variant="warning">
            This tenant has no active or validating binding, so a governed change has no revision to
            attest to and no governance to validate it. Update directly, or bind a profile first.
          </Notice>
        ) : null}

        {route === "authorized_approval" ? (
          <label className={`${catalogLabelClassName} mt-4`}>
            Approval reference
            <input
              required
              className={catalogInputClassName}
              onChange={(event) => setApprovalReference(event.target.value)}
              placeholder="The approval this write rests on"
              value={approvalReference}
            />
          </label>
        ) : null}

        <label className={`${catalogLabelClassName} mt-4`}>
          Attributes JSON
          <textarea
            aria-invalid={attributesError ? true : undefined}
            className={`${catalogInputClassName} min-h-52 resize-y font-mono leading-6`}
            onChange={(event) => setAttributesText(event.target.value)}
            spellCheck={false}
            value={attributesText}
          />
        </label>
        {attributesError ? <p className="mt-2 text-sm text-danger">{attributesError}</p> : null}
        <div className="mt-4 flex justify-end">
          {/* Disabled until the binding is known, so a governed change cannot be
              sent with nothing to attest to. The create learned this the hard
              way: it silently sent an unattested write while the query was in
              flight. */}
          <Button
            disabled={updateMutation.isPending || (isGoverned(route) && binding.isPending)}
            type="submit"
          >
            <Save aria-hidden="true" className="size-4" />
            {updateMutation.isPending
              ? "Saving…"
              : isGoverned(route)
                ? "Submit change"
                : "Save attributes"}
          </Button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            visibilityMutation.mutate();
          }}
        >
          <h3 className="text-base font-semibold text-foreground">Visibility</h3>
          <p className="mt-1 text-sm text-muted">
            Choose who may discover and use this capability. Current visibility is not included in
            the default detail response, so no value is inferred.
          </p>
          <SearchableSelect
            allowEmpty={false}
            className="mt-4"
            label="New visibility"
            onValueChange={(value) => setVisibility(value as (typeof visibilityOptions)[number])}
            options={visibilitySelectOptions}
            value={visibility}
          />
          {visibility === "tenant-shared" ? (
            <div className="mt-4 space-y-3">
              {/* Added one at a time from the credential's own memberships. A
                  comma-separated list of UUIDs decides who may see this
                  capability, and one transposed character shares it with a
                  tenant nobody chose — silently, because the wrong UUID is
                  still a valid UUID. */}
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <ResourcePicker
                    emptyMessage="This credential reaches no other tenant."
                    label="Share with tenant"
                    load={tenants}
                    onValueChange={setTenantToAdd}
                    searchPlaceholder="Search tenants by name"
                    value={tenantToAdd}
                  />
                </div>
                <Button
                  disabled={tenantToAdd === "" || sharedTenants.some((e) => e.id === tenantToAdd)}
                  onClick={() => {
                    setSharedTenants((current) =>
                      current.some((entry) => entry.id === tenantToAdd)
                        ? current
                        : [...current, { id: tenantToAdd, name: tenantNames[tenantToAdd] ?? tenantToAdd }],
                    );
                    setTenantToAdd("");
                  }}
                  type="button"
                  variant="secondary"
                >
                  Add
                </Button>
              </div>
              {sharedTenants.length === 0 ? (
                <p className="text-xs text-muted">
                  No tenant chosen yet. Sharing with none is refused rather than treated as
                  private — those are different decisions and only one of them was made here.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {sharedTenants.map((entry) => (
                    <li key={entry.id}>
                      <Button
                        onClick={() =>
                          setSharedTenants((current) => current.filter((e) => e.id !== entry.id))
                        }
                        size="compact"
                        type="button"
                        variant="secondary"
                      >
                        {entry.name}
                        <X aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">Stop sharing with {entry.name}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button disabled={visibilityMutation.isPending} type="submit" variant="secondary">
              {visibilityMutation.isPending ? "Changing…" : "Change visibility"}
            </Button>
          </div>
        </form>

        <form
          className="rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            lifecycleMutation.mutate();
          }}
        >
          <h3 className="text-base font-semibold text-foreground">Lifecycle transition</h3>
          <p className="mt-1 text-sm text-muted">
            The service evaluates progression rules and returns gate failures without changing the
            current state.
          </p>
          <SearchableSelect
            allowEmpty={false}
            className="mt-4"
            label="New lifecycle state"
            onValueChange={setLifecycle}
            options={lifecycleSelectOptions}
            value={lifecycle}
          />
          <label className={`${catalogLabelClassName} mt-4`}>
            Successor capability UUID or “none”
            <input
              required
              className={catalogInputClassName}
              onChange={(event) => setSuccessor(event.target.value)}
              value={successor}
            />
          </label>
          <div className="mt-4 flex justify-end">
            <Button disabled={lifecycleMutation.isPending} type="submit" variant="secondary">
              {lifecycleMutation.isPending ? "Changing…" : "Change lifecycle"}
            </Button>
          </div>
        </form>
      </div>

      <section className="rounded-lg border border-danger/40 bg-danger-subtle p-5">
        <div className="flex gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground">Delete capability</h3>
            <p className="mt-1 text-sm text-muted">
              This removes the capability from active catalog state. Review dependents and adoptions
              before proceeding.
            </p>
            <label className={`${catalogLabelClassName} mt-4`}>
              Type {capability.name} to confirm
              <input
                autoComplete="off"
                className={catalogInputClassName}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                value={deleteConfirmation}
              />
            </label>
            <div className="mt-4 flex justify-end">
              <Button
                disabled={deleteMutation.isPending || deleteConfirmation.trim() !== capability.name}
                onClick={() => deleteMutation.mutate()}
                variant="danger"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {deleteMutation.isPending ? "Deleting…" : "Delete capability"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
