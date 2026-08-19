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
import { AdminOperationDialog } from "./AdminOperationDialog";
import {
  ADMIN_OPERATIONS,
  ADMIN_OPERATION_GROUPS,
  type AdminOperationDefinition,
  type AdminOperationGroup,
  type AdminOperationGroupId,
} from "./adminOperations";

interface AdminPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
}

const guidedHrefs: Partial<Record<AdminOperationGroupId, string>> = {
  "arc-trust": "/arc",
  audit: "/audit",
  "graph-schema": "/settings?tab=schema",
  integrations: "/settings?tab=integrations",
  lifecycle: "/settings?tab=lifecycle",
  memory: "/settings?tab=memory",
  privacy: "/settings?tab=privacy",
  usage: "/analytics",
};

function groupFromLocation(): AdminOperationGroupId {
  const value = new URLSearchParams(window.location.search).get("domain");
  return ADMIN_OPERATION_GROUPS.some((group) => group.id === value)
    ? (value as AdminOperationGroupId)
    : "operations";
}

function operationFromLocation(): AdminOperationDefinition | null {
  const id = new URLSearchParams(window.location.search).get("operation");
  return ADMIN_OPERATIONS.find((operation) => operation.id === id) ?? null;
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
          ? "The current credential cannot resolve administrative identity for this tenant."
          : "Administrative identity could not be verified. No service operation was requested.",
      requestId: error.requestId,
    };
  }
  return {
    description:
      "Administrative identity could not be verified. No service operation was requested.",
    requestId: null,
  };
}

