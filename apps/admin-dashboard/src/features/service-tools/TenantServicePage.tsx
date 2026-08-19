import { ArrowUpRight, SearchX, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type RefObject } from "react";

import { BRAND } from "@repo/ui/brand";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  PageSkeleton,
  SummaryStrip,
  TableSection,
} from "@repo/ui/layouts";
import {
  Button,
  DetailsLink,
  Notice,
  RequestFailure,
  SearchField,
  StatusBadge,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  getWhoAmI,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { TenantOperationDialog } from "./TenantOperationDialog";
import {
  TENANT_OPERATIONS,
  TENANT_OPERATION_GROUPS,
  type TenantOperationDefinition,
  type TenantOperationGroup,
  type TenantOperationGroupId,
} from "./tenantOperations";

interface TenantServicePageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
}

function groupFromLocation(): TenantOperationGroupId {
  const value = new URLSearchParams(window.location.search).get("domain");
  return TENANT_OPERATION_GROUPS.some((group) => group.id === value)
    ? (value as TenantOperationGroupId)
    : "catalog";
}

function operationFromLocation(): TenantOperationDefinition | null {
  const id = new URLSearchParams(window.location.search).get("operation");
  return TENANT_OPERATIONS.find((operation) => operation.id === id) ?? null;
}

function updateLocation(updates: Readonly<Record<string, string | null>>, push = true) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  window.history[push ? "pushState" : "replaceState"](window.history.state, "", url);
}

function identityFailure(error: unknown): { description: string; requestId: string | null } {
  if (error instanceof ContextplaneApiError) {
    return {
      description:
        error.status === 403
          ? "The current credential cannot resolve an identity for this tenant."
          : "Tenant identity could not be verified. No service operation was requested.",
      requestId: error.requestId,
    };
  }
  return {
    description: "Tenant identity could not be verified. No service operation was requested.",
    requestId: null,
  };
}

