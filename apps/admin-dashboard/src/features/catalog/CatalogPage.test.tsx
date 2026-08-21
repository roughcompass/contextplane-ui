import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { CatalogPage } from "./CatalogPage";

const concept = {
  attributes: {},
  created_at: "2026-08-12T14:31:02Z",
  entity_id: "0f2e6d43-8b2c-4f0e-9b31-7c1f2b7a5d10",
  entity_type: "concept",
  external_id: null,
  lifecycle: "ga",
  name: "Settlement window",
};

const capability = {
  attributes: { lifecycle: { state: "ga" }, summary: "Resolves policy decisions" },
  created_at: "2026-08-12T14:28:41Z",
  entity_id: "51485c54-ed69-459b-8dd8-30d80f62d835",
  entity_type: "capability",
  external_id: "policy-evaluation",
  lifecycle: "ga",
  name: "Policy evaluation",
};

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return clientFromRequest(
    vi.fn(async (path: string, options?: ContextplaneRequestOptions) => resolver(path, options)),
  );
}

function renderCatalog(client: ContextplaneClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CatalogPage
          activeTenantName="Northstar Systems"
          apiTenantId="tenant-a"
          client={client}
          searchRef={createRef<HTMLInputElement>()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/catalog");
});

describe("CatalogPage", () => {
  it("lists canonical capabilities with tenant forwarding and URL-addressable filters", async () => {
    const client = clientFor(() => ({ items: [capability], next_cursor: null }));
    renderCatalog(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Catalog" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Policy evaluation" })[0]).toBeVisible();
    expect(screen.getAllByText("capability")[0]).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/capabilities?page_size=100",
      expect.objectContaining({ tenantId: "tenant-a" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search current page" }), {
      target: { value: "missing" },
    });

    expect(screen.getByText("No entity matches")).toBeVisible();
    expect(window.location.search).toContain("q=missing");
  });

  it("creates a capability through the service and opens its canonical detail", async () => {
    const created = {
      ...capability,
      entity_id: "c94bba7c-3e70-48a1-84cb-42029415ba78",
      name: "Authorization policy",
    };
    const client = clientFor((path, options) => {
      if (path === "/v1/capabilities" && options?.method === "POST") return created;
      if (path.startsWith(`/v1/capabilities/${created.entity_id}`)) return created;
      return { items: [capability], next_cursor: null };
    });
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getByRole("button", { name: "Create capability" }));
    const dialog = screen.getByRole("dialog", { name: "Create capability" });
    expect(dialog).toHaveTextContent("Creates canonical tenant state");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Capability name" }), {
      target: { value: "Authorization policy" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create capability" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/capabilities",
        expect.objectContaining({
          body: expect.objectContaining({
            entity_type: "capability",
            name: "Authorization policy",
          }),
          headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
          method: "POST",
          tenantId: "tenant-a",
        }),
      ),
    );
    await waitFor(() => {
      expect(window.location.search).toContain(`capability=${created.entity_id}`);
      expect(client.request).toHaveBeenCalledWith(
        `/v1/capabilities/${created.entity_id}?include=components%2Cdepends_on%2Cexternal_ids%2Cinterface`,
        expect.objectContaining({ tenantId: "tenant-a" }),
      );
    });
  });

  it("lists every entity type the tenant holds, not only capabilities", async () => {
    const client = clientFor(() => ({ items: [capability, concept], next_cursor: null }));
    renderCatalog(client);

    await screen.findByRole("heading", { level: 1, name: "Catalog" });
    expect(screen.getAllByRole("button", { name: "Settlement window" })[0]).toBeVisible();
    expect(screen.getAllByText("concept")[0]).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/capabilities?page_size=100",
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
  });

  it("narrows to one entity type at the service and keeps the choice in the URL", async () => {
    const client = clientFor(() => ({ items: [capability, concept], next_cursor: null }));
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Entity type All types" }));
    fireEvent.click(await screen.findByRole("option", { name: "Concept" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/capabilities?entity_type=concept&page_size=100",
        expect.objectContaining({ tenantId: "tenant-a" }),
      ),
    );
    expect(window.location.search).toContain("type=concept");
  });

  it("creates a concept at its own route, with the parent capability it belongs to", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/concepts" && options?.method === "POST") return concept;
      if (path.startsWith(`/v1/capabilities/${concept.entity_id}`)) return concept;
      return { items: [capability], next_cursor: null };
    });
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getByRole("button", { name: "Create concept" }));
    const dialog = screen.getByRole("dialog", { name: "Create concept" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Concept name" }), {
      target: { value: "Settlement window" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create concept" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/concepts",
        expect.objectContaining({
          body: expect.objectContaining({ entity_type: "concept", name: "Settlement window" }),
          method: "POST",
          tenantId: "tenant-a",
        }),
      ),
    );
  });

  it("creates an operation at its own route", async () => {
    const operation = { ...concept, entity_type: "operation", name: "Reprice order" };
    const client = clientFor((path, options) => {
      if (path === "/v1/operations" && options?.method === "POST") return operation;
      if (path.startsWith(`/v1/capabilities/${operation.entity_id}`)) return operation;
      return { items: [], next_cursor: null };
    });
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getAllByRole("button", { name: "Create operation" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Create operation" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Operation name" }), {
      target: { value: "Reprice order" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create operation" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/operations",
        expect.objectContaining({
          body: expect.objectContaining({ entity_type: "operation", name: "Reprice order" }),
          method: "POST",
        }),
      ),
    );
  });

  it("reopens a create dialog from the URL alone, for the type the URL names", async () => {
    window.history.replaceState({}, "", "/catalog?create=operation");
    renderCatalog(clientFor(() => ({ items: [], next_cursor: null })));

    expect(await screen.findByRole("dialog", { name: "Create operation" })).toBeVisible();
  });

  it("keeps a creation draft available when the service refuses the write", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/capabilities" && options?.method === "POST") {
        return Promise.reject(new Error("unavailable"));
      }
      return { items: [], next_cursor: null };
    });
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getAllByRole("button", { name: "Create capability" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Create capability" });
    const name = within(dialog).getByRole("textbox", { name: "Capability name" });
    fireEvent.change(name, { target: { value: "Draft remains" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create capability" }));

    expect(await within(dialog).findByText("The capability was not created")).toBeVisible();
    expect(name).toHaveValue("Draft remains");
  });

  it("registers directly by default, on the dedicated create route", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/capabilities" && options?.method === "POST") return capability;
      if (path.startsWith(`/v1/capabilities/${capability.entity_id}`)) return capability;
      return { items: [], next_cursor: null };
    });
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getAllByRole("button", { name: "Create capability" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Create capability" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Capability name/ }), {
      target: { value: "Policy evaluation" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create capability" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/capabilities",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("routes a governed write to the generic surface, attesting to the binding", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/profiles/conformance") {
        return {
          binding: {
            binding_id: "b-1",
            extension_set_digest: "sha256:d-1",
            profile_revision_id: "r-1",
            state: "active",
          },
          bound: true,
        };
      }
      if (path === "/v1/entities" && options?.method === "POST") {
        return {
          effect: "staged_claim",
          entity_id: null,
          intent: "observation",
          profile: { binding_id: "b-1", enforcement_mode: "mandatory", profile_revision_id: "r-1" },
          review_entry_id: null,
          staged_claim_id: "s-1",
          validation: { mode: "mandatory", valid: true },
        };
      }
      return { items: [], next_cursor: null };
    });
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getAllByRole("button", { name: "Create capability" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Create capability" });
    fireEvent.click(
      within(dialog).getByRole("combobox", { name: /How this write reaches the catalog/ }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /^Observation/ }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Capability name/ }), {
      target: { value: "Policy evaluation" },
    });
    // The form will not submit a governed write until it knows what governs the
    // tenant, so wait for that rather than racing it.
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Create capability" })).toBeEnabled(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Create capability" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/entities",
        expect.objectContaining({
          body: expect.objectContaining({
            intent: "observation",
            subject_kind: "entity",
            target_revision: { binding_revision: "sha256:d-1", profile_revision: "r-1" },
          }),
          method: "POST",
        }),
      ),
    );
  });

  it("will not send a governed write for a tenant bound to nothing", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/profiles/conformance") return { binding: null, bound: false };
      return { items: [], next_cursor: null };
    });
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getAllByRole("button", { name: "Create capability" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Create capability" });
    fireEvent.click(
      within(dialog).getByRole("combobox", { name: /How this write reaches the catalog/ }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /^Request/ }));

    expect(await within(dialog).findByText("No profile is bound")).toBeVisible();
    expect(client.request).not.toHaveBeenCalledWith("/v1/entities", expect.anything());
  });

  it("requires an authorized approval to name the approval it rests on", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/profiles/conformance") {
        return {
          binding: {
            binding_id: "b-1",
            extension_set_digest: "sha256:d-1",
            profile_revision_id: "r-1",
            state: "active",
          },
          bound: true,
        };
      }
      return { items: [], next_cursor: null };
    });
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });

    fireEvent.click(screen.getAllByRole("button", { name: "Create capability" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Create capability" });
    fireEvent.click(
      within(dialog).getByRole("combobox", { name: /How this write reaches the catalog/ }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /^Authorized approval/ }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Capability name/ }), {
      target: { value: "Policy evaluation" },
    });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Create capability" })).toBeEnabled(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Create capability" }));

    expect(
      await within(dialog).findByText("An authorized approval must name the approval it rests on."),
    ).toBeVisible();
    expect(client.request).not.toHaveBeenCalledWith("/v1/entities", expect.anything());
  });
  // --- E19-T7: the governed read and the governed edit ------------------------

  const governedBinding = {
    binding: {
      binding_id: "b-1",
      extension_set_digest: "sha256:d-1",
      profile_revision_id: "r-1",
      state: "active",
    },
    bound: true,
  };

  const governedEdge = {
    endpoints: {
      destination_entity_id: "9c2c8d1e-1111-4a3b-8f2d-000000000002",
      source_entity_id: capability.entity_id,
    },
    is_inverse: false,
    profile: { binding_id: "b-1", enforcement_mode: "mandatory", profile_revision_id: "r-1" },
    properties: {},
    provenance: {
      authority: null,
      confidence: null,
      external_record_id: null,
      external_revision: null,
      freshness_state: "fresh",
      source_system: "admin-dashboard",
    },
    readiness_state: "ready",
    relationship_id: "rel-1",
    relationship_type: "depends_on",
    temporal: { effective_from: "2026-08-01T00:00:00Z", effective_to: null, recorded_at: null },
    validation: { mode: "mandatory", truncated: false, valid: true, violations: [] },
  };

  async function openConnections(client: ContextplaneClient) {
    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });
    fireEvent.click(screen.getAllByRole("button", { name: "Policy evaluation" })[0]!);
    const dialog = await screen.findByRole("dialog");
    // The dialog opens on a loading skeleton; the tabs appear once the detail
    // read resolves, so wait for the tab rather than racing it.
    fireEvent.click(await within(dialog).findByRole("tab", { name: "Connections" }));
    return dialog;
  }

  it("shows the governance on an edge, which the traversal views do not carry", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/relationships:query" && options?.method === "POST") {
        return { has_more: false, items: [governedEdge], limit: 50, offset: 0 };
      }
      if (path.startsWith(`/v1/capabilities/${capability.entity_id}`)) return capability;
      return { items: [capability], next_cursor: null };
    });

    const dialog = await openConnections(client);

    expect(await within(dialog).findByText("depends_on")).toBeVisible();
    // The four things this surface has and a bare edge does not.
    expect(within(dialog).getByText("mandatory")).toBeVisible();
    expect(within(dialog).getByText("ready")).toBeVisible();
    expect(within(dialog).getByText("valid")).toBeVisible();
    expect(within(dialog).getByText("r-1")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/relationships:query",
      expect.objectContaining({
        body: expect.objectContaining({ entity_id: capability.entity_id }),
        method: "POST",
      }),
    );
  });

  it("names an edge that fails its profile rather than listing it as any other", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/relationships:query" && options?.method === "POST") {
        return {
          has_more: false,
          limit: 50,
          offset: 0,
          items: [
            {
              ...governedEdge,
              readiness_state: "blocked",
              validation: {
                mode: "mandatory",
                truncated: false,
                valid: false,
                violations: ["destination is not a declared endpoint type"],
              },
            },
          ],
        };
      }
      if (path.startsWith(`/v1/capabilities/${capability.entity_id}`)) return capability;
      return { items: [capability], next_cursor: null };
    });

    const dialog = await openConnections(client);

    expect(await within(dialog).findByText("invalid")).toBeVisible();
    expect(within(dialog).getByText("blocked")).toBeVisible();
    expect(
      within(dialog).getByText("destination is not a declared endpoint type"),
    ).toBeVisible();
  });

  it("routes a governed attribute change to the update surface, subject in the path", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/profiles/conformance") return governedBinding;
      if (path === `/v1/entities/${capability.entity_id}` && options?.method === "PATCH") {
        return {
          effect: "review_entry",
          entity_id: null,
          intent: "request",
          profile: { binding_id: "b-1", enforcement_mode: "mandatory", profile_revision_id: "r-1" },
          review_entry_id: "re-1",
          staged_claim_id: null,
          validation: { mode: "mandatory", valid: true },
        };
      }
      if (path.startsWith(`/v1/capabilities/${capability.entity_id}`)) return capability;
      return { items: [capability], next_cursor: null };
    });

    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });
    fireEvent.click(screen.getAllByRole("button", { name: "Policy evaluation" })[0]!);
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(
      await within(dialog).findByRole("combobox", {
        name: /How this change reaches the catalog/,
      }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /^Request/ }));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Submit change" })).toBeEnabled(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit change" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/entities/${capability.entity_id}`,
        expect.objectContaining({
          body: expect.objectContaining({
            identity: { subject_id: capability.entity_id },
            intent: "request",
            subject_type: "core:capability",
            target_revision: { binding_revision: "sha256:d-1", profile_revision: "r-1" },
          }),
          method: "PATCH",
        }),
      ),
    );
    // The assertion that matters, and the one whose absence let the first
    // attempt ship: the service takes the write target from the path and never
    // from `identity.subject_id`, so an edit posted to the create surface does
    // not update anything -- on the approval route it mints a second entity.
    // A test that only checked the body was satisfied by the broken call.
    expect(client.request).not.toHaveBeenCalledWith("/v1/entities", expect.anything());
    // Not "were updated": a review entry has not changed the attributes, and a
    // receipt claiming otherwise is the failure the effect wording exists for.
    expect(await within(dialog).findByText(/routed as review entry/)).toBeVisible();
  });

  it("keeps the direct PATCH as the default edit", async () => {
    const client = clientFor((path, options) => {
      if (path === `/v1/capabilities/${capability.entity_id}` && options?.method === "PATCH") {
        return capability;
      }
      if (path.startsWith(`/v1/capabilities/${capability.entity_id}`)) return capability;
      return { items: [capability], next_cursor: null };
    });

    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });
    fireEvent.click(screen.getAllByRole("button", { name: "Policy evaluation" })[0]!);
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(await within(dialog).findByRole("button", { name: "Save attributes" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/capabilities/${capability.entity_id}`,
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(client.request).not.toHaveBeenCalledWith("/v1/entities", expect.anything());
  });

  it("will not send a governed attribute change for a tenant bound to nothing", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/profiles/conformance") return { binding: null, bound: false };
      if (path.startsWith(`/v1/capabilities/${capability.entity_id}`)) return capability;
      return { items: [capability], next_cursor: null };
    });

    renderCatalog(client);
    await screen.findByRole("heading", { level: 1, name: "Catalog" });
    fireEvent.click(screen.getAllByRole("button", { name: "Policy evaluation" })[0]!);
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(
      await within(dialog).findByRole("combobox", {
        name: /How this change reaches the catalog/,
      }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /^Observation/ }));

    expect(await within(dialog).findByText("No profile is bound")).toBeVisible();
    expect(client.request).not.toHaveBeenCalledWith(
      `/v1/entities/${capability.entity_id}`,
      expect.anything(),
    );
  });
});
