import {
  Bot,
  Braces,
  Clock3,
  Database,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  UserRound,
  Wrench,
} from "lucide-react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState, type RefObject } from "react";

import { BRAND } from "@repo/ui/brand";
import {
  DataToolbar,
  DetailLayout,
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
  Notice,
  RequestFailure,
  SearchField,
  SearchableSelect,
  Skeleton,
  StatusBadge,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  getToolUsage,
  getUsageSummary,
  getWhoAmI,
  listSessionEvents,
  listSessions,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type SessionEvent,
  type SessionEventKind,
  type SessionSummary,
  type SurfaceUsageSummary,
  type ToolUsage,
  type WhoAmI,
} from "../../shared/api";
import {
  defaultSessionLimit,
  defaultSessionWindow,
  filterSessions,
  formatLatency,
  formatNumber,
  formatSessionTimestamp,
  formatUsageWindow,
  isSessionEventKind,
  isSessionWindow,
  parseSessionLimit,
  sessionEventKindLabel,
  sessionKindOptions,
  sessionLimitOptions,
  sessionMemoryTools,
  sessionWindowOptions,
  sessionWindowRange,
  shortIdentifier,
  type SessionLimit,
  type SessionWindow,
} from "./sessionMemoryModel";

interface SessionsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
  selectedSessionId: string | null;
}

interface SessionListUrlState {
  limit: SessionLimit;
  query: string;
  window: SessionWindow;
}

const eventPageSize = 100;
const controlLinkClassName =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:border-accent hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function readListUrlState(): SessionListUrlState {
  const parameters = new URLSearchParams(window.location.search);
  const windowValue = parameters.get("window");
  const limit = parseSessionLimit(parameters.get("limit"));
  return {
    limit: limit ?? defaultSessionLimit,
    query: parameters.get("q") ?? "",
    window: isSessionWindow(windowValue) ? windowValue : defaultSessionWindow,
  };
}

function writeListUrlState(state: SessionListUrlState) {
  const url = new URL(window.location.href);
  if (state.query) url.searchParams.set("q", state.query);
  else url.searchParams.delete("q");
  if (state.window === defaultSessionWindow) url.searchParams.delete("window");
  else url.searchParams.set("window", state.window);
  if (state.limit === defaultSessionLimit) url.searchParams.delete("limit");
  else url.searchParams.set("limit", String(state.limit));
  window.history.replaceState(window.history.state, "", url);
}

function readEventKind(): SessionEventKind | "" {
  const kind = new URLSearchParams(window.location.search).get("kind");
  return isSessionEventKind(kind) ? kind : "";
}

function writeEventKind(kind: SessionEventKind | "") {
  const url = new URL(window.location.href);
  if (kind) url.searchParams.set("kind", kind);
  else url.searchParams.delete("kind");
  window.history.replaceState(window.history.state, "", url);
}

