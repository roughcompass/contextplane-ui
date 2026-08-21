import { GitBranch, Network } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

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
} from "@repo/ui/layouts";
import {
  Button,
  Notice,
  RequestFailure,
  SearchableSelect,
  Skeleton,
  StatusBadge,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  getConsumerRelationshipProjection,
  getProviderRelationshipProjection,
  getRelationshipBlastRadius,
  getRelationshipDependencies,
  getRelationshipDependents,
  getWhoAmI,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type RelationshipDependencyResult,
  type RelationshipEdge,
  type RelationshipEntity,
  type RelationshipTraversalResult,
  type WhoAmI,
} from "../../shared/api";
import {
  defaultRelationshipState,
  groupRelationshipEdges,
  humanizeRelationship,
  normalizeRelationshipState,
  parseRelationshipEdgeTypes,
  readRelationshipUrlState,
  relationshipAsOf,
  relationshipAreas,
  relationshipCaveats,
  relationshipNodeLookup,
  relationshipDepthOptions,
  relationshipPropertiesSummary,
  relationshipProjectionOptions,
  relationshipQuestionDescription,
  relationshipQuestionLabel,
  relationshipDirectionOptions,
  relationshipQuestionOptions,
  relationshipSearch,
  shortRelationshipIdentifier,
  unsatisfiedRelationshipEdges,
  validateRelationshipState,
  type RelationshipUrlState,
  type RelationshipArea,
  type RelationshipValidation,
} from "./relationshipModel";

interface RelationshipsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
}

type RelationshipResult = RelationshipDependencyResult | RelationshipTraversalResult;

const inputClassName =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent aria-invalid:border-danger aria-invalid:outline-danger";
const labelClassName = "block min-w-44 flex-1 text-xs font-medium text-muted";
const selectControlClassName = "min-w-44 flex-1";

function requestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function tenantQueryKey(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function isTraversal(result: RelationshipResult): result is RelationshipTraversalResult {
  return "cache_hit" in result && "version_satisfied" in result;
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
        body: "The resolved identity cannot traverse relationships in this tenant scope. The canonical catalog remains available.",
        title: "Relationship traversal is restricted",
        variant: "warning",
      };
    }
    if (error.code === "service_unavailable" || error.code === "unavailable") {
      return {
        body: "Relationship traversal is not available on this deployment. No dependency answer has been inferred in the browser.",
        title: "Relationships are unavailable",
        variant: "warning",
      };
    }
  }
  return {
    body: "The graph could not be traversed. No relationship has been added, removed, or inferred; retry when the service is available.",
    title: "Relationships could not be loaded",
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
    identity.actor_display_name ??
    identity.actor_email ??
    shortRelationshipIdentifier(identity.actor_id)
  );
}

