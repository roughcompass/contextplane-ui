import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type Workspace,
  type WorkspaceEntry,
} from "../../shared/api";
import { WorkspacesPage } from "./WorkspacesPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "a0000000-0000-4000-8000-000000000001",
  roles: ["admin", "producer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "b0000000-0000-4000-8000-000000000001",
  tenant_slug: "northstar",
};

const personalWorkspace: Workspace = {
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
};

const tenantWorkspace: Workspace = {
  ...personalWorkspace,
  description: "Record the shared operating policy.",
  name: "Operating policy",
  owner_actor_id: null,
  owner_kind: "tenant",
  workspace_id: "c0000000-0000-4000-8000-000000000002",
};

const decisionEntry: WorkspaceEntry = {
  body_md: "Use the staged policy until migration completes.",
  created_at: "2026-08-12T10:10:00Z",
  created_by: identity.actor_id,
  entry_id: "d0000000-0000-4000-8000-000000000001",
  expires_at: null,
  kind: "decision",
  reference_ids: ["e0000000-0000-4000-8000-000000000001"],
  references_jsonb: null,
  tenant_id: identity.tenant_id,
  updated_at: "2026-08-12T10:10:00Z",
  warnings: [],
  workspace_id: tenantWorkspace.workspace_id,
};

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return {
    request: vi.fn(async (path: string, options?: ContextplaneRequestOptions): Promise<unknown> =>
      resolver(path, options),
    ),
  } satisfies ContextplaneClient;
}

function renderPage(
  client: ContextplaneClient,
  options: { apiTenantId?: string; selectedWorkspaceId?: string | null } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const searchRef = createRef<HTMLInputElement>();
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WorkspacesPage
            {...(options.apiTenantId ? { apiTenantId: options.apiTenantId } : {})}
            activeTenantName="Northstar Systems"
            client={client}
            searchRef={searchRef}
            selectedWorkspaceId={options.selectedWorkspaceId ?? null}
          />
        </ToastProvider>
      </QueryClientProvider>,
    ),
    queryClient,
    searchRef,
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/workspaces");
});