function sessionListHref(): string {
  const url = new URL("/sessions", window.location.origin);
  const current = new URLSearchParams(window.location.search);
  for (const key of ["q", "window", "limit"]) {
    const value = current.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function requestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function queryKeyTenant(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function identityName(identity: WhoAmI): string {
  return identity.actor_display_name ?? identity.actor_email ?? shortIdentifier(identity.actor_id);
}

function errorPresentation(error: unknown): {
  body: string;
  title: string;
  variant: "danger" | "warning";
} {
  if (error instanceof ContextplaneApiError) {
    if (error.code === "unauthenticated") {
      return {
        body: "This page uses the service bearer session. Configure the deployment gateway or runtime token provider; never place access tokens in Vite-bundled variables.",
        title: `Connect an authenticated ${BRAND.name} session`,
        variant: "warning",
      };
    }
    if (error.code === "tenant_required") {
      return {
        body: "The credential has access to more than one tenant. Select a tenant that the runtime maps to the X-Tenant-ID request header.",
        title: "Select an API tenant",
        variant: "warning",
      };
    }
    if (error.code === "service_unavailable" || error.code === "unavailable") {
      return {
        body: "Session memory is not configured on this deployment. Existing catalog and audit data remain available.",
        title: "Session memory is unavailable",
        variant: "warning",
      };
    }
  }

  return {
    body: "The service response could not be loaded. Existing page context is preserved; retry the request when the service is available.",
    title: "Session memory could not be loaded",
    variant: "danger",
  };
}

function QueryFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const presentation = errorPresentation(error);
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

function SessionPageHeader({ identity }: { identity: WhoAmI }) {
  return (
    <PageHeader
      breadcrumbs={[{ href: "/", label: identity.tenant_display_name }, { label: "Sessions" }]}
      description="Review the retained interaction history your current agent identity can resume, then inspect each user message, agent action, and tool invocation in sequence."
      eyebrow="Session memory"
      metadata={
        <>
          <StatusBadge tone="info">Current actor only</StatusBadge>
          <StatusBadge>{identityName(identity)}</StatusBadge>
          <StatusBadge>{identity.tenant_display_name}</StatusBadge>
        </>
      }
      title="Sessions"
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
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Sessions" }]}
        description="Session memory becomes available after the service resolves the current bearer credential to an actor and tenant."
        eyebrow="Session memory"
        title="Sessions"
      />
      <QueryFailure error={error} onRetry={onRetry} />
    </PageContainer>
  );
}

function UsageSummarySection({
  mcp,
  windowLabel,
}: {
  mcp: SurfaceUsageSummary;
  windowLabel: string;
}) {
  const items: readonly SummaryItem[] = [
    {
      detail: `All MCP operations · ${windowLabel}`,
      id: "mcp-calls",
      label: "MCP calls",
      value: formatNumber(mcp.calls),
    },
    {
      detail:
        mcp.distinct_actors === null
          ? (mcp.distinct_actors_unavailable_reason ?? "Outside raw-event retention")
          : "Unique actors in the complete window",
      id: "distinct-actors",
      label: "Distinct agents",
      value: mcp.distinct_actors === null ? "Not available" : formatNumber(mcp.distinct_actors),
    },
    {
      detail: "An active actor counts once per day",
      id: "actor-days",
      label: "Actor-days",
      value: formatNumber(mcp.actor_days),
    },
    {
      detail: "Largest exact daily p95; not a window-wide percentile",
      id: "mcp-p95",
      label: "Worst daily p95",
      value: formatLatency(mcp.worst_daily_p95_ms),
    },
  ];

  return (
    <section aria-labelledby="tenant-mcp-usage-title">
      <div className="mb-4">
        <h2 id="tenant-mcp-usage-title" className="text-base font-semibold text-foreground">
          Tenant MCP usage
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Service-computed context for all MCP activity in this tenant. Session replay below remains
          private to the current actor.
        </p>
      </div>
      <SummaryStrip items={items} label="Tenant MCP usage summary" />
    </section>
  );
}

function UsageLoading() {
  return (
    <section aria-label="Loading tenant MCP usage">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="mt-2 h-4 w-full max-w-xl" />
      <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-surface px-6 py-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

function SessionToolUsageTable({
  tools,
  windowLabel,
}: {
  tools: readonly ToolUsage[];
  windowLabel: string;
}) {
  return (
    <TableSection
      description={`Server-ranked calls to the five session-memory MCP tools during ${windowLabel}. Missing tools are not rendered as zero.`}
      footer={
        <p className="text-xs leading-5 text-muted">
          Actor-days are cumulative daily distinct counts. Latency is the worst daily p95 published
          by the service, not a percentile recomputed in this browser.
        </p>
      }
      title="Session memory tool activity"
    >
      {tools.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">Usage of session-memory MCP tools</caption>
            <thead>
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  Tool
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Calls
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Succeeded
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Failed
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Actor-days
                </th>
                <th className="px-6 py-3 text-right font-medium" scope="col">
                  Worst daily p95
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {tools.map((tool) => (
                <tr key={tool.tool} className="hover:bg-surface-muted">
                  <th className="px-6 py-4 font-medium text-foreground" scope="row">
                    <code className="text-xs">{tool.tool}</code>
                  </th>
                  <td className="px-4 py-4 text-right tabular-nums">{formatNumber(tool.calls)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {formatNumber(tool.ok_calls)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {formatNumber(tool.error_calls)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {formatNumber(tool.actor_days)}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums">
                    {formatLatency(tool.worst_daily_p95_ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description="The service returned no ranked session tools for this window; this is not presented as zero usage."
          title="No session-memory tool activity is published"
        />
      )}
    </TableSection>
  );
}

function SessionTable({
  identity,
  limit,
  onClearQuery,
  onLimitChange,
  onQueryChange,
  onRefresh,
  onWindowChange,
  query,
  searchRef,
  sessions,
  activityWindow,
}: {
  identity: WhoAmI;
  limit: SessionLimit;
  onClearQuery: () => void;
  onLimitChange: (limit: SessionLimit) => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onWindowChange: (window: SessionWindow) => void;
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  sessions: readonly SessionSummary[];
  activityWindow: SessionWindow;
}) {
  const filtered = filterSessions(sessions, query);
  const filters = (
    <DataToolbar
      actions={
        <Button
          className={query ? "text-warning hover:bg-warning-subtle" : undefined}
          disabled={!query}
          onClick={onClearQuery}
          size="compact"
          title={query ? "Clear session search" : "No session search to clear"}
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
            label="Activity window"
            onValueChange={(value) => {
              if (isSessionWindow(value)) onWindowChange(value);
            }}
            options={sessionWindowOptions.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            searchPlaceholder="Search windows"
            value={activityWindow}
          />
          <SearchableSelect
            allowEmpty={false}
            label="Session limit"
            onValueChange={(value) => {
              const nextLimit = parseSessionLimit(value);
              if (nextLimit !== null) onLimitChange(nextLimit);
            }}
            options={sessionLimitOptions.map((value) => ({
              label: `${value} sessions`,
              value: String(value),
            }))}
            searchPlaceholder="Search limits"
            value={String(limit)}
          />
        </div>
      }
      resultSummary={`${filtered.length} of ${sessions.length} returned sessions · Up to ${limit} most recently active · Current actor only`}
      search={
        <SearchField
          ref={searchRef}
          label="Session ID"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Find a returned session"
          value={query}
        />
      }
    />
  );

  return (
    <TableSection
      action={
        <Button onClick={onRefresh} size="compact" variant="ghost">
          <RefreshCw aria-hidden="true" className="size-4" />
          Refresh
        </Button>
      }
      description={`Sessions with retained events for ${identityName(identity)}, ordered by the service's latest activity timestamp.`}
      filters={filters}
      filtersId="session-filters"
      title="Your retained sessions"
    >
      {filtered.length > 0 ? (
        <div
          aria-label="Scrollable retained sessions"
          className="overflow-x-auto"
          role="region"
          tabIndex={0}
        >
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <caption className="sr-only">Retained sessions for {identityName(identity)}</caption>
            <thead>
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  Session
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  First activity
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Last activity
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Events
                </th>
                <th className="px-6 py-3 text-right font-medium" scope="col">
                  Replay
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((session) => {
                const href = `/sessions/${encodeURIComponent(session.session_id)}${window.location.search}`;
                return (
                  <tr key={session.session_id} className="hover:bg-surface-muted">
                    <th className="px-6 py-4 font-medium" scope="row">
                      <a
                        className="font-mono text-xs text-accent hover:underline"
                        href={href}
                        title={session.session_id}
                      >
                        {shortIdentifier(session.session_id)}
                      </a>
                    </th>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-muted tabular-nums">
                      <time dateTime={session.first_activity_at}>
                        {formatSessionTimestamp(session.first_activity_at)}
                      </time>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-foreground tabular-nums">
                      <time dateTime={session.last_activity_at}>
                        {formatSessionTimestamp(session.last_activity_at)}
                      </time>
                    </td>
                    <td className="px-4 py-4 text-right text-foreground tabular-nums">
                      {formatNumber(session.event_count)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a className={controlLinkClassName} href={href}>
                        View replay
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : sessions.length > 0 ? (
        <EmptyState
          description="Clear the search to restore every session in the service response."
          title="No returned session matches this ID"
        />
      ) : (
        <EmptyState
          description={
            <>
              Sessions appear after an agent records a <code>user_message</code>,{" "}
              <code>agent_action</code>, or <code>tool_invocation</code>. Expired and removed events
              are excluded from this read path.
            </>
          }
          icon={MessageSquareText}
          title="No retained sessions in this window"
        />
      )}
    </TableSection>
  );
}

function SessionsListPage({
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
  const [urlState, setUrlState] = useState(readListUrlState);
  const tenantKey = queryKeyTenant(apiTenantId);
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const range = sessionWindowRange(urlState.window);
  const isAdmin = identity.roles.includes("admin");

  useEffect(() => {
    function restoreUrlState() {
      setUrlState(readListUrlState());
    }
    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, []);

  const sessionsQuery = useQuery({
    queryFn: ({ signal }) =>
      listSessions(client, { limit: urlState.limit, since: range.since }, context, signal),
    queryKey: ["contextplane", tenantKey, "sessions", urlState.window, urlState.limit],
  });
  const usageQuery = useQuery({
    enabled: isAdmin,
    queryFn: ({ signal }) => getUsageSummary(client, range, context, signal),
    queryKey: ["contextplane", tenantKey, "usage-summary", range.from, range.to],
  });
  const toolsQuery = useQuery({
    enabled: isAdmin,
    queryFn: ({ signal }) => getToolUsage(client, range, context, signal),
    queryKey: ["contextplane", tenantKey, "tool-usage", range.from, range.to],
  });

  function updateUrlState(nextState: SessionListUrlState) {
    writeListUrlState(nextState);
    setUrlState(nextState);
  }

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["contextplane", tenantKey] });
  }

  const usage = usageQuery.data;
  const mcpUsage = usage?.surfaces.find((surface) => surface.surface === "mcp");
  const usageWindowLabel = usage ? formatUsageWindow(usage.start, usage.end) : "selected window";
  const failedQueries: readonly { error: unknown; retry: () => void }[] = [
    ...(usageQuery.isError
      ? [{ error: usageQuery.error, retry: () => void usageQuery.refetch() }]
      : []),
    ...(sessionsQuery.isError
      ? [{ error: sessionsQuery.error, retry: () => void sessionsQuery.refetch() }]
      : []),
    ...(toolsQuery.isError
      ? [{ error: toolsQuery.error, retry: () => void toolsQuery.refetch() }]
      : []),
  ];
  const firstFailure = failedQueries[0];

  return (
    <PageContainer>
      <SessionPageHeader identity={identity} />
      <div className="space-y-6">
        <Notice title="Session replay is private to the resolved actor">
          The REST and MCP APIs derive actor <code>{shortIdentifier(identity.actor_id)}</code> from
          the credential and intentionally expose no actor selector. An administrator cannot use
          this page to discover another actor&apos;s conversations.
        </Notice>

        {firstFailure ? (
          <QueryFailure
            error={firstFailure.error}
            onRetry={() => {
              for (const failure of failedQueries) failure.retry();
            }}
          />
        ) : null}

        {isAdmin ? (
          usageQuery.isLoading ? (
            <UsageLoading />
          ) : usageQuery.isError ? null : mcpUsage ? (
            <UsageSummarySection mcp={mcpUsage} windowLabel={usageWindowLabel} />
          ) : (
            <Notice title="MCP usage is not published for this window" variant="warning">
              The service returned no MCP surface aggregate. The UI does not replace an absent
              surface with zero calls.
            </Notice>
          )
        ) : (
          <Notice title="Tenant usage requires administrator access" variant="warning">
            Session replay remains available because it is actor-scoped. Tenant-wide MCP reach and
            call totals are deliberately omitted for this role.
          </Notice>
        )}

        {sessionsQuery.isLoading ? (
          <SectionSurface
            title="Your retained sessions"
            description="Loading the most recently active sessions from the service."
          >
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </SectionSurface>
        ) : sessionsQuery.isError ? null : (
          <SessionTable
            identity={identity}
            limit={urlState.limit}
            onClearQuery={() => updateUrlState({ ...urlState, query: "" })}
            onLimitChange={(limit) => updateUrlState({ ...urlState, limit })}
            onQueryChange={(query) => updateUrlState({ ...urlState, query })}
            onRefresh={refreshAll}
            onWindowChange={(window) => updateUrlState({ ...urlState, window })}
            query={urlState.query}
            searchRef={searchRef}
            sessions={sessionsQuery.data ?? []}
            activityWindow={urlState.window}
          />
        )}

        {isAdmin ? (
          toolsQuery.isLoading ? (
            <SectionSurface
              title="Session memory tool activity"
              description="Loading service-ranked MCP tools."
            >
              <Skeleton className="h-40 w-full" />
            </SectionSurface>
          ) : toolsQuery.isError ? null : toolsQuery.data ? (
            <SessionToolUsageTable
              tools={sessionMemoryTools(toolsQuery.data.tools)}
              windowLabel={formatUsageWindow(toolsQuery.data.start, toolsQuery.data.end)}
            />
          ) : null
        ) : null}
      </div>
    </PageContainer>
  );
}

function EventIcon({ kind }: { kind: string }) {
  const className = "size-4";
  if (kind === "user_message") return <UserRound aria-hidden="true" className={className} />;
  if (kind === "agent_action") return <Bot aria-hidden="true" className={className} />;
  if (kind === "tool_invocation") return <Wrench aria-hidden="true" className={className} />;
  return <Braces aria-hidden="true" className={className} />;
}

function metadataValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function SessionEventRow({ event }: { event: SessionEvent }) {
  const metadata = Object.entries(event.metadata);
  return (
    <li className="grid gap-4 px-6 py-5 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
      <div
        className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-muted text-accent"
        aria-hidden="true"
      >
        <EventIcon kind={event.kind} />
      </div>
      <article aria-labelledby={`event-${event.event_id}`} className="min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`event-${event.event_id}`} className="text-sm font-semibold text-foreground">
                {sessionEventKindLabel(event.kind)}
              </h3>
              {event.tool_name ? (
                <code className="rounded bg-surface-muted px-2 py-1 text-xs text-accent-strong">
                  {event.tool_name}
                </code>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted tabular-nums">
              Sequence {event.seq} ·{" "}
              <time dateTime={event.created_at}>{formatSessionTimestamp(event.created_at)}</time>
            </p>
          </div>
          <StatusBadge>{event.kind}</StatusBadge>
        </div>
        <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          {event.body}
        </div>
        {metadata.length > 0 ? (
          <details className="mt-4 rounded-md border border-border-subtle bg-surface-muted px-4 py-3">
            <summary className="cursor-pointer rounded-sm text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              View structural metadata
            </summary>
            <dl className="mt-3 grid gap-2 text-xs">
              {metadata.map(([key, value]) => (
                <div key={key} className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <dt className="font-medium text-muted">{key}</dt>
                  <dd className="break-all font-mono text-foreground">{metadataValue(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </article>
    </li>
  );
}

function SessionDetailPage({
  apiTenantId,
  client,
  identity,
  sessionId,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  identity: WhoAmI;
  sessionId: string;
}) {
  const [kind, setKind] = useState<SessionEventKind | "">(readEventKind);
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const tenantKey = queryKeyTenant(apiTenantId);

  useEffect(() => {
    function restoreKind() {
      setKind(readEventKind());
    }
    window.addEventListener("popstate", restoreKind);
    return () => window.removeEventListener("popstate", restoreKind);
  }, []);

  const summaryQuery = useQuery({
    queryFn: ({ signal }) => listSessions(client, { limit: 1000 }, context, signal),
    queryKey: ["contextplane", tenantKey, "sessions", "summary-lookup"],
  });
  const eventsQuery = useInfiniteQuery<
    readonly SessionEvent[],
    Error,
    InfiniteData<readonly SessionEvent[], number | null>,
    readonly unknown[],
    number | null
  >({
    getNextPageParam: (lastPage) => {
      if (lastPage.length < eventPageSize) return undefined;
      return lastPage.at(-1)?.seq;
    },
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) =>
      listSessionEvents(
        client,
        sessionId,
        {
          ...(pageParam === null ? {} : { cursor: pageParam }),
          ...(kind ? { kind } : {}),
          limit: eventPageSize,
          order: "asc",
        },
        context,
        signal,
      ),
    queryKey: ["contextplane", tenantKey, "session-events", sessionId, kind],
  });

  const events = eventsQuery.data?.pages.flatMap((page) => page) ?? [];
  const summary = summaryQuery.data?.find((session) => session.session_id === sessionId);
  const listHref = sessionListHref();
  const summaryItems: readonly SummaryItem[] = [
    {
      detail: "Service-provided count across all event kinds",
      id: "event-count",
      label: "Recorded events",
      value: summary ? formatNumber(summary.event_count) : "Not available",
    },
    {
      detail: "Absolute UTC time",
      id: "first-activity",
      label: "First activity",
      value: summary ? formatSessionTimestamp(summary.first_activity_at) : "Not available",
    },
    {
      detail: "Absolute UTC time",
      id: "last-activity",
      label: "Last activity",
      value: summary ? formatSessionTimestamp(summary.last_activity_at) : "Not available",
    },
    {
      detail: "Stable even when timestamps collide",
      id: "replay-order",
      label: "Replay order",
      value: "Sequence",
    },
  ];

  function updateKind(value: string) {
    if (value !== "" && !isSessionEventKind(value)) return;
    writeEventKind(value);
    setKind(value);
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <a className={controlLinkClassName} href={listHref}>
            Back to sessions
          </a>
        }
        breadcrumbs={[
          { href: "/", label: identity.tenant_display_name },
          { href: listHref, label: "Sessions" },
          { label: shortIdentifier(sessionId) },
        ]}
        description={
          <>
            Retained interaction history for{" "}
            <code className="break-all text-sm text-foreground">{sessionId}</code>.
          </>
        }
        eyebrow="Session replay"
        metadata={
          <>
            <StatusBadge tone="info">Current actor only</StatusBadge>
            <StatusBadge>{identityName(identity)}</StatusBadge>
            <StatusBadge>Read-only replay</StatusBadge>
          </>
        }
        title="Session replay"
      />

      <div className="space-y-6">
        <SummaryStrip items={summaryItems} label="Session summary" />

        <Notice title="Replay follows the service sequence">
          Events are ordered by immutable <code>seq</code>, not timestamps, so bursts recorded in
          the same instant remain stable. Removed or retention-expired events are absent from this
          read path.
        </Notice>

        <DetailLayout
          aside={
            <SectionSurface
              title="How session memory works"
              description="Implementation boundaries enforced by the service."
            >
              <ul className="space-y-4 text-sm leading-6 text-foreground/80">
                <li className="flex gap-3">
                  <LockKeyhole aria-hidden="true" className="mt-1 size-4 shrink-0 text-accent" />
                  <span>
                    <span className="block font-medium text-foreground">Actor-scoped</span>
                    The credential selects the actor; no request parameter can select someone else.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Database aria-hidden="true" className="mt-1 size-4 shrink-0 text-accent" />
                  <span>
                    <span className="block font-medium text-foreground">Write-once</span>
                    Events are appended and never updated. Removal invalidates replay without
                    rewriting history.
                  </span>
                </li>
                <li className="flex gap-3">
                  <KeyRound aria-hidden="true" className="mt-1 size-4 shrink-0 text-accent" />
                  <span>
                    <span className="block font-medium text-foreground">Body protected</span>
                    Bodies pass PII admission before storage. Metadata is structural, not
                    PII-scanned or encrypted.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Clock3 aria-hidden="true" className="mt-1 size-4 shrink-0 text-accent" />
                  <span>
                    <span className="block font-medium text-foreground">Retention-aware</span>
                    The list and replay expose only live, non-invalidated events.
                  </span>
                </li>
              </ul>
            </SectionSurface>
          }
        >
          <SectionSurface
            action={
              <SearchableSelect
                className="w-48"
                emptyLabel="All event kinds"
                label="Event kind"
                onValueChange={updateKind}
                options={sessionKindOptions
                  .filter((option) => option.value !== "")
                  .map((option) => ({ label: option.label, value: option.value }))}
                searchPlaceholder="Search event kinds"
                value={kind}
              />
            }
            description="A flat, ordered interaction view similar to session replay in agent observability tools, without inventing spans the service does not record."
            flush
            footer={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p aria-live="polite" className="text-xs text-muted">
                  {summary && !kind
                    ? `${events.length} of ${summary.event_count} recorded events loaded`
                    : `${events.length} matching events loaded`}
                </p>
                {eventsQuery.hasNextPage ? (
                  <Button
                    disabled={eventsQuery.isFetchingNextPage}
                    onClick={() => void eventsQuery.fetchNextPage()}
                    variant="secondary"
                  >
                    {eventsQuery.isFetchingNextPage ? "Loading events…" : "Load later events"}
                  </Button>
                ) : null}
              </div>
            }
            title="Interaction replay"
          >
            {eventsQuery.isLoading ? (
              <div className="space-y-3 px-6 py-5">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-28 w-full" />
                ))}
              </div>
            ) : eventsQuery.isError ? (
              <div className="p-6">
                <QueryFailure
                  error={eventsQuery.error}
                  onRetry={() => void eventsQuery.refetch()}
                />
              </div>
            ) : events.length > 0 ? (
              <ol className="divide-y divide-border-subtle">
                {events.map((event) => (
                  <SessionEventRow key={event.event_id} event={event} />
                ))}
              </ol>
            ) : (
              <EmptyState
                description={
                  kind
                    ? "No retained events match this kind. Choose all event kinds to inspect the complete replay."
                    : "The session may be empty, expired, removed, or outside the service's most recent summary window. The API deliberately does not reveal which case applies."
                }
                icon={MessageSquareText}
                title="No retained events are available"
              />
            )}
          </SectionSurface>
        </DetailLayout>
      </div>
    </PageContainer>
  );
}

export function SessionsPage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
  selectedSessionId,
}: SessionsPageProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const identityQuery = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, context, signal),
    queryKey: ["contextplane", queryKeyTenant(apiTenantId), "identity"],
    staleTime: 5 * 60 * 1000,
  });

  if (identityQuery.isLoading) return <PageSkeleton controls={2} rows={5} />;
  if (identityQuery.isError) {
    return (
      <IdentityFailure
        activeTenantName={activeTenantName}
        error={identityQuery.error}
        onRetry={() => void identityQuery.refetch()}
      />
    );
  }
  if (!identityQuery.data) return <PageSkeleton controls={2} rows={5} />;

  return selectedSessionId ? (
    <SessionDetailPage
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identityQuery.data}
      sessionId={selectedSessionId}
    />
  ) : (
    <SessionsListPage
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identityQuery.data}
      searchRef={searchRef}
    />
  );
}
