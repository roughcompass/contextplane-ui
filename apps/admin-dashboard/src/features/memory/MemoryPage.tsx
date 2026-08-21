import {
  Check,
  ClipboardCheck,
  Copy,
  Database,
  History,
  PenLine,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { BRAND } from "@repo/ui/brand";
import {
  DataToolbar,
  DetailLayout,
  EmptyState,
  PageContainer,
  PageHeader,
  PageSkeleton,
  SectionSurface,
  TableSection,
} from "@repo/ui/layouts";
import {
  Button,
  DetailsLink,
  Notice,
  RequestFailure,
  SearchableSelect,
  SearchField,
  Skeleton,
  StatusBadge,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  getMemoryClaim,
  getMemoryClaimHistory,
  getMemoryCurationCounts,
  getWhoAmI,
  listMemoryClaims,
  listMemoryCurationQueue,
  searchMemoryClaims,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type MemoryClaim,
  type MemoryClaimHistoryItem,
  type MemoryClaimPersona,
  type MemoryCurationItem,
  type WhoAmI,
} from "../../shared/api";
import { assertClaimHref } from "./claimAssertionModel";
import {
  curationCountSummary,
  defaultMemoryPersona,
  formatClaimValue,
  formatConfidence,
  formatMemoryTimestamp,
  humanizeMemoryValue,
  memoryClaimHref,
  memoryClaimLimit,
  memoryConfidenceOptions,
  memoryCurationPageSize,
  memoryListHref,
  memoryPersonaOptions,
  memorySearch,
  memoryTabs,
  readMemoryUrlState,
  recallCaveat,
  shortMemoryIdentifier,
  uncitedClaims,
  type MemoryConfidenceFloor,
  type MemoryTab,
  type MemoryUrlState,
} from "./memoryModel";

interface MemoryPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
  selectedClaimId: string | null;
}

const inputClassName =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block min-w-48 flex-1 text-xs font-medium text-muted";
const selectControlClassName = "min-w-48 flex-1";
const controlLinkClassName =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:border-accent hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function requestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function tenantQueryKey(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function errorPresentation(error: unknown): {
  body: string;
  title: string;
  variant: "danger" | "warning";
} {
  if (error instanceof ContextplaneApiError) {
    if (error.code === "unauthenticated") {
      return {
        body: "Connect through the deployment gateway or runtime token provider. Access tokens must not be placed in browser-bundled variables.",
        title: `Connect an authenticated ${BRAND.name} session`,
        variant: "warning",
      };
    }
    if (error.code === "tenant_required") {
      return {
        body: "The credential spans multiple tenants. Select a tenant that the runtime maps to the X-Tenant-ID request header.",
        title: "Select an API tenant",
        variant: "warning",
      };
    }
    if (error.status === 403) {
      return {
        body: "The resolved identity cannot read this Living Memory scope. Existing catalog records remain available.",
        title: "Living Memory is restricted",
        variant: "warning",
      };
    }
    if (error.code === "service_unavailable" || error.code === "unavailable") {
      return {
        body: "Living Memory is not available on this deployment. Canonical catalog and audit records remain available.",
        title: "Living Memory is unavailable",
        variant: "warning",
      };
    }
  }

  return {
    body: "The requested Living Memory data could not be loaded. No observation or canonical record has been changed; retry when the service is available.",
    title: "Living Memory could not be loaded",
    variant: "danger",
  };
}

function QueryFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const presentation = errorPresentation(error);
  return (
    <RequestFailure
      onRetry={onRetry}
      requestId={error instanceof ContextplaneApiError ? error.requestId : null}
      title={presentation.title}
      variant={presentation.variant}
    >
      {presentation.body}
    </RequestFailure>
  );
}

function identityName(identity: WhoAmI): string {
  return (
    identity.actor_display_name ?? identity.actor_email ?? shortMemoryIdentifier(identity.actor_id)
  );
}

function MemoryHeader({ identity }: { identity: WhoAmI }) {
  return (
    <PageHeader
      actions={
        <a className={controlLinkClassName} href={assertClaimHref()}>
          <PenLine aria-hidden="true" className="size-4" />
          Record claim
        </a>
      }
      breadcrumbs={[{ href: "/", label: identity.tenant_display_name }, { label: "Living Memory" }]}
      description="Inspect recalled claims with their confidence, evidence, time scope, and human-review state, then see what is waiting for curator attention."
      eyebrow="Observed context"
      metadata={
        <>
          <StatusBadge tone="info">Observed claims</StatusBadge>
          <StatusBadge>{identity.tenant_display_name}</StatusBadge>
          <StatusBadge>{identityName(identity)}</StatusBadge>
        </>
      }
      title="Living Memory"
    />
  );
}

