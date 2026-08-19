import { ArrowLeft, Check, FileDiff, RefreshCw, RotateCcw, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState, type FormEvent, type RefObject } from "react";

import { BRAND } from "@repo/ui/brand";
import {
  DataToolbar,
  EmptyState,
  PageContainer,
  PageHeader,
  PageSkeleton,
  SectionSurface,
  SummaryStrip,
  TableSection,
  type SummaryItem,
} from "@repo/ui/layouts";
import {
  Button,
  DetailsLink,
  ImpactBadge,
  Notice,
  RequestFailure,
  SearchField,
  SearchableSelect,
  Skeleton,
  StatusBadge,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  getPromotionProposal,
  getWhoAmI,
  listPromotionProposals,
  reviewPromotionProposal,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type PromotionProposal,
  type PromotionProposalDecision,
  type PromotionProposalState,
  type ReviewPromotionProposalInput,
  type WhoAmI,
} from "../../shared/api";
import {
  defaultProposalPageSize,
  defaultProposalState,
  diffProposalValues,
  filterPromotionProposals,
  formatProposalTimestamp,
  highImpactReasonLabel,
  humanizeProposalField,
  isPromotionProposalState,
  mayReviewPromotionProposals,
  parseProposalPageSize,
  proposalPageSizeOptions,
  proposalListIdentifier,
  proposalStateLabel,
  proposalStateOptions,
  proposalStateTone,
  proposalValueDocument,
  shortProposalIdentifier,
  summarizeProposalChange,
  type ProposalPageSize,
  type ProposalValueDiffStatus,
} from "./proposalModel";

interface ProposalsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
  selectedProposalId: string | null;
}

interface ProposalListUrlState {
  cursor: string;
  pageSize: ProposalPageSize;
  query: string;
  state: PromotionProposalState;
}

type ReviewMode = "accept" | "reject" | null;

const controlLinkClassName =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:border-accent hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function readProposalListUrlState(): ProposalListUrlState {
  const parameters = new URLSearchParams(window.location.search);
  const stateValue = parameters.get("state");
  return {
    cursor: parameters.get("cursor") ?? "",
    pageSize: parseProposalPageSize(parameters.get("page_size")) ?? defaultProposalPageSize,
    query: parameters.get("q") ?? "",
    state: isPromotionProposalState(stateValue) ? stateValue : defaultProposalState,
  };
}

function writeProposalListUrlState(state: ProposalListUrlState, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  if (state.state === defaultProposalState) url.searchParams.delete("state");
  else url.searchParams.set("state", state.state);
  if (state.pageSize === defaultProposalPageSize) url.searchParams.delete("page_size");
  else url.searchParams.set("page_size", String(state.pageSize));
  if (state.query) url.searchParams.set("q", state.query);
  else url.searchParams.delete("q");
  if (state.cursor) url.searchParams.set("cursor", state.cursor);
  else url.searchParams.delete("cursor");
  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
}

