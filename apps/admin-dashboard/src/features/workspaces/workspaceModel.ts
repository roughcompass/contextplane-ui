import type {
  WhoAmI,
  Workspace,
  WorkspaceEntry,
  WorkspaceEntryKind,
  WorkspaceOwnerKind,
} from "../../shared/api";

export const workspaceEntryKindOptions: readonly {
  label: string;
  value: WorkspaceEntryKind;
}[] = [
  { label: "Note", value: "note" },
  { label: "Decision", value: "decision" },
  { label: "Open question", value: "open_question" },
  { label: "Saved query", value: "saved_query" },
  { label: "Saved view", value: "saved_view" },
];

export const workspaceOwnerKindOptions: readonly {
  label: string;
  value: WorkspaceOwnerKind;
}[] = [
  { label: "Personal workspace", value: "actor" },
  { label: "Tenant workspace", value: "tenant" },
];

export function isWorkspaceEntryKind(value: string | null): value is WorkspaceEntryKind {
  return workspaceEntryKindOptions.some((option) => option.value === value);
}

export function isWorkspaceOwnerKind(value: string): value is WorkspaceOwnerKind {
  return value === "actor" || value === "tenant";
}

export function workspaceEntryKindLabel(kind: string): string {
  return workspaceEntryKindOptions.find((option) => option.value === kind)?.label ?? kind;
}

export function workspaceOwnerKindLabel(kind: string): string {
  return workspaceOwnerKindOptions.find((option) => option.value === kind)?.label ?? kind;
}

export function shortWorkspaceIdentifier(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function workspaceListIdentifier(value: string): string {
  return value.length <= 12 ? value : `…${value.slice(-8)}`;
}

export function formatWorkspaceTimestamp(value: string | null): string {
  if (value === null) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid service timestamp";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
}

export function filterWorkspaces(
  workspaces: readonly Workspace[],
  query: string,
): readonly Workspace[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return workspaces;
  return workspaces.filter((workspace) =>
    [workspace.name, workspace.description ?? "", workspace.workspace_id, workspace.owner_kind]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

export function mayCreateWorkspace(identity: WhoAmI, ownerKind: WorkspaceOwnerKind): boolean {
  return ownerKind === "actor"
    ? identity.roles.includes("producer")
    : identity.roles.includes("admin");
}

export function availableWorkspaceOwnerKinds(identity: WhoAmI): WorkspaceOwnerKind[] {
  return workspaceOwnerKindOptions
    .map((option) => option.value)
    .filter((ownerKind) => mayCreateWorkspace(identity, ownerKind));
}

export function mayWriteWorkspace(identity: WhoAmI, workspace: Workspace): boolean {
  if (workspace.archived_at) return false;
  if (workspace.owner_kind === "tenant") return identity.roles.includes("admin");
  return workspace.owner_actor_id === identity.actor_id && identity.roles.includes("producer");
}

export function mayArchiveWorkspace(identity: WhoAmI, workspace: Workspace): boolean {
  if (workspace.owner_kind === "tenant") return identity.roles.includes("admin");
  return workspace.owner_actor_id === identity.actor_id && identity.roles.includes("producer");
}

export function workspaceVisibilityDescription(workspace: Workspace): string {
  if (workspace.owner_kind === "tenant") {
    return "Visible to role holders in this tenant; administrators write.";
  }
  return "Visible to its owner and tenant auditors; only the owning producer writes.";
}

export function entryBodyPreview(value: string, limit = 160): string {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

export interface ParsedReferenceIds {
  error: string | null;
  values: readonly string[];
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReferenceIds(value: string): ParsedReferenceIds {
  const candidates = value
    .split(/[\s,]+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const invalid = candidates.find((candidate) => !uuidPattern.test(candidate));
  if (invalid) {
    return {
      error: `Reference “${invalid}” is not a UUID.`,
      values: [],
    };
  }
  const values = [
    ...new Map(candidates.map((candidate) => [candidate.toLocaleLowerCase(), candidate])).values(),
  ];
  return { error: null, values };
}

export function referenceIdsInput(referenceIds: readonly string[]): string {
  return referenceIds.join("\n");
}

export function localExpiryToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function entryExpiryReached(
  entry: Pick<WorkspaceEntry, "expires_at">,
  now = Date.now(),
): boolean {
  if (!entry.expires_at) return false;
  const expiry = new Date(entry.expires_at).getTime();
  return !Number.isNaN(expiry) && expiry <= now;
}
