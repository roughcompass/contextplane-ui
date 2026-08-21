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
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: /How this write reaches the catalog/ }),
      { target: { value: "observation" } },
    );
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
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: /How this write reaches the catalog/ }),
      { target: { value: "request" } },
    );

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
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: /How this write reaches the catalog/ }),
      { target: { value: "authorized_approval" } },
    );
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
});
