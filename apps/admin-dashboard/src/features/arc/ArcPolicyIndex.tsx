import { FileCheck2, Plus, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type RefObject } from "react";

import { DataToolbar, EmptyState, TableSection } from "@repo/ui/layouts";
import {
  Button,
  RequestFailure,
  SearchField,
  SearchableSelect,
  Skeleton,
  StatusBadge,
} from "@repo/ui/primitives";

import type { ContextplaneRequestOptions } from "../../shared/api/client";
import { ContextplaneApiError, type ContextplaneClient } from "../../shared/api/client";
import {
  arcArtifactKinds,
  arcOwningScopes,
  listArcArtifactFamilies,
  type ArcArtifactFamily,
  type ArcArtifactKind,
  type ArcOwningScope,
} from "../../shared/api/contextplane";
import { formatArcDate, formatArcLabel } from "./arcModel";

interface ArcPolicyIndexProps {
  client: ContextplaneClient;
  onCreate?: () => void;
  onSelect?: (policy: ArcArtifactFamily) => void;
  requestContext: ContextplaneRequestOptions;
  searchRef: RefObject<HTMLInputElement | null>;
  selectedPolicyId?: string;
  tenantKey: string;
}

interface PolicyListState {
  cursor: string;
  kind: ArcArtifactKind | "";
  query: string;
  scope: ArcOwningScope | "";
}

const pageSize = 25;
const tableHeaderClassName =
  "border-b border-border bg-surface-muted px-4 py-3 text-left text-xs font-semibold tracking-[0.04em] text-muted uppercase";
const tableCellClassName =
  "border-b border-border-subtle px-4 py-3 align-middle text-sm text-foreground";

function isArtifactKind(value: string | null): value is ArcArtifactKind {
  return value !== null && arcArtifactKinds.includes(value as ArcArtifactKind);
}

function isOwningScope(value: string | null): value is ArcOwningScope {
  return value !== null && arcOwningScopes.includes(value as ArcOwningScope);
}

function readPolicyListState(search: string): PolicyListState {
  const parameters = new URLSearchParams(search);
  const kind = parameters.get("policy_kind");
  const scope = parameters.get("policy_scope");
  return {
    cursor: parameters.get("policy_cursor") ?? "",
    kind: isArtifactKind(kind) ? kind : "",
    query: (parameters.get("policy_q") ?? "").slice(0, 200),
    scope: isOwningScope(scope) ? scope : "",
  };
}

function writePolicyListState(state: PolicyListState, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  if (state.query) url.searchParams.set("policy_q", state.query);
  else url.searchParams.delete("policy_q");
  if (state.kind) url.searchParams.set("policy_kind", state.kind);
  else url.searchParams.delete("policy_kind");
  if (state.scope) url.searchParams.set("policy_scope", state.scope);
  else url.searchParams.delete("policy_scope");
  if (state.cursor) url.searchParams.set("policy_cursor", state.cursor);
  else url.searchParams.delete("policy_cursor");
  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
}

function listErrorDescription(error: unknown): string {
  if (error instanceof ContextplaneApiError) {
    if (error.status === 403) {
      return "You do not have permission to view policies for the selected tenant.";
    }
    if (error.code === "tenant_required") {
      return "Choose a tenant from the application header, then retry.";
    }
    if (error.status === 429) {
      return "Too many policy requests were made. Wait a moment, then retry.";
    }
    if (error.status >= 500) {
      return "The policy service is temporarily unavailable. Your search and filters are preserved.";
    }
    return "Policies could not be loaded with the current search and filters. Adjust them or retry.";
  }
  return "Policies could not be loaded. Check the connection and retry; your search and filters are preserved.";
}

