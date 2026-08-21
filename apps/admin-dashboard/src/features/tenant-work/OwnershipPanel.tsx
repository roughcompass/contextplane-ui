import { BadgeCheck, Search, ShieldCheck, UserRoundCog } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  Button,
  Notice,
  RequestFailure,
  SearchableSelect,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  assignTenantOwnership,
  findTargetOwners,
  getProfileConformance,
  getTenantOwnershipAssignment,
  listPrincipalOwnership,
  planProfileBinding,
  publishProfileExtension,
  publishProfileRevision,
  transitionProfileBinding,
  transitionTenantOwnership,
  type AssignOwnershipInput,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type OwnershipAssignment,
  type StructuredServiceResult,
} from "../../shared/api";

interface OwnershipPanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";

const compatibilityOptions = [
  { label: "Backward compatible", value: "backward_compatible" },
  { label: "Breaking", value: "breaking" },
  { label: "Deprecating", value: "deprecating" },
];
const bindingActionOptions = [
  { label: "Validate", value: "validate" },
  { label: "Activate", value: "activate" },
  { label: "Begin rollback", value: "rollback" },
  { label: "Complete rollback", value: "rollback/complete" },
];

function Receipt({ title, value }: { title: string; value: StructuredServiceResult }) {
  return (
    <div aria-live="polite" className="rounded-lg border border-success/40 bg-success-subtle p-4">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function AssignmentList({
  assignments,
  onSelect,
}: {
  assignments: readonly OwnershipAssignment[];
  onSelect: (assignment: OwnershipAssignment) => void;
}) {
  if (assignments.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface-muted p-5 text-sm text-muted">
        No assignment matches this governed lookup.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle rounded-lg border border-border">
      {assignments.map((assignment) => (
        <li key={assignment.ownershipAssignmentId} className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium text-foreground">{assignment.ownerPrincipal}</h4>
                <StatusBadge tone={assignment.isPending ? "warning" : "success"}>
                  {assignment.isPending ? "Pending" : assignment.validationState}
                </StatusBadge>
                <StatusBadge>{assignment.role}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-muted">
                {assignment.ownedTargetKind} · {assignment.scope} · {assignment.source}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted">
                Target {assignment.ownedTargetId} · Assignment {assignment.ownershipAssignmentId}
              </p>
            </div>
            <Button onClick={() => onSelect(assignment)} size="compact" variant="secondary">
              Manage state
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OwnershipPanel({ client, requestContext }: OwnershipPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const tenantKey = requestContext.tenantId ?? "credential-default";
  const [searchMode, setSearchMode] = useState<"owner" | "target">("target");
  const [targetKind, setTargetKind] = useState("");
  const [targetId, setTargetId] = useState("");
  const [ownerPrincipal, setOwnerPrincipal] = useState("");
  const [includePending, setIncludePending] = useState(true);
  const [searchRequest, setSearchRequest] = useState<
    | { includePending: boolean; mode: "owner"; owner: string }
    | { includePending: boolean; kind: string; mode: "target"; target: string }
    | null
  >(null);
  const [lookupId, setLookupId] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState<OwnershipAssignment | null>(null);
  const [transitionState, setTransitionState] = useState("validated");
  const [transitionReason, setTransitionReason] = useState("");
  const [assignment, setAssignment] = useState<AssignOwnershipInput>({
    owned_target_id: "",
    owned_target_kind: "",
    owner_principal: "",
    profile_revision_id: "",
    role: "owner",
    scope: "tenant",
    source: "manual",
  });

  const conformance = useQuery({
    queryFn: ({ signal }) => getProfileConformance(client, requestContext, signal),
    queryKey: ["contextplane", tenantKey, "ownership", "profile-conformance"],
  });
  const ownership = useQuery({
    enabled: searchRequest !== null,
    queryFn: ({ signal }) =>
      searchRequest?.mode === "owner"
        ? listPrincipalOwnership(
            client,
            searchRequest.owner,
            searchRequest.includePending,
            requestContext,
            signal,
          )
        : findTargetOwners(
            client,
            searchRequest?.kind ?? "",
            searchRequest?.target ?? "",
            searchRequest?.includePending ?? true,
            requestContext,
            signal,
          ),
    queryKey: ["contextplane", tenantKey, "ownership", "search", searchRequest],
  });
  const lookupMutation = useMutation({
    mutationFn: () => getTenantOwnershipAssignment(client, lookupId.trim(), requestContext),
    onSuccess: setSelectedAssignment,
  });
  const assignmentMutation = useMutation({
    mutationFn: () => assignTenantOwnership(client, assignment, requestContext),
    onSuccess: (value) => {
      setSelectedAssignment(value);
      void queryClient.invalidateQueries({ queryKey: ["contextplane", tenantKey, "ownership"] });
      showToast({
        message: "A draft ownership assignment was recorded for validation.",
        title: "Ownership assigned",
        variant: "success",
      });
    },
  });
  const transitionMutation = useMutation({
    mutationFn: () =>
      transitionTenantOwnership(
        client,
        selectedAssignment?.ownershipAssignmentId ?? "",
        { reason: transitionReason.trim(), to_state: transitionState },
        requestContext,
      ),
    onSuccess: (value) => {
      setSelectedAssignment(value);
      setTransitionReason("");
      void queryClient.invalidateQueries({ queryKey: ["contextplane", tenantKey, "ownership"] });
      showToast({
        message: `Assignment state changed to ${value.validationState}.`,
        title: "Ownership updated",
        variant: "success",
      });
    },
  });

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchRequest(
      searchMode === "owner"
        ? { includePending, mode: "owner", owner: ownerPrincipal.trim() }
        : {
            includePending,
            kind: targetKind.trim(),
            mode: "target",
            target: targetId.trim(),
          },
    );
  }

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="conformance-title"
        className="rounded-xl border border-border bg-surface p-6"
      >
        <div className="flex items-start gap-3">
          <BadgeCheck aria-hidden="true" className="mt-0.5 size-5 text-accent" />
          <div>
            <h2 id="conformance-title" className="text-lg font-semibold text-foreground">
              Active profile conformance
            </h2>
            <p className="mt-1 text-sm text-muted">
              The governing profile binding the service currently applies to this tenant.
            </p>
          </div>
        </div>
        {conformance.isPending ? (
          <div className="mt-5 h-24 animate-pulse rounded-lg bg-surface-muted" role="status" />
        ) : conformance.isError ? (
          <div className="mt-5">
            <RequestFailure
              onRetry={() => void conformance.refetch()}
              title="Conformance unavailable"
            >
              Current profile governance could not be loaded.
            </RequestFailure>
          </div>
        ) : (
          <div className="mt-5">
            <Receipt title="Service-reported conformance" value={conformance.data} />
          </div>
        )}
      </section>

      <section
        aria-labelledby="ownership-search-title"
        className="rounded-xl border border-border bg-surface p-6"
      >
        <div className="flex items-center gap-2">
          <Search aria-hidden="true" className="size-5 text-accent" />
          <h2 id="ownership-search-title" className="text-lg font-semibold text-foreground">
            Find ownership
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Search in either direction: who owns a target, or what a principal owns.
        </p>
        <form className="mt-5 space-y-5" onSubmit={runSearch}>
          <fieldset>
            <legend className="text-xs font-medium text-muted">Lookup direction</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-foreground">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  checked={searchMode === "target"}
                  name="ownership-mode"
                  onChange={() => setSearchMode("target")}
                  type="radio"
                />
                Owners of target
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  checked={searchMode === "owner"}
                  name="ownership-mode"
                  onChange={() => setSearchMode("owner")}
                  type="radio"
                />
                Targets owned by principal
              </label>
            </div>
          </fieldset>
          {searchMode === "target" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClassName}>
                Target kind
                <input
                  required
                  className={inputClassName}
                  onChange={(event) => setTargetKind(event.target.value)}
                  placeholder="capability"
                  value={targetKind}
                />
              </label>
              <label className={labelClassName}>
                Target UUID
                <input
                  required
                  className={inputClassName}
                  onChange={(event) => setTargetId(event.target.value)}
                  value={targetId}
                />
              </label>
            </div>
          ) : (
            <label className={labelClassName}>
              Owner principal
              <input
                required
                className={inputClassName}
                onChange={(event) => setOwnerPrincipal(event.target.value)}
                placeholder="actor or group principal"
                value={ownerPrincipal}
              />
            </label>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <input
              checked={includePending}
              onChange={(event) => setIncludePending(event.target.checked)}
              type="checkbox"
            />
            Include pending assignments
          </label>
          <div className="flex justify-end">
            <Button disabled={ownership.isFetching} type="submit">
              <Search aria-hidden="true" className="size-4" />
              {ownership.isFetching ? "Searching…" : "Search ownership"}
            </Button>
          </div>
        </form>
        {ownership.isError ? (
          <div className="mt-5">
            <RequestFailure
              onRetry={() => void ownership.refetch()}
              title="Ownership search failed"
            >
              The service could not resolve this ownership view.
            </RequestFailure>
          </div>
        ) : ownership.data ? (
          <div className="mt-5">
            <AssignmentList assignments={ownership.data} onSelect={setSelectedAssignment} />
          </div>
        ) : null}
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section
          aria-labelledby="assign-title"
          className="rounded-xl border border-border bg-surface p-6"
        >
          <div className="flex items-center gap-2">
            <UserRoundCog aria-hidden="true" className="size-5 text-accent" />
            <h2 id="assign-title" className="text-lg font-semibold text-foreground">
              Assign ownership
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            Creates a draft assignment. Validate it before presenting ownership as settled fact.
          </p>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              assignmentMutation.mutate();
            }}
          >
            <label className={labelClassName}>
              Owner principal
              <input
                required
                className={inputClassName}
                onChange={(event) =>
                  setAssignment((current) => ({ ...current, owner_principal: event.target.value }))
                }
                value={assignment.owner_principal}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClassName}>
                Target kind
                <input
                  required
                  className={inputClassName}
                  onChange={(event) =>
                    setAssignment((current) => ({
                      ...current,
                      owned_target_kind: event.target.value,
                    }))
                  }
                  value={assignment.owned_target_kind}
                />
              </label>
              <label className={labelClassName}>
                Target UUID
                <input
                  required
                  className={inputClassName}
                  onChange={(event) =>
                    setAssignment((current) => ({
                      ...current,
                      owned_target_id: event.target.value,
                    }))
                  }
                  value={assignment.owned_target_id}
                />
              </label>
              <label className={labelClassName}>
                Role
                <input
                  required
                  className={inputClassName}
                  onChange={(event) =>
                    setAssignment((current) => ({ ...current, role: event.target.value }))
                  }
                  value={assignment.role}
                />
              </label>
              <label className={labelClassName}>
                Scope
                <input
                  required
                  className={inputClassName}
                  onChange={(event) =>
                    setAssignment((current) => ({ ...current, scope: event.target.value }))
                  }
                  value={assignment.scope}
                />
              </label>
              <label className={labelClassName}>
                Source
                <input
                  required
                  className={inputClassName}
                  onChange={(event) =>
                    setAssignment((current) => ({ ...current, source: event.target.value }))
                  }
                  value={assignment.source}
                />
              </label>
              <label className={labelClassName}>
                Profile revision UUID
                <input
                  required
                  className={inputClassName}
                  onChange={(event) =>
                    setAssignment((current) => ({
                      ...current,
                      profile_revision_id: event.target.value,
                    }))
                  }
                  value={assignment.profile_revision_id}
                />
              </label>
            </div>
            {assignmentMutation.isError ? (
              <Notice title="Assignment was not created" variant="danger">
                The service rejected the draft. Entered values remain available.
              </Notice>
            ) : null}
            <div className="flex justify-end">
              <Button disabled={assignmentMutation.isPending} type="submit">
                {assignmentMutation.isPending ? "Assigning…" : "Create draft assignment"}
              </Button>
            </div>
          </form>
        </section>

        <section
          aria-labelledby="transition-title"
          className="rounded-xl border border-border bg-surface p-6"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5 text-accent" />
            <h2 id="transition-title" className="text-lg font-semibold text-foreground">
              Review assignment state
            </h2>
          </div>
          <form
            className="mt-5 flex gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              lookupMutation.mutate();
            }}
          >
            <label className={`${labelClassName} flex-1`}>
              Assignment UUID
              <input
                required
                className={inputClassName}
                onChange={(event) => setLookupId(event.target.value)}
                value={lookupId}
              />
            </label>
            <Button
              className="self-end"
              disabled={lookupMutation.isPending}
              type="submit"
              variant="secondary"
            >
              Load
            </Button>
          </form>
          {lookupMutation.isError ? (
            <p className="mt-3 text-sm text-danger">The assignment could not be loaded.</p>
          ) : null}
          {selectedAssignment ? (
            <form
              className="mt-5 space-y-4 rounded-lg border border-border bg-surface-muted p-4"
              onSubmit={(event) => {
                event.preventDefault();
                transitionMutation.mutate();
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={selectedAssignment.isPending ? "warning" : "success"}>
                  {selectedAssignment.validationState}
                </StatusBadge>
                <span className="text-sm text-foreground">{selectedAssignment.ownerPrincipal}</span>
              </div>
              <label className={labelClassName}>
                New state
                <input
                  required
                  className={inputClassName}
                  onChange={(event) => setTransitionState(event.target.value)}
                  value={transitionState}
                />
              </label>
              <label className={labelClassName}>
                Reason
                <textarea
                  required
                  className={`${inputClassName} min-h-24 resize-y`}
                  onChange={(event) => setTransitionReason(event.target.value)}
                  value={transitionReason}
                />
              </label>
              {transitionMutation.isError ? (
                <Notice title="Transition was not completed" variant="danger">
                  Current state remains authoritative. The reason is preserved.
                </Notice>
              ) : null}
              <div className="flex justify-end">
                <Button disabled={transitionMutation.isPending} type="submit">
                  {transitionMutation.isPending ? "Transitioning…" : "Transition assignment"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-5 rounded-lg border border-border bg-surface-muted p-5 text-sm text-muted">
              Select a search result or load an assignment UUID to review its state.
            </p>
          )}
        </section>
      </div>

      <ProfileLifecyclePanel
        client={client}
        requestContext={requestContext}
        tenantKey={tenantKey}
      />
    </div>
  );
}

function ProfileLifecyclePanel({
  client,
  requestContext,
  tenantKey,
}: OwnershipPanelProps & { tenantKey: string }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [profileFamily, setProfileFamily] = useState("");
  const [profileName, setProfileName] = useState("");
  const [semanticVersion, setSemanticVersion] = useState("");
  const [compatibility, setCompatibility] = useState("backward_compatible");
  const [namespace, setNamespace] = useState("");
  const [coreRevisionId, setCoreRevisionId] = useState("");
  const [bindingRevisionId, setBindingRevisionId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [bindingReason, setBindingReason] = useState("");
  const [bindingId, setBindingId] = useState("");
  const [bindingAction, setBindingAction] = useState<
    "activate" | "rollback" | "rollback/complete" | "validate"
  >("validate");
  const [actionReason, setActionReason] = useState("");
  const [receipt, setReceipt] = useState<{ title: string; value: StructuredServiceResult } | null>(
    null,
  );

  function completed(title: string, value: StructuredServiceResult) {
    setReceipt({ title, value });
    void queryClient.invalidateQueries({
      queryKey: ["contextplane", tenantKey, "ownership", "profile-conformance"],
    });
    showToast({
      message: "The service returned a durable profile workflow result.",
      title,
      variant: "success",
    });
  }

  const revisionMutation = useMutation({
    mutationFn: () =>
      publishProfileRevision(
        client,
        {
          compatibility,
          profile_family: profileFamily.trim(),
          profile_name: profileName.trim(),
          semantic_version: semanticVersion.trim(),
        },
        requestContext,
      ),
    onSuccess: (value) => completed("Profile revision published", value),
  });
  const extensionMutation = useMutation({
    mutationFn: () =>
      publishProfileExtension(
        client,
        { namespace: namespace.trim(), target_core_revision_id: coreRevisionId.trim() },
        requestContext,
      ),
    onSuccess: (value) => completed("Profile extension published", value),
  });
  const planMutation = useMutation({
    mutationFn: () =>
      planProfileBinding(
        client,
        {
          effective_from: new Date(effectiveFrom).toISOString(),
          profile_revision_id: bindingRevisionId.trim(),
          reason: bindingReason.trim(),
        },
        requestContext,
      ),
    onSuccess: (value) => completed("Profile binding planned", value),
  });
  const actionMutation = useMutation({
    mutationFn: () =>
      transitionProfileBinding(
        client,
        bindingId.trim(),
        bindingAction,
        { reason: actionReason.trim() },
        requestContext,
      ),
    onSuccess: (value) => completed("Profile binding updated", value),
  });
  const hasError =
    revisionMutation.isError ||
    extensionMutation.isError ||
    planMutation.isError ||
    actionMutation.isError;

  return (
    <section
      aria-labelledby="profile-lifecycle-title"
      className="rounded-xl border border-border bg-surface p-6"
    >
      <h2 id="profile-lifecycle-title" className="text-lg font-semibold text-foreground">
        Profile publishing and binding lifecycle
      </h2>
      <p className="mt-1 text-sm text-muted">
        Publish immutable profile revisions or tenant extensions, then plan, validate, activate, or
        roll back a binding.
      </p>
      <Notice title="Review before profile changes" variant="warning">
        Profile changes can alter validation for future canonical writes. Use a reason that
        identifies the reviewed change and run validation before activation.
      </Notice>
      {hasError ? (
        <Notice title="Profile action was not completed" variant="danger">
          The current binding remains authoritative. Entered values are preserved.
        </Notice>
      ) : null}
      {receipt ? <Receipt title={receipt.title} value={receipt.value} /> : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <form
          className="space-y-4 rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            revisionMutation.mutate();
          }}
        >
          <h3 className="font-semibold text-foreground">Publish core revision</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClassName}>
              Profile family
              <input
                required
                className={inputClassName}
                onChange={(event) => setProfileFamily(event.target.value)}
                value={profileFamily}
              />
            </label>
            <label className={labelClassName}>
              Profile name
              <input
                required
                className={inputClassName}
                onChange={(event) => setProfileName(event.target.value)}
                value={profileName}
              />
            </label>
            <label className={labelClassName}>
              Semantic version
              <input
                required
                className={inputClassName}
                onChange={(event) => setSemanticVersion(event.target.value)}
                placeholder="1.0.0"
                value={semanticVersion}
              />
            </label>
            <SearchableSelect
              allowEmpty={false}
              label="Compatibility"
              onValueChange={setCompatibility}
              options={compatibilityOptions}
              value={compatibility}
            />
          </div>
          <div className="flex justify-end">
            <Button disabled={revisionMutation.isPending} type="submit">
              Publish revision
            </Button>
          </div>
        </form>
        <form
          className="space-y-4 rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            extensionMutation.mutate();
          }}
        >
          <h3 className="font-semibold text-foreground">Publish tenant extension</h3>
          <label className={labelClassName}>
            Namespace
            <input
              required
              className={inputClassName}
              onChange={(event) => setNamespace(event.target.value)}
              value={namespace}
            />
          </label>
          <label className={labelClassName}>
            Target core revision UUID
            <input
              required
              className={inputClassName}
              onChange={(event) => setCoreRevisionId(event.target.value)}
              value={coreRevisionId}
            />
          </label>
          <div className="flex justify-end">
            <Button disabled={extensionMutation.isPending} type="submit">
              Publish extension
            </Button>
          </div>
        </form>
        <form
          className="space-y-4 rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            planMutation.mutate();
          }}
        >
          <h3 className="font-semibold text-foreground">Plan profile binding</h3>
          <label className={labelClassName}>
            Profile revision UUID
            <input
              required
              className={inputClassName}
              onChange={(event) => setBindingRevisionId(event.target.value)}
              value={bindingRevisionId}
            />
          </label>
          <label className={labelClassName}>
            Effective from
            <input
              required
              className={inputClassName}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              type="datetime-local"
              value={effectiveFrom}
            />
          </label>
          <label className={labelClassName}>
            Reason
            <textarea
              required
              className={`${inputClassName} min-h-24 resize-y`}
              onChange={(event) => setBindingReason(event.target.value)}
              value={bindingReason}
            />
          </label>
          <div className="flex justify-end">
            <Button disabled={planMutation.isPending} type="submit">
              Plan binding
            </Button>
          </div>
        </form>
        <form
          className="space-y-4 rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            actionMutation.mutate();
          }}
        >
          <h3 className="font-semibold text-foreground">Advance binding state</h3>
          <label className={labelClassName}>
            Binding UUID
            <input
              required
              className={inputClassName}
              onChange={(event) => setBindingId(event.target.value)}
              value={bindingId}
            />
          </label>
          <SearchableSelect
            allowEmpty={false}
            label="Action"
            onValueChange={(value) => setBindingAction(value as typeof bindingAction)}
            options={bindingActionOptions}
            value={bindingAction}
          />
          <label className={labelClassName}>
            Reason
            <textarea
              required
              className={`${inputClassName} min-h-24 resize-y`}
              onChange={(event) => setActionReason(event.target.value)}
              value={actionReason}
            />
          </label>
          <div className="flex justify-end">
            <Button disabled={actionMutation.isPending} type="submit">
              Run binding action
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
