import { Braces, CalendarDays, Database, RotateCcw, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  DataToolbar,
  EmptyState,
  PageContainer,
  PageHeader,
  PageSkeleton,
  SummaryStrip,
  TableSection,
  type SummaryItem,
} from "@repo/ui/layouts";
import { Button, Notice, RequestFailure, SearchField, StatusBadge } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  getCapabilityUsage,
  getDailyUsageSeries,
  getToolUsage,
  getUsageSummary,
  type CapabilityUsageRanking,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type DailyUsageSeries,
  type SurfaceUsageSummary,
  type ToolUsageRanking,
  type UsageSummary,
} from "../../shared/api";

interface AnalyticsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
}

interface UsageWindow {
  from: string;
  to: string;
}

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const responsiveRowClassName = "grid gap-3 p-6 hover:bg-surface-muted md:table-row md:p-0";
const responsiveCellClassName =
  "flex items-start justify-between gap-4 p-0 md:table-cell md:px-4 md:py-4";

function MobileLabel({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="shrink-0 font-medium text-muted md:hidden">
      {children}
    </span>
  );
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultWindow(): UsageWindow {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: isoDate(start), to: isoDate(end) };
}

function readUsageWindow(): UsageWindow {
  const parameters = new URLSearchParams(window.location.search);
  const fallback = defaultWindow();
  return {
    from: parameters.get("from") ?? fallback.from,
    to: parameters.get("to") ?? fallback.to,
  };
}

function writeUsageWindow(value: UsageWindow) {
  const url = new URL(window.location.href);
  url.searchParams.set("from", value.from);
  url.searchParams.set("to", value.to);
  window.history.pushState(window.history.state, "", url);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatLatency(value: number | null): string {
  return value === null ? "Not available" : `${formatNumber(value)} ms`;
}

function formatPayload(value: number | null, unit: string): string {
  return value === null ? "Not available" : `${formatNumber(value)} ${unit}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function surface(summary: UsageSummary, id: "mcp" | "rest"): SurfaceUsageSummary | undefined {
  return summary.surfaces.find((candidate) => candidate.surface === id);
}

function summaryItems(summary: UsageSummary): readonly SummaryItem[] {
  const total = summary.surfaces.reduce((sum, item) => sum + item.calls, 0);
  const failed = summary.surfaces.reduce((sum, item) => sum + item.error_calls, 0);
  return [
    {
      detail: `${summary.days} calendar days`,
      id: "total",
      label: "Total calls",
      value: formatNumber(total),
    },
    {
      detail: "Agent tool calls",
      id: "mcp",
      label: "MCP calls",
      value: surface(summary, "mcp")
        ? formatNumber(surface(summary, "mcp")?.calls ?? 0)
        : "Not reported",
    },
    {
      detail: "Application requests",
      id: "rest",
      label: "REST API calls",
      value: surface(summary, "rest")
        ? formatNumber(surface(summary, "rest")?.calls ?? 0)
        : "Not reported",
    },
    {
      detail: "Counted, not converted into a rate",
      id: "failed",
      label: "Failed calls",
      value: formatNumber(failed),
    },
  ];
}

function safeRequestId(error: unknown): string | null {
  return error instanceof ContextplaneApiError ? error.requestId : null;
}

function SurfaceTable({ summary }: { summary: UsageSummary }) {
  return (
    <TableSection
      description="Service-provided totals retain the API's original reach, payload, and worst-daily-latency semantics."
      title="Usage by surface"
    >
      {summary.surfaces.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm md:min-w-[900px]">
            <caption className="sr-only">Usage totals by service surface</caption>
            <thead className="sr-only md:not-sr-only">
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  Surface
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Calls
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Successful
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Failed
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Actor-days
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Distinct actors
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Payload
                </th>
                <th className="px-6 py-3 text-right font-medium" scope="col">
                  Worst daily p95
                </th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-border-subtle md:table-row-group">
              {summary.surfaces.map((item) => (
                <tr key={item.surface} className={responsiveRowClassName}>
                  <th
                    className="flex items-start justify-between gap-4 p-0 font-medium text-foreground md:table-cell md:px-6 md:py-4"
                    scope="row"
                  >
                    <MobileLabel>Surface</MobileLabel>
                    <span className="flex items-center gap-2">
                      {item.surface === "mcp" ? (
                        <Braces aria-hidden="true" className="size-4 text-accent" />
                      ) : (
                        <Database aria-hidden="true" className="size-4 text-accent" />
                      )}
                      {item.surface === "mcp" ? "MCP" : "REST API"}
                    </span>
                  </th>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Calls</MobileLabel>
                    <span>{formatNumber(item.calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Successful</MobileLabel>
                    <span>{formatNumber(item.ok_calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Failed</MobileLabel>
                    <span>{formatNumber(item.error_calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Actor-days</MobileLabel>
                    <span>{formatNumber(item.actor_days)}</span>
                  </td>
                  <td className={responsiveCellClassName}>
                    <MobileLabel>Distinct actors</MobileLabel>
                    <span className="text-right">
                      <span className="block tabular-nums">
                        {item.distinct_actors === null
                          ? "Not available"
                          : formatNumber(item.distinct_actors)}
                      </span>
                      {item.distinct_actors_unavailable_reason ? (
                        <span className="mt-1 block max-w-72 text-xs leading-5 text-muted">
                          {item.distinct_actors_unavailable_reason}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className={`${responsiveCellClassName} tabular-nums`}>
                    <MobileLabel>Payload</MobileLabel>
                    <span className="text-right">
                      <span className="block">{formatPayload(item.payload_bytes, "bytes")}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {formatPayload(item.payload_tokens, "tokens")}
                      </span>
                    </span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums md:px-6`}>
                    <MobileLabel>Worst daily p95</MobileLabel>
                    <span>{formatLatency(item.worst_daily_p95_ms)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description="The service returned no surface aggregates for this window."
          title="Surface usage is not available"
        />
      )}
    </TableSection>
  );
}

