import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Boxes,
  FilePlus2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState, type FormEvent, type RefObject } from "react";

import { BRAND } from "@repo/ui/brand";
import {
  DataToolbar,
  EmptyState,
  PageContainer,
  PageSkeleton,
  SectionSurface,
  SummaryStrip,
  TableSection,
  type SummaryItem,
} from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";
import {
  Button,
  DetailsLink,
  Notice,
  RequestFailure,
  SearchField,
  SearchableSelect,
  Skeleton,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  createWorkspace,
  createWorkspaceEntry,
  deleteWorkspaceEntry,
  getWhoAmI,
  getWorkspace,
  listWorkspaceEntries,
  listWorkspaces,
  updateWorkspace,
  updateWorkspaceEntry,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type WhoAmI,
  type Workspace,
  type WorkspaceEntry,
  type WorkspaceEntryKind,
  type WorkspaceOwnerKind,
  type WorkspaceWarning,
} from "../../shared/api";
import {
  availableWorkspaceOwnerKinds,
  entryExpiryReached,
  filterWorkspaces,
  formatWorkspaceTimestamp,
  isWorkspaceEntryKind,
  localExpiryToIso,
  mayArchiveWorkspace,
  mayWriteWorkspace,
  parseReferenceIds,
  referenceIdsInput,
  shortWorkspaceIdentifier,
  workspaceEntryKindLabel,
  workspaceEntryKindOptions,
  workspaceListIdentifier,
  workspaceOwnerKindLabel,
  workspaceOwnerKindOptions,
  workspaceVisibilityDescription,
} from "./workspaceModel";

interface WorkspacesPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
  selectedWorkspaceId: string | null;
}

interface WorkspaceListUrlState {
  cursor: string;
  includeArchived: boolean;
  query: string;
}

interface EntryListUrlState {
  cursor: string;
  kind: WorkspaceEntryKind | "";
}

interface MutationReceipt {
  body: string;
  title: string;
  variant: "success" | "warning";
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
const invalidInputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-danger bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:outline-2 focus:outline-offset-2 focus:outline-danger";
const controlLinkClassName =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:border-accent hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
    shortWorkspaceIdentifier(identity.actor_id)
  );
}

function readWorkspaceListUrlState(): WorkspaceListUrlState {
  const parameters = new URLSearchParams(window.location.search);
  return {
    cursor: parameters.get("cursor") ?? "",
    includeArchived: parameters.get("archived") === "include",
    query: parameters.get("q") ?? "",
  };
}

function writeWorkspaceListUrlState(
  state: WorkspaceListUrlState,
  mode: "push" | "replace" = "replace",
) {
  const url = new URL(window.location.href);
  if (state.query) url.searchParams.set("q", state.query);
  else url.searchParams.delete("q");
  if (state.includeArchived) url.searchParams.set("archived", "include");
  else url.searchParams.delete("archived");
  if (state.cursor) url.searchParams.set("cursor", state.cursor);
  else url.searchParams.delete("cursor");
  url.searchParams.delete("kind");
  url.searchParams.delete("entry_cursor");
  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
}

function readEntryListUrlState(): EntryListUrlState {
  const parameters = new URLSearchParams(window.location.search);
  const kind = parameters.get("kind");
  return {
    cursor: parameters.get("entry_cursor") ?? "",
    kind: isWorkspaceEntryKind(kind) ? kind : "",
  };
}

function writeEntryListUrlState(state: EntryListUrlState, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  if (state.kind) url.searchParams.set("kind", state.kind);
  else url.searchParams.delete("kind");
  if (state.cursor) url.searchParams.set("entry_cursor", state.cursor);
  else url.searchParams.delete("entry_cursor");
  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
}

function workspaceListHref(): string {
  const url = new URL("/notebooks", window.location.origin);
  const current = new URLSearchParams(window.location.search);
  for (const key of ["q", "archived", "cursor"]) {
    const value = current.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
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
        body: "The workspace is absent or not visible to this actor. The service intentionally returns the same response for both cases.",
        title: "Workspace not found",
        variant: "warning" as const,
      };
    }
    if (error.status === 403) {
      return {
        body: "The service did not authorize this workspace operation for the resolved actor and tenant.",
        title: "Workspace access is restricted",
        variant: "warning" as const,
      };
    }
  }
  return {
    body: "Workspace material could not be loaded. Existing page context is preserved; retry when the service is available.",
    title: "Workspaces could not be loaded",
    variant: "danger" as const,
  };
}

