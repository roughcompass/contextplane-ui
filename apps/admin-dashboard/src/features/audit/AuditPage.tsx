import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleX,
  Clipboard,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import {
  DataToolbar,
  EmptyState,
  PageContainer,
  PageHeader,
  PageSkeleton,
  TableSection,
} from "@repo/ui/layouts";
import { Button, Notice, RequestFailure, SearchField, StatusBadge } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  queryAuditRecords,
  type AuditRecord,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import {
  auditPageSize,
  emptyAuditFilters,
  formatAuditTimestamp,
  formatSnapshot,
  shortIdentifier,
  shortRequestIdentifier,
  type AuditFilters,
} from "./auditModel";

interface AuditPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
}

interface AuditUrlState extends AuditFilters {
  cursor: string;
}

interface CopyFeedback {
  status: "copied" | "failed";
  value: string;
}

const controlClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

const jsonTokenPattern = /"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function highlightJson(json: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of json.matchAll(jsonTokenPattern)) {
    const token = match[0];
    const tokenIndex = match.index;
    if (tokenIndex > lastIndex) {
      nodes.push(
        <span key={`syntax-${lastIndex}`} className="text-muted">
          {json.slice(lastIndex, tokenIndex)}
        </span>,
      );
    }

    const remainder = json.slice(tokenIndex + token.length).trimStart();
    const key = token.startsWith('"') && remainder.startsWith(":");
    const className = key
      ? "text-accent-strong"
      : token === "null"
        ? "text-muted italic"
        : token.startsWith('"')
          ? "text-foreground"
          : "font-medium text-foreground";
    nodes.push(
      <span key={`token-${tokenIndex}`} className={className}>
        {token}
      </span>,
    );
    lastIndex = tokenIndex + token.length;
  }

  if (lastIndex < json.length) {
    nodes.push(
      <span key={`syntax-${lastIndex}`} className="text-muted">
        {json.slice(lastIndex)}
      </span>,
    );
  }

  return nodes;
}

function JsonSnapshot({
  label,
  snapshot,
}: {
  label: string;
  snapshot: AuditRecord["before_jsonb"];
}) {
  const json = formatSnapshot(snapshot);

  return (
    <pre
      aria-label={`${label} JSON`}
      className="max-h-80 overflow-auto rounded-md border border-border bg-canvas p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words"
    >
      <code>{highlightJson(json)}</code>
    </pre>
  );
}

function readAuditUrlState(): AuditUrlState {
  const parameters = new URLSearchParams(window.location.search);
  return {
    action: parameters.get("action") ?? "",
    actorId: parameters.get("actor_id") ?? "",
    cursor: parameters.get("cursor") ?? "",
    from: parameters.get("from") ?? "",
    targetId: parameters.get("target_id") ?? "",
    targetType: parameters.get("target_type") ?? "",
    to: parameters.get("to") ?? "",
  };
}

function writeAuditUrlState(state: AuditUrlState, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  const values = {
    action: state.action,
    actor_id: state.actorId,
    cursor: state.cursor,
    from: state.from,
    target_id: state.targetId,
    target_type: state.targetType,
    to: state.to,
  };

  for (const [name, value] of Object.entries(values)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }

  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
}