function DailySeriesTable({ series }: { series: DailyUsageSeries }) {
  return (
    <TableSection
      description="One exact row per reported day and surface. Missing days are not rendered as zero because absence can also indicate unavailable observation."
      title="Daily request series"
    >
      {series.points.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm md:min-w-[900px]">
            <caption className="sr-only">Exact daily usage by surface</caption>
            <thead className="sr-only md:not-sr-only">
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  Day
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Surface
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Calls
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Successful
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Failed
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Distinct actors
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  p50
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  p95
                </th>
                <th className="px-6 py-3 text-right font-medium" scope="col">
                  p99
                </th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-border-subtle md:table-row-group">
              {series.points.map((point) => (
                <tr key={`${point.day}-${point.surface}`} className={responsiveRowClassName}>
                  <th
                    className="flex items-start justify-between gap-4 p-0 font-medium text-foreground md:table-cell md:px-6 md:py-4"
                    scope="row"
                  >
                    <MobileLabel>Day</MobileLabel>
                    <span>{formatDate(point.day)}</span>
                  </th>
                  <td className={responsiveCellClassName}>
                    <MobileLabel>Surface</MobileLabel>
                    <span>{point.surface === "mcp" ? "MCP" : "REST API"}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Calls</MobileLabel>
                    <span>{formatNumber(point.calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Successful</MobileLabel>
                    <span>{formatNumber(point.ok_calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Failed</MobileLabel>
                    <span>{formatNumber(point.error_calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Distinct actors</MobileLabel>
                    <span>{formatNumber(point.distinct_actors)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>p50</MobileLabel>
                    <span>{formatLatency(point.p50_ms)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>p95</MobileLabel>
                    <span>{formatLatency(point.p95_ms)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums md:px-6`}>
                    <MobileLabel>p99</MobileLabel>
                    <span>{formatLatency(point.p99_ms)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description="Missing days are intentionally not interpreted as zero traffic."
          title="No daily usage points were reported"
        />
      )}
    </TableSection>
  );
}

function ToolTable({ query, ranking }: { query: string; ranking: ToolUsageRanking }) {
  const rows = ranking.tools.filter((row) => row.tool.toLocaleLowerCase().includes(query));
  return (
    <TableSection
      description="Which tools agents invoked through the MCP surface during this window."
      title="MCP tool usage"
    >
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm md:min-w-[700px]">
            <caption className="sr-only">Usage totals by MCP tool</caption>
            <thead className="sr-only md:not-sr-only">
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  Tool
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Calls
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
            <tbody className="block divide-y divide-border-subtle md:table-row-group">
              {rows.map((row) => (
                <tr key={row.tool} className={responsiveRowClassName}>
                  <th
                    className="flex items-start justify-between gap-4 p-0 font-medium md:table-cell md:px-6 md:py-4"
                    scope="row"
                  >
                    <MobileLabel>Tool</MobileLabel>
                    <code className="break-all text-right text-xs">{row.tool}</code>
                  </th>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Calls</MobileLabel>
                    <span>{formatNumber(row.calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Failed</MobileLabel>
                    <span>{formatNumber(row.error_calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Actor-days</MobileLabel>
                    <span>{formatNumber(row.actor_days)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums md:px-6`}>
                    <MobileLabel>Worst daily p95</MobileLabel>
                    <span>{formatLatency(row.worst_daily_p95_ms)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description="Try another tool name or clear the search."
          title="No MCP tools match this search"
        />
      )}
    </TableSection>
  );
}

function CapabilityTable({ query, ranking }: { query: string; ranking: CapabilityUsageRanking }) {
  const rows = ranking.capabilities.filter((row) =>
    row.capability_id.toLocaleLowerCase().includes(query),
  );
  return (
    <TableSection
      description="Which capabilities callers requested during this window. Capability identifiers remain service-authoritative."
      title="Capability demand"
    >
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm md:min-w-[620px]">
            <caption className="sr-only">Usage totals by requested capability</caption>
            <thead className="sr-only md:not-sr-only">
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  Capability ID
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Calls
                </th>
                <th className="px-6 py-3 text-right font-medium" scope="col">
                  Actor-days
                </th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-border-subtle md:table-row-group">
              {rows.map((row) => (
                <tr key={row.capability_id} className={responsiveRowClassName}>
                  <th
                    className="flex items-start justify-between gap-4 p-0 font-medium md:table-cell md:px-6 md:py-4"
                    scope="row"
                  >
                    <MobileLabel>Capability ID</MobileLabel>
                    <span className="break-all text-right font-mono text-xs">
                      {row.capability_id}
                    </span>
                  </th>
                  <td className={`${responsiveCellClassName} text-right tabular-nums`}>
                    <MobileLabel>Calls</MobileLabel>
                    <span>{formatNumber(row.calls)}</span>
                  </td>
                  <td className={`${responsiveCellClassName} text-right tabular-nums md:px-6`}>
                    <MobileLabel>Actor-days</MobileLabel>
                    <span>{formatNumber(row.actor_days)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description="Try another capability identifier or clear the search."
          title="No capabilities match this search"
        />
      )}
    </TableSection>
  );
}

export function AnalyticsPage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
}: AnalyticsPageProps) {
  const [usageWindow, setUsageWindow] = useState<UsageWindow>(readUsageWindow);
  const [draftWindow, setDraftWindow] = useState<UsageWindow>(readUsageWindow);
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [windowError, setWindowError] = useState<string | null>(null);
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const queryKey = [apiTenantId ?? "credential-default", usageWindow] as const;
  const summaryQuery = useQuery({
    queryFn: ({ signal }) => getUsageSummary(client, usageWindow, requestContext, signal),
    queryKey: ["usage-summary", ...queryKey],
    placeholderData: (previous) => previous,
  });
  const seriesQuery = useQuery({
    queryFn: ({ signal }) => getDailyUsageSeries(client, usageWindow, requestContext, signal),
    queryKey: ["usage-series", ...queryKey],
    placeholderData: (previous) => previous,
  });
  const toolsQuery = useQuery({
    queryFn: ({ signal }) => getToolUsage(client, usageWindow, requestContext, signal),
    queryKey: ["usage-tools", ...queryKey],
    placeholderData: (previous) => previous,
  });
  const capabilitiesQuery = useQuery({
    queryFn: ({ signal }) => getCapabilityUsage(client, usageWindow, requestContext, signal),
    queryKey: ["usage-capabilities", ...queryKey],
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    const restore = () => {
      const nextWindow = readUsageWindow();
      setUsageWindow(nextWindow);
      setDraftWindow(nextWindow);
      setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingCount = useMemo(
    () =>
      (toolsQuery.data?.tools.filter((row) =>
        row.tool.toLocaleLowerCase().includes(normalizedQuery),
      ).length ?? 0) +
      (capabilitiesQuery.data?.capabilities.filter((row) =>
        row.capability_id.toLocaleLowerCase().includes(normalizedQuery),
      ).length ?? 0),
    [capabilitiesQuery.data, normalizedQuery, toolsQuery.data],
  );

  function applyWindow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftWindow.from || !draftWindow.to || draftWindow.from > draftWindow.to) {
      setWindowError("Choose a valid start date that is not after the end date.");
      return;
    }
    setWindowError(null);
    writeUsageWindow(draftWindow);
    setUsageWindow(draftWindow);
  }

  function updateQuery(value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("q", value);
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
    setQuery(value);
  }

  if (summaryQuery.isPending) return <PageSkeleton controls={2} />;

  if (summaryQuery.isError) {
    return (
      <PageContainer>
        <PageHeader
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Analytics" }]}
          description="Understand how agents and applications use organizational context through MCP tools and the REST API."
          eyebrow="Platform usage"
          title="Analytics"
        />
        <RequestFailure
          onRetry={() => void summaryQuery.refetch()}
          requestId={safeRequestId(summaryQuery.error)}
          title="Usage summary unavailable"
        >
          The service did not return usage totals for this tenant and date range.
        </RequestFailure>
      </PageContainer>
    );
  }

  const anyRefreshing =
    summaryQuery.isFetching ||
    seriesQuery.isFetching ||
    toolsQuery.isFetching ||
    capabilitiesQuery.isFetching;

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Analytics" }]}
        description="Understand how agents and applications use organizational context through MCP tools and the REST API."
        eyebrow="Platform usage"
        metadata={
          <>
            <StatusBadge tone="info">Service aggregate</StatusBadge>
            <StatusBadge>
              {formatDate(summaryQuery.data.start)}–{formatDate(summaryQuery.data.end)}
            </StatusBadge>
            {anyRefreshing ? <StatusBadge tone="warning">Refreshing</StatusBadge> : null}
          </>
        }
        title="Analytics"
      />
      <form className="rounded-lg border border-border bg-surface p-6" onSubmit={applyWindow}>
        <div className="flex items-start gap-3">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-5 text-accent" />
          <div>
            <h2 className="text-base font-semibold">Reporting window</h2>
            <p className="mt-1 text-sm text-muted">
              Dates are inclusive and become shareable URL state when applied.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs font-medium text-muted">
            From
            <input
              className={`${inputClassName} mt-1.5`}
              onChange={(event) =>
                setDraftWindow((current) => ({ ...current, from: event.target.value }))
              }
              type="date"
              value={draftWindow.from}
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            To
            <input
              className={`${inputClassName} mt-1.5`}
              onChange={(event) =>
                setDraftWindow((current) => ({ ...current, to: event.target.value }))
              }
              type="date"
              value={draftWindow.to}
            />
          </label>
          <Button type="submit">Apply window</Button>
        </div>
        {windowError ? (
          <p className="mt-3 text-sm font-medium text-danger" role="alert">
            {windowError}
          </p>
        ) : null}
      </form>
      <SummaryStrip items={summaryItems(summaryQuery.data)} label="Usage summary" />
      <Notice title="Aggregate semantics are preserved">
        Calls, payloads, actor-days, and latency retain the service's reported meaning. Missing
        values stay unavailable rather than becoming zero, and absent daily points are not
        interpreted as quiet days.
      </Notice>
      <SurfaceTable summary={summaryQuery.data} />
      {seriesQuery.isError ? (
        <RequestFailure
          onRetry={() => void seriesQuery.refetch()}
          requestId={safeRequestId(seriesQuery.error)}
          title="Daily series unavailable"
        >
          Summary totals remain valid, but the day-by-day breakdown could not be loaded.
        </RequestFailure>
      ) : seriesQuery.data ? (
        <DailySeriesTable series={seriesQuery.data} />
      ) : null}
      <DataToolbar
        actions={
          <Button disabled={!query} onClick={() => updateQuery("")} variant="ghost">
            <RotateCcw aria-hidden="true" className="size-4" />
            Clear search
          </Button>
        }
        resultSummary={`${matchingCount} matching tools and capabilities`}
        search={
          <SearchField
            ref={searchRef}
            label="Search usage"
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Tool or capability identifier"
            value={query}
          />
        }
      />
      {toolsQuery.isError ? (
        <RequestFailure
          onRetry={() => void toolsQuery.refetch()}
          requestId={safeRequestId(toolsQuery.error)}
          title="Tool rankings unavailable"
        >
          Other usage evidence remains available for this window.
        </RequestFailure>
      ) : toolsQuery.data ? (
        <ToolTable query={normalizedQuery} ranking={toolsQuery.data} />
      ) : null}
      {capabilitiesQuery.isError ? (
        <RequestFailure
          onRetry={() => void capabilitiesQuery.refetch()}
          requestId={safeRequestId(capabilitiesQuery.error)}
          title="Capability rankings unavailable"
        >
          Other usage evidence remains available for this window.
        </RequestFailure>
      ) : capabilitiesQuery.data ? (
        <CapabilityTable query={normalizedQuery} ranking={capabilitiesQuery.data} />
      ) : null}
      <footer className="flex items-center gap-2 text-xs text-muted">
        <ShieldCheck aria-hidden="true" className="size-4 text-success" />
        <span>
          Usage is read-only, scoped to {activeTenantName}, and sourced from service aggregates.
        </span>
      </footer>
    </PageContainer>
  );
}