function GroupTabs({
  activeGroup,
  onChange,
}: {
  activeGroup: TenantOperationGroupId;
  onChange: (group: TenantOperationGroupId) => void;
}) {
  return (
    <div
      aria-label="Tenant service domains"
      className="flex gap-0 overflow-x-auto border-b border-border"
      role="tablist"
    >
      {TENANT_OPERATION_GROUPS.map((group) => (
        <button
          key={group.id}
          id={`tenant-domain-${group.id}`}
          aria-controls="tenant-domain-panel"
          aria-selected={activeGroup === group.id}
          className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            activeGroup === group.id
              ? "border-accent font-semibold text-foreground"
              : "border-transparent font-normal text-muted hover:border-border hover:text-foreground"
          }`}
          onClick={() => onChange(group.id)}
          role="tab"
          type="button"
        >
          {group.title}
        </button>
      ))}
    </div>
  );
}

function OperationBadges({ operation }: { operation: TenantOperationDefinition }) {
  return (
    <span className="flex flex-wrap gap-2">
      {operation.method === "GET" ? <StatusBadge>Read only</StatusBadge> : null}
      {operation.confirmationRequired ? (
        <StatusBadge tone="warning">Confirmation required</StatusBadge>
      ) : null}
      {operation.availability === "guided-only" ? (
        <StatusBadge tone="info">Guided workflow</StatusBadge>
      ) : null}
    </span>
  );
}

function OperationAction({
  fullWidth = false,
  group,
  onOpen,
  operation,
}: {
  fullWidth?: boolean;
  group: TenantOperationGroup;
  onOpen: (operation: TenantOperationDefinition) => void;
  operation: TenantOperationDefinition;
}) {
  if (operation.availability === "guided-only") {
    return <DetailsLink href={group.guidedHref}>Open guided upload</DetailsLink>;
  }

  return (
    <Button
      className={fullWidth ? "w-full justify-center" : undefined}
      onClick={() => onOpen(operation)}
      size="compact"
      variant={operation.method === "DELETE" ? "danger" : "secondary"}
    >
      {operation.method === "GET" ? "Configure query" : "Review operation"}
      <ArrowUpRight aria-hidden="true" className="size-4" />
    </Button>
  );
}

function OperationTable({
  group,
  onOpen,
  operations,
}: {
  group: TenantOperationGroup;
  onOpen: (operation: TenantOperationDefinition) => void;
  operations: readonly TenantOperationDefinition[];
}) {
  return (
    <TableSection
      id="tenant-domain-panel"
      aria-labelledby={`tenant-domain-${group.id}`}
      action={<DetailsLink href={group.guidedHref}>Open guided workflow</DetailsLink>}
      description={group.description}
      role="tabpanel"
      title={group.title}
    >
      <div className="flex flex-wrap gap-2 px-6 pb-4">
        <StatusBadge tone="info">Tenant scoped</StatusBadge>
        <StatusBadge>{operations.length} service operations</StatusBadge>
      </div>
      <ul className="divide-y divide-border-subtle border-t border-border lg:hidden">
        {operations.map((operation) => (
          <li key={operation.id} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="font-medium text-foreground">{operation.title}</span>
              <span className="shrink-0 rounded bg-surface-muted px-2 py-1 font-mono text-xs font-semibold text-accent">
                {operation.method}
              </span>
            </div>
            <span className="mt-2 block break-all font-mono text-xs leading-5 text-muted">
              {operation.path}
            </span>
            <span className="mt-3 block text-xs leading-5 text-muted">
              {operation.requestSchema
                ? `Request contract: ${operation.requestSchema}`
                : operation.method === "GET"
                  ? "Read-only query"
                  : "No request body"}
            </span>
            <span className="mt-3 block">
              <OperationBadges operation={operation} />
            </span>
            <span className="mt-4 block">
              <OperationAction fullWidth group={group} onOpen={onOpen} operation={operation} />
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <caption className="sr-only">{group.title} tenant service operations</caption>
          <thead>
            <tr className="border-y border-border bg-surface-muted text-xs text-muted">
              <th className="px-6 py-3 font-medium" scope="col">
                Task and service path
              </th>
              <th className="px-4 py-3 font-medium" scope="col">
                Method
              </th>
              <th className="px-4 py-3 font-medium" scope="col">
                Request contract
              </th>
              <th className="px-6 py-3 text-right font-medium" scope="col">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {operations.map((operation) => (
              <tr key={operation.id} className="align-top hover:bg-surface-muted">
                <th className="px-6 py-4 font-normal" scope="row">
                  <span className="block font-medium text-foreground">{operation.title}</span>
                  <span className="mt-1 block break-all font-mono text-xs leading-5 text-muted">
                    {operation.path}
                  </span>
                  <span className="mt-2 block">
                    <OperationBadges operation={operation} />
                  </span>
                </th>
                <td className="px-4 py-4">
                  <span className="rounded bg-surface-muted px-2 py-1 font-mono text-xs font-semibold text-accent">
                    {operation.method}
                  </span>
                </td>
                <td className="px-4 py-4 text-xs leading-5 text-muted">
                  {operation.requestSchema
                    ? operation.requestSchema
                    : operation.method === "GET"
                      ? "Read-only query"
                      : "No request body"}
                </td>
                <td className="px-6 py-4 text-right">
                  <OperationAction group={group} onOpen={onOpen} operation={operation} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableSection>
  );
}

export function TenantServicePage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
}: TenantServicePageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const [activeGroup, setActiveGroup] = useState<TenantOperationGroupId>(groupFromLocation);
  const [selectedOperation, setSelectedOperation] = useState<TenantOperationDefinition | null>(
    operationFromLocation,
  );
  const [search, setSearch] = useState("");
  const identity = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, requestContext, signal),
    queryKey: ["contextplane", apiTenantId ?? "credential-default", "identity"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const onPopState = () => {
      setActiveGroup(groupFromLocation());
      setSelectedOperation(operationFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const activeGroupDefinition =
    TENANT_OPERATION_GROUPS.find((group) => group.id === activeGroup) ?? TENANT_OPERATION_GROUPS[0];
  const filteredOperations = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return TENANT_OPERATIONS.filter(
      (operation) =>
        operation.group === activeGroup &&
        (!normalized ||
          operation.title.toLocaleLowerCase().includes(normalized) ||
          operation.path.toLocaleLowerCase().includes(normalized) ||
          operation.method.toLocaleLowerCase().includes(normalized) ||
          operation.requestSchema?.toLocaleLowerCase().includes(normalized)),
    );
  }, [activeGroup, search]);

  function changeGroup(group: TenantOperationGroupId) {
    setActiveGroup(group);
    setSearch("");
    updateLocation({ domain: group, operation: null });
  }

  function openOperation(operation: TenantOperationDefinition) {
    setSelectedOperation(operation);
    updateLocation({ domain: operation.group, operation: operation.id });
  }

  function closeOperation() {
    setSelectedOperation(null);
    updateLocation({ operation: null }, false);
  }

  if (identity.isPending) return <PageSkeleton controls={4} />;

  if (identity.isError) {
    const failure = identityFailure(identity.error);
    return (
      <PageContainer>
        <PageHeader
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Service tools" }]}
          description={`Use the complete tenant-facing ${BRAND.name} service surface.`}
          eyebrow="Advanced tenant access"
          title="Service Tools"
        />
        <RequestFailure
          onRetry={() => void identity.refetch()}
          requestId={failure.requestId}
          title="Tenant identity unavailable"
        >
          {failure.description}
        </RequestFailure>
      </PageContainer>
    );
  }

  const writeCount = TENANT_OPERATIONS.filter((operation) => operation.method !== "GET").length;
  const readCount = TENANT_OPERATIONS.length - writeCount;

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { href: "/", label: identity.data.tenant_display_name },
          { label: "Service tools" },
        ]}
        description="A contract-complete tenant operation inventory grouped by the job it supports. Use guided workspaces for routine tasks; use these advanced controls when an exact service operation is required."
        eyebrow="Advanced tenant access"
        metadata={
          <>
            <StatusBadge tone="success">Identity verified</StatusBadge>
            <StatusBadge>{identity.data.tenant_display_name}</StatusBadge>
          </>
        }
        title="Service Tools"
      />

      <SummaryStrip
        items={[
          {
            detail: "Committed non-administrative /v1 surface",
            id: "contract",
            label: "Tenant operations",
            value: TENANT_OPERATIONS.length,
          },
          {
            detail: "Queries that do not change service state",
            id: "reads",
            label: "Read operations",
            value: readCount,
          },
          {
            detail: "Operations requiring explicit review",
            id: "writes",
            label: "Write operations",
            value: writeCount,
          },
          {
            detail: "Task-oriented operation groups",
            id: "domains",
            label: "Tenant domains",
            value: TENANT_OPERATION_GROUPS.length,
          },
        ]}
        label="Tenant API coverage"
      />

      <Notice title="Start with the guided workspace" variant="info">
        Routine catalog, relationship, memory, workspace, context, and ARC work belongs in the
        guided destinations linked from each domain. These controls provide exact contract access
        without pretending raw JSON is the preferred product experience.
      </Notice>

      <div className="space-y-4">
        <GroupTabs activeGroup={activeGroup} onChange={changeGroup} />
        <SearchField
          ref={searchRef}
          label={`Search ${activeGroupDefinition.title}`}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by task, method, contract, or service path"
          value={search}
        />
      </div>

      {filteredOperations.length > 0 ? (
        <OperationTable
          group={activeGroupDefinition}
          onOpen={openOperation}
          operations={filteredOperations}
        />
      ) : (
        <EmptyState
          action={
            <Button onClick={() => setSearch("")} variant="secondary">
              Clear search
            </Button>
          }
          description="Try a task name, request contract, HTTP method, or part of the service path."
          icon={SearchX}
          title="No tenant operation matches"
        />
      )}

      <footer className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
        <p>
          <span className="font-medium text-foreground">Authority remains server-side.</span> This
          interface supplies safe inputs, idempotency keys, cancellation, confirmation, and durable
          responses; the service enforces tenant scope, permissions, visibility, and transition
          rules.
        </p>
      </footer>

      {selectedOperation ? (
        <TenantOperationDialog
          {...(apiTenantId ? { apiTenantId } : {})}
          client={client}
          onClose={closeOperation}
          operation={selectedOperation}
        />
      ) : null}
    </PageContainer>
  );
}