describe("WorkspacesPage", () => {
  it("browses, searches, filters, and cursor-pages visible workspaces", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.includes("cursor=opaque-next")) {
        return { items: [tenantWorkspace], next_cursor: null };
      }
      if (path.includes("include_archived=true")) {
        return {
          items: [{ ...personalWorkspace, archived_at: "2026-08-13T10:00:00Z" }],
          next_cursor: null,
        };
      }
      if (path.startsWith("/v1/workspaces")) {
        return { items: [personalWorkspace], next_cursor: "opaque-next" };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    const { searchRef } = renderPage(client, { apiTenantId: "tenant-real" });

    expect(await screen.findByRole("heading", { level: 1, name: "Workspaces" })).toBeVisible();
    expect(screen.getByText("Workspace material is mutable working context")).toBeVisible();
    const section = screen.getByRole("region", { name: "Visible workspaces" });
    expect(await within(section).findByRole("link", { name: "Identity migration" })).toBeVisible();
    expect(within(section).getByText("ID …00000001")).toBeVisible();
    expect(within(section).getByRole("link", { name: "View details" })).toBeVisible();
    expect(searchRef.current).not.toBeNull();

    fireEvent.click(within(section).getByRole("button", { name: "Show filters" }));
    const search = within(section).getByRole("searchbox", { name: "Search returned page" });
    fireEvent.change(search, { target: { value: "no match" } });
    expect(within(section).getByText("No returned workspace matches this search")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("no match");
    fireEvent.click(within(section).getByRole("button", { name: "Clear search" }));

    fireEvent.click(within(section).getByRole("button", { name: "Next page" }));
    expect(await within(section).findByRole("link", { name: "Operating policy" })).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("cursor")).toBe("opaque-next");
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("cursor=opaque-next"),
      expect.objectContaining({ tenantId: "tenant-real", signal: expect.any(AbortSignal) }),
    );

    fireEvent.click(within(section).getByRole("combobox", { name: /^Archive visibility/ }));
    fireEvent.click(screen.getByRole("option", { name: "Include archived workspaces" }));
    expect(await within(section).findByText("Archived")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("archived")).toBe("include");
  });

  it("creates a role-permitted workspace and leaves a durable receipt", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/whoami") return identity;
      if (path === "/v1/workspaces" && options?.method === "POST") return tenantWorkspace;
      if (path.startsWith("/v1/workspaces")) return { items: [], next_cursor: null };
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Workspaces" });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(screen.getByText("Enter a workspace name.")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace name" }), {
      target: { value: "Operating policy" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: /^Ownership and visibility/ }));
    fireEvent.click(screen.getByRole("option", { name: "Tenant workspace" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "Record the shared operating policy." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(await screen.findByText("Workspace created")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute(
      "href",
      `/workspaces/${tenantWorkspace.workspace_id}`,
    );
    expect(client.request).toHaveBeenCalledWith("/v1/workspaces", {
      body: {
        description: "Record the shared operating policy.",
        name: "Operating policy",
        owner_kind: "tenant",
      },
      method: "POST",
    });
  });

  it("recovers from an invalid opaque workspace cursor", async () => {
    window.history.replaceState({}, "", "/workspaces?cursor=expired");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.includes("cursor=expired")) {
        throw new ContextplaneApiError({
          errors: [{ code: "invalid_cursor", message: "invalid cursor", path: null }],
          requestId: "request-cursor",
          status: 422,
        });
      }
      if (path.startsWith("/v1/workspaces")) return { items: [], next_cursor: null };
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByText("This workspace page cursor is invalid")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to first page" }));
    expect(await screen.findByText("No active workspaces")).toBeVisible();
    expect(new URL(window.location.href).searchParams.has("cursor")).toBe(false);
  });

  it("renders personal workspace material read-only for a consumer and reports pending expiry", async () => {
    window.history.replaceState({}, "", `/workspaces/${personalWorkspace.workspace_id}?q=identity`);
    const consumer = { ...identity, roles: ["consumer"] };
    const expiredEntry = {
      ...decisionEntry,
      expires_at: "2020-01-01T00:00:00Z",
      workspace_id: personalWorkspace.workspace_id,
    };
    const futureEntry = {
      ...decisionEntry,
      body_md: "Review this after the migration window.",
      entry_id: "d0000000-0000-4000-8000-000000000002",
      expires_at: "2099-01-01T00:00:00Z",
      kind: "note",
      reference_ids: [],
      workspace_id: personalWorkspace.workspace_id,
    };
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return consumer;
      if (path === `/v1/workspaces/${personalWorkspace.workspace_id}`) return personalWorkspace;
      if (path.startsWith(`/v1/workspaces/${personalWorkspace.workspace_id}/entries`)) {
        return { items: [expiredEntry, futureEntry], next_cursor: null };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client, { selectedWorkspaceId: personalWorkspace.workspace_id });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Identity migration" }),
    ).toBeVisible();
    expect(screen.getByText("Mutable workspace material, not canonical context")).toBeVisible();
    expect(screen.getByText("This workspace is read-only for the resolved actor")).toBeVisible();
    expect(await screen.findByText("Expiry reached")).toBeVisible();
    expect(await screen.findByText("Time-limited")).toBeVisible();
    expect(
      await screen.findByText(/background invalidation has not removed this entry/i),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit entry" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to workspaces" })).toHaveAttribute(
      "href",
      "/workspaces?q=identity",
    );
  });

  it("adds a tenant entry, surfaces scanner warnings, and archives the workspace", async () => {
    let archived = false;
    const warningEntry = {
      ...decisionEntry,
      warnings: [{ categories: ["PII_EMAIL"], field: "body_md" }],
    };
    const client = clientFor((path, options) => {
      if (path === "/v1/whoami") return identity;
      if (
        path === `/v1/workspaces/${tenantWorkspace.workspace_id}` &&
        options?.method === "PATCH"
      ) {
        const body = options.body as { archived_at: string | null };
        archived = body.archived_at !== null;
        return {
          ...tenantWorkspace,
          archived_at: archived ? "2026-08-12T12:00:00Z" : null,
        };
      }
      if (path === `/v1/workspaces/${tenantWorkspace.workspace_id}`) {
        return archived
          ? { ...tenantWorkspace, archived_at: "2026-08-12T12:00:00Z" }
          : tenantWorkspace;
      }
      if (
        path === `/v1/workspaces/${tenantWorkspace.workspace_id}/entries` &&
        options?.method === "POST"
      ) {
        return warningEntry;
      }
      if (path.startsWith(`/v1/workspaces/${tenantWorkspace.workspace_id}/entries`)) {
        return { items: [], next_cursor: null };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client, { selectedWorkspaceId: tenantWorkspace.workspace_id });

    await screen.findByRole("heading", { level: 1, name: "Operating policy" });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Entry kind Note" }));
    fireEvent.click(screen.getByRole("option", { name: "Decision" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace material" }), {
      target: { value: decisionEntry.body_md },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Catalog reference UUIDs/ }), {
      target: { value: decisionEntry.reference_ids[0] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));

    expect(await screen.findByText("Entry added with a personal-data warning")).toBeVisible();
    expect(screen.getByText(/PII_EMAIL/)).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      `/v1/workspaces/${tenantWorkspace.workspace_id}/entries`,
      expect.objectContaining({
        body: expect.objectContaining({
          body_md: decisionEntry.body_md,
          kind: "decision",
          reference_ids: decisionEntry.reference_ids,
        }),
        method: "POST",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));
    expect(await screen.findByText("Workspace archived")).toBeVisible();
    expect(screen.getByText("Archived workspaces are read-only")).toBeVisible();
    expect(screen.getByRole("button", { name: "Restore workspace" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Restore workspace" }));
    expect(await screen.findByText("Workspace restored")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add entry" })).toBeVisible();
  });

  it("edits and safely removes workspace entries", async () => {
    let currentEntry: WorkspaceEntry | null = decisionEntry;
    const client = clientFor((path, options) => {
      if (path === "/v1/whoami") return identity;
      if (path === `/v1/workspaces/${tenantWorkspace.workspace_id}`) return tenantWorkspace;
      if (path.endsWith(`/${decisionEntry.entry_id}`) && options?.method === "PATCH") {
        currentEntry = { ...decisionEntry, body_md: "Updated operating decision." };
        return currentEntry;
      }
      if (path.endsWith(`/${decisionEntry.entry_id}`) && options?.method === "DELETE") {
        currentEntry = null;
        return null;
      }
      if (path.startsWith(`/v1/workspaces/${tenantWorkspace.workspace_id}/entries`)) {
        return { items: currentEntry ? [currentEntry] : [], next_cursor: null };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client, { selectedWorkspaceId: tenantWorkspace.workspace_id });

    expect(await screen.findByText(decisionEntry.body_md)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit entry" }));
    expect(screen.getByText("Editing replaces the current text")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace material" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    expect(screen.getByText("Workspace material cannot be empty.")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace material" }), {
      target: { value: "Updated operating decision." },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Catalog reference UUIDs" }), {
      target: { value: "invalid-reference" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    expect(screen.getByText(/invalid-reference.*not a UUID/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit entry" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace material" }), {
      target: { value: "Updated operating decision." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    expect(await screen.findByText("Workspace entry updated")).toBeVisible();
    expect(await screen.findByText("Updated operating decision.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove entry" }));
    expect(screen.getByText("Remove this decision?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Keep entry" }));
    expect(screen.queryByText("Remove this decision?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove entry" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(await screen.findByText("Workspace entry removed")).toBeVisible();
    expect(await screen.findByText("No workspace entries yet")).toBeVisible();
  });

  it("preserves an entry draft after a PII block", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/whoami") return identity;
      if (path === `/v1/workspaces/${tenantWorkspace.workspace_id}`) return tenantWorkspace;
      if (
        path === `/v1/workspaces/${tenantWorkspace.workspace_id}/entries` &&
        options?.method === "POST"
      ) {
        throw new ContextplaneApiError({
          errors: [
            {
              categories: ["PII_EMAIL"],
              code: "pii_detected",
              message: "blocked",
              path: null,
            },
          ],
          requestId: "request-pii",
          status: 422,
        });
      }
      if (path.startsWith(`/v1/workspaces/${tenantWorkspace.workspace_id}/entries`)) {
        return { items: [], next_cursor: null };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client, { selectedWorkspaceId: tenantWorkspace.workspace_id });

    await screen.findByRole("heading", { level: 1, name: "Operating policy" });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    const material = screen.getByRole("textbox", { name: "Workspace material" });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    expect(screen.getByText("Enter workspace material.")).toBeVisible();
    fireEvent.change(material, { target: { value: "Contact person@example.test" } });
    const references = screen.getByRole("textbox", { name: /Catalog reference UUIDs/ });
    fireEvent.change(references, { target: { value: "not-a-reference" } });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    expect(screen.getByText(/not-a-reference.*not a UUID/i)).toBeVisible();
    fireEvent.change(references, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Expiry/), {
      target: { value: "2027-01-01T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));

    expect(
      await screen.findByText("Workspace material contains blocked personal data"),
    ).toBeVisible();
    expect(screen.getByText(/PII_EMAIL/)).toBeVisible();
    expect(material).toHaveValue("Contact person@example.test");
  });

  it("filters and cursor-pages entries with URL-addressable service state", async () => {
    window.history.replaceState(
      {},
      "",
      `/workspaces/${tenantWorkspace.workspace_id}?kind=decision&entry_cursor=opaque-current`,
    );
    const noteEntry = {
      ...decisionEntry,
      body_md: "Follow-up note.",
      entry_id: "d0000000-0000-4000-8000-000000000002",
      kind: "note",
      reference_ids: [],
    };
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path === `/v1/workspaces/${tenantWorkspace.workspace_id}`) return tenantWorkspace;
      if (path.includes("entry_cursor")) throw new Error("Cursor leaked into the API path");
      if (path.includes("cursor=opaque-next")) return { items: [noteEntry], next_cursor: null };
      if (path.includes("kind=note")) return { items: [], next_cursor: null };
      if (path.includes("cursor=opaque-current")) {
        return { items: [decisionEntry], next_cursor: "opaque-next" };
      }
      if (path.includes("kind=decision")) {
        return { items: [decisionEntry], next_cursor: "opaque-next" };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client, { selectedWorkspaceId: tenantWorkspace.workspace_id });

    expect(await screen.findByText(decisionEntry.body_md)).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("kind=decision&cursor=opaque-current"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Follow-up note.")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("entry_cursor")).toBe("opaque-next");
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    expect(await screen.findByText(decisionEntry.body_md)).toBeVisible();

    fireEvent.click(screen.getByRole("combobox", { name: "Entry kind Decision" }));
    fireEvent.click(screen.getByRole("option", { name: "Note" }));
    expect(await screen.findByText("No note entries")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("kind")).toBe("note");
    expect(new URL(window.location.href).searchParams.has("entry_cursor")).toBe(false);
  });

  it("reports hidden workspace detail without revealing whether it exists", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      throw new ContextplaneApiError({
        errors: [{ code: "not_found", message: "not found", path: null }],
        requestId: "request-hidden",
        status: 404,
      });
    });
    renderPage(client, { selectedWorkspaceId: "hidden-workspace" });

    expect(await screen.findByText("Workspace not found")).toBeVisible();
    expect(screen.getByText(/absent or not visible to this actor/i)).toBeVisible();
    expect(screen.getByText(/request-hidden/)).toBeVisible();
  });

  it("explains identity failures before exposing workspace scope", async () => {
    const client = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "unauthenticated", message: "authentication required", path: null }],
        requestId: "request-auth",
        status: 401,
      });
    });
    renderPage(client);

    expect(
      await screen.findByText("Connect an authenticated DE Context Plane session"),
    ).toBeVisible();
    expect(screen.getByText(/request-auth/)).toBeVisible();
  });
});