function AuditSnapshotView({ entry }: { entry: AuditRecord }) {
  return (
    <div
      id={`audit-change-${entry.audit_id}`}
      className="grid gap-4 p-5 md:grid-cols-2"
      aria-label={`Change recorded by ${entry.action}`}
    >
      {entry.error_code ? (
        <section
          aria-labelledby={`error-${entry.audit_id}`}
          className="rounded-md border border-danger/25 bg-danger-subtle p-4 md:col-span-2"
        >
          <h3 id={`error-${entry.audit_id}`} className="text-sm font-semibold text-foreground">
            Failure detail
          </h3>
          <p className="mt-1 text-sm text-foreground/80">
            The service recorded error code{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-danger">
              {entry.error_code}
            </code>
            . The attempted before-and-after payload remains available for audit review.
          </p>
        </section>
      ) : null}
      <section aria-labelledby={`before-${entry.audit_id}`}>
        <h3 id={`before-${entry.audit_id}`} className="mb-2 text-sm font-semibold text-foreground">
          Before
        </h3>
        <JsonSnapshot label="Before" snapshot={entry.before_jsonb} />
      </section>
      <section aria-labelledby={`after-${entry.audit_id}`}>
        <h3 id={`after-${entry.audit_id}`} className="mb-2 text-sm font-semibold text-foreground">
          After
        </h3>
        <JsonSnapshot label="After" snapshot={entry.after_jsonb} />
      </section>
    </div>
  );
}

export function AuditPage({ activeTenantName, apiTenantId, client, searchRef }: AuditPageProps) {
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [urlState, setUrlState] = useState<AuditUrlState>(readAuditUrlState);
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(() => readAuditUrlState());
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function restoreUrlState() {
      const restored = readAuditUrlState();
      setExpandedAuditId(null);
      setUrlState(restored);
      setDraftFilters(restored);
    }

    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, []);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    [],
  );

  const filters: AuditFilters = {
    action: urlState.action,
    actorId: urlState.actorId,
    from: urlState.from,
    targetId: urlState.targetId,
    targetType: urlState.targetType,
    to: urlState.to,
  };
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const auditQuery = useQuery({
    queryFn: ({ signal }) =>
      queryAuditRecords(
        client,
        {
          action: filters.action,
          actorId: filters.actorId,
          cursor: urlState.cursor,
          from: filters.from,
          pageSize: auditPageSize,
          targetId: filters.targetId,
          targetType: filters.targetType,
          to: filters.to,
        },
        requestContext,
        signal,
      ),
    queryKey: ["audit", apiTenantId ?? "credential-default", urlState],
    placeholderData: (previous) => previous,
  });
  const result = auditQuery.data;
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const hasUnappliedFilters = (Object.keys(emptyAuditFilters) as (keyof AuditFilters)[]).some(
    (key) => draftFilters[key] !== filters[key],
  );

  function commitState(nextState: AuditUrlState, mode: "push" | "replace" = "replace") {
    writeAuditUrlState(nextState, mode);
    setUrlState(nextState);
  }

  function updateFilter(filter: keyof AuditFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [filter]: value }));
  }

  function applyFilters() {
    setExpandedAuditId(null);
    commitState({ ...draftFilters, cursor: "" });
  }

  function filterByActor(actorId: string) {
    const nextFilters = { ...filters, actorId };
    setDraftFilters(nextFilters);
    setExpandedAuditId(null);
    commitState({ ...nextFilters, cursor: "" });
  }

  function clearFilters() {
    setExpandedAuditId(null);
    setDraftFilters(emptyAuditFilters);
    commitState({ ...emptyAuditFilters, cursor: "" });
  }

  function changePage(cursor: string) {
    setExpandedAuditId(null);
    commitState({ ...urlState, cursor }, "push");
  }

  async function copyIdentifier(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied`);
      setCopyFeedback({ status: "copied", value });
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopyFeedback(null);
        copyResetTimerRef.current = null;
      }, 1600);
    } catch {
      setCopyMessage(`Could not copy ${label.toLowerCase()}`);
      setCopyFeedback({ status: "failed", value });
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopyFeedback(null);
        copyResetTimerRef.current = null;
      }, 1600);
    }
  }

  const nextCursor = result?.next_cursor;
  const auditFilters = (
    <DataToolbar
      actions={
        <div className="flex flex-wrap gap-2">
          <Button disabled={!hasUnappliedFilters} onClick={applyFilters}>
            Apply filters
          </Button>
          <Button
            className={hasActiveFilters ? "text-warning hover:bg-warning-subtle" : undefined}
            disabled={!hasActiveFilters && !hasUnappliedFilters}
            onClick={clearFilters}
            title={
              hasActiveFilters || hasUnappliedFilters
                ? "Clear all audit filters"
                : "No filters to clear"
            }
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Clear filters
          </Button>
        </div>
      }
      filters={
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SearchField
            ref={searchRef}
            label="Actor ID"
            onChange={(event) => updateFilter("actorId", event.currentTarget.value)}
            placeholder="Principal UUID or system"
            value={draftFilters.actorId}
          />
          <SearchField
            label="Action"
            onChange={(event) => updateFilter("action", event.currentTarget.value)}
            placeholder="For example, proposal.approve"
            value={draftFilters.action}
          />
          <SearchField
            label="Target type"
            onChange={(event) => updateFilter("targetType", event.currentTarget.value)}
            placeholder="For example, capability"
            value={draftFilters.targetType}
          />
          <SearchField
            label="Target ID"
            onChange={(event) => updateFilter("targetId", event.currentTarget.value)}
            placeholder="Target UUID"
            value={draftFilters.targetId}
          />
          <label className="block text-xs font-medium text-muted">
            From
            <input
              className={`${controlClassName} mt-1.5`}
              onChange={(event) => updateFilter("from", event.currentTarget.value)}
              type="date"
              value={draftFilters.from}
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            To
            <input
              className={`${controlClassName} mt-1.5`}
              onChange={(event) => updateFilter("to", event.currentTarget.value)}
              type="date"
              value={draftFilters.to}
            />
          </label>
        </div>
      }
    />
  );

  if (auditQuery.isPending) return <PageSkeleton controls={5} />;

  const invalidCursor =
    Boolean(urlState.cursor) &&
    auditQuery.error instanceof ContextplaneApiError &&
    auditQuery.error.status === 422;
  const auditRequestId =
    auditQuery.error instanceof ContextplaneApiError ? auditQuery.error.requestId : null;

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Audit Log" }]}
        description="Trace immutable service activity by actor, action, target, outcome, timestamp, and request correlation."
        eyebrow="Immutable history"
        metadata={
          <>
            <StatusBadge>Service-authoritative</StatusBadge>
            <StatusBadge>Newest first</StatusBadge>
            <StatusBadge>Read-only</StatusBadge>
            {auditQuery.isFetching ? <StatusBadge tone="warning">Refreshing</StatusBadge> : null}
          </>
        }
        title="Audit Log"
      />

      <div className="space-y-6">
        <Notice title="This history is append-only">
          Entries reflect what the service recorded for this tenant. Filters change the view but do
          not alter or remove audit evidence.
        </Notice>

        {auditQuery.isError && invalidCursor ? (
          <Notice
            action={
              <Button onClick={() => commitState({ ...urlState, cursor: "" })} variant="secondary">
                <RotateCcw aria-hidden="true" className="size-4" />
                Return to newest entries
              </Button>
            }
            title="This audit page link is no longer valid"
            variant="danger"
          >
            The service could not continue from this opaque cursor. Return to the newest matching
            entries with the current filters still applied.
          </Notice>
        ) : auditQuery.isError ? (
          <RequestFailure
            onRetry={() => void auditQuery.refetch()}
            requestId={auditRequestId}
            title="Audit history unavailable"
          >
            The service did not return audit history for the active tenant. Filters and cursor state
            have been preserved.
          </RequestFailure>
        ) : result ? (
          <TableSection
            description="Expand an entry to compare the recorded state before and after the action."
            filters={auditFilters}
            filtersId="audit-filters"
            filtersVisible={filtersVisible}
            footer={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted" aria-live="polite">
                  {result.items.length === 0
                    ? "No entries shown"
                    : `Showing ${result.items.length} service-recorded entries`}
                </p>
                <div className="flex items-center gap-2">
                  {urlState.cursor ? (
                    <Button onClick={() => changePage("")} variant="secondary">
                      Newest entries
                    </Button>
                  ) : null}
                  {nextCursor ? (
                    <Button onClick={() => changePage(nextCursor)} variant="secondary">
                      Older entries
                    </Button>
                  ) : null}
                </div>
              </div>
            }
            onFiltersVisibleChange={setFiltersVisible}
            title="Audit entries"
          >
            {result.items.length > 0 ? (
              <>
                <p className="border-b border-border-subtle px-4 py-2 text-xs text-muted lg:hidden">
                  Swipe horizontally to view complete audit details.
                </p>
                <div
                  aria-label="Scrollable audit entries"
                  className="overflow-x-auto"
                  role="region"
                  tabIndex={0}
                >
                  <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Audit entries for {activeTenantName}. {result.items.length} entries are shown
                      on this page.
                    </caption>
                    <thead>
                      <tr className="border-b border-border bg-surface-muted text-xs text-muted">
                        <th className="px-5 py-3 font-medium" scope="col">
                          When
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Action
                        </th>
                        <th className="min-w-36 px-4 py-3 font-medium" scope="col">
                          Actor
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Target
                        </th>
                        <th className="min-w-32 px-4 py-3 font-medium" scope="col">
                          Outcome
                        </th>
                        <th className="min-w-52 px-4 py-3 font-medium" scope="col">
                          Request ID
                        </th>
                        <th className="px-5 py-3 text-right font-medium" scope="col">
                          Change
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {result.items.map((entry) => {
                        const expanded = expandedAuditId === entry.audit_id;
                        const actor = entry.actor_id;
                        const actorCopyStatus =
                          actor && copyFeedback?.value === actor ? copyFeedback.status : null;
                        const requestCopyStatus =
                          entry.request_id && copyFeedback?.value === entry.request_id
                            ? copyFeedback.status
                            : null;

                        return (
                          <Fragment key={entry.audit_id}>
                            <tr className="hover:bg-surface-muted">
                              <td className="whitespace-nowrap px-5 py-4 text-xs text-muted tabular-nums">
                                <time dateTime={entry.ts}>{formatAuditTimestamp(entry.ts)}</time>
                              </td>
                              <td className="px-4 py-4">
                                <code className="text-xs text-foreground">{entry.action}</code>
                              </td>
                              <td className="px-4 py-4">
                                {actor ? (
                                  <span className="flex items-center gap-1">
                                    <button
                                      className="inline-flex min-h-6 items-center rounded-sm font-mono text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                      onClick={() => filterByActor(actor)}
                                      title={`Filter by actor ${actor}`}
                                      type="button"
                                    >
                                      {shortIdentifier(actor)}
                                    </button>
                                    <Button
                                      aria-label={`Copy actor ID ${actor}`}
                                      className={`shrink-0 hover:bg-accent-subtle hover:text-accent-strong active:bg-accent-subtle active:text-accent-strong ${actorCopyStatus === "failed" ? "text-danger" : "text-muted"}`}
                                      onClick={() => void copyIdentifier("Actor ID", actor)}
                                      size="icon"
                                      title={
                                        actorCopyStatus === "copied"
                                          ? "Copied"
                                          : actorCopyStatus === "failed"
                                            ? "Copy failed"
                                            : "Copy actor ID"
                                      }
                                      variant="ghost"
                                    >
                                      {actorCopyStatus === "copied" ? (
                                        <Check aria-hidden="true" className="size-4 text-success" />
                                      ) : actorCopyStatus === "failed" ? (
                                        <CircleX
                                          aria-hidden="true"
                                          className="size-4 text-danger"
                                        />
                                      ) : (
                                        <Clipboard aria-hidden="true" className="size-4" />
                                      )}
                                    </Button>
                                  </span>
                                ) : (
                                  <span className="text-muted">System</span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <span className="block text-xs text-muted">
                                  {entry.target_type}
                                </span>
                                <code className="text-xs text-foreground" title={entry.target_id}>
                                  {shortIdentifier(entry.target_id)}
                                </code>
                              </td>
                              <td className="px-4 py-4">
                                {entry.error_code ? (
                                  <StatusBadge tone="danger">Failed</StatusBadge>
                                ) : (
                                  <StatusBadge tone="success">Succeeded</StatusBadge>
                                )}
                              </td>
                              <td className="min-w-52 px-4 py-4">
                                {entry.request_id ? (
                                  <span className="flex min-w-0 items-center gap-1">
                                    <code
                                      className="whitespace-nowrap text-xs text-foreground"
                                      title={entry.request_id}
                                    >
                                      {shortRequestIdentifier(entry.request_id)}
                                    </code>
                                    <Button
                                      aria-label={`Copy request ID ${entry.request_id}`}
                                      className={`shrink-0 hover:bg-accent-subtle hover:text-accent-strong active:bg-accent-subtle active:text-accent-strong ${requestCopyStatus === "failed" ? "text-danger" : "text-muted"}`}
                                      onClick={() =>
                                        void copyIdentifier("Request ID", entry.request_id ?? "")
                                      }
                                      size="icon"
                                      title={
                                        requestCopyStatus === "copied"
                                          ? "Copied"
                                          : requestCopyStatus === "failed"
                                            ? "Copy failed"
                                            : "Copy request ID"
                                      }
                                      variant="ghost"
                                    >
                                      {requestCopyStatus === "copied" ? (
                                        <Check aria-hidden="true" className="size-4 text-success" />
                                      ) : requestCopyStatus === "failed" ? (
                                        <CircleX
                                          aria-hidden="true"
                                          className="size-4 text-danger"
                                        />
                                      ) : (
                                        <Clipboard aria-hidden="true" className="size-4" />
                                      )}
                                    </Button>
                                  </span>
                                ) : (
                                  <span className="text-muted">Not available</span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <Button
                                  aria-controls={`audit-change-${entry.audit_id}`}
                                  aria-expanded={expanded}
                                  className="whitespace-nowrap"
                                  onClick={() =>
                                    setExpandedAuditId(expanded ? null : entry.audit_id)
                                  }
                                  variant="ghost"
                                >
                                  {expanded ? (
                                    <ChevronDown aria-hidden="true" className="size-4" />
                                  ) : (
                                    <ChevronRight aria-hidden="true" className="size-4" />
                                  )}
                                  {expanded ? "Hide change" : "View change"}
                                </Button>
                              </td>
                            </tr>
                            {expanded ? (
                              <tr className="bg-surface-muted">
                                <td colSpan={7} className="p-0">
                                  <AuditSnapshotView entry={entry} />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <EmptyState
                description={
                  hasActiveFilters
                    ? "Adjust the actor, action, target, or date range."
                    : "Service-recorded administrative and data-plane events will appear here."
                }
                title={
                  hasActiveFilters
                    ? "No audit entries match these filters"
                    : "No audit history is available yet"
                }
              />
            )}
          </TableSection>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck aria-hidden="true" className="size-4 text-success" />
          <span>Audit history is read-only and scoped to {activeTenantName}.</span>
        </div>
        <p aria-live="polite" className="sr-only">
          {copyMessage}
        </p>
      </div>
    </PageContainer>
  );
}
