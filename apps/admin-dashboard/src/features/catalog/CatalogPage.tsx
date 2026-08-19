import { Plus, SearchX, Settings2 } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type RefObject } from "react";

import {
  DataToolbar,
  EmptyState,
  PageContainer,
  PageHeader,
  PageSkeleton,
  SummaryStrip,
  TableSection,
} from "@repo/ui/layouts";
import {
  Button,
  Notice,
  RequestFailure,
  SearchField,
  SearchableSelect,
  StatusBadge,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  listCapabilities,
  type CatalogCapabilitySummary,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { CapabilityDialog, type CapabilityDialogTarget } from "./CapabilityDialog";

interface CatalogPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
}

const lifecycleOptions = [
  { label: "All lifecycle states", value: "all" },
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Generally available", value: "ga" },
  { label: "Deprecated", value: "deprecated" },
  { label: "Retired", value: "retired" },
] as const;

function readParameter(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function readTarget(): CapabilityDialogTarget | null {
  if (readParameter("create") === "capability") return { mode: "create" };
  const capabilityId = readParameter("capability");
  return capabilityId ? { capabilityId, mode: "detail" } : null;
}

function updateLocation(updates: Readonly<Record<string, string | null>>, push = false) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  window.history[push ? "pushState" : "replaceState"](window.history.state, "", url);
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function requestFailure(error: unknown): { description: string; requestId: string | null } {
  if (error instanceof ContextplaneApiError) {
    return {
      description:
        error.status === 403
          ? "The current credential cannot browse capabilities in this tenant."
          : "Capabilities could not be loaded from the service.",
      requestId: error.requestId,
    };
  }
  return { description: "Capabilities could not be loaded from the service.", requestId: null };
}

export function CatalogPage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
}: CatalogPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const [query, setQuery] = useState(() => readParameter("q"));
  const [lifecycle, setLifecycle] = useState(() => readParameter("lifecycle") || "all");
  const [asOf, setAsOf] = useState(() => readParameter("as_of"));
  const [cursor, setCursor] = useState(() => readParameter("cursor"));
  const [target, setTarget] = useState<CapabilityDialogTarget | null>(readTarget);

  const capabilities = useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      listCapabilities(
        client,
        {
          ...(asOf ? { asOf } : {}),
          ...(cursor ? { cursor } : {}),
          ...(lifecycle !== "all" ? { lifecycle } : {}),
          pageSize: 100,
        },
        requestContext,
        signal,
      ),
    queryKey: [
      "contextplane",
      apiTenantId ?? "credential-default",
      "catalog",
      "capabilities",
      lifecycle,
      asOf,
      cursor,
    ],
  });

  useEffect(() => {
    function restoreLocation() {
      setQuery(readParameter("q"));
      setLifecycle(readParameter("lifecycle") || "all");
      setAsOf(readParameter("as_of"));
      setCursor(readParameter("cursor"));
      setTarget(readTarget());
    }
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return capabilities.data?.items ?? [];
    return (capabilities.data?.items ?? []).filter((capability) =>
      [capability.name, capability.entityType, capability.externalId, capability.entityId].some(
        (value) => value?.toLocaleLowerCase().includes(normalized),
      ),
    );
  }, [capabilities.data?.items, query]);

  function updateFilters(nextQuery: string, nextLifecycle: string, nextAsOf: string) {
    updateLocation({
      as_of: nextAsOf || null,
      cursor: null,
      lifecycle: nextLifecycle === "all" ? null : nextLifecycle,
      q: nextQuery || null,
    });
    setQuery(nextQuery);
    setLifecycle(nextLifecycle);
    setAsOf(nextAsOf);
    setCursor("");
  }

  function openTarget(nextTarget: CapabilityDialogTarget) {
    setTarget(nextTarget);
    updateLocation(
      nextTarget.mode === "create"
        ? { capability: null, create: "capability", panel: null }
        : { capability: nextTarget.capabilityId, create: null, panel: "overview" },
      true,
    );
  }

  function closeTarget() {
    setTarget(null);
    updateLocation({ capability: null, create: null, panel: null });
  }

  function selectCreatedCapability(capability: CatalogCapabilitySummary) {
    const nextTarget: CapabilityDialogTarget = {
      capabilityId: capability.entityId,
      mode: "detail",
    };
    setTarget(nextTarget);
    updateLocation({ capability: capability.entityId, create: null, panel: "overview" });
  }

  if (capabilities.isPending) return <PageSkeleton controls={4} />;

  if (capabilities.isError) {
    const failure = requestFailure(capabilities.error);
    return (
      <PageContainer>
        <PageHeader
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Catalog" }]}
          description="Discover and maintain canonical capabilities and their governed service records."
          eyebrow="Canonical catalog"
          title="Catalog"
        />
        <RequestFailure
          onRetry={() => void capabilities.refetch()}
          requestId={failure.requestId}
          title="Capabilities unavailable"
        >
          {failure.description}
        </RequestFailure>
      </PageContainer>
    );
  }

  const hasFilters = Boolean(query || asOf || lifecycle !== "all");
  const resultCount = capabilities.data.items.length;

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button onClick={() => openTarget({ mode: "create" })}>
            <Plus aria-hidden="true" className="size-4" />
            Create capability
          </Button>
        }
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Catalog" }]}
        description="Discover canonical capabilities, inspect ownership and impact, and maintain lifecycle, interfaces, artifacts, adoptions, and subscriptions in one workflow."
        eyebrow="Canonical catalog"
        metadata={
          <>
            <StatusBadge tone="success">Service backed</StatusBadge>
            {capabilities.isFetching ? <StatusBadge tone="info">Refreshing</StatusBadge> : null}
            {asOf ? <StatusBadge tone="warning">Historical view</StatusBadge> : null}
          </>
        }
        title="Catalog"
      />

      <Notice title="Canonical service state" variant="info">
        Every record on this page comes from the selected tenant's service boundary. Living Memory
        observations and workspace material remain in their own workflows and are not presented as
        approved catalog state.
      </Notice>

      <SummaryStrip
        items={[
          {
            detail: "Records returned on this service page",
            id: "page-count",
            label: "Capabilities on page",
            value: resultCount,
          },
          {
            detail: query ? `Filtered by “${query}”` : "No text filter applied",
            id: "matches",
            label: "Visible matches",
            value: filtered.length,
          },
          {
            detail: lifecycle === "all" ? "All lifecycle states" : `Lifecycle: ${lifecycle}`,
            id: "lifecycle",
            label: "Lifecycle scope",
            value: lifecycle === "all" ? "All" : lifecycle,
          },
          {
            detail: capabilities.data.nextCursor
              ? "The service has more records"
              : "No next cursor returned",
            id: "pagination",
            label: "More results",
            value: capabilities.data.nextCursor ? "Available" : "No",
          },
        ]}
        label="Catalog result context"
      />

      <TableSection
        description="Comparable capability records from the selected tenant. Open a record to work with its governed state and related evidence."
        filters={
          <DataToolbar
            filters={
              <>
                <SearchableSelect
                  allowEmpty={false}
                  className="w-full sm:w-52"
                  label="Lifecycle"
                  onValueChange={(value) => updateFilters(query, value, asOf)}
                  options={lifecycleOptions}
                  searchPlaceholder="Search lifecycle states"
                  value={lifecycle}
                />
                <label className="block text-xs font-medium text-muted">
                  State as of
                  <input
                    className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent sm:w-56"
                    onChange={(event) => updateFilters(query, lifecycle, event.target.value)}
                    placeholder="ISO-8601 timestamp"
                    type="text"
                    value={asOf}
                  />
                </label>
              </>
            }
            resultSummary={`${filtered.length} of ${resultCount} records shown${asOf ? ` · state as of ${asOf}` : ""}`}
            search={
              <SearchField
                ref={searchRef}
                label="Search current page"
                onChange={(event) => updateFilters(event.target.value, lifecycle, asOf)}
                placeholder="Capability, type, external ID, or UUID"
                value={query}
              />
            }
          />
        }
        title="Capabilities"
      >
        {filtered.length === 0 ? (
          <EmptyState
            action={
              hasFilters ? (
                <Button onClick={() => updateFilters("", "all", "")} variant="secondary">
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => openTarget({ mode: "create" })}>Create capability</Button>
              )
            }
            description={
              hasFilters
                ? "Adjust the text, lifecycle, or historical-time filter."
                : "Create the first canonical capability for this tenant."
            }
            {...(hasFilters ? { icon: SearchX } : {})}
            title={hasFilters ? "No capability matches" : "No capabilities yet"}
          />
        ) : (
          <>
            <ul className="divide-y divide-border-subtle border-t border-border lg:hidden">
              {filtered.map((capability) => (
                <li key={capability.entityId} className="p-6">
                  <button
                    className="text-left font-medium text-foreground hover:text-accent hover:underline"
                    onClick={() =>
                      openTarget({ capabilityId: capability.entityId, mode: "detail" })
                    }
                    type="button"
                  >
                    {capability.name}
                  </button>
                  <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-xs">
                    <dt className="text-muted">Type</dt>
                    <dd className="text-foreground">{capability.entityType}</dd>
                    <dt className="text-muted">External ID</dt>
                    <dd className="break-all font-mono text-foreground">
                      {capability.externalId ?? "Not assigned"}
                    </dd>
                    <dt className="text-muted">Created</dt>
                    <dd className="text-foreground">
                      <time dateTime={capability.createdAt}>
                        {formatTimestamp(capability.createdAt)}
                      </time>
                    </dd>
                  </dl>
                  <Button
                    className="mt-4 w-full justify-center"
                    onClick={() =>
                      openTarget({ capabilityId: capability.entityId, mode: "detail" })
                    }
                    size="compact"
                    variant="secondary"
                  >
                    <Settings2 aria-hidden="true" className="size-4" />
                    Open capability
                  </Button>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Service-backed capability records for {activeTenantName}
                </caption>
                <thead>
                  <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                    <th className="px-6 py-3 font-medium" scope="col">
                      Capability
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Type
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      External ID
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right font-medium" scope="col">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filtered.map((capability) => (
                    <tr key={capability.entityId} className="hover:bg-surface-muted">
                      <th className="px-6 py-4 font-normal" scope="row">
                        <button
                          className="font-medium text-foreground hover:text-accent hover:underline"
                          onClick={() =>
                            openTarget({ capabilityId: capability.entityId, mode: "detail" })
                          }
                          type="button"
                        >
                          {capability.name}
                        </button>
                        <span className="mt-1 block break-all font-mono text-xs text-muted">
                          {capability.entityId}
                        </span>
                      </th>
                      <td className="px-4 py-4 text-muted">{capability.entityType}</td>
                      <td className="px-4 py-4 font-mono text-xs text-muted">
                        {capability.externalId ?? "Not assigned"}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        <time dateTime={capability.createdAt}>
                          {formatTimestamp(capability.createdAt)}
                        </time>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          onClick={() =>
                            openTarget({ capabilityId: capability.entityId, mode: "detail" })
                          }
                          size="compact"
                          variant="secondary"
                        >
                          <Settings2 aria-hidden="true" className="size-4" />
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-xs text-muted">Cursors remain opaque and are sent unchanged.</p>
          <div className="flex gap-2">
            {cursor ? (
              <Button
                onClick={() => {
                  updateLocation({ cursor: null });
                  setCursor("");
                }}
                size="compact"
                variant="secondary"
              >
                First page
              </Button>
            ) : null}
            <Button
              disabled={!capabilities.data.nextCursor}
              onClick={() => {
                const nextCursor = capabilities.data.nextCursor;
                if (!nextCursor) return;
                updateLocation({ cursor: nextCursor });
                setCursor(nextCursor);
              }}
              size="compact"
              variant="secondary"
            >
              Next page
            </Button>
          </div>
        </div>
      </TableSection>

      {target ? (
        <CapabilityDialog
          {...(apiTenantId ? { apiTenantId } : {})}
          client={client}
          onClose={closeTarget}
          onCreated={selectCreatedCapability}
          target={target}
          tenantName={activeTenantName}
        />
      ) : null}
    </PageContainer>
  );
}