function proposalListHref(): string {
  const url = new URL("/proposals", window.location.origin);
  const current = new URLSearchParams(window.location.search);
  for (const key of ["state", "page_size", "q", "cursor"]) {
    const value = current.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function requestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function queryTenantKey(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function identityName(identity: WhoAmI): string {
  return (
    identity.actor_display_name ??
    identity.actor_email ??
    shortProposalIdentifier(identity.actor_id)
  );
}

function queryErrorPresentation(error: unknown, detail = false) {
  if (error instanceof ContextplaneApiError) {
    if (error.code === "unauthenticated") {
      return {
        body: "Connect through the deployment gateway or runtime token provider. Access tokens must not be placed in browser-bundled variables.",
        title: `Connect an authenticated ${BRAND.name} session`,
        variant: "warning" as const,
      };
    }
    if (error.code === "tenant_required") {
      return {
        body: "The credential spans multiple tenants. Select a tenant that the runtime maps to the X-Tenant-ID request header.",
        title: "Select an API tenant",
        variant: "warning" as const,
      };
    }
    if (detail && error.status === 404) {
      return {
        body: "The proposal is absent or belongs to another tenant. The service intentionally returns the same response for both cases.",
        title: "Proposal not found",
        variant: "warning" as const,
      };
    }
    if (error.status === 403) {
      return {
        body: "The service did not authorize this proposal operation for the resolved actor and tenant.",
        title: "Proposal access is restricted",
        variant: "warning" as const,
      };
    }
  }

  return {
    body: "The proposal service response could not be loaded. Existing page context is preserved; retry when the service is available.",
    title: "Proposals could not be loaded",
    variant: "danger" as const,
  };
}

function decisionErrorPresentation(error: unknown) {
  if (error instanceof ContextplaneApiError) {
    if (error.status === 409) {
      return {
        body: "Another reviewer already decided this proposal. Refresh the proposal before taking another action.",
        title: "Proposal state changed",
      };
    }
    if (error.status === 403) {
      return {
        body: "Only a producer or administrator in the owning tenant may decide this proposal.",
        title: "Review action not permitted",
      };
    }
    if (error.status === 422) {
      return {
        body: "The service rejected this decision as invalid. Preserve the review context, correct the input, and try again.",
        title: "Decision could not be submitted",
      };
    }
  }
  return {
    body: "The decision was not recorded. The proposal remains unchanged and the entered rationale has been preserved.",
    title: "Decision could not be recorded",
  };
}

function QueryFailure({
  detail = false,
  error,
  onRetry,
}: {
  detail?: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const presentation = queryErrorPresentation(error, detail);
  const requestId = error instanceof ContextplaneApiError ? error.requestId : null;
  return (
    <RequestFailure
      onRetry={onRetry}
      requestId={requestId}
      title={presentation.title}
      variant={presentation.variant}
    >
      {presentation.body}
    </RequestFailure>
  );
}

function ProposalsHeader({
  identity,
  state,
}: {
  identity: WhoAmI;
  state?: PromotionProposalState;
}) {
  return (
    <PageHeader
      breadcrumbs={[{ href: "/", label: identity.tenant_display_name }, { label: "Proposals" }]}
      description="Review observed claims proposed for promotion into the canonical context graph, with the current value, proposed change, impact classification, and tenant provenance kept together."
      eyebrow="Memory governance"
      metadata={
        <>
          <StatusBadge tone="info">Tenant-owned subjects</StatusBadge>
          {state ? (
            <StatusBadge tone={proposalStateTone(state)}>{proposalStateLabel(state)}</StatusBadge>
          ) : null}
          <StatusBadge>{identityName(identity)}</StatusBadge>
        </>
      }
      title="Proposals"
    />
  );
}

function ProposalFilters({
  filteredCount,
  onClearQuery,
  onPageSizeChange,
  onQueryChange,
  onStateChange,
  pageSize,
  query,
  returnedCount,
  searchRef,
  state,
}: {
  filteredCount: number;
  onClearQuery: () => void;
  onPageSizeChange: (value: ProposalPageSize) => void;
  onQueryChange: (value: string) => void;
  onStateChange: (value: PromotionProposalState) => void;
  pageSize: ProposalPageSize;
  query: string;
  returnedCount: number;
  searchRef: RefObject<HTMLInputElement | null>;
  state: PromotionProposalState;
}) {
  return (
    <DataToolbar
      actions={
        <Button
          className={query ? "text-warning hover:bg-warning-subtle" : undefined}
          disabled={!query}
          onClick={onClearQuery}
          size="compact"
          title={query ? "Clear proposal search" : "No proposal search to clear"}
          variant="ghost"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Clear search
        </Button>
      }
      filters={
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <SearchableSelect
            allowEmpty={false}
            label="Proposal state"
            onValueChange={(value) => {
              if (isPromotionProposalState(value)) onStateChange(value);
            }}
            options={proposalStateOptions}
            searchPlaceholder="Search states"
            value={state}
          />
          <SearchableSelect
            allowEmpty={false}
            label="Page size"
            onValueChange={(value) => {
              const nextPageSize = parseProposalPageSize(value);
              if (nextPageSize !== null) onPageSizeChange(nextPageSize);
            }}
            options={proposalPageSizeOptions.map((value) => ({
              label: `${value} proposals`,
              value: String(value),
            }))}
            searchPlaceholder="Search page sizes"
            value={String(pageSize)}
          />
        </div>
      }
      resultSummary={`${filteredCount} of ${returnedCount} returned proposals · Oldest first · Current tenant only`}
      search={
        <SearchField
          ref={searchRef}
          label="Search returned page"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="ID, predicate, target, or value"
          value={query}
        />
      }
    />
  );
}

function ProposalRows({ proposals }: { proposals: readonly PromotionProposal[] }) {
  return (
    <div aria-label="Scrollable proposals" className="overflow-x-auto" role="region" tabIndex={0}>
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <caption className="sr-only">Promotion proposals returned by the service</caption>
        <thead>
          <tr className="border-y border-border bg-surface-muted text-xs text-muted">
            <th className="w-44 px-6 py-3 font-medium" scope="col">
              Proposal
            </th>
            <th className="w-40 px-4 py-3 font-medium" scope="col">
              Target
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Change summary
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Impact
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Created
            </th>
            <th
              className="sticky right-0 border-l border-border bg-surface-muted px-6 py-3 text-right font-medium"
              scope="col"
            >
              Details
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {proposals.map((proposal) => {
            const href = `/proposals/${encodeURIComponent(proposal.proposal_id)}${window.location.search}`;
            const changeSummary = summarizeProposalChange(
              proposal.current_value,
              proposal.proposed_value,
            );
            return (
              <tr key={proposal.proposal_id} className="group hover:bg-surface-muted">
                <th className="px-6 py-4 align-top font-medium" scope="row">
                  <a
                    className="text-sm font-medium text-accent hover:underline"
                    href={href}
                    title={proposal.proposal_id}
                  >
                    {humanizeProposalField(proposal.predicate)}
                  </a>
                  <span className="mt-1 block font-mono text-xs font-normal text-muted">
                    ID {proposalListIdentifier(proposal.proposal_id)}
                  </span>
                </th>
                <td className="px-4 py-4 align-top">
                  <span className="block text-xs font-medium text-foreground">
                    {humanizeProposalField(proposal.target_kind)}
                  </span>
                  <code
                    className="mt-1 block max-w-48 truncate text-xs text-muted"
                    title={proposal.target_key}
                  >
                    {proposal.target_key}
                  </code>
                </td>
                <td className="px-4 py-4 align-top">
                  <span className="block text-xs font-medium text-foreground">
                    {changeSummary.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted">{changeSummary.detail}</span>
                </td>
                <td className="px-4 py-4 align-top">
                  <ImpactBadge highImpact={proposal.high_impact} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 align-top text-xs text-muted tabular-nums">
                  {formatProposalTimestamp(proposal.created_at)}
                </td>
                <td className="sticky right-0 border-l border-border bg-surface px-6 py-4 text-right align-top group-hover:bg-surface-muted">
                  <DetailsLink href={href} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProposalsListPage({
  apiTenantId,
  client,
  identity,
  searchRef,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  identity: WhoAmI;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const queryClient = useQueryClient();
  const [urlState, setUrlState] = useState(readProposalListUrlState);
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const tenantKey = queryTenantKey(apiTenantId);

  useEffect(() => {
    function restoreUrlState() {
      setUrlState(readProposalListUrlState());
    }
    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, []);

  const proposalsQuery = useQuery({
    queryFn: ({ signal }) =>
      listPromotionProposals(
        client,
        {
          ...(urlState.cursor ? { cursor: urlState.cursor } : {}),
          pageSize: urlState.pageSize,
          state: urlState.state,
        },
        context,
        signal,
      ),
    queryKey: [
      "contextplane",
      tenantKey,
      "promotion-proposals",
      urlState.state,
      urlState.pageSize,
      urlState.cursor,
    ],
  });

  function updateUrlState(nextState: ProposalListUrlState, mode: "push" | "replace" = "replace") {
    writeProposalListUrlState(nextState, mode);
    setUrlState(nextState);
  }

  const returned = proposalsQuery.data?.items ?? [];
  const filtered = filterPromotionProposals(returned, urlState.query);
  const invalidCursor =
    proposalsQuery.error instanceof ContextplaneApiError &&
    proposalsQuery.error.code === "invalid_cursor";

  return (
    <PageContainer>
      <ProposalsHeader identity={identity} state={urlState.state} />
      <div className="space-y-6">
        <Notice title="Promotion proposals preserve the truth boundary">
          Each row is an observed claim proposed for a canonical write. An open proposal is not yet
          canonical, and acceptance or rejection applies only to the owning tenant&apos;s subject.
        </Notice>

        <TableSection
          action={
            <Button
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["contextplane", tenantKey, "promotion-proposals"],
                })
              }
              size="compact"
              variant="ghost"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
          }
          description="Tenant-owned claim promotions, ordered oldest first by the service so the longest-waiting decision remains visible."
          filters={
            <ProposalFilters
              filteredCount={filtered.length}
              onClearQuery={() => updateUrlState({ ...urlState, query: "" })}
              onPageSizeChange={(pageSize) => updateUrlState({ ...urlState, cursor: "", pageSize })}
              onQueryChange={(query) => updateUrlState({ ...urlState, query })}
              onStateChange={(state) => updateUrlState({ ...urlState, cursor: "", state })}
              pageSize={urlState.pageSize}
              query={urlState.query}
              returnedCount={returned.length}
              searchRef={searchRef}
              state={urlState.state}
            />
          }
          filtersId="proposal-filters"
          footer={
            !proposalsQuery.isError && returned.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted">
                  Search applies only to this returned page. The cursor is opaque and is sent back
                  to the service unchanged.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!urlState.cursor}
                    onClick={() => updateUrlState({ ...urlState, cursor: "" }, "push")}
                    variant="secondary"
                  >
                    First page
                  </Button>
                  <Button
                    disabled={!proposalsQuery.data?.next_cursor}
                    onClick={() => {
                      const cursor = proposalsQuery.data?.next_cursor;
                      if (cursor) updateUrlState({ ...urlState, cursor }, "push");
                    }}
                    variant="secondary"
                  >
                    Next page
                  </Button>
                </div>
              </div>
            ) : undefined
          }
          title="Promotion proposals"
        >
          {proposalsQuery.isLoading ? (
            <div className="space-y-3 px-6 py-5">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : proposalsQuery.isError ? (
            <div className="p-6">
              {invalidCursor ? (
                <Notice
                  action={
                    <Button
                      onClick={() => updateUrlState({ ...urlState, cursor: "" }, "replace")}
                      variant="secondary"
                    >
                      Return to first page
                    </Button>
                  }
                  title="This proposal page cursor is invalid"
                  variant="warning"
                >
                  The service refused the cursor. It is not decoded or repaired in the browser;
                  return to the first page for a fresh service cursor.
                </Notice>
              ) : (
                <QueryFailure
                  error={proposalsQuery.error}
                  onRetry={() => void proposalsQuery.refetch()}
                />
              )}
            </div>
          ) : filtered.length > 0 ? (
            <ProposalRows proposals={filtered} />
          ) : returned.length > 0 ? (
            <EmptyState
              description="Clear the local search to restore every proposal on this service page."
              title="No returned proposal matches this search"
            />
          ) : (
            <EmptyState
              description="The service returned no tenant-owned promotion proposals in this state. This is not a count of other tenants or ARC authoring proposals."
              icon={FileDiff}
              title={`No ${proposalStateLabel(urlState.state).toLocaleLowerCase()} proposals`}
            />
          )}
        </TableSection>
      </div>
    </PageContainer>
  );
}

function ProposalValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <pre className="mt-3 max-h-80 overflow-auto border-l-2 border-border-strong bg-surface-muted px-4 py-3 font-mono text-xs leading-5 text-foreground whitespace-pre-wrap break-words">
        {proposalValueDocument(value)}
      </pre>
    </div>
  );
}

function ProposalTruthBoundary({ proposal }: { proposal: PromotionProposal }) {
  if (proposal.state === "open") {
    return (
      <Notice title="Observed claim, not canonical state">
        The proposed value remains observed context until the service accepts this proposal. The
        current value below is the canonical baseline supplied with the proposal.
      </Notice>
    );
  }

  if (proposal.state === "rejected") {
    return (
      <Notice title="Proposed canonical write was rejected" variant="warning">
        The proposal remains part of the review record, but its observed value was not promoted. The
        values below are the preserved decision context.
      </Notice>
    );
  }

  return (
    <Notice
      title={
        proposal.state === "amended" ? "Amended promotion recorded" : "Canonical promotion recorded"
      }
      variant="success"
    >
      The proposal is terminal. The values below are its preserved review snapshot; load the
      canonical subject separately when the latest graph value is required.
    </Notice>
  );
}

function proposalDiffTone(
  status: ProposalValueDiffStatus,
): "danger" | "info" | "neutral" | "warning" {
  if (status === "added") return "info";
  if (status === "removed") return "danger";
  if (status === "changed") return "warning";
  return "neutral";
}

function DecisionFailure({ error, onRefresh }: { error: unknown; onRefresh: () => void }) {
  const presentation = decisionErrorPresentation(error);
  const requestId = error instanceof ContextplaneApiError ? error.requestId : null;
  const conflict = error instanceof ContextplaneApiError && error.status === 409;
  return (
    <Notice
      action={
        conflict ? (
          <Button onClick={onRefresh} variant="secondary">
            <RefreshCw aria-hidden="true" className="size-4" />
            Refresh proposal
          </Button>
        ) : undefined
      }
      title={presentation.title}
      variant="danger"
    >
      <p>{presentation.body}</p>
      {requestId ? (
        <p className="mt-2 text-xs">
          Request ID: <code>{requestId}</code>
        </p>
      ) : null}
    </Notice>
  );
}

function ReviewControls({
  decision,
  identity,
  onDecide,
  pending,
  proposal,
}: {
  decision: PromotionProposalDecision | undefined;
  identity: WhoAmI;
  onDecide: (input: ReviewPromotionProposalInput) => void;
  pending: boolean;
  proposal: PromotionProposal;
}) {
  const reasonId = useId();
  const [mode, setMode] = useState<ReviewMode>(null);
  const [reason, setReason] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const mayReview = mayReviewPromotionProposals(identity);

  function chooseMode(nextMode: ReviewMode) {
    setMode(nextMode);
    setValidationMessage("");
  }

  function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = reason.trim();
    if (!normalized) {
      setValidationMessage("Enter the service-required rejection reason.");
      return;
    }
    setValidationMessage("");
    onDecide({ reason: normalized, state: "rejected" });
  }

  if (decision) {
    return (
      <Notice
        role="status"
        title={decision.proposal.state === "rejected" ? "Proposal rejected" : "Proposal accepted"}
        variant={decision.proposal.state === "rejected" ? "warning" : "success"}
      >
        {decision.proposal.state === "rejected" ? (
          <p>The proposed canonical write was refused. The underlying claim remains staged.</p>
        ) : (
          <p>
            The service recorded the canonical write
            {decision.promotion_id ? (
              <>
                {" "}
                under promotion <code>{decision.promotion_id}</code>
              </>
            ) : null}
            .
          </p>
        )}
      </Notice>
    );
  }

  if (proposal.state !== "open") {
    return (
      <Notice title={`Proposal is ${proposalStateLabel(proposal.state).toLocaleLowerCase()}`}>
        This proposal is terminal and no further review action is available from this page.
      </Notice>
    );
  }

  if (!mayReview) {
    return (
      <Notice title="Review actions require producer or administrator access" variant="warning">
        The proposal remains readable, but the service permits only a producer or administrator in
        the owning tenant to accept or reject it.
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => chooseMode("accept")}>
          <Check aria-hidden="true" className="size-4" />
          Accept proposal
        </Button>
        <Button onClick={() => chooseMode("reject")} variant="danger">
          <X aria-hidden="true" className="size-4" />
          Reject proposal
        </Button>
      </div>

      {mode === "accept" ? (
        <div className="border-t border-border-subtle pt-4">
          <h3 className="text-sm font-semibold text-foreground">Confirm canonical promotion</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            Acceptance writes the exact proposed value to the canonical context graph. The service
            returns a promotion identifier for the audit and reversal workflow.
          </p>
          {proposal.high_impact ? (
            <p className="mt-3 text-sm font-medium text-warning">
              The service classified this proposal as high impact. Review every reported reason
              before confirming.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => onDecide({ state: "accepted" })}>
              {pending ? "Recording acceptance…" : "Confirm acceptance"}
            </Button>
            <Button disabled={pending} onClick={() => chooseMode(null)} variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "reject" ? (
        <form className="border-t border-border-subtle pt-4" onSubmit={reject}>
          <h3 className="text-sm font-semibold text-foreground">Reject proposed canonical write</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            Rejection refuses this promotion but does not discard the underlying staged claim.
          </p>
          <label className="mt-4 block max-w-2xl text-xs font-medium text-muted" htmlFor={reasonId}>
            Rejection reason
          </label>
          <textarea
            aria-describedby={validationMessage ? `${reasonId}-error` : undefined}
            aria-invalid={validationMessage ? "true" : undefined}
            className="mt-1.5 min-h-28 w-full max-w-2xl rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            id={reasonId}
            onChange={(event) => setReason(event.currentTarget.value)}
            placeholder="Explain why this canonical write is incorrect or unsuitable"
            value={reason}
          />
          {validationMessage ? (
            <p className="mt-1 text-xs text-danger" id={`${reasonId}-error`} role="alert">
              {validationMessage}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pending} type="submit" variant="danger">
              {pending ? "Recording rejection…" : "Confirm rejection"}
            </Button>
            <Button disabled={pending} onClick={() => chooseMode(null)} variant="ghost">
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function ProposalDetailPage({
  apiTenantId,
  client,
  identity,
  proposalId,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  identity: WhoAmI;
  proposalId: string;
}) {
  const queryClient = useQueryClient();
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const tenantKey = queryTenantKey(apiTenantId);
  const queryKey = ["contextplane", tenantKey, "promotion-proposal", proposalId] as const;
  const proposalQuery = useQuery({
    queryFn: ({ signal }) => getPromotionProposal(client, proposalId, context, signal),
    queryKey,
  });
  const decisionMutation = useMutation({
    mutationFn: (decision: ReviewPromotionProposalInput) =>
      reviewPromotionProposal(client, proposalId, decision, context),
    onSuccess(result) {
      queryClient.setQueryData(queryKey, result.proposal);
      void queryClient.invalidateQueries({
        queryKey: ["contextplane", tenantKey, "promotion-proposals"],
      });
    },
  });
  const listHref = proposalListHref();

  if (proposalQuery.isLoading) return <PageSkeleton controls={2} rows={5} />;
  if (proposalQuery.isError) {
    return (
      <PageContainer>
        <PageHeader
          actions={
            <a className={controlLinkClassName} href={listHref}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to proposals
            </a>
          }
          breadcrumbs={[
            { href: "/", label: identity.tenant_display_name },
            { href: listHref, label: "Proposals" },
            { label: shortProposalIdentifier(proposalId) },
          ]}
          description="The proposal detail could not be resolved within the current tenant boundary."
          eyebrow="Memory governance"
          title="Proposal review"
        />
        <QueryFailure
          detail
          error={proposalQuery.error}
          onRetry={() => void proposalQuery.refetch()}
        />
      </PageContainer>
    );
  }

  const proposal = proposalQuery.data;
  if (!proposal) return <PageSkeleton controls={2} rows={5} />;

  const summaryItems: readonly SummaryItem[] = [
    {
      detail: "Service workflow state",
      id: "state",
      label: "State",
      value: proposalStateLabel(proposal.state),
    },
    {
      detail: "Absolute service timestamp",
      id: "created",
      label: "Created",
      value: formatProposalTimestamp(proposal.created_at),
    },
    {
      detail: humanizeProposalField(proposal.target_kind),
      id: "target",
      label: "Target",
      value: proposal.target_key,
    },
    {
      detail: "Service impact classification",
      id: "impact",
      label: "Impact",
      value: <ImpactBadge highImpact={proposal.high_impact} />,
    },
  ];
  const valueDiff = diffProposalValues(proposal.current_value, proposal.proposed_value);

  return (
    <PageContainer>
      <PageHeader
        actions={
          <a className={controlLinkClassName} href={listHref}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to proposals
          </a>
        }
        breadcrumbs={[
          { href: "/", label: identity.tenant_display_name },
          { href: listHref, label: "Proposals" },
          { label: shortProposalIdentifier(proposal.proposal_id) },
        ]}
        description={
          <>
            {proposal.state === "open" ? "Review" : "Inspect"} the{" "}
            {proposal.state === "open" ? "proposed canonical change" : "recorded proposal decision"}{" "}
            for <code className="text-sm text-foreground">{proposal.target_key}</code>, its
            provenance, and the service-reported impact{" "}
            {proposal.state === "open" ? "before deciding." : "preserved with it."}
          </>
        }
        eyebrow="Promotion proposal"
        metadata={
          <>
            <StatusBadge tone={proposalStateTone(proposal.state)}>
              {proposalStateLabel(proposal.state)}
            </StatusBadge>
            <ImpactBadge highImpact={proposal.high_impact} />
            <StatusBadge>{humanizeProposalField(proposal.predicate)}</StatusBadge>
          </>
        }
        title="Proposal review"
      />

      <div className="space-y-6">
        <ProposalTruthBoundary proposal={proposal} />

        <SummaryStrip items={summaryItems} label="Proposal summary" />

        <SectionSurface
          description="The exact JSON values returned by the service. No client-side normalization or confidence threshold is applied."
          title="Canonical baseline and proposed value"
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <ProposalValue label="Canonical baseline in proposal" value={proposal.current_value} />
            <ProposalValue label="Proposed observed value" value={proposal.proposed_value} />
          </div>
          <div className="mt-6 border-t border-border-subtle pt-6">
            <h3 className="text-sm font-semibold text-foreground">Field-level comparison</h3>
            <p className="mt-1 text-sm leading-6 text-muted">
              A direct browser comparison of the two service values. This highlights structural
              changes but does not add evidence or a risk classification.
            </p>
            <div
              aria-label="Scrollable proposal value comparison"
              className="mt-4 overflow-x-auto"
              role="region"
              tabIndex={0}
            >
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Field-level comparison of current and proposed values
                </caption>
                <thead>
                  <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                    <th className="px-4 py-3 font-medium" scope="col">
                      JSON path
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Change
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Current
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Proposed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {valueDiff.map((field) => (
                    <tr key={field.path}>
                      <th className="px-4 py-3 font-mono text-xs font-medium" scope="row">
                        {field.path}
                      </th>
                      <td className="px-4 py-3">
                        <StatusBadge tone={proposalDiffTone(field.status)}>
                          {humanizeProposalField(field.status)}
                        </StatusBadge>
                      </td>
                      <td className="max-w-64 px-4 py-3 font-mono text-xs text-muted">
                        {field.current}
                      </td>
                      <td className="max-w-64 px-4 py-3 font-mono text-xs text-foreground">
                        {field.proposed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionSurface>

        {proposal.high_impact ? (
          <Notice title="The service classified this proposal as high impact" variant="warning">
            {proposal.high_impact_reasons.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {proposal.high_impact_reasons.map((reason) => (
                  <li key={reason}>{highImpactReasonLabel(reason)}</li>
                ))}
              </ul>
            ) : (
              <p>
                No reason codes were published. Do not infer the missing explanation in the browser.
              </p>
            )}
          </Notice>
        ) : (
          <Notice title="No high-impact classification was reported">
            This means the service set <code>high_impact</code> to false; it is not a
            browser-derived claim that the change is risk-free.
          </Notice>
        )}

        <Notice title="Supporting evidence and affected records are not published">
          This proposal response identifies the source claim and subject, but it does not include
          citations, conflicting evidence, affected versions or dependents, reviewer identity, or
          decision timestamps. The browser does not infer that missing decision context.
        </Notice>

        <SectionSurface
          description="Stable identifiers and validity supplied by the promotion proposal."
          title="Provenance and scope"
        >
          <dl className="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
            {[
              ["Proposal ID", proposal.proposal_id],
              ["Claim ID", proposal.claim_id],
              ["Subject entity ID", proposal.subject_entity_id],
              ["Predicate", proposal.predicate],
              ["Owner tenant ID", proposal.owner_tenant_id],
              ["Author tenant ID", proposal.author_tenant_id],
              ["Valid from", formatProposalTimestamp(proposal.valid_from)],
              ["Valid to", formatProposalTimestamp(proposal.valid_to)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 border-b border-border-subtle pb-4">
                <dt className="text-xs font-medium text-muted">{label}</dt>
                <dd className="mt-1 break-all font-mono text-xs text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionSurface>

        <SectionSurface
          description="The server rechecks the owning tenant, actor, role, and current proposal state when a decision is submitted."
          title="Review decision"
        >
          <div className="space-y-4">
            {decisionMutation.isError ? (
              <DecisionFailure
                error={decisionMutation.error}
                onRefresh={() => {
                  decisionMutation.reset();
                  void proposalQuery.refetch();
                }}
              />
            ) : null}
            <ReviewControls
              decision={decisionMutation.data}
              identity={identity}
              onDecide={(decision) => decisionMutation.mutate(decision)}
              pending={decisionMutation.isPending}
              proposal={proposal}
            />
          </div>
        </SectionSurface>
      </div>
    </PageContainer>
  );
}

export function ProposalsPage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
  selectedProposalId,
}: ProposalsPageProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const identityQuery = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, context, signal),
    queryKey: ["contextplane", queryTenantKey(apiTenantId), "identity"],
    staleTime: 5 * 60 * 1000,
  });

  if (identityQuery.isLoading) return <PageSkeleton controls={2} rows={5} />;
  if (identityQuery.isError) {
    return (
      <PageContainer>
        <PageHeader
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Proposals" }]}
          description="Proposal governance becomes available after the service resolves the bearer credential to an actor and tenant."
          eyebrow="Memory governance"
          metadata={<StatusBadge tone="warning">Identity unresolved</StatusBadge>}
          title="Proposals"
        />
        <QueryFailure error={identityQuery.error} onRetry={() => void identityQuery.refetch()} />
      </PageContainer>
    );
  }
  if (!identityQuery.data) return <PageSkeleton controls={2} rows={5} />;

  return selectedProposalId ? (
    <ProposalDetailPage
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identityQuery.data}
      proposalId={selectedProposalId}
    />
  ) : (
    <ProposalsListPage
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identityQuery.data}
      searchRef={searchRef}
    />
  );
}
