import { describe, expect, it } from "vitest";

import type { WhoAmI, Workspace, WorkspaceEntry } from "../../shared/api";
import {
  availableWorkspaceOwnerKinds,
  entryBodyPreview,
  entryExpiryReached,
  filterWorkspaces,
  formatWorkspaceTimestamp,
  isWorkspaceEntryKind,
  localExpiryToIso,
  mayArchiveWorkspace,
  mayCreateWorkspace,
  mayWriteWorkspace,
  parseReferenceIds,
  shortWorkspaceIdentifier,
  workspaceEntryKindLabel,
  workspaceListIdentifier,
  workspaceOwnerKindLabel,
  workspaceVisibilityDescription,
} from "./workspaceModel";

const identity: WhoAmI = {
  actor_display_name: "Morgan Morris",
  actor_email: null,
  actor_id: "a0000000-0000-4000-8000-000000000001",
  roles: ["admin", "producer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "b0000000-0000-4000-8000-000000000001",
  tenant_slug: "northstar",
};

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    archived_at: null,
    created_at: "2026-08-12T10:00:00Z",
    created_by: identity.actor_id,
    description: "Track the identity migration decision.",
    name: "Identity migration",
    owner_actor_id: identity.actor_id,
    owner_kind: "actor",
    t_invalidated_at: null,
    tenant_id: identity.tenant_id,
    updated_at: "2026-08-12T11:00:00Z",
    workspace_id: "c0000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

describe("workspace model", () => {
  it("labels contract vocabularies and rejects unknown entry kinds", () => {
    expect(isWorkspaceEntryKind("open_question")).toBe(true);
    expect(isWorkspaceEntryKind("task")).toBe(false);
    expect(workspaceEntryKindLabel("saved_query")).toBe("Saved query");
    expect(workspaceOwnerKindLabel("tenant")).toBe("Tenant workspace");
  });

  it("formats identifiers and absolute UTC timestamps", () => {
    expect(shortWorkspaceIdentifier("c0000000-0000-4000-8000-000000000001")).toBe(
      "c0000000-000…00000001",
    );
    expect(workspaceListIdentifier("c0000000-0000-4000-8000-000000000001")).toBe("…00000001");
    expect(formatWorkspaceTimestamp("2026-08-12T10:05:06Z")).toContain("UTC");
    expect(formatWorkspaceTimestamp(null)).toBe("Not set");
    expect(formatWorkspaceTimestamp("not-a-date")).toBe("Invalid service timestamp");
  });

  it("filters a returned page without inventing service-wide search", () => {
    const workspaces = [
      workspace(),
      workspace({
        description: "Capture policy review notes.",
        name: "Policy review",
        workspace_id: "c0000000-0000-4000-8000-000000000002",
      }),
    ];

    expect(filterWorkspaces(workspaces, "policy").map((item) => item.name)).toEqual([
      "Policy review",
    ]);
    expect(filterWorkspaces(workspaces, "00000001").map((item) => item.name)).toEqual([
      "Identity migration",
    ]);
    expect(filterWorkspaces(workspaces, "")).toBe(workspaces);
  });

  it("mirrors the service creation and write authorization matrix", () => {
    expect(mayCreateWorkspace(identity, "actor")).toBe(true);
    expect(mayCreateWorkspace(identity, "tenant")).toBe(true);
    expect(availableWorkspaceOwnerKinds(identity)).toEqual(["actor", "tenant"]);
    expect(mayWriteWorkspace(identity, workspace())).toBe(true);
    expect(mayArchiveWorkspace(identity, workspace())).toBe(true);
    expect(mayWriteWorkspace(identity, workspace({ owner_actor_id: "other" }))).toBe(false);
    expect(
      mayWriteWorkspace(identity, workspace({ owner_actor_id: null, owner_kind: "tenant" })),
    ).toBe(true);
    expect(mayWriteWorkspace(identity, workspace({ archived_at: "2026-08-13T00:00:00Z" }))).toBe(
      false,
    );

    const consumer = { ...identity, roles: ["consumer"] };
    expect(availableWorkspaceOwnerKinds(consumer)).toEqual([]);
    expect(mayWriteWorkspace(consumer, workspace())).toBe(false);
    expect(mayArchiveWorkspace(consumer, workspace())).toBe(false);
  });

  it("explains personal and tenant visibility without implying selected-team sharing", () => {
    expect(workspaceVisibilityDescription(workspace())).toMatch(/owner and tenant auditors/i);
    expect(
      workspaceVisibilityDescription(workspace({ owner_actor_id: null, owner_kind: "tenant" })),
    ).toMatch(/role holders in this tenant/i);
  });

  it("parses, validates, and deduplicates catalog reference UUIDs", () => {
    const first = "d0000000-0000-4000-8000-000000000001";
    const second = "d0000000-0000-4000-8000-000000000002";
    expect(parseReferenceIds(`${first}\n${second}, ${first}`)).toEqual({
      error: null,
      values: [first, second],
    });
    expect(parseReferenceIds("not-an-id")).toEqual({
      error: "Reference “not-an-id” is not a UUID.",
      values: [],
    });
    expect(parseReferenceIds("")).toEqual({ error: null, values: [] });
  });

  it("summarizes bodies and preserves expiry worker semantics", () => {
    expect(entryBodyPreview("  First\n\nsecond   line ")).toBe("First second line");
    expect(entryBodyPreview("a".repeat(20), 10)).toBe("aaaaaaaaa…");
    expect(localExpiryToIso("")).toBeNull();
    expect(localExpiryToIso("invalid")).toBeNull();
    expect(localExpiryToIso("2026-08-12T10:00")).toMatch(/^2026-08-12T/);

    const entry = { expires_at: "2026-08-12T10:00:00Z" } as Pick<WorkspaceEntry, "expires_at">;
    expect(entryExpiryReached(entry, new Date("2026-08-12T10:00:00Z").getTime())).toBe(true);
    expect(entryExpiryReached({ expires_at: null }, Date.now())).toBe(false);
  });
});