function IdentityFailure({
  activeTenantName,
  error,
  onRetry,
}: {
  activeTenantName: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Living Memory" }]}
        description="Inspect recalled claims, evidence, and curator attention without treating observations as canonical records."
        eyebrow="Observed context"
        title="Living Memory"
      />
      <QueryFailure error={error} onRetry={onRetry} />
    </PageContainer>
  );
}

function MemoryTabs({
  activeTab,
  onChange,
}: {
  activeTab: MemoryTab;
  onChange: (tab: MemoryTab) => void;
}) {
  function moveFocus(index: number) {
    const tab = memoryTabs[index];
    if (!tab) return;
    onChange(tab.id);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`#memory-tab-${tab.id}`)?.focus();
    });
  }

  return (
    <div
      aria-label="Living Memory areas"
      className="mb-6 grid grid-cols-2 border-b border-border"
      role="tablist"
    >
      {memoryTabs.map((tab, index) => (
        <button
          key={tab.id}
          aria-controls={`memory-panel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          className={`min-h-11 border-b-2 px-4 py-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            activeTab === tab.id
              ? "border-accent font-semibold text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
          id={`memory-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveFocus((index + 1) % memoryTabs.length);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveFocus((index - 1 + memoryTabs.length) % memoryTabs.length);
            } else if (event.key === "Home") {
              event.preventDefault();
              moveFocus(0);
            } else if (event.key === "End") {
              event.preventDefault();
              moveFocus(memoryTabs.length - 1);
            }
          }}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ClaimsLoading() {
  return (
    <div className="space-y-3 px-6 py-5">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  );
}

function ClaimsRows({ claims, state }: { claims: readonly MemoryClaim[]; state: MemoryUrlState }) {
  return (
    <div
      aria-label="Scrollable observed claims"
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">Observed claims returned by Living Memory</caption>
        <thead>
          <tr className="border-y border-border bg-surface-muted text-xs text-muted">
            <th className="w-40 px-6 py-3 font-medium" scope="col">
              Claim
            </th>
            <th className="w-32 px-4 py-3 font-medium" scope="col">
              Subject
            </th>
            <th className="w-24 px-4 py-3 text-right font-medium" scope="col">
              Confidence
            </th>
            <th className="w-36 px-4 py-3 font-medium" scope="col">
              Review state
            </th>
            <th className="w-20 px-4 py-3 text-right font-medium" scope="col">
              Evidence
            </th>
            <th className="w-44 px-4 py-3 font-medium" scope="col">
              Believed as of
            </th>
            <th
              className="sticky right-0 w-44 border-l border-border bg-surface-muted px-6 py-3 text-right font-medium"
              scope="col"
            >
              Details
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {claims.map((claim) => {
            const href = memoryClaimHref(claim.claim_id, state);
            return (
              <tr key={claim.claim_id} className="group hover:bg-surface-muted">
                <th className="px-6 py-4 align-top font-medium" scope="row">
                  <a className="text-sm text-accent hover:underline" href={href}>
                    {formatClaimValue(claim.value)}
                  </a>
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {humanizeMemoryValue(claim.predicate)} ·{" "}
                    {humanizeMemoryValue(claim.claim_category)}
                  </span>
                </th>
                <td className="px-4 py-4 align-top">
                  <span
                    className="block font-mono text-xs text-foreground"
                    title={claim.subject_entity_id}
                  >
                    {shortMemoryIdentifier(claim.subject_entity_id)}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {humanizeMemoryValue(claim.authority)} authority
                  </span>
                </td>
                <td className="px-4 py-4 text-right align-top font-medium text-foreground tabular-nums">
                  {formatConfidence(claim.confidence)}
                  <span className="mt-1 block text-xs font-normal text-muted">reported</span>
                </td>
                <td className="px-4 py-4 align-top">
                  <StatusBadge tone={claim.human_confirmed ? "success" : "neutral"}>
                    {claim.human_confirmed ? "Human confirmed" : "Not confirmed"}
                  </StatusBadge>
                </td>
                <td className="px-4 py-4 text-right align-top text-foreground tabular-nums">
                  {claim.citations.length} {claim.citations.length === 1 ? "citation" : "citations"}
                </td>
                <td className="whitespace-nowrap px-4 py-4 align-top text-xs text-muted tabular-nums">
                  <time dateTime={claim.as_of}>{formatMemoryTimestamp(claim.as_of)}</time>
                </td>
                <td className="sticky right-0 border-l border-border bg-surface px-6 py-4 text-right align-top group-hover:bg-surface-muted">
                  <DetailsLink href={href}>Inspect evidence</DetailsLink>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClaimFilters({
  onChange,
  searchRef,
  state,
}: {
  onChange: (state: MemoryUrlState) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  state: MemoryUrlState;
}) {
  const hasFilters = Boolean(
    state.query ||
    state.subjectEntityId ||
    state.predicate ||
    state.category ||
    state.namespacePrefix ||
    state.minConfidence ||
    state.persona !== defaultMemoryPersona,
  );

  return (
    <DataToolbar
      actions={
        <Button
          className={hasFilters ? "text-warning hover:bg-warning-subtle" : undefined}
          disabled={!hasFilters}
          onClick={() =>
            onChange({
              ...state,
              category: "",
              minConfidence: "",
              namespacePrefix: "",
              persona: defaultMemoryPersona,
              predicate: "",
              query: "",
              subjectEntityId: "",
            })
          }
          size="compact"
          title={hasFilters ? "Clear claim search and filters" : "No claim filters to clear"}
          variant="ghost"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Clear filters
        </Button>
      }
      filters={
        <>
          <label className={labelClassName}>
            Subject entity ID
            <input
              className={inputClassName}
              onChange={(event) =>
                onChange({ ...state, query: "", subjectEntityId: event.currentTarget.value })
              }
              placeholder="Entity UUID"
              value={state.subjectEntityId}
            />
          </label>
          <label className={labelClassName}>
            Predicate
            <input
              className={inputClassName}
              onChange={(event) =>
                onChange({ ...state, predicate: event.currentTarget.value, query: "" })
              }
              placeholder="owned_by_team"
              value={state.predicate}
            />
          </label>
          <label className={labelClassName}>
            Category
            <input
              className={inputClassName}
              onChange={(event) => onChange({ ...state, category: event.currentTarget.value })}
              placeholder="ownership"
              value={state.category}
            />
          </label>
          <label className={labelClassName}>
            Namespace prefix
            <input
              className={inputClassName}
              onChange={(event) =>
                onChange({ ...state, namespacePrefix: event.currentTarget.value })
              }
              placeholder="platform.identity"
              value={state.namespacePrefix}
            />
          </label>
          <SearchableSelect
            className={selectControlClassName}
            emptyLabel="Any reported confidence"
            label="Minimum confidence"
            onValueChange={(value) =>
              onChange({ ...state, minConfidence: value as MemoryConfidenceFloor })
            }
            options={memoryConfidenceOptions}
            value={state.minConfidence}
          />
          <SearchableSelect
            allowEmpty={false}
            className={selectControlClassName}
            label="Retrieval persona"
            onValueChange={(value) => onChange({ ...state, persona: value as MemoryClaimPersona })}
            options={memoryPersonaOptions}
            value={state.persona}
          />
        </>
      }
      search={
        <SearchField
          ref={searchRef}
          label="Search recalled claims"
          onChange={(event) => {
            const query = event.currentTarget.value;
            onChange({
              ...state,
              predicate: query.trim() ? "" : state.predicate,
              query,
              subjectEntityId: query.trim() ? "" : state.subjectEntityId,
            });
          }}
          placeholder="Value or predicate"
          value={state.query}
        />
      }
    />
  );
}

function ClaimsPanel({
  apiTenantId,
  client,
  searchRef,
  state,
  updateState,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
  state: MemoryUrlState;
  updateState: (state: MemoryUrlState) => void;
}) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const tenantKey = tenantQueryKey(apiTenantId);
  const searching = state.query.trim().length > 0;
  const minConfidence = state.minConfidence ? Number(state.minConfidence) : undefined;
  const structuralQuery = useQuery({
    enabled: !searching,
    queryFn: ({ signal }) =>
      listMemoryClaims(
        client,
        {
          ...(state.category.trim() ? { category: state.category.trim() } : {}),
          limit: memoryClaimLimit,
          ...(minConfidence === undefined ? {} : { minConfidence }),
          ...(state.namespacePrefix.trim()
            ? { namespacePrefix: state.namespacePrefix.trim() }
            : {}),
          persona: state.persona,
          ...(state.predicate.trim() ? { predicate: state.predicate.trim() } : {}),
          ...(state.subjectEntityId.trim()
            ? { subjectEntityId: state.subjectEntityId.trim() }
            : {}),
        },
        context,
        signal,
      ),
    queryKey: [
      "contextplane",
      tenantKey,
      "memory",
      "claims",
      state.subjectEntityId,
      state.predicate,
      state.category,
      state.namespacePrefix,
      state.minConfidence,
      state.persona,
    ],
  });
  const semanticQuery = useQuery({
    enabled: searching,
    queryFn: ({ signal }) =>
      searchMemoryClaims(
        client,
        {
          ...(state.category.trim() ? { category: state.category.trim() } : {}),
          ...(minConfidence === undefined ? {} : { minConfidence }),
          ...(state.namespacePrefix.trim()
            ? { namespacePrefix: state.namespacePrefix.trim() }
            : {}),
          persona: state.persona,
          query: state.query.trim(),
          topK: memoryClaimLimit,
        },
        context,
        signal,
      ),
    queryKey: [
      "contextplane",
      tenantKey,
      "memory",
      "claim-search",
      state.query,
      state.category,
      state.namespacePrefix,
      state.minConfidence,
      state.persona,
    ],
  });
  const activeQuery = searching ? semanticQuery : structuralQuery;
  const claims = activeQuery.data ?? [];
  const caveat = recallCaveat(claims);
  const uncited = uncitedClaims(claims);
  const inconsistentCaveat = claims.length > 0 && !caveat;

  return (
    <div id="memory-panel-claims" aria-labelledby="memory-tab-claims" role="tabpanel">
      <div className="space-y-6">
        {caveat ? (
          <Notice title="Recalled content is not canonical" variant="warning">
            {caveat}
          </Notice>
        ) : null}
        {inconsistentCaveat ? (
          <Notice title="Claims returned inconsistent trust notices" variant="danger">
            The service did not provide one trust boundary that applies to every returned claim.
            Inspect each claim individually before using the result.
          </Notice>
        ) : null}
        {uncited.length > 0 ? (
          <Notice title="Some claims arrived without evidence" variant="danger">
            {uncited.length} returned {uncited.length === 1 ? "claim has" : "claims have"} no
            citations. This violates the serving contract; the rows remain visible only for
            diagnosis and must not be treated as verified evidence.
          </Notice>
        ) : null}
        <TableSection
          action={
            activeQuery.isError ? undefined : (
              <Button onClick={() => void activeQuery.refetch()} size="compact" variant="ghost">
                <RefreshCw aria-hidden="true" className="size-4" />
                Refresh
              </Button>
            )
          }
          description={
            searching
              ? "Ranked semantic and lexical matches. The service publishes no total or next page for this retrieval."
              : "Exact structural matches in service order. This endpoint publishes no total or next page."
          }
          filters={
            activeQuery.isError ? undefined : (
              <ClaimFilters onChange={updateState} searchRef={searchRef} state={state} />
            )
          }
          filtersId="memory-claim-filters"
          title="Observed claims"
        >
          {activeQuery.isPending ? (
            <ClaimsLoading />
          ) : activeQuery.isError ? (
            <div className="p-6">
              <QueryFailure error={activeQuery.error} onRetry={() => void activeQuery.refetch()} />
            </div>
          ) : claims.length > 0 ? (
            <>
              <div
                aria-atomic="true"
                aria-live="polite"
                className="border-b border-border-subtle px-6 py-3 text-xs text-muted"
              >
                {claims.length} {searching ? "ranked" : "structural"}{" "}
                {claims.length === 1 ? "claim" : "claims"} returned · Limited to {memoryClaimLimit}
              </div>
              <ClaimsRows claims={claims} state={state} />
            </>
          ) : searching ? (
            <EmptyState
              description={`No recalled claim matched “${state.query.trim()}” in this visibility and filter scope. Clear the search to return to structural lookup.`}
              title="No claim matches this search"
            />
          ) : (
            <EmptyState
              description="The service returned no observed claims in this structural scope. This does not imply that no hidden or out-of-scope claims exist."
              icon={Database}
              title="No visible claims"
            />
          )}
        </TableSection>
      </div>
    </div>
  );
}

function CurationRows({
  items,
  state,
}: {
  items: readonly MemoryCurationItem[];
  state: MemoryUrlState;
}) {
  return (
    <div
      aria-label="Scrollable curation queue"
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">Living Memory items waiting for curator attention</caption>
        <thead>
          <tr className="border-y border-border bg-surface-muted text-xs text-muted">
            <th className="w-32 px-6 py-3 font-medium" scope="col">
              Reason
            </th>
            <th className="w-40 px-4 py-3 font-medium" scope="col">
              Claim
            </th>
            <th className="w-44 px-4 py-3 font-medium" scope="col">
              Subject reference
            </th>
            <th className="w-24 px-4 py-3 text-right font-medium" scope="col">
              Confidence
            </th>
            <th className="w-36 px-4 py-3 font-medium" scope="col">
              Waiting since
            </th>
            <th className="w-28 px-4 py-3 font-medium" scope="col">
              Service actions
            </th>
            <th
              className="sticky right-0 w-40 border-l border-border bg-surface-muted px-6 py-3 text-right font-medium"
              scope="col"
            >
              Details
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {items.map((item) => {
            const href = memoryClaimHref(item.claim_id, state);
            return (
              <tr key={item.claim_id} className="group hover:bg-surface-muted">
                <td className="px-6 py-4 align-top">
                  <StatusBadge tone="warning">{humanizeMemoryValue(item.reason)}</StatusBadge>
                </td>
                <th className="px-4 py-4 align-top font-medium" scope="row">
                  <a className="text-sm text-accent hover:underline" href={href}>
                    {formatClaimValue(item.value)}
                  </a>
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {humanizeMemoryValue(item.predicate)}
                  </span>
                  {item.human_backed ? (
                    <StatusBadge className="mt-2">Human backed</StatusBadge>
                  ) : null}
                </th>
                <td className="px-4 py-4 align-top">
                  <span
                    className="block max-w-52 truncate font-mono text-xs text-foreground"
                    title={item.subject_reference}
                  >
                    {item.subject_reference}
                  </span>
                  <span
                    className="mt-1 block font-mono text-xs text-muted"
                    title={item.subject_entity_id ?? undefined}
                  >
                    {item.subject_entity_id
                      ? shortMemoryIdentifier(item.subject_entity_id)
                      : "Subject unresolved"}
                  </span>
                </td>
                <td className="px-4 py-4 text-right align-top font-medium text-foreground tabular-nums">
                  {formatConfidence(item.confidence)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 align-top text-xs text-muted tabular-nums">
                  <time dateTime={item.created_at}>{formatMemoryTimestamp(item.created_at)}</time>
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="flex max-w-64 flex-wrap gap-2">
                    {item.available_actions.length > 0 ? (
                      item.available_actions.map((action) => (
                        <StatusBadge key={action}>{humanizeMemoryValue(action)}</StatusBadge>
                      ))
                    ) : (
                      <span className="text-xs text-muted">No action published</span>
                    )}
                  </div>
                  {item.proposal_id ? (
                    <a
                      className="mt-2 inline-flex text-xs font-medium text-accent hover:underline"
                      href={`/proposals/${encodeURIComponent(item.proposal_id)}`}
                    >
                      Review linked proposal
                    </a>
                  ) : null}
                </td>
                <td className="sticky right-0 border-l border-border bg-surface px-6 py-4 text-right align-top group-hover:bg-surface-muted">
                  <DetailsLink href={href}>Inspect claim</DetailsLink>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CurationPanel({
  apiTenantId,
  client,
  state,
  updateState,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  state: MemoryUrlState;
  updateState: (state: MemoryUrlState, mode?: "push" | "replace") => void;
}) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const tenantKey = tenantQueryKey(apiTenantId);
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryFn: ({ signal }) =>
      listMemoryCurationQueue(
        client,
        {
          ...(state.cursor ? { cursor: state.cursor } : {}),
          pageSize: memoryCurationPageSize,
        },
        context,
        signal,
      ),
    queryKey: ["contextplane", tenantKey, "memory", "curation", state.cursor],
  });
  const counts = useQuery({
    queryFn: ({ signal }) => getMemoryCurationCounts(client, context, signal),
    queryKey: ["contextplane", tenantKey, "memory", "curation-counts"],
  });
  const invalidCursor =
    queue.error instanceof ContextplaneApiError && queue.error.code === "invalid_cursor";

  return (
    <div id="memory-panel-curation" aria-labelledby="memory-tab-curation" role="tabpanel">
      <div className="space-y-6">
        <Notice title="This queue separates observation from governance">
          Queue rows are unresolved or contested observations, not canonical records.
          Service-published actions are shown as context only. Inspect evidence here; review linked
          promotions in Proposals.
        </Notice>
        <TableSection
          action={
            queue.isError ? undefined : (
              <Button
                onClick={() => {
                  void queryClient.invalidateQueries({
                    queryKey: ["contextplane", tenantKey, "memory", "curation"],
                  });
                  void queryClient.invalidateQueries({
                    queryKey: ["contextplane", tenantKey, "memory", "curation-counts"],
                  });
                }}
                size="compact"
                variant="ghost"
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Refresh
              </Button>
            )
          }
          description="Every item the service reports as needing curator attention in the current tenant, ordered and paged by the service."
          footer={
            !queue.isError && (queue.data?.items.length ?? 0) > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted">
                  Cursors are opaque and returned to the service unchanged. Counts describe the
                  whole queue; rows describe this page only.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!state.cursor}
                    onClick={() => updateState({ ...state, cursor: "" }, "push")}
                    variant="secondary"
                  >
                    First page
                  </Button>
                  <Button
                    disabled={!queue.data?.next_cursor}
                    onClick={() => {
                      const cursor = queue.data?.next_cursor;
                      if (cursor) updateState({ ...state, cursor }, "push");
                    }}
                    variant="secondary"
                  >
                    Next page
                  </Button>
                </div>
              </div>
            ) : undefined
          }
          title="Waiting for curator attention"
        >
          <div
            aria-atomic="true"
            aria-live="polite"
            className="border-b border-border-subtle px-6 py-3 text-xs text-muted"
          >
            {counts.isPending
              ? "Loading whole-queue reason counts…"
              : counts.isError
                ? "Whole-queue reason counts are unavailable; the page below may still be complete."
                : curationCountSummary(counts.data.counts)}
          </div>
          {queue.isPending ? (
            <ClaimsLoading />
          ) : queue.isError ? (
            <div className="p-6">
              {invalidCursor ? (
                <Notice
                  action={
                    <Button
                      onClick={() => updateState({ ...state, cursor: "" }, "replace")}
                      variant="secondary"
                    >
                      Return to first page
                    </Button>
                  }
                  title="This curation cursor is invalid"
                  variant="warning"
                >
                  The service refused the cursor. It is not decoded or repaired in the browser.
                </Notice>
              ) : (
                <QueryFailure error={queue.error} onRetry={() => void queue.refetch()} />
              )}
            </div>
          ) : queue.data.items.length > 0 ? (
            <CurationRows items={queue.data.items} state={state} />
          ) : (
            <EmptyState
              description="The service reports no unresolved or contested observations in this tenant queue. This is an empty queue, not a count of all Living Memory claims."
              icon={ClipboardCheck}
              title="No items need curator attention"
            />
          )}
        </TableSection>
      </div>
    </div>
  );
}

function ClaimField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-foreground">{value}</dd>
    </div>
  );
}

function CopyableIdentifier({ label, value }: { label: string; value: string }) {
  const [copyState, setCopyState] = useState<"copied" | "failed" | "idle">("idle");

  async function copyIdentifier() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="flex items-start gap-2">
      <span className="min-w-0 flex-1 break-all font-mono text-xs" title={value}>
        {value}
      </span>
      <Button
        aria-label={`Copy ${label}`}
        className="size-11 shrink-0 justify-center p-0"
        onClick={() => void copyIdentifier()}
        title={
          copyState === "copied"
            ? `${label} copied`
            : copyState === "failed"
              ? `Could not copy ${label}`
              : `Copy ${label}`
        }
        variant="ghost"
      >
        {copyState === "copied" ? (
          <Check aria-hidden="true" className="size-4 text-success" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copyState === "copied"
          ? `${label} copied`
          : copyState === "failed"
            ? `Could not copy ${label}`
            : ""}
      </span>
    </div>
  );
}

function HistoryRows({ items }: { items: readonly MemoryClaimHistoryItem[] }) {
  return (
    <ol className="divide-y divide-border-subtle">
      {items.map((item, index) => (
        <li
          key={item.claim_id}
          className="grid gap-4 px-6 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {formatClaimValue(item.value)}
              </span>
              <StatusBadge>{item.was_current ? "Was current" : "Historical"}</StatusBadge>
              {item.is_contested ? <StatusBadge tone="warning">Contested</StatusBadge> : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              {humanizeMemoryValue(item.predicate)} · {humanizeMemoryValue(item.source_authority)}{" "}
              authority ·{" "}
              {item.confidence === null
                ? "Confidence not reported"
                : `${formatConfidence(item.confidence)} confidence`}
            </p>
            {item.superseded_reason ? (
              <p className="mt-2 text-xs leading-5 text-muted">
                Superseded because: {item.superseded_reason}
              </p>
            ) : null}
          </div>
          <div className="text-left text-xs leading-5 text-muted tabular-nums sm:text-right">
            <span className="block">
              {index === 0 ? "Oldest record" : `Chain entry ${index + 1}`}
            </span>
            <time dateTime={item.created_at}>{formatMemoryTimestamp(item.created_at)}</time>
            <span className="mt-1 block font-mono" title={item.claim_id}>
              {shortMemoryIdentifier(item.claim_id)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ClaimDetailPage({
  apiTenantId,
  claimId,
  client,
  identity,
}: {
  apiTenantId?: string;
  claimId: string;
  client: ContextplaneClient;
  identity: WhoAmI;
}) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const tenantKey = tenantQueryKey(apiTenantId);
  const returnState = readMemoryUrlState();
  const claim = useQuery({
    queryFn: ({ signal }) => getMemoryClaim(client, claimId, returnState.persona, context, signal),
    queryKey: ["contextplane", tenantKey, "memory", "claim", claimId, returnState.persona],
  });
  const history = useQuery({
    enabled: claim.isSuccess,
    queryFn: ({ signal }) => getMemoryClaimHistory(client, claimId, context, signal),
    queryKey: ["contextplane", tenantKey, "memory", "claim-history", claimId],
  });
  const backHref = memoryListHref(returnState);

  if (claim.isPending) return <PageSkeleton controls={2} rows={5} />;
  if (claim.isError) {
    return (
      <PageContainer>
        <PageHeader
          actions={
            <a className={controlLinkClassName} href={backHref}>
              Back to Living Memory
            </a>
          }
          breadcrumbs={[
            { href: "/", label: identity.tenant_display_name },
            { href: backHref, label: "Living Memory" },
            { label: "Claim" },
          ]}
          description="The service did not return this claim. A hidden claim and an unknown claim are intentionally indistinguishable."
          eyebrow="Observed context"
          title="Claim unavailable"
        />
        <QueryFailure error={claim.error} onRetry={() => void claim.refetch()} />
      </PageContainer>
    );
  }

  const item = claim.data;
  const uncited = item.citations.length === 0;

  return (
    <PageContainer>
      <PageHeader
        actions={
          <a className={controlLinkClassName} href={backHref}>
            Back to Living Memory
          </a>
        }
        breadcrumbs={[
          { href: "/", label: identity.tenant_display_name },
          { href: backHref, label: "Living Memory" },
          { label: "Claim" },
        ]}
        description={formatClaimValue(item.value)}
        eyebrow="Observed claim"
        metadata={
          <>
            <StatusBadge tone="warning">Recalled content</StatusBadge>
            <StatusBadge tone={item.human_confirmed ? "success" : "neutral"}>
              {item.human_confirmed ? "Human confirmed" : "Not human confirmed"}
            </StatusBadge>
            <StatusBadge>{humanizeMemoryValue(item.authority)} authority</StatusBadge>
          </>
        }
        title={`${humanizeMemoryValue(item.predicate)} claim`}
      />
      <div className="space-y-6">
        <Notice title="This observation is not a canonical record" variant="warning">
          {item.trust_note}
        </Notice>
        {uncited ? (
          <Notice title="This claim arrived without evidence" variant="danger">
            The serving contract requires at least one citation. Keep this claim visible for
            diagnosis, but do not treat its value as verified evidence.
          </Notice>
        ) : null}
        <DetailLayout
          aside={
            <SectionSurface title="Provenance">
              <dl className="space-y-4">
                <ClaimField
                  label="Claim ID"
                  value={<CopyableIdentifier label="claim ID" value={item.claim_id} />}
                />
                <ClaimField
                  label="Subject entity ID"
                  value={
                    <CopyableIdentifier label="subject entity ID" value={item.subject_entity_id} />
                  }
                />
                <ClaimField label="Category" value={humanizeMemoryValue(item.claim_category)} />
                <ClaimField
                  label="Serving label"
                  value={<span className="font-mono text-xs">{item.label}</span>}
                />
                <ClaimField label="Trust classification" value={humanizeMemoryValue(item.trust)} />
                <ClaimField
                  label="Believed as of"
                  value={<time dateTime={item.as_of}>{formatMemoryTimestamp(item.as_of)}</time>}
                />
              </dl>
            </SectionSurface>
          }
        >
          <div className="space-y-6">
            <SectionSurface
              description="The ontology-bound subject, predicate, and value, with uncertainty and validity exactly as the service returned them."
              title="Claim statement"
            >
              <dl className="grid gap-6 sm:grid-cols-2">
                <ClaimField label="Predicate" value={humanizeMemoryValue(item.predicate)} />
                <ClaimField
                  label="Value"
                  value={<span className="font-mono text-xs">{formatClaimValue(item.value)}</span>}
                />
                <ClaimField
                  label="Reported confidence"
                  value={
                    <>
                      <span className="font-medium tabular-nums">
                        {formatConfidence(item.confidence)}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        Service value on a 0–1 scale; no client acceptance threshold is applied.
                      </span>
                    </>
                  }
                />
                <ClaimField label="Source authority" value={humanizeMemoryValue(item.authority)} />
                <ClaimField
                  label="Valid from"
                  value={
                    <time dateTime={item.valid_from}>{formatMemoryTimestamp(item.valid_from)}</time>
                  }
                />
                <ClaimField
                  label="Valid to"
                  value={
                    item.valid_to ? (
                      <time dateTime={item.valid_to}>{formatMemoryTimestamp(item.valid_to)}</time>
                    ) : (
                      "Open-ended validity"
                    )
                  }
                />
              </dl>
            </SectionSurface>
            <SectionSurface
              description="Evidence handles remain attached to the claim they support. Excerpts are shown only when the service returned one."
              flush
              title="Citations"
            >
              {item.citations.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {item.citations.map((citation, index) => (
                    <li key={`${citation.kind}-${citation.ref}-${index}`} className="px-6 py-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone="info">{humanizeMemoryValue(citation.kind)}</StatusBadge>
                        <span className="break-all font-mono text-xs text-foreground">
                          {citation.ref}
                        </span>
                      </div>
                      {citation.excerpt ? (
                        <blockquote className="mt-3 border-l-2 border-accent pl-4 text-sm leading-6 text-muted">
                          {citation.excerpt}
                        </blockquote>
                      ) : (
                        <p className="mt-2 text-xs text-muted">
                          The service returned a resolvable reference without an excerpt.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  description="No evidence handle was returned. This violates the claim-serving contract."
                  icon={ShieldAlert}
                  title="Citation evidence is missing"
                />
              )}
            </SectionSurface>
          </div>
        </DetailLayout>
        <SectionSurface
          description="The full supersession and confirmation chain in the oldest-first order published by the service."
          flush
          title="Claim history"
        >
          {history.isPending ? (
            <ClaimsLoading />
          ) : history.isError ? (
            <div className="p-6">
              <QueryFailure error={history.error} onRetry={() => void history.refetch()} />
            </div>
          ) : history.data.items.length > 0 ? (
            <HistoryRows items={history.data.items} />
          ) : (
            <EmptyState
              description="The claim is visible, but the service returned no supersession or confirmation chain entries."
              icon={History}
              title="Claim history is unavailable"
            />
          )}
        </SectionSurface>
      </div>
    </PageContainer>
  );
}

function MemoryBrowsePage({
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
  const [state, setState] = useState(readMemoryUrlState);

  useEffect(() => {
    function restoreState() {
      setState(readMemoryUrlState());
    }
    window.addEventListener("popstate", restoreState);
    return () => window.removeEventListener("popstate", restoreState);
  }, []);

  function updateState(next: MemoryUrlState, mode: "push" | "replace" = "replace") {
    window.history[mode === "push" ? "pushState" : "replaceState"](
      window.history.state,
      "",
      `/memory${memorySearch(next)}`,
    );
    setState(next);
  }

  function changeTab(tab: MemoryTab) {
    updateState({ ...state, cursor: "", tab }, "push");
  }

  return (
    <PageContainer>
      <MemoryHeader identity={identity} />
      <MemoryTabs activeTab={state.tab} onChange={changeTab} />
      {state.tab === "curation" ? (
        <CurationPanel
          {...(apiTenantId ? { apiTenantId } : {})}
          client={client}
          state={state}
          updateState={updateState}
        />
      ) : (
        <ClaimsPanel
          {...(apiTenantId ? { apiTenantId } : {})}
          client={client}
          searchRef={searchRef}
          state={state}
          updateState={updateState}
        />
      )}
    </PageContainer>
  );
}

export function MemoryPage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
  selectedClaimId,
}: MemoryPageProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const identity = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, context, signal),
    queryKey: ["contextplane", tenantQueryKey(apiTenantId), "identity"],
    staleTime: 5 * 60 * 1000,
  });

  if (identity.isPending) return <PageSkeleton controls={2} rows={5} />;
  if (identity.isError) {
    return (
      <IdentityFailure
        activeTenantName={activeTenantName}
        error={identity.error}
        onRetry={() => void identity.refetch()}
      />
    );
  }

  return selectedClaimId ? (
    <ClaimDetailPage
      {...(apiTenantId ? { apiTenantId } : {})}
      claimId={selectedClaimId}
      client={client}
      identity={identity.data}
    />
  ) : (
    <MemoryBrowsePage
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identity.data}
      searchRef={searchRef}
    />
  );
}