function RelationshipTabs({
  activeArea,
  onChange,
}: {
  activeArea: RelationshipArea;
  onChange: (area: RelationshipArea) => void;
}) {
  function moveFocus(index: number) {
    const area = relationshipAreas[index];
    if (!area) return;
    onChange(area.id);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`#relationships-tab-${area.id}`)?.focus();
    });
  }

  return (
    <div
      aria-label="Relationship areas"
      className="grid grid-cols-2 border-b border-border"
      role="tablist"
    >
      {relationshipAreas.map((area, index) => (
        <button
          key={area.id}
          aria-controls={`relationships-panel-${area.id}`}
          aria-selected={activeArea === area.id}
          className={`min-h-11 border-b-2 px-4 py-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            activeArea === area.id
              ? "border-accent font-semibold text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
          id={`relationships-tab-${area.id}`}
          onClick={() => onChange(area.id)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveFocus((index + 1) % relationshipAreas.length);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveFocus((index - 1 + relationshipAreas.length) % relationshipAreas.length);
            } else if (event.key === "Home") {
              event.preventDefault();
              moveFocus(0);
            } else if (event.key === "End") {
              event.preventDefault();
              moveFocus(relationshipAreas.length - 1);
            }
          }}
          role="tab"
          tabIndex={activeArea === area.id ? 0 : -1}
          type="button"
        >
          {area.label}
        </button>
      ))}
    </div>
  );
}

function EntityReference({
  entityId,
  nodes,
}: {
  entityId: string;
  nodes: ReadonlyMap<string, RelationshipEntity>;
}) {
  const entity = nodes.get(entityId);
  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">
        {entity?.name ?? shortRelationshipIdentifier(entityId)}
      </span>
      <span className="mt-1 block truncate font-mono text-xs text-muted" title={entityId}>
        {entityId}
      </span>
      {entity ? (
        <span className="mt-1 block text-xs text-muted">
          {humanizeRelationship(entity.entity_type)}
          {entity.external_id ? ` · ${entity.external_id}` : ""}
        </span>
      ) : null}
    </div>
  );
}

function versionAgreement(
  edge: RelationshipEdge,
  traversal: RelationshipTraversalResult | null,
): "not-evaluated" | "satisfied" | "unresolved" {
  if (!traversal || !(edge.edge_id in traversal.version_satisfied)) return "not-evaluated";
  return traversal.version_satisfied[edge.edge_id] ? "satisfied" : "unresolved";
}

function RelationshipRows({
  edges,
  entities = [],
  traversal = null,
}: {
  edges: readonly RelationshipEdge[];
  entities?: readonly RelationshipEntity[];
  traversal?: RelationshipTraversalResult | null;
}) {
  const nodes = relationshipNodeLookup(entities);
  const groups = [...groupRelationshipEdges(edges).entries()];

  return (
    <div
      aria-label="Scrollable relationship results"
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">Canonical graph relationships returned by the service</caption>
        <thead>
          <tr className="border-y border-border bg-surface-muted text-xs text-muted">
            <th className="w-64 px-6 py-3 font-medium" scope="col">
              Source
            </th>
            <th className="w-64 px-4 py-3 font-medium" scope="col">
              Target
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Published conditions
            </th>
            <th className="w-40 px-6 py-3 font-medium" scope="col">
              Version agreement
            </th>
          </tr>
        </thead>
        {groups.map(([relation, edges]) => (
          <tbody key={relation} className="divide-y divide-border-subtle">
            <tr className="border-t border-border bg-surface-muted/60">
              <th
                className="px-6 py-2 text-xs font-semibold text-foreground"
                colSpan={4}
                scope="rowgroup"
              >
                {humanizeRelationship(relation)}
                <span className="ml-2 font-normal text-muted">
                  {edges.length} {edges.length === 1 ? "connection" : "connections"}
                </span>
              </th>
            </tr>
            {edges.map((edge) => {
              const agreement = versionAgreement(edge, traversal);
              return (
                <tr key={edge.edge_id} className="hover:bg-surface-muted">
                  <td className="px-6 py-4 align-top">
                    <EntityReference entityId={edge.src_entity_id} nodes={nodes} />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <EntityReference entityId={edge.dst_entity_id} nodes={nodes} />
                  </td>
                  <td className="break-words px-4 py-4 align-top text-xs leading-5 text-muted">
                    {relationshipPropertiesSummary(edge.properties)}
                  </td>
                  <td className="px-6 py-4 align-top">
                    {agreement === "satisfied" ? (
                      <StatusBadge tone="success">Satisfied</StatusBadge>
                    ) : agreement === "unresolved" ? (
                      <StatusBadge tone="warning">Unresolved</StatusBadge>
                    ) : (
                      <span className="text-xs text-muted">Not evaluated</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function ResultsLoading() {
  return (
    <div className="space-y-3 px-6 py-5">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

function Results({
  query,
  state,
}: {
  query: ReturnType<typeof useRelationshipQuery>;
  state: RelationshipUrlState;
}) {
  if (!state.root) {
    return (
      <EmptyState
        description="Enter a capability UUID or slug above. Relationships are read from the canonical graph only after you run the traversal."
        icon={GitBranch}
        title="Choose a capability to inspect"
      />
    );
  }
  if (query.isPending) return <ResultsLoading />;
  if (query.isError) {
    return (
      <div className="p-6">
        <QueryFailure error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (query.data.edges.length === 0) {
    return (
      <EmptyState
        description="The service returned no connections visible at this depth and time. Try more hops or another question. Relationships private to another tenant remain hidden."
        icon={Network}
        title="No visible relationships at this depth"
      />
    );
  }
  const traversal = isTraversal(query.data) ? query.data : null;
  return (
    <RelationshipRows
      edges={query.data.edges}
      entities={traversal?.nodes ?? []}
      traversal={traversal}
    />
  );
}

function useRelationshipQuery(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
  tenantKey: string,
  state: RelationshipUrlState,
) {
  return useQuery({
    enabled: Boolean(state.root),
    queryFn: ({ signal }) => {
      const asOf = relationshipAsOf(state.asOf);
      if (state.question === "dependencies") {
        return getRelationshipDependencies(
          client,
          state.root,
          { ...(asOf ? { asOf } : {}), depth: state.depth },
          context,
          signal,
        );
      }

      const edgeTypes = parseRelationshipEdgeTypes(state.edgeTypes);
      const shared = {
        ...(asOf ? { asOf } : {}),
        ...(state.asOfVersion ? { asOfVersion: state.asOfVersion } : {}),
        depth: state.depth,
        ...(edgeTypes ? { edgeTypes } : {}),
      };
      if (state.question === "blast-radius") {
        return getRelationshipBlastRadius(
          client,
          state.root,
          { ...shared, direction: state.direction },
          context,
          signal,
        );
      }
      return getRelationshipDependents(client, state.root, shared, context, signal);
    },
    queryKey: [
      "contextplane",
      tenantKey,
      "relationships",
      state.root,
      state.question,
      state.depth,
      state.direction,
      state.edgeTypes,
      state.asOf,
      state.asOfVersion,
    ],
  });
}

function useProjectionQuery(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
  tenantKey: string,
  state: RelationshipUrlState,
) {
  return useQuery({
    enabled: state.area === "projections",
    queryFn: ({ signal }) => {
      const asOf = relationshipAsOf(state.asOf);
      const parameters = {
        ...(asOf ? { asOf } : {}),
        ...(state.cursor ? { cursor: state.cursor } : {}),
        pageSize: 100,
      };
      return state.projection === "provider"
        ? getProviderRelationshipProjection(client, parameters, context, signal)
        : getConsumerRelationshipProjection(client, parameters, context, signal);
    },
    queryKey: [
      "contextplane",
      tenantKey,
      "relationships",
      "projection",
      state.projection,
      state.cursor,
      state.asOf,
    ],
  });
}

function ProjectionNodeRows({ nodes }: { nodes: readonly RelationshipEntity[] }) {
  return (
    <div
      aria-label="Scrollable projection entities"
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">Entities on this graph projection page</caption>
        <thead>
          <tr className="border-y border-border bg-surface-muted text-xs text-muted">
            <th className="w-72 px-6 py-3 font-medium" scope="col">
              Entity
            </th>
            <th className="w-44 px-4 py-3 font-medium" scope="col">
              Type
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              External ID
            </th>
            <th className="w-48 px-6 py-3 font-medium" scope="col">
              Created
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {nodes.map((node) => (
            <tr key={node.entity_id} className="hover:bg-surface-muted">
              <th className="px-6 py-4 align-top font-medium" scope="row">
                {node.name}
                <span
                  className="mt-1 block truncate font-mono text-xs font-normal text-muted"
                  title={node.entity_id}
                >
                  {node.entity_id}
                </span>
              </th>
              <td className="px-4 py-4 align-top text-muted">
                {humanizeRelationship(node.entity_type)}
              </td>
              <td className="px-4 py-4 align-top font-mono text-xs text-muted">
                {node.external_id ?? "Not published"}
              </td>
              <td className="whitespace-nowrap px-6 py-4 align-top text-xs text-muted tabular-nums">
                <time dateTime={node.created_at}>{node.created_at}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectionPanel({
  draft,
  onDraftChange,
  onSubmit,
  query,
  state,
  updateState,
  validation,
}: {
  draft: RelationshipUrlState;
  onDraftChange: (draft: RelationshipUrlState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  query: ReturnType<typeof useProjectionQuery>;
  state: RelationshipUrlState;
  updateState: (state: RelationshipUrlState) => void;
  validation: RelationshipValidation;
}) {
  const invalidCursor =
    query.error instanceof ContextplaneApiError && query.error.code === "invalid_cursor";

  return (
    <div
      id="relationships-panel-projections"
      aria-labelledby="relationships-tab-projections"
      className="space-y-6"
      role="tabpanel"
    >
      <Notice title="Projection counts describe this page only">
        The service publishes no graph total. Nodes and edges below are one cursor page of what this
        tenant ships or consumes; more may follow without a total count.
      </Notice>
      <SectionSurface
        description="Provider shows tenant-owned entities and outgoing provides-to edges. Consumer adds adopted provider capabilities and dependency relations."
        flush
        title="Choose a tenant projection"
      >
        <form onSubmit={onSubmit}>
          <div className="border-y border-border-subtle bg-surface-muted px-4 py-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-start">
              <label className="block text-xs font-medium text-muted">
                As of (optional)
                <input
                  aria-describedby={
                    validation.asOf
                      ? "relationship-projection-as-of-error"
                      : "relationship-projection-as-of-help"
                  }
                  aria-invalid={Boolean(validation.asOf)}
                  className={inputClassName}
                  onChange={(event) =>
                    onDraftChange({ ...draft, asOf: event.target.value, cursor: "" })
                  }
                  placeholder="2026-08-13T10:00:00Z"
                  type="text"
                  value={draft.asOf}
                />
                <span
                  className="mt-1 block text-xs font-normal text-muted"
                  id="relationship-projection-as-of-help"
                >
                  ISO 8601 instant. Empty means now.
                </span>
                {validation.asOf ? (
                  <span
                    className="mt-1 block text-xs text-danger"
                    id="relationship-projection-as-of-error"
                  >
                    {validation.asOf}
                  </span>
                ) : null}
              </label>
              <SearchableSelect
                allowEmpty={false}
                label="Projection"
                onValueChange={(value) =>
                  onDraftChange({
                    ...draft,
                    cursor: "",
                    projection: value as RelationshipUrlState["projection"],
                  })
                }
                options={relationshipProjectionOptions}
                value={draft.projection}
              />
              <Button className="w-full md:mt-5 md:w-auto" type="submit">
                Load projection
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              {draft.projection === "provider"
                ? "What this tenant publishes and provides."
                : "What this tenant owns, adopts, and depends on."}
            </p>
          </div>
        </form>
      </SectionSurface>

      {query.isPending ? <ResultsLoading /> : null}
      {query.isError ? (
        invalidCursor ? (
          <Notice
            action={
              <Button onClick={() => updateState({ ...state, cursor: "" })} variant="secondary">
                Return to first page
              </Button>
            }
            title="This projection cursor is invalid"
            variant="warning"
          >
            The service refused the cursor. It is not decoded, repaired, or replaced in the browser.
          </Notice>
        ) : (
          <QueryFailure error={query.error} onRetry={() => void query.refetch()} />
        )
      ) : null}

      {query.data ? (
        <>
          <SummaryStrip
            items={[
              {
                detail: "This page only",
                id: "projection-nodes",
                label: "Nodes on this page",
                value: query.data.nodes.length,
              },
              {
                detail: "This page only",
                id: "projection-edges",
                label: "Edges on this page",
                value: query.data.edges.length,
              },
              {
                detail: query.data.next_cursor
                  ? "An opaque cursor was published"
                  : "No next cursor was published",
                id: "projection-pages",
                label: "More pages",
                value: query.data.next_cursor ? "Yes" : "No",
              },
              {
                detail: state.asOf ? `As of ${state.asOf}` : "Current graph time",
                id: "projection-direction",
                label: "Projection",
                value: state.projection === "provider" ? "Provider" : "Consumer",
              },
            ]}
            label="Projection page summary"
          />

          <SectionSurface
            description="Every entity returned on this cursor page. No tenant-wide entity count is inferred."
            flush
            title="Entities on this page"
          >
            {query.data.nodes.length > 0 ? (
              <ProjectionNodeRows nodes={query.data.nodes} />
            ) : (
              <EmptyState
                description="The service returned no entities on this projection page. This is not a graph-wide count."
                icon={Network}
                title="No entities on this page"
              />
            )}
          </SectionSurface>

          <TableSection
            description="Edges whose source is represented by this projection page, grouped in service traversal order."
            footer={
              query.data.nodes.length > 0 || query.data.edges.length > 0 ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-muted">
                    Projection cursors are opaque and returned to the service unchanged.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!state.cursor}
                      onClick={() => updateState({ ...state, cursor: "" })}
                      variant="secondary"
                    >
                      First page
                    </Button>
                    <Button
                      disabled={!query.data.next_cursor}
                      onClick={() => {
                        const cursor = query.data.next_cursor;
                        if (cursor) updateState({ ...state, cursor });
                      }}
                      variant="secondary"
                    >
                      Next page
                    </Button>
                  </div>
                </div>
              ) : undefined
            }
            title="Edges on this page"
          >
            {query.data.edges.length > 0 ? (
              <RelationshipRows edges={query.data.edges} entities={query.data.nodes} />
            ) : (
              <EmptyState
                description="The service returned entities but no edges for this projection page."
                icon={GitBranch}
                title="No edges on this page"
              />
            )}
          </TableSection>
        </>
      ) : null}
    </div>
  );
}

function TraversalForm({
  draft,
  onDraftChange,
  onReset,
  onSubmit,
  searchRef,
  validation,
}: {
  draft: RelationshipUrlState;
  onDraftChange: (draft: RelationshipUrlState) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  validation: RelationshipValidation;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DataToolbar
        actions={
          <>
            <Button onClick={onReset} type="button" variant="ghost">
              Reset
            </Button>
            <Button type="submit">Run traversal</Button>
          </>
        }
        filters={
          <>
            <SearchableSelect
              allowEmpty={false}
              className={selectControlClassName}
              label="Question"
              onValueChange={(value) =>
                onDraftChange({
                  ...draft,
                  question: value as RelationshipUrlState["question"],
                })
              }
              options={relationshipQuestionOptions}
              value={draft.question}
            />
            <SearchableSelect
              allowEmpty={false}
              className={selectControlClassName}
              label="Hops to follow"
              onValueChange={(value) =>
                onDraftChange({
                  ...draft,
                  depth: Number(value) as RelationshipUrlState["depth"],
                })
              }
              options={relationshipDepthOptions}
              value={String(draft.depth)}
            />
            {draft.question === "blast-radius" ? (
              <SearchableSelect
                allowEmpty={false}
                className={selectControlClassName}
                label="Direction"
                onValueChange={(value) =>
                  onDraftChange({
                    ...draft,
                    direction: value as RelationshipUrlState["direction"],
                  })
                }
                options={relationshipDirectionOptions}
                value={draft.direction}
              />
            ) : null}
            {draft.question !== "dependencies" ? (
              <label className={labelClassName}>
                Relationship types
                <input
                  className={inputClassName}
                  onChange={(event) => onDraftChange({ ...draft, edgeTypes: event.target.value })}
                  placeholder="All dependency relations"
                  type="text"
                  value={draft.edgeTypes}
                />
              </label>
            ) : null}
          </>
        }
        resultSummary={relationshipQuestionDescription(draft.question)}
        search={
          <label className="block text-xs font-medium text-muted">
            Capability UUID or slug
            <input
              ref={searchRef}
              aria-describedby={validation.root ? "relationship-root-error" : undefined}
              aria-invalid={Boolean(validation.root)}
              className={inputClassName}
              onChange={(event) => onDraftChange({ ...draft, root: event.target.value })}
              placeholder="identity-platform"
              type="search"
              value={draft.root}
            />
            {validation.root ? (
              <span className="mt-1 block text-xs text-danger" id="relationship-root-error">
                {validation.root}
              </span>
            ) : null}
          </label>
        }
      />
      <div className="grid gap-4 border-t border-border-subtle bg-surface px-4 py-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-muted">
          As of (optional)
          <input
            aria-describedby={
              validation.asOf ? "relationship-as-of-error" : "relationship-as-of-help"
            }
            aria-invalid={Boolean(validation.asOf)}
            className={inputClassName}
            onChange={(event) => onDraftChange({ ...draft, asOf: event.target.value })}
            placeholder="2026-08-13T10:00:00Z"
            type="text"
            value={draft.asOf}
          />
          <span className="mt-1 block text-xs font-normal text-muted" id="relationship-as-of-help">
            ISO 8601 instant. Empty means now.
          </span>
          {validation.asOf ? (
            <span className="mt-1 block text-xs text-danger" id="relationship-as-of-error">
              {validation.asOf}
            </span>
          ) : null}
        </label>
        {draft.question !== "dependencies" ? (
          <label className="block text-xs font-medium text-muted">
            Version to resolve (optional)
            <input
              className={inputClassName}
              onChange={(event) => onDraftChange({ ...draft, asOfVersion: event.target.value })}
              placeholder="2.4.0"
              type="text"
              value={draft.asOfVersion}
            />
            <span className="mt-1 block text-xs font-normal text-muted">
              Checked against published edge constraints by the service.
            </span>
          </label>
        ) : null}
      </div>
    </form>
  );
}

function RelationshipExplorer({
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
  const [state, setState] = useState(readRelationshipUrlState);
  const [draft, setDraft] = useState(readRelationshipUrlState);
  const [validation, setValidation] = useState<RelationshipValidation>({});
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const query = useRelationshipQuery(client, context, tenantQueryKey(apiTenantId), state);
  const projectionQuery = useProjectionQuery(client, context, tenantQueryKey(apiTenantId), state);
  const traversal = query.data && isTraversal(query.data) ? query.data : null;
  const caveats = traversal ? relationshipCaveats(traversal) : [];

  useEffect(() => {
    function restoreState() {
      const restored = readRelationshipUrlState();
      setState(restored);
      setDraft(restored);
      setValidation({});
    }
    window.addEventListener("popstate", restoreState);
    return () => window.removeEventListener("popstate", restoreState);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextValidation = validateRelationshipState(draft);
    setValidation(nextValidation);
    if (Object.keys(nextValidation).length > 0) return;

    const next = normalizeRelationshipState(draft);
    const unchanged = relationshipSearch(next) === relationshipSearch(state);
    window.history.pushState(window.history.state, "", `/relationships${relationshipSearch(next)}`);
    setDraft(next);
    setState(next);
    if (unchanged) {
      if (next.area === "projections") void projectionQuery.refetch();
      else void query.refetch();
    }
  }

  function updateState(next: RelationshipUrlState) {
    window.history.pushState(window.history.state, "", `/relationships${relationshipSearch(next)}`);
    setDraft(next);
    setState(next);
    setValidation({});
  }

  function changeArea(area: RelationshipArea) {
    if (area === state.area) return;
    updateState({
      ...defaultRelationshipState,
      area,
      asOf: state.asOf,
      projection: state.projection,
    });
  }

  function reset() {
    window.history.pushState(window.history.state, "", "/relationships");
    setDraft(defaultRelationshipState);
    setState(defaultRelationshipState);
    setValidation({});
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  const result = query.data;
  const nodesReturned = result && isTraversal(result) ? result.nodes.length : null;
  const source =
    result && isTraversal(result)
      ? result.cache_hit
        ? "Cached closure"
        : "Live traversal"
      : "Not reported";
  const unresolved = traversal ? unsatisfiedRelationshipEdges(traversal).length : null;

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { href: "/", label: identity.tenant_display_name },
          { label: "Relationships" },
        ]}
        description="Walk canonical dependencies, reverse dependents, or a transitive blast radius before building on or changing a capability."
        eyebrow="Dependency intelligence"
        metadata={
          <>
            <StatusBadge tone="info">Canonical graph</StatusBadge>
            <StatusBadge>{identity.tenant_display_name}</StatusBadge>
            <StatusBadge>{identityName(identity)}</StatusBadge>
          </>
        }
        title="Relationships"
      />

      <div className="space-y-6">
        <Notice title="Visibility follows tenant access">
          Traversals show only relationships visible to this tenant; adopted provider capabilities
          may expose cross-tenant nodes. An empty answer does not prove that no hidden relationship
          exists.
        </Notice>

        <RelationshipTabs activeArea={state.area} onChange={changeArea} />

        {state.area === "projections" ? (
          <ProjectionPanel
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={submit}
            query={projectionQuery}
            state={state}
            updateState={updateState}
            validation={validation}
          />
        ) : (
          <div
            id="relationships-panel-explore"
            aria-labelledby="relationships-tab-explore"
            className="space-y-6"
            role="tabpanel"
          >
            <SectionSurface
              description="Use a capability UUID or slug. Every answer is URL-addressable and every selected parameter changes the traversal."
              flush
              title="Explore impact"
            >
              <TraversalForm
                draft={draft}
                onDraftChange={setDraft}
                onReset={reset}
                onSubmit={submit}
                searchRef={searchRef}
                validation={validation}
              />
            </SectionSurface>

            {result ? (
              <SummaryStrip
                items={[
                  {
                    detail: "This response only",
                    id: "edges",
                    label: "Edges returned",
                    value: result.edges.length,
                  },
                  {
                    detail:
                      nodesReturned === null
                        ? "Not published by this endpoint"
                        : "This response only",
                    id: "nodes",
                    label: "Nodes returned",
                    value: nodesReturned ?? "—",
                  },
                  {
                    detail: result.as_of ? `As of ${result.as_of}` : "Current graph time",
                    id: "depth",
                    label: "Hops followed",
                    value: result.depth,
                  },
                  {
                    detail:
                      unresolved === null
                        ? "Version agreement not published"
                        : unresolved === 0
                          ? "All evaluated constraints resolved"
                          : `${unresolved} unresolved`,
                    id: "source",
                    label: "Answer source",
                    value: source,
                  },
                ]}
                label="Relationship result summary"
              />
            ) : null}

            {caveats.length > 0 ? (
              <Notice title="What this answer could not settle" variant="warning">
                {caveats.join(" ")}
              </Notice>
            ) : null}

            <TableSection
              description={
                state.root
                  ? `${relationshipQuestionDescription(state.question)} Results preserve the traversal order returned by the service.`
                  : "Run one canonical graph question at a time. No graph-wide total is inferred from the returned rows."
              }
              title={state.root ? relationshipQuestionLabel(state.question) : "Traversal results"}
            >
              <Results query={query} state={state} />
            </TableSection>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

export function RelationshipsPage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
}: RelationshipsPageProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const identity = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, context, signal),
    queryKey: ["contextplane", tenantQueryKey(apiTenantId), "identity"],
    staleTime: 5 * 60 * 1000,
  });

  if (identity.isPending) return <PageSkeleton controls={4} rows={5} />;
  if (identity.isError) {
    return (
      <PageContainer>
        <PageHeader
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Relationships" }]}
          description="Walk canonical dependencies and change impact without inferring graph totals in the browser."
          eyebrow="Dependency intelligence"
          title="Relationships"
        />
        <QueryFailure error={identity.error} onRetry={() => void identity.refetch()} />
      </PageContainer>
    );
  }

  return (
    <RelationshipExplorer
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identity.data}
      searchRef={searchRef}
    />
  );
}