function mutationErrorPresentation(error: unknown, action: "archive" | "create" | "entry") {
  if (error instanceof ContextplaneApiError) {
    if (error.code === "pii_detected") {
      const first = error.errors[0];
      const categories = Array.isArray(first?.categories)
        ? first.categories.filter((category): category is string => typeof category === "string")
        : [];
      return {
        body: `The service refused the write because prohibited personal data was detected${categories.length > 0 ? ` (${categories.join(", ")})` : ""}. The draft is preserved for correction.`,
        title: "Workspace material contains blocked personal data",
      };
    }
    if (error.status === 403) {
      return {
        body:
          action === "create"
            ? "A producer may create a personal workspace and an administrator may create a tenant workspace. The server rechecked the resolved roles."
            : "The workspace remains readable, but the server refused this write for the resolved role, owner, or archive state.",
        title: "Workspace write not permitted",
      };
    }
    if (error.status === 422) {
      return {
        body:
          action === "create"
            ? "The service rejected this workspace. Regulated tenants require a supported content-encryption tier, and the name and ownership model must satisfy the service contract."
            : "The service rejected this workspace material. The draft is preserved so the invalid fields can be corrected.",
        title: action === "archive" ? "Workspace lifecycle could not be changed" : "Write rejected",
      };
    }
  }
  return {
    body: "The write was not recorded. Entered content remains on this page; retry when the service is available.",
    title: "Workspace write could not be recorded",
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

function WorkspacesHeader({ action, identity }: { action?: React.ReactNode; identity: WhoAmI }) {
  return (
    <PageHeader
      actions={action}
      breadcrumbs={[{ href: "/", label: identity.tenant_display_name }, { label: "Notebooks" }]}
      description="Collect mutable notes, decisions, questions, and saved retrieval context without presenting working material as canonical catalog state."
      metadata={
        <>
          <StatusBadge tone="info">Workspace material</StatusBadge>
          <StatusBadge>{identityName(identity)}</StatusBadge>
          <StatusBadge>{identity.tenant_display_name}</StatusBadge>
        </>
      }
      title="Notebooks"
    />
  );
}

function CreateWorkspaceForm({
  apiTenantId,
  client,
  identity,
  onCancel,
  onCreated,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  identity: WhoAmI;
  onCancel: () => void;
  onCreated: (workspace: Workspace) => void;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const ownerKinds = availableWorkspaceOwnerKinds(identity);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerKind, setOwnerKind] = useState<WorkspaceOwnerKind>(ownerKinds[0] ?? "actor");
  const [validationMessage, setValidationMessage] = useState("");
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const mutation = useMutation({
    mutationFn: () =>
      createWorkspace(
        client,
        {
          description: description.trim() || null,
          name: name.trim(),
          ownerKind,
        },
        context,
      ),
    onSuccess: onCreated,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setValidationMessage("Enter a workspace name.");
      return;
    }
    setValidationMessage("");
    mutation.mutate();
  }

  const mutationPresentation = mutation.isError
    ? mutationErrorPresentation(mutation.error, "create")
    : null;

  return (
    <SectionSurface
      description="Ownership is immutable. Personal workspaces are written by their owning producer; tenant workspaces are written by administrators."
      title="Create workspace"
    >
      <form className="max-w-2xl space-y-4" onSubmit={submit}>
        {mutationPresentation ? (
          <Notice title={mutationPresentation.title} variant="danger">
            {mutationPresentation.body}
          </Notice>
        ) : null}
        <label className="block text-xs font-medium text-muted" htmlFor={nameId}>
          Workspace name
          <input
            aria-describedby={validationMessage ? `${nameId}-error` : undefined}
            aria-invalid={validationMessage ? "true" : undefined}
            className={validationMessage ? invalidInputClassName : inputClassName}
            id={nameId}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Quarterly identity migration"
            value={name}
          />
        </label>
        {validationMessage ? (
          <p className="text-xs text-danger" id={`${nameId}-error`} role="alert">
            {validationMessage}
          </p>
        ) : null}
        <SearchableSelect
          allowEmpty={false}
          label="Ownership and visibility"
          onValueChange={(value) => {
            if (value === "actor" || value === "tenant") setOwnerKind(value);
          }}
          options={workspaceOwnerKindOptions.filter((option) => ownerKinds.includes(option.value))}
          searchPlaceholder="Search ownership models"
          value={ownerKind}
        />
        <p className="text-xs leading-5 text-muted">
          {ownerKind === "actor"
            ? "Visible to you and tenant auditors. Only you, while resolved as a producer, may write."
            : "Visible to role holders in this tenant. Only administrators may write."}
        </p>
        <label className="block text-xs font-medium text-muted" htmlFor={descriptionId}>
          Description <span className="font-normal text-subtle">(optional)</span>
          <textarea
            className={`${inputClassName} min-h-24 resize-y`}
            id={descriptionId}
            onChange={(event) => setDescription(event.currentTarget.value)}
            placeholder="State the task, boundary, and expected continuity for this workspace."
            value={description}
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button disabled={mutation.isPending} type="submit">
            <Plus aria-hidden="true" className="size-4" />
            {mutation.isPending ? "Creating workspace…" : "Create workspace"}
          </Button>
          <Button disabled={mutation.isPending} onClick={onCancel} variant="ghost">
            Cancel
          </Button>
        </div>
      </form>
    </SectionSurface>
  );
}

function WorkspaceRows({ workspaces }: { workspaces: readonly Workspace[] }) {
  return (
    <div aria-label="Scrollable workspaces" className="overflow-x-auto" role="region" tabIndex={0}>
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <caption className="sr-only">Workspaces visible to the resolved actor</caption>
        <thead>
          <tr className="border-y border-border bg-surface-muted text-xs text-muted">
            <th className="w-56 px-6 py-3 font-medium" scope="col">
              Workspace
            </th>
            <th className="w-40 px-4 py-3 font-medium" scope="col">
              Visibility
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Purpose
            </th>
            <th className="w-40 px-4 py-3 font-medium" scope="col">
              Last edited
            </th>
            <th className="w-28 px-4 py-3 font-medium" scope="col">
              Lifecycle
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
          {workspaces.map((workspace) => {
            const href = `/notebooks/${encodeURIComponent(workspace.workspace_id)}${window.location.search}`;
            return (
              <tr key={workspace.workspace_id} className="group hover:bg-surface-muted">
                <th className="px-6 py-4 align-top font-medium" scope="row">
                  <a className="text-sm text-accent hover:underline" href={href}>
                    {workspace.name}
                  </a>
                  <span
                    className="mt-1 block font-mono text-xs font-normal text-muted"
                    title={workspace.workspace_id}
                  >
                    ID {workspaceListIdentifier(workspace.workspace_id)}
                  </span>
                </th>
                <td className="px-4 py-4 align-top">
                  <span className="text-xs font-medium text-foreground">
                    {workspaceOwnerKindLabel(workspace.owner_kind)}
                  </span>
                  {workspace.owner_actor_id ? (
                    <span
                      className="mt-1 block max-w-36 truncate font-mono text-xs text-muted"
                      title={workspace.owner_actor_id}
                    >
                      {shortWorkspaceIdentifier(workspace.owner_actor_id)}
                    </span>
                  ) : null}
                </td>
                <td className="max-w-96 px-4 py-4 align-top text-xs leading-5 text-muted">
                  {workspace.description?.trim() || "No purpose description was provided."}
                </td>
                <td className="whitespace-nowrap px-4 py-4 align-top text-xs text-muted tabular-nums">
                  <time dateTime={workspace.updated_at}>
                    {formatWorkspaceTimestamp(workspace.updated_at)}
                  </time>
                </td>
                <td className="px-4 py-4 align-top">
                  <StatusBadge tone={workspace.archived_at ? "neutral" : "success"}>
                    {workspace.archived_at ? "Archived" : "Active"}
                  </StatusBadge>
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

function WorkspacesListPage({
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
  const { showToast } = useToast();
  const [urlState, setUrlState] = useState(readWorkspaceListUrlState);
  const [showCreate, setShowCreate] = useState(false);
  const [createdWorkspace, setCreatedWorkspace] = useState<Workspace | null>(null);
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const tenantKey = queryTenantKey(apiTenantId);
  const ownerKinds = availableWorkspaceOwnerKinds(identity);

  useEffect(() => {
    function restoreUrlState() {
      setUrlState(readWorkspaceListUrlState());
    }
    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, []);

  const workspacesQuery = useQuery({
    queryFn: ({ signal }) =>
      listWorkspaces(
        client,
        {
          ...(urlState.cursor ? { cursor: urlState.cursor } : {}),
          includeArchived: urlState.includeArchived,
        },
        context,
        signal,
      ),
    queryKey: ["contextplane", tenantKey, "workspaces", urlState.includeArchived, urlState.cursor],
  });

  function updateUrlState(nextState: WorkspaceListUrlState, mode: "push" | "replace" = "replace") {
    writeWorkspaceListUrlState(nextState, mode);
    setUrlState(nextState);
  }

  const returned = workspacesQuery.data?.items ?? [];
  const filtered = filterWorkspaces(returned, urlState.query);
  const invalidCursor =
    workspacesQuery.error instanceof ContextplaneApiError &&
    workspacesQuery.error.code === "invalid_cursor";

  return (
    <PageContainer>
      <WorkspacesHeader
        action={
          ownerKinds.length > 0 ? (
            <Button onClick={() => setShowCreate((current) => !current)}>
              <Plus aria-hidden="true" className="size-4" />
              {showCreate ? "Close create form" : "Create workspace"}
            </Button>
          ) : undefined
        }
        identity={identity}
      />
      <div className="space-y-6">
        <Notice title="Workspace material is mutable working context">
          Notes, decisions, questions, and saved retrievals do not update the canonical context
          graph. Entries have no revision history; append a checkpoint instead of rewriting history
          when continuity matters.
        </Notice>

        {createdWorkspace ? (
          <Notice
            action={
              <DetailsLink
                href={`/notebooks/${encodeURIComponent(createdWorkspace.workspace_id)}`}
              >
                Open workspace
              </DetailsLink>
            }
            title="Open the new workspace"
          >
            <span className="text-foreground">{createdWorkspace.name}</span> was created as a{" "}
            {workspaceOwnerKindLabel(createdWorkspace.owner_kind).toLocaleLowerCase()} for{" "}
            {identityName(identity)} at {formatWorkspaceTimestamp(createdWorkspace.created_at)}.
          </Notice>
        ) : null}

        {showCreate ? (
          <CreateWorkspaceForm
            {...(apiTenantId ? { apiTenantId } : {})}
            client={client}
            identity={identity}
            onCancel={() => setShowCreate(false)}
            onCreated={(workspace) => {
              setCreatedWorkspace(workspace);
              setShowCreate(false);
              showToast({
                message: `${workspace.name} is ready to use.`,
                title: "Workspace created",
                variant: "success",
              });
              void queryClient.invalidateQueries({
                queryKey: ["contextplane", tenantKey, "workspaces"],
              });
            }}
          />
        ) : null}

        <TableSection
          action={
            <Button
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["contextplane", tenantKey, "workspaces"],
                })
              }
              size="compact"
              variant="ghost"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
          }
          description="Personal workspaces owned by the resolved actor, tenant workspaces visible to this tenant, and actor workspaces visible through the auditor carve-out."
          filters={
            <DataToolbar
              actions={
                <Button
                  className={urlState.query ? "text-warning hover:bg-warning-subtle" : undefined}
                  disabled={!urlState.query}
                  onClick={() => updateUrlState({ ...urlState, query: "" })}
                  size="compact"
                  title={urlState.query ? "Clear workspace search" : "No workspace search to clear"}
                  variant="ghost"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Clear search
                </Button>
              }
              filters={
                <SearchableSelect
                  allowEmpty={false}
                  className="w-full sm:w-64"
                  label="Archive visibility"
                  onValueChange={(value) =>
                    updateUrlState({
                      ...urlState,
                      cursor: "",
                      includeArchived: value === "include",
                    })
                  }
                  options={[
                    { label: "Active workspaces only", value: "active" },
                    { label: "Include archived workspaces", value: "include" },
                  ]}
                  searchPlaceholder="Search lifecycle filters"
                  value={urlState.includeArchived ? "include" : "active"}
                />
              }
              resultSummary={`${filtered.length} of ${returned.length} returned workspaces · Current tenant boundary`}
              search={
                <SearchField
                  ref={searchRef}
                  label="Search returned page"
                  onChange={(event) =>
                    updateUrlState({ ...urlState, query: event.currentTarget.value })
                  }
                  placeholder="Name, purpose, or ID"
                  value={urlState.query}
                />
              }
            />
          }
          filtersId="workspace-filters"
          footer={
            !workspacesQuery.isError && returned.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted">
                  Search applies only to this returned service page. Cursors remain opaque and are
                  sent back unchanged.
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
                    disabled={!workspacesQuery.data?.next_cursor}
                    onClick={() => {
                      const cursor = workspacesQuery.data?.next_cursor;
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
          title="Visible workspaces"
        >
          {workspacesQuery.isLoading ? (
            <div className="space-y-3 px-6 py-5">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : workspacesQuery.isError ? (
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
                  title="This workspace page cursor is invalid"
                  variant="warning"
                >
                  The service refused the cursor. It is not decoded or repaired in the browser;
                  return to the first page for a fresh cursor.
                </Notice>
              ) : (
                <QueryFailure
                  error={workspacesQuery.error}
                  onRetry={() => void workspacesQuery.refetch()}
                />
              )}
            </div>
          ) : filtered.length > 0 ? (
            <WorkspaceRows workspaces={filtered} />
          ) : returned.length > 0 ? (
            <EmptyState
              description="Clear the local search to restore every workspace on this service page."
              title="No returned workspace matches this search"
            />
          ) : (
            <EmptyState
              description="The service returned no workspace containers in this visibility scope. This does not reveal workspaces owned by actors outside the service's perceivability rules."
              icon={Boxes}
              title={urlState.includeArchived ? "No visible workspaces" : "No active workspaces"}
            />
          )}
        </TableSection>
      </div>
    </PageContainer>
  );
}

function warningSummary(warnings: readonly WorkspaceWarning[]): string {
  const categories = [...new Set(warnings.flatMap((warning) => warning.categories))];
  return categories.length > 0
    ? `The service stored the entry and reported: ${categories.join(", ")}.`
    : "The service stored the entry with a personal-data warning.";
}

function AddEntryForm({
  apiTenantId,
  client,
  onCancel,
  onCreated,
  workspaceId,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  onCancel: () => void;
  onCreated: (entry: WorkspaceEntry) => void;
  workspaceId: string;
}) {
  const bodyId = useId();
  const referencesId = useId();
  const expiresId = useId();
  const [kind, setKind] = useState<WorkspaceEntryKind>("note");
  const [body, setBody] = useState("");
  const [references, setReferences] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [bodyError, setBodyError] = useState("");
  const [referencesError, setReferencesError] = useState("");
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const mutation = useMutation({
    mutationFn: () => {
      const parsedReferences = parseReferenceIds(references);
      return createWorkspaceEntry(
        client,
        workspaceId,
        {
          bodyMarkdown: body.trim(),
          expiresAt: localExpiryToIso(expiresAt),
          kind,
          referenceIds: parsedReferences.values,
        },
        context,
      );
    },
    onSuccess: onCreated,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedReferences = parseReferenceIds(references);
    const nextBodyError = body.trim() ? "" : "Enter workspace material.";
    setBodyError(nextBodyError);
    setReferencesError(parsedReferences.error ?? "");
    if (nextBodyError || parsedReferences.error) return;
    mutation.mutate();
  }

  const mutationPresentation = mutation.isError
    ? mutationErrorPresentation(mutation.error, "entry")
    : null;

  return (
    <form
      className="space-y-4 border-y border-border-subtle bg-surface-muted px-6 py-5"
      onSubmit={submit}
    >
      {mutationPresentation ? (
        <Notice title={mutationPresentation.title} variant="danger">
          {mutationPresentation.body}
        </Notice>
      ) : null}
      <SearchableSelect
        allowEmpty={false}
        label="Entry kind"
        onValueChange={(value) => {
          if (isWorkspaceEntryKind(value)) setKind(value);
        }}
        options={workspaceEntryKindOptions}
        searchPlaceholder="Search entry kinds"
        value={kind}
      />
      <label className="block text-xs font-medium text-muted" htmlFor={bodyId}>
        Workspace material
        <textarea
          aria-describedby={bodyError ? `${bodyId}-error` : `${bodyId}-help`}
          aria-invalid={bodyError ? "true" : undefined}
          className={`${bodyError ? invalidInputClassName : inputClassName} min-h-36 resize-y font-mono text-xs leading-5`}
          id={bodyId}
          onChange={(event) => setBody(event.currentTarget.value)}
          placeholder="Markdown is stored as mutable workspace text."
          value={body}
        />
      </label>
      {bodyError ? (
        <p className="text-xs text-danger" id={`${bodyId}-error`} role="alert">
          {bodyError}
        </p>
      ) : (
        <p className="text-xs leading-5 text-muted" id={`${bodyId}-help`}>
          Markdown is stored but displayed as safe plain text in this console. Avoid personal or
          regulated data; the service scans writes before storage.
        </p>
      )}
      <label className="block text-xs font-medium text-muted" htmlFor={referencesId}>
        Catalog reference UUIDs <span className="font-normal text-subtle">(optional)</span>
        <textarea
          aria-describedby={referencesError ? `${referencesId}-error` : `${referencesId}-help`}
          aria-invalid={referencesError ? "true" : undefined}
          className={`${referencesError ? invalidInputClassName : inputClassName} min-h-24 resize-y font-mono text-xs`}
          id={referencesId}
          onChange={(event) => setReferences(event.currentTarget.value)}
          placeholder="One UUID per line or comma-separated"
          value={references}
        />
      </label>
      {referencesError ? (
        <p className="text-xs text-danger" id={`${referencesId}-error`} role="alert">
          {referencesError}
        </p>
      ) : (
        <p className="text-xs leading-5 text-muted" id={`${referencesId}-help`}>
          References anchor this material to catalog entities; they do not publish the entry to
          capability owners.
        </p>
      )}
      <label className="block max-w-sm text-xs font-medium text-muted" htmlFor={expiresId}>
        Expiry <span className="font-normal text-subtle">(optional, local time)</span>
        <input
          className={inputClassName}
          id={expiresId}
          onChange={(event) => setExpiresAt(event.currentTarget.value)}
          type="datetime-local"
          value={expiresAt}
        />
      </label>
      <p className="text-xs leading-5 text-muted">
        Expiry is processed by a background worker. Material can remain visible briefly after the
        timestamp until invalidation runs.
      </p>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button disabled={mutation.isPending} type="submit">
          <FilePlus2 aria-hidden="true" className="size-4" />
          {mutation.isPending ? "Adding entry…" : "Add entry"}
        </Button>
        <Button disabled={mutation.isPending} onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EntryMutationFailure({ error }: { error: unknown }) {
  const presentation = mutationErrorPresentation(error, "entry");
  return (
    <Notice title={presentation.title} variant="danger">
      {presentation.body}
    </Notice>
  );
}

function WorkspaceEntryRow({
  apiTenantId,
  client,
  entry,
  mayWrite,
  onChanged,
  onReceipt,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  entry: WorkspaceEntry;
  mayWrite: boolean;
  onChanged: () => void;
  onReceipt: (receipt: MutationReceipt) => void;
}) {
  const bodyId = useId();
  const referencesId = useId();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [body, setBody] = useState(entry.body_md);
  const [references, setReferences] = useState(referenceIdsInput(entry.reference_ids));
  const [validationMessage, setValidationMessage] = useState("");
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const updateMutation = useMutation({
    mutationFn: () => {
      const parsedReferences = parseReferenceIds(references);
      return updateWorkspaceEntry(
        client,
        entry.workspace_id,
        entry.entry_id,
        {
          bodyMarkdown: body.trim(),
          referenceIds: parsedReferences.values,
        },
        context,
      );
    },
    onSuccess(updatedEntry) {
      setEditing(false);
      setValidationMessage("");
      onReceipt(
        updatedEntry.warnings && updatedEntry.warnings.length > 0
          ? {
              body: warningSummary(updatedEntry.warnings),
              title: "Entry updated with a personal-data warning",
              variant: "warning",
            }
          : {
              body: `${workspaceEntryKindLabel(updatedEntry.kind)} ${shortWorkspaceIdentifier(updatedEntry.entry_id)} was updated at ${formatWorkspaceTimestamp(updatedEntry.updated_at)}.`,
              title: "Workspace entry updated",
              variant: "success",
            },
      );
      onChanged();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkspaceEntry(client, entry.workspace_id, entry.entry_id, context),
    onSuccess() {
      setConfirmingDelete(false);
      onReceipt({
        body: `${workspaceEntryKindLabel(entry.kind)} ${shortWorkspaceIdentifier(entry.entry_id)} was removed from active workspace material.`,
        title: "Workspace entry removed",
        variant: "success",
      });
      onChanged();
    },
  });
  const expiryReached = entryExpiryReached(entry);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedReferences = parseReferenceIds(references);
    if (!body.trim()) {
      setValidationMessage("Workspace material cannot be empty.");
      return;
    }
    if (parsedReferences.error) {
      setValidationMessage(parsedReferences.error);
      return;
    }
    setValidationMessage("");
    updateMutation.mutate();
  }

  return (
    <li className="px-6 py-5">
      <article aria-labelledby={`workspace-entry-${entry.entry_id}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="text-sm font-semibold text-foreground"
                id={`workspace-entry-${entry.entry_id}`}
              >
                {workspaceEntryKindLabel(entry.kind)}
              </h3>
              {expiryReached ? (
                <StatusBadge tone="warning">Expiry reached</StatusBadge>
              ) : entry.expires_at ? (
                <StatusBadge tone="info">Time-limited</StatusBadge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted tabular-nums">
              Last edited{" "}
              <time dateTime={entry.updated_at}>{formatWorkspaceTimestamp(entry.updated_at)}</time>
              {entry.created_by ? (
                <>
                  {" "}
                  · Actor <code>{shortWorkspaceIdentifier(entry.created_by)}</code>
                </>
              ) : null}
            </p>
          </div>
          {mayWrite && !editing && !confirmingDelete ? (
            <div className="flex flex-wrap gap-1">
              <Button
                onClick={() => {
                  setBody(entry.body_md);
                  setReferences(referenceIdsInput(entry.reference_ids));
                  setEditing(true);
                }}
                size="compact"
                variant="ghost"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit entry
              </Button>
              <Button onClick={() => setConfirmingDelete(true)} size="compact" variant="ghost">
                <Trash2 aria-hidden="true" className="size-4" />
                Remove entry
              </Button>
            </div>
          ) : null}
        </div>

        {editing ? (
          <form className="mt-4 space-y-4" onSubmit={save}>
            <Notice title="Editing replaces the current text" variant="warning">
              Workspace entries have no revision history. Append a checkpoint instead when the
              previous wording must remain inspectable.
            </Notice>
            {updateMutation.isError ? <EntryMutationFailure error={updateMutation.error} /> : null}
            <label className="block text-xs font-medium text-muted" htmlFor={bodyId}>
              Workspace material
              <textarea
                aria-describedby={validationMessage ? `${bodyId}-error` : undefined}
                aria-invalid={validationMessage ? "true" : undefined}
                className={`${validationMessage ? invalidInputClassName : inputClassName} min-h-36 resize-y font-mono text-xs leading-5`}
                id={bodyId}
                onChange={(event) => setBody(event.currentTarget.value)}
                value={body}
              />
            </label>
            <label className="block text-xs font-medium text-muted" htmlFor={referencesId}>
              Catalog reference UUIDs
              <textarea
                className={`${inputClassName} min-h-24 resize-y font-mono text-xs`}
                id={referencesId}
                onChange={(event) => setReferences(event.currentTarget.value)}
                value={references}
              />
            </label>
            {validationMessage ? (
              <p className="text-xs text-danger" id={`${bodyId}-error`} role="alert">
                {validationMessage}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={updateMutation.isPending} type="submit">
                {updateMutation.isPending ? "Saving entry…" : "Save entry"}
              </Button>
              <Button
                disabled={updateMutation.isPending}
                onClick={() => {
                  setEditing(false);
                  setValidationMessage("");
                  updateMutation.reset();
                }}
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-4 whitespace-pre-wrap break-words border-l-2 border-border-strong pl-4 text-sm leading-6 text-foreground">
            {entry.body_md}
          </div>
        )}

        {confirmingDelete ? (
          <div className="mt-4">
            {deleteMutation.isError ? <EntryMutationFailure error={deleteMutation.error} /> : null}
            <Notice
              title={`Remove this ${workspaceEntryKindLabel(entry.kind).toLocaleLowerCase()}?`}
              variant="danger"
            >
              <p>
                The entry will be soft-deleted and disappear from active workspace reads. This
                console does not expose a restore operation.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                  variant="danger"
                >
                  {deleteMutation.isPending ? "Removing entry…" : "Confirm removal"}
                </Button>
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    setConfirmingDelete(false);
                    deleteMutation.reset();
                  }}
                  variant="ghost"
                >
                  Keep entry
                </Button>
              </div>
            </Notice>
          </div>
        ) : null}

        {!editing && entry.reference_ids.length > 0 ? (
          <details className="mt-4 rounded-md bg-surface-muted px-4 py-3">
            <summary className="cursor-pointer rounded-sm text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {entry.reference_ids.length} catalog reference
              {entry.reference_ids.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-3 space-y-2">
              {entry.reference_ids.map((referenceId) => (
                <li key={referenceId} className="break-all font-mono text-xs text-muted">
                  {referenceId}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {entry.expires_at ? (
          <p className={`mt-4 text-xs ${expiryReached ? "text-warning" : "text-muted"}`}>
            {expiryReached
              ? "The expiry timestamp has passed; background invalidation has not removed this entry yet."
              : "Expires"}{" "}
            <time dateTime={entry.expires_at}>{formatWorkspaceTimestamp(entry.expires_at)}</time>
          </p>
        ) : null}
      </article>
    </li>
  );
}

function WorkspaceDetailPage({
  apiTenantId,
  client,
  identity,
  workspaceId,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  identity: WhoAmI;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [urlState, setUrlState] = useState(readEntryListUrlState);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [receipt, setReceipt] = useState<MutationReceipt | null>(null);
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const tenantKey = queryTenantKey(apiTenantId);
  const workspaceKey = ["contextplane", tenantKey, "workspace", workspaceId] as const;
  const entriesKey = ["contextplane", tenantKey, "workspace-entries", workspaceId] as const;

  function publishReceipt(nextReceipt: MutationReceipt) {
    if (nextReceipt.variant === "warning") {
      setReceipt(nextReceipt);
      return;
    }
    setReceipt(null);
    showToast({
      message: nextReceipt.body,
      title: nextReceipt.title,
      variant: "success",
    });
  }

  useEffect(() => {
    function restoreUrlState() {
      setUrlState(readEntryListUrlState());
    }
    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, []);

  const workspaceQuery = useQuery({
    queryFn: ({ signal }) => getWorkspace(client, workspaceId, context, signal),
    queryKey: workspaceKey,
  });
  const entriesQuery = useQuery({
    enabled: workspaceQuery.isSuccess,
    queryFn: ({ signal }) =>
      listWorkspaceEntries(
        client,
        workspaceId,
        {
          ...(urlState.cursor ? { cursor: urlState.cursor } : {}),
          ...(urlState.kind ? { kind: urlState.kind } : {}),
        },
        context,
        signal,
      ),
    queryKey: [...entriesKey, urlState.kind, urlState.cursor],
  });
  const archiveMutation = useMutation({
    mutationFn: (archive: boolean) =>
      updateWorkspace(
        client,
        workspaceId,
        { archivedAt: archive ? new Date().toISOString() : null },
        context,
      ),
    onSuccess(updatedWorkspace) {
      queryClient.setQueryData(workspaceKey, updatedWorkspace);
      setShowAddEntry(false);
      publishReceipt({
        body: `${updatedWorkspace.name} is now ${updatedWorkspace.archived_at ? "read-only and archived" : "active and writable for permitted roles"}. The service recorded the lifecycle change at ${formatWorkspaceTimestamp(updatedWorkspace.updated_at)}.`,
        title: updatedWorkspace.archived_at ? "Workspace archived" : "Workspace restored",
        variant: "success",
      });
      void queryClient.invalidateQueries({
        queryKey: ["contextplane", tenantKey, "workspaces"],
      });
    },
  });
  const listHref = workspaceListHref();

  function updateUrlState(nextState: EntryListUrlState, mode: "push" | "replace" = "replace") {
    writeEntryListUrlState(nextState, mode);
    setUrlState(nextState);
  }

  if (workspaceQuery.isLoading) return <PageSkeleton controls={2} rows={5} />;
  if (workspaceQuery.isError) {
    return (
      <PageContainer>
        <PageHeader
          actions={
            <a className={controlLinkClassName} href={listHref}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to workspaces
            </a>
          }
          breadcrumbs={[
            { href: "/", label: identity.tenant_display_name },
            { href: listHref, label: "Workspaces" },
            { label: shortWorkspaceIdentifier(workspaceId) },
          ]}
          description="The workspace detail could not be resolved within the current actor and tenant visibility boundary."
          title="Workspace detail"
        />
        <QueryFailure
          detail
          error={workspaceQuery.error}
          onRetry={() => void workspaceQuery.refetch()}
        />
      </PageContainer>
    );
  }

  const workspace = workspaceQuery.data;
  if (!workspace) return <PageSkeleton controls={2} rows={5} />;
  const canWrite = mayWriteWorkspace(identity, workspace);
  const canArchive = mayArchiveWorkspace(identity, workspace);
  const entries = entriesQuery.data?.items ?? [];
  const invalidCursor =
    entriesQuery.error instanceof ContextplaneApiError &&
    entriesQuery.error.code === "invalid_cursor";
  const summaryItems: readonly SummaryItem[] = [
    {
      detail: workspaceVisibilityDescription(workspace),
      id: "visibility",
      label: "Visibility",
      value: workspaceOwnerKindLabel(workspace.owner_kind),
    },
    {
      detail: "Absolute service timestamp",
      id: "updated",
      label: "Last edited",
      value: formatWorkspaceTimestamp(workspace.updated_at),
    },
    {
      detail: "Current service page; not a workspace total",
      id: "entries",
      label: "Returned entries",
      value: String(entries.length),
    },
    {
      detail: workspace.archived_at
        ? `Archived ${formatWorkspaceTimestamp(workspace.archived_at)}`
        : "Entry writes depend on owner and role",
      id: "lifecycle",
      label: "Lifecycle",
      value: workspace.archived_at ? "Archived" : "Active",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <a className={controlLinkClassName} href={listHref}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to workspaces
            </a>
            {canArchive ? (
              <Button
                disabled={archiveMutation.isPending}
                onClick={() => archiveMutation.mutate(!workspace.archived_at)}
                variant="secondary"
              >
                {workspace.archived_at ? (
                  <ArchiveRestore aria-hidden="true" className="size-4" />
                ) : (
                  <Archive aria-hidden="true" className="size-4" />
                )}
                {archiveMutation.isPending
                  ? "Changing lifecycle…"
                  : workspace.archived_at
                    ? "Restore workspace"
                    : "Archive workspace"}
              </Button>
            ) : null}
          </div>
        }
        breadcrumbs={[
          { href: "/", label: identity.tenant_display_name },
          { href: listHref, label: "Workspaces" },
          { label: workspace.name },
        ]}
        description={
          workspace.description?.trim() ||
          "No purpose description was provided for this mutable workspace."
        }
        metadata={
          <>
            <StatusBadge tone={workspace.owner_kind === "tenant" ? "info" : "neutral"}>
              {workspaceOwnerKindLabel(workspace.owner_kind)}
            </StatusBadge>
            <StatusBadge tone={workspace.archived_at ? "neutral" : "success"}>
              {workspace.archived_at ? "Archived" : "Active"}
            </StatusBadge>
            <StatusBadge>{identityName(identity)}</StatusBadge>
          </>
        }
        title={workspace.name}
      />

      <div className="space-y-6">
        <Notice title="Mutable workspace material, not canonical context">
          Entries can support a task or record a working decision, but they do not change catalog
          state, route work to capability owners, or create durable audit evidence.
        </Notice>

        {receipt ? (
          <Notice role="status" title={receipt.title} variant={receipt.variant}>
            {receipt.body}
          </Notice>
        ) : null}

        {archiveMutation.isError ? (
          <Notice
            title={mutationErrorPresentation(archiveMutation.error, "archive").title}
            variant="danger"
          >
            {mutationErrorPresentation(archiveMutation.error, "archive").body}
          </Notice>
        ) : null}

        <SummaryStrip items={summaryItems} label="Workspace summary" />

        <SectionSurface
          action={
            canWrite ? (
              <Button onClick={() => setShowAddEntry((current) => !current)}>
                <FilePlus2 aria-hidden="true" className="size-4" />
                {showAddEntry ? "Close entry form" : "Add entry"}
              </Button>
            ) : undefined
          }
          description="Entries are ordered by the service's stable identifier. Kind filtering and pagination are sent to the service."
          flush
          footer={
            !entriesQuery.isError && entries.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted">
                  Expired entries can remain visible until the background invalidation worker runs.
                  Cursors remain opaque.
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
                    disabled={!entriesQuery.data?.next_cursor}
                    onClick={() => {
                      const cursor = entriesQuery.data?.next_cursor;
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
          title="Workspace entries"
        >
          {showAddEntry && canWrite ? (
            <AddEntryForm
              {...(apiTenantId ? { apiTenantId } : {})}
              client={client}
              onCancel={() => setShowAddEntry(false)}
              onCreated={(entry) => {
                setShowAddEntry(false);
                publishReceipt(
                  entry.warnings && entry.warnings.length > 0
                    ? {
                        body: warningSummary(entry.warnings),
                        title: "Entry added with a personal-data warning",
                        variant: "warning",
                      }
                    : {
                        body: `${workspaceEntryKindLabel(entry.kind)} ${shortWorkspaceIdentifier(entry.entry_id)} was added by ${identityName(identity)} at ${formatWorkspaceTimestamp(entry.created_at)}.`,
                        title: "Workspace entry added",
                        variant: "success",
                      },
                );
                void queryClient.invalidateQueries({ queryKey: entriesKey });
              }}
              workspaceId={workspace.workspace_id}
            />
          ) : null}

          {!canWrite ? (
            <div className="px-6 pb-5">
              <Notice
                title={
                  workspace.archived_at
                    ? "Archived workspaces are read-only"
                    : "This workspace is read-only for the resolved actor"
                }
                variant="warning"
              >
                {workspace.archived_at
                  ? "Restore the workspace before adding or editing entries. The service rejects entry writes while archived."
                  : workspace.owner_kind === "tenant"
                    ? "Tenant workspace writes require administrator access."
                    : "Personal workspace writes require the owning actor to hold the producer role; auditors and consumers remain read-only."}
              </Notice>
            </div>
          ) : null}

          <div className="border-y border-border-subtle bg-surface-muted px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-end">
              <SearchableSelect
                emptyLabel="All entry kinds"
                label="Entry kind"
                onValueChange={(value) => {
                  if (value === "" || isWorkspaceEntryKind(value)) {
                    updateUrlState({ cursor: "", kind: value });
                  }
                }}
                options={workspaceEntryKindOptions}
                searchPlaceholder="Search entry kinds"
                value={urlState.kind}
              />
              <div className="flex min-h-11 items-center justify-between gap-3 text-xs text-muted">
                <span aria-live="polite">
                  {entries.length} returned{" "}
                  {urlState.kind
                    ? workspaceEntryKindLabel(urlState.kind).toLocaleLowerCase()
                    : "entries"}
                </span>
                <Button
                  onClick={() =>
                    void queryClient.invalidateQueries({
                      queryKey: entriesKey,
                    })
                  }
                  size="compact"
                  variant="ghost"
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Refresh entries
                </Button>
              </div>
            </div>
          </div>

          {entriesQuery.isLoading ? (
            <div className="space-y-3 px-6 py-5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-32 w-full" />
              ))}
            </div>
          ) : entriesQuery.isError ? (
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
                  title="This entry page cursor is invalid"
                  variant="warning"
                >
                  The browser does not decode or repair cursor values. Return to the first page for
                  a fresh service cursor.
                </Notice>
              ) : (
                <QueryFailure
                  error={entriesQuery.error}
                  onRetry={() => void entriesQuery.refetch()}
                />
              )}
            </div>
          ) : entries.length > 0 ? (
            <ul className="divide-y divide-border-subtle">
              {entries.map((entry) => (
                <WorkspaceEntryRow
                  key={entry.entry_id}
                  {...(apiTenantId ? { apiTenantId } : {})}
                  client={client}
                  entry={entry}
                  mayWrite={canWrite}
                  onChanged={() => void queryClient.invalidateQueries({ queryKey: entriesKey })}
                  onReceipt={publishReceipt}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              description={
                urlState.kind
                  ? "The service returned no active entries for this kind. Clear the filter to inspect other workspace material."
                  : canWrite
                    ? "Add the first note, decision, question, saved query, or saved view for this task."
                    : "No active material is visible in this workspace. Read-only access does not imply permission to create it."
              }
              icon={FilePlus2}
              title={
                urlState.kind
                  ? `No ${workspaceEntryKindLabel(urlState.kind).toLocaleLowerCase()} entries`
                  : "No workspace entries yet"
              }
            />
          )}
        </SectionSurface>
      </div>
    </PageContainer>
  );
}

export function WorkspacesPage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
  selectedWorkspaceId,
}: WorkspacesPageProps) {
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
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Notebooks" }]}
          description="Workspace material becomes available after the service resolves the bearer credential to an actor and tenant."
          metadata={<StatusBadge tone="warning">Identity unresolved</StatusBadge>}
          title="Notebooks"
        />
        <QueryFailure error={identityQuery.error} onRetry={() => void identityQuery.refetch()} />
      </PageContainer>
    );
  }
  if (!identityQuery.data) return <PageSkeleton controls={2} rows={5} />;

  return selectedWorkspaceId ? (
    <WorkspaceDetailPage
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identityQuery.data}
      workspaceId={selectedWorkspaceId}
    />
  ) : (
    <WorkspacesListPage
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identityQuery.data}
      searchRef={searchRef}
    />
  );
}