function GroupTabs({
  activeGroup,
  onChange,
}: {
  activeGroup: AdminOperationGroupId;
  onChange: (group: AdminOperationGroupId) => void;
}) {
  return (
    <div
      aria-label="Administrative domains"
      className="flex gap-0 overflow-x-auto border-b border-border"
      role="tablist"
    >
      {ADMIN_OPERATION_GROUPS.map((group) => (
        <button
          key={group.id}
          id={`admin-domain-${group.id}`}
          aria-controls="admin-domain-panel"
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

function OperationBadges({ operation }: { operation: AdminOperationDefinition }) {
  const unavailable = operation.availability === "service-pending";
  if (!operation.destructive && !unavailable) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {operation.destructive ? (
        <StatusBadge tone="danger">Confirmation required</StatusBadge>
      ) : null}
      {unavailable ? <StatusBadge tone="warning">API implementation pending</StatusBadge> : null}
    </span>
  );
}

function OperationButton({
  fullWidth = false,
  onOpen,
  operation,
}: {
  fullWidth?: boolean;
  onOpen: (operation: AdminOperationDefinition) => void;
  operation: AdminOperationDefinition;
}) {
  const unavailable = operation.availability === "service-pending";
  return (
    <Button
      className={fullWidth ? "w-full justify-center" : undefined}
      disabled={unavailable}
      onClick={() => onOpen(operation)}
      size="compact"
      variant={operation.destructive ? "danger" : "secondary"}
    >
      {unavailable
        ? "Unavailable in service"
        : operation.method === "GET"
          ? "Configure query"
          : "Review operation"}
      {!unavailable ? <ArrowUpRight aria-hidden="true" className="size-4" /> : null}
    </Button>
  );
}

function OperationTable({
  group,
  onOpen,
  operations,
}: {
  group: AdminOperationGroup;
  onOpen: (operation: AdminOperationDefinition) => void;
  operations: readonly AdminOperationDefinition[];
}) {
  const guidedHref = guidedHrefs[group.id];
  return (
    <TableSection
      id="admin-domain-panel"
      aria-labelledby={`admin-domain-${group.id}`}
      action={
        guidedHref ? <DetailsLink href={guidedHref}>Open guided workspace</DetailsLink> : undefined
      }
      description={group.description}
      role="tabpanel"
      title={group.title}
    >
      <div className="flex flex-wrap gap-2 px-6 pb-4">
        <StatusBadge tone={group.scope === "Deployment operator" ? "warning" : "info"}>
          {group.scope}
        </StatusBadge>
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
            {operation.destructive || operation.availability === "service-pending" ? (
              <span className="mt-3 block">
                <OperationBadges operation={operation} />
              </span>
            ) : null}
            <span className="mt-4 block">
              <OperationButton fullWidth onOpen={onOpen} operation={operation} />
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[800px] border-collapse text-left text-sm">
          <caption className="sr-only">{group.title} service operations</caption>
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
                  {operation.destructive || operation.availability === "service-pending" ? (
                    <span className="mt-2 block">
                      <OperationBadges operation={operation} />
                    </span>
                  ) : null}
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
                  <OperationButton onOpen={onOpen} operation={operation} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableSection>
  );
}

export function AdminPage({ activeTenantName, apiTenantId, client, searchRef }: AdminPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const [activeGroup, setActiveGroup] = useState<AdminOperationGroupId>(groupFromLocation);
  const [selectedOperation, setSelectedOperation] = useState<AdminOperationDefinition | null>(
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
    ADMIN_OPERATION_GROUPS.find((group) => group.id === activeGroup) ?? ADMIN_OPERATION_GROUPS[0];
  const filteredOperations = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return ADMIN_OPERATIONS.filter(
      (operation) =>
        operation.group === activeGroup &&
        (!normalized ||
          operation.title.toLocaleLowerCase().includes(normalized) ||
          operation.path.toLocaleLowerCase().includes(normalized) ||
          operation.method.toLocaleLowerCase().includes(normalized)),
    );
  }, [activeGroup, search]);

  function changeGroup(group: AdminOperationGroupId) {
    setActiveGroup(group);
    setSearch("");
    updateLocation({ domain: group, operation: null });
  }

  function openOperation(operation: AdminOperationDefinition) {
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
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Administration" }]}
          description={`Operate the complete administrative surface for ${BRAND.name}.`}
          eyebrow="Governed administration"
          title="Administration"
        />
        <RequestFailure
          onRetry={() => void identity.refetch()}
          requestId={failure.requestId}
          title="Administrator identity unavailable"
        >
          {failure.description}
        </RequestFailure>
      </PageContainer>
    );
  }

  const isAdministrator = identity.data.roles.includes("admin");
  const availableCount = ADMIN_OPERATIONS.filter(
    (operation) => operation.availability !== "service-pending",
  ).length;

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { href: "/", label: identity.data.tenant_display_name },
          { label: "Administration" },
        ]}
        description="A contract-complete inventory of tenant and deployment-operator controls, grouped by the job they perform. Prefer guided workspaces for routine changes; use these controls for complete service access."
        eyebrow="Governed administration"
        metadata={
          <>
            <StatusBadge tone={isAdministrator ? "success" : "warning"}>
              {isAdministrator ? "Administrator access" : "Administrator access required"}
            </StatusBadge>
            <StatusBadge>{identity.data.tenant_display_name}</StatusBadge>
          </>
        }
        title="Administration"
      />

      {isAdministrator ? (
        <>
          <SummaryStrip
            items={[
              {
                detail: "Committed OpenAPI surface",
                id: "contract",
                label: "Administrative operations",
                value: ADMIN_OPERATIONS.length,
              },
              {
                detail: "Active tenant authority",
                id: "tenant",
                label: "Tenant operations",
                value: ADMIN_OPERATIONS.filter((operation) => operation.scope === "tenant").length,
              },
              {
                detail: "Deployment-wide authority",
                id: "operator",
                label: "Operator operations",
                value: ADMIN_OPERATIONS.filter((operation) => operation.scope === "operator")
                  .length,
              },
              {
                detail: "3 schema endpoints await service implementation",
                id: "available",
                label: "Runnable now",
                value: availableCount,
              },
            ]}
            label="Administrative API coverage"
          />

          <Notice title="Contract-complete, task-oriented administration" variant="info">
            Every committed <span className="font-mono">/v1/admin</span> and{" "}
            <span className="font-mono">/v1/arc/admin</span> operation is represented. Destructive
            actions require explicit confirmation, creates use fresh idempotency keys where
            supported, and arbitrary service error text is never displayed.
          </Notice>

          <div className="space-y-4">
            <GroupTabs activeGroup={activeGroup} onChange={changeGroup} />
            <SearchField
              ref={searchRef}
              label={`Search ${activeGroupDefinition.title}`}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by task, method, or service path"
              value={search}
            />
          </div>

          {activeGroup === "arc-trust" ? (
            <Notice title="Operator boundary" variant="warning">
              These controls can affect trust across tenants. The backend independently verifies
              deployment-operator identity for every operation.
            </Notice>
          ) : null}

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
              description="Try a task name, HTTP method, or part of the service path."
              icon={SearchX}
              title="No administrative operation matches"
            />
          )}

          <footer className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
            <p>
              <span className="font-medium text-foreground">Authority remains server-side.</span>{" "}
              This interface shapes safe workflows; the service enforces tenant scope, permissions,
              validation, and operator identity.
            </p>
          </footer>
        </>
      ) : (
        <Notice title="Administrator access is required" variant="warning">
          The resolved {BRAND.name} role does not permit tenant administration. No administrative
          operation was requested.
        </Notice>
      )}

      {selectedOperation ? (
        <AdminOperationDialog
          {...(apiTenantId ? { apiTenantId } : {})}
          client={client}
          onClose={closeOperation}
          operation={selectedOperation}
        />
      ) : null}
    </PageContainer>
  );
}