function activeFilterDescription(state: PolicyListState): string {
  return [
    state.query ? `Search “${state.query}”` : "",
    state.kind ? `Kind: ${formatArcLabel(state.kind)}` : "",
    state.scope ? `Scope: ${formatArcLabel(state.scope)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function PolicyListSkeleton() {
  return (
    <div aria-label="Loading policies" className="space-y-3 px-4 py-5" role="status">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function ArcPolicyIndex({
  client,
  onCreate,
  onSelect,
  requestContext,
  searchRef,
  selectedPolicyId,
  tenantKey,
}: ArcPolicyIndexProps) {
  const [state, setState] = useState(() => readPolicyListState(window.location.search));
  const [queryInput, setQueryInput] = useState(state.query);
  const filtersActive = Boolean(state.query || state.kind || state.scope);
  const clearAvailable = filtersActive || Boolean(queryInput);

  useEffect(() => {
    function restoreState() {
      const restored = readPolicyListState(window.location.search);
      setState(restored);
      setQueryInput(restored.query);
    }
    window.addEventListener("popstate", restoreState);
    return () => window.removeEventListener("popstate", restoreState);
  }, []);

  const policiesQuery = useQuery({
    queryFn: ({ signal }) =>
      listArcArtifactFamilies(
        client,
        {
          ...(state.cursor ? { cursor: state.cursor } : {}),
          ...(state.kind ? { kind: state.kind } : {}),
          ...(state.scope ? { owningScope: state.scope } : {}),
          pageSize,
          ...(state.query ? { query: state.query } : {}),
        },
        requestContext,
        signal,
      ),
    queryKey: ["arc", tenantKey, "artifact-families", state],
    retry: false,
  });

  function updateState(update: Partial<PolicyListState>, mode: "push" | "replace" = "replace") {
    const next = { ...state, ...update };
    setState(next);
    writePolicyListState(next, mode);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateState({ cursor: "", query: queryInput.trim() }, "push");
  }

  function clearFilters() {
    setQueryInput("");
    updateState({ cursor: "", kind: "", query: "", scope: "" }, "push");
  }

  const items = policiesQuery.data?.items ?? [];
  const filterDescription = activeFilterDescription(state);
  const showToolbar =
    policiesQuery.isPending ||
    policiesQuery.isError ||
    items.length > 0 ||
    filtersActive ||
    Boolean(state.cursor);

  return (
    <TableSection
      description="Select a policy record to bind evidence and author its next revision. Results include global policies and policies owned by the selected tenant."
      title="Choose a policy"
    >
      {showToolbar ? (
        <form onSubmit={search}>
          <DataToolbar
            actions={
              <>
                <Button
                  disabled={!clearAvailable}
                  onClick={clearFilters}
                  size="compact"
                  variant="ghost"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Clear filters
                </Button>
                <Button size="compact" type="submit" variant="secondary">
                  Search policies
                </Button>
              </>
            }
            filters={
              <>
                <SearchableSelect
                  className="min-w-36 flex-1"
                  emptyLabel="All kinds"
                  label="Policy kind"
                  onValueChange={(value) => {
                    if (value === "" || isArtifactKind(value))
                      updateState({ cursor: "", kind: value });
                  }}
                  options={arcArtifactKinds.map((kind) => ({
                    label: formatArcLabel(kind),
                    value: kind,
                  }))}
                  searchPlaceholder="Search kinds"
                  value={state.kind}
                />
                <SearchableSelect
                  className="min-w-36 flex-1"
                  emptyLabel="All scopes"
                  label="Owning scope"
                  onValueChange={(value) => {
                    if (value === "" || isOwningScope(value))
                      updateState({ cursor: "", scope: value });
                  }}
                  options={arcOwningScopes.map((scope) => ({
                    label: formatArcLabel(scope),
                    value: scope,
                  }))}
                  searchPlaceholder="Search scopes"
                  value={state.scope}
                />
              </>
            }
            resultSummary={
              <div className="space-y-1">
                <p>
                  {policiesQuery.isPending
                    ? "Loading policies"
                    : policiesQuery.isError
                      ? "Policies unavailable"
                      : `${items.length} ${items.length === 1 ? "policy" : "policies"} on this page · Newest first`}
                </p>
                {filterDescription ? (
                  <p className="text-foreground">Filtered by {filterDescription}</p>
                ) : null}
              </div>
            }
            search={
              <SearchField
                ref={searchRef}
                label="Search policies"
                maxLength={200}
                onChange={(event) => setQueryInput(event.currentTarget.value)}
                placeholder="Title or stable slug"
                value={queryInput}
              />
            }
          />
        </form>
      ) : null}

      {policiesQuery.isPending ? (
        <PolicyListSkeleton />
      ) : policiesQuery.isError ? (
        <div className="p-6">
          <RequestFailure
            onRetry={() => void policiesQuery.refetch()}
            requestId={
              policiesQuery.error instanceof ContextplaneApiError
                ? policiesQuery.error.requestId
                : null
            }
            title="Policies unavailable"
          >
            {listErrorDescription(policiesQuery.error)}
          </RequestFailure>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          action={
            filtersActive ? (
              <Button onClick={clearFilters} variant="secondary">
                Clear policy filters
              </Button>
            ) : onCreate ? (
              <Button onClick={onCreate}>
                <Plus aria-hidden="true" className="size-4" />
                Create first policy
              </Button>
            ) : undefined
          }
          description={
            filtersActive
              ? `No visible policy matches ${filterDescription}. Adjust the search or clear all filters to see the full collection.`
              : onCreate
                ? "Create the first policy record to begin a governed, source-backed authoring workflow."
                : "No global or tenant-owned policies are visible in this tenant yet."
          }
          icon={FileCheck2}
          title={filtersActive ? "No policies match" : "No policies yet"}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse sm:min-w-[44rem]">
              <caption className="sr-only">Visible governed policies</caption>
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>Policy</th>
                  <th className={tableHeaderClassName}>Kind</th>
                  <th className={`${tableHeaderClassName} hidden sm:table-cell`}>Scope</th>
                  <th className={`${tableHeaderClassName} hidden sm:table-cell`}>Lifecycle</th>
                  <th className={`${tableHeaderClassName} hidden sm:table-cell`}>Created</th>
                  {onSelect ? (
                    <th className={`${tableHeaderClassName} text-right`}>Action</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.map((policy) => {
                  const selected = selectedPolicyId === policy.artifact_id;
                  return (
                    <tr key={policy.artifact_id} className="hover:bg-surface-muted">
                      <td className={tableCellClassName}>
                        <p className="font-medium text-foreground">{policy.title}</p>
                        <p className="mt-1 font-mono text-xs text-muted">{policy.slug}</p>
                      </td>
                      <td className={tableCellClassName}>{formatArcLabel(policy.kind)}</td>
                      <td className={`${tableCellClassName} hidden sm:table-cell`}>
                        {formatArcLabel(policy.owning_scope)}
                      </td>
                      <td className={`${tableCellClassName} hidden sm:table-cell`}>
                        <StatusBadge tone={policy.active_revision_id ? "success" : "neutral"}>
                          {policy.active_revision_id ? "Active" : "Not active"}
                        </StatusBadge>
                      </td>
                      <td className={`${tableCellClassName} hidden sm:table-cell`}>
                        {formatArcDate(policy.created_at)}
                      </td>
                      {onSelect ? (
                        <td className={`${tableCellClassName} text-right`}>
                          <Button
                            disabled={selected}
                            onClick={() => onSelect(policy)}
                            size="compact"
                            variant={selected ? "ghost" : "secondary"}
                          >
                            {selected ? "Selected" : "Select policy"}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-4">
            <p className="text-xs text-muted">
              Results are ordered newest first. Changing a filter returns to the first page.
            </p>
            <div className="flex items-center gap-2">
              {state.cursor ? (
                <Button
                  onClick={() => updateState({ cursor: "" }, "push")}
                  size="compact"
                  variant="ghost"
                >
                  Back to first page
                </Button>
              ) : null}
              {policiesQuery.data?.next_cursor ? (
                <Button
                  onClick={() =>
                    updateState({ cursor: policiesQuery.data?.next_cursor ?? "" }, "push")
                  }
                  size="compact"
                  variant="secondary"
                >
                  Next page
                </Button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </TableSection>
  );
}
