import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContextplaneApiError,
  clientFromRequest,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { ToastProvider } from "@repo/ui/primitives";

import { RelationshipsPage } from "./RelationshipsPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "actor-a",
  roles: ["producer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "tenant-a",
  tenant_slug: "northstar",
};

const edges = [
  {
    dst_entity_id: "entity-policy",
    edge_id: "edge-policy",
    properties: { version_constraint: ">=2.1.0" },
    rel: "depends_on",
    src_entity_id: "entity-identity",
  },
  {
    dst_entity_id: "entity-token",
    edge_id: "edge-token",
    properties: null,
    rel: "requires",
    src_entity_id: "entity-policy",
  },
];

const nodes = [
  {
    created_at: "2026-08-01T00:00:00Z",
    entity_id: "entity-identity",
    entity_type: "capability",
    external_id: "identity-platform",
    name: "Identity platform",
  },
  {
    created_at: "2026-08-01T00:00:00Z",
    entity_id: "entity-policy",
    entity_type: "capability",
    external_id: "policy-evaluation",
    name: "Policy evaluation",
  },
  {
    created_at: "2026-08-01T00:00:00Z",
    entity_id: "entity-token",
    entity_type: "interface",
    external_id: null,
    name: "Token contract",
  },
];

const traversal = {
  as_of: "2026-08-13T10:00:00Z",
  cache_hit: true,
  depth: 3,
  direction: "reverse",
  edges,
  nodes,
  root_entity_id: "entity-identity",
  version_satisfied: { "edge-policy": false, "edge-token": true },
};

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return clientFromRequest(
    vi.fn(async (path: string, options?: ContextplaneRequestOptions) => resolver(path, options)),
  );
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RelationshipsPage
          activeTenantName="Northstar Systems"
          client={client}
          searchRef={createRef<HTMLInputElement>()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/relationships");
});

describe("RelationshipsPage", () => {
  it("waits for a root before traversing and validates the required capability", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Relationships" })).toBeVisible();
    expect(screen.getByText("Choose a capability to inspect")).toBeVisible();
    expect(screen.getByText("Visibility follows tenant access")).toBeVisible();
    expect(client.request).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Run traversal" }));
    expect(screen.getByText("Enter a capability UUID or slug.")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: /^Capability UUID or slug/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("restores a shareable traversal and exposes cache, version, and visibility caveats", async () => {
    window.history.replaceState(
      {},
      "",
      "/relationships?root=entity-identity&depth=3&relations=depends_on%2C+requires&as_of=2026-08-13T10%3A00%3A00Z&version=2.4.0",
    );
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/capabilities/entity-identity/dependents?")) return traversal;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByText("What this answer could not settle")).toBeVisible();
    expect(screen.getByText(/served from cache/)).toBeVisible();
    expect(screen.getByText(/1 version constraint could not be resolved/)).toBeVisible();
    expect(screen.getByText("Identity platform")).toBeVisible();
    expect(screen.getAllByText("Policy evaluation")).toHaveLength(2);
    expect(screen.getByText("Token contract")).toBeVisible();
    expect(screen.getByText("Version Constraint: >=2.1.0")).toBeVisible();
    expect(screen.getByText("Unresolved")).toBeVisible();
    expect(screen.getByText("Satisfied")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Relationship result summary" })).getByText("2"),
    ).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/capabilities/entity-identity/dependents?depth=3&edge_types=depends_on%2Crequires&as_of=2026-08-13T10%3A00%3A00.000Z&as_of_version=2.4.0",
      expect.any(Object),
    );
  });

  it("runs the dependency question without unsupported edge or version parameters", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/capabilities/identity%2Fplatform/dependencies?")) {
        return {
          as_of: "2026-08-13T08:00:00Z",
          depth: 1,
          edges: [edges[0]],
          root_entity_id: "entity-identity",
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);
    await screen.findByRole("heading", { level: 1, name: "Relationships" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Capability UUID or slug" }), {
      target: { value: "identity/platform" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Question" }), {
      target: { value: "dependencies" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Hops to follow" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^As of \(optional\)/ }), {
      target: { value: "2026-08-13T10:00:00+02:00" },
    });

    expect(screen.queryByRole("textbox", { name: "Relationship types" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Version to resolve (optional)" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run traversal" }));

    expect(window.location.search).toBe(
      "?root=identity%2Fplatform&question=dependencies&depth=1&as_of=2026-08-13T10%3A00%3A00%2B02%3A00",
    );
    expect(await screen.findByText("Version Constraint: >=2.1.0")).toBeVisible();
    expect(screen.getByText("Not evaluated")).toBeVisible();
    expect(screen.getByText("Not reported")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/capabilities/identity%2Fplatform/dependencies?depth=1&as_of=2026-08-13T08%3A00%3A00.000Z",
      expect.any(Object),
    );
  });

  it("runs a forward blast radius and resets the URL and result", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/capabilities/identity/blast-radius?")) {
        return { ...traversal, cache_hit: false, direction: "forward" };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);
    await screen.findByRole("heading", { level: 1, name: "Relationships" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Capability UUID or slug" }), {
      target: { value: "identity" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Question" }), {
      target: { value: "blast-radius" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), {
      target: { value: "forward" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Relationship types" }), {
      target: { value: "depends_on, depends_on requires" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run traversal" }));

    expect(await screen.findByText("Live traversal")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/capabilities/identity/blast-radius?direction=forward&depth=2&edge_types=depends_on%2Crequires",
      expect.any(Object),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(window.location.pathname).toBe("/relationships");
    expect(window.location.search).toBe("");
    expect(screen.getByText("Choose a capability to inspect")).toBeVisible();
  });

  it("pages tenant projections without presenting page counts as graph totals", async () => {
    window.history.replaceState({}, "", "/relationships?tab=projections");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path === "/v1/graph/provider?page_size=100") {
        return { edges: [edges[0]], next_cursor: "opaque/next cursor", nodes: nodes.slice(0, 2) };
      }
      if (path === "/v1/graph/provider?cursor=opaque%2Fnext+cursor&page_size=100") {
        return { edges: [], next_cursor: null, nodes: [nodes[2]] };
      }
      if (path === "/v1/graph/consumer?page_size=100") {
        return { edges: [], next_cursor: null, nodes: [] };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByText("Projection counts describe this page only")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Tenant projections" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findAllByText("Identity platform")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Projection page summary" })).toHaveTextContent(
      "Nodes on this page",
    );
    expect(screen.getByText("An opaque cursor was published")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(window.location.search).toBe("?tab=projections&cursor=opaque%2Fnext+cursor");
    expect(await screen.findByText("Token contract")).toBeVisible();
    expect(screen.getByText("No edges on this page")).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Projection" }), {
      target: { value: "consumer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load projection" }));
    expect(window.location.search).toBe("?tab=projections&projection=consumer");
    expect(await screen.findByText("No entities on this page")).toBeVisible();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Tenant projections" }), {
      key: "ArrowLeft",
    });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Explore impact" })).toHaveFocus());
    expect(window.location.search).toBe("");
  });

  it("distinguishes an empty visible answer from a refused traversal", async () => {
    window.history.replaceState({}, "", "/relationships?root=identity");
    let refused = false;
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/capabilities/identity/dependents?")) {
        if (refused) {
          throw new ContextplaneApiError({
            errors: [{ code: "forbidden", message: "forbidden", path: null }],
            requestId: "request-relationship",
            status: 403,
          });
        }
        return {
          ...traversal,
          cache_hit: false,
          edges: [],
          nodes: [],
          version_satisfied: {},
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByText("No visible relationships at this depth")).toBeVisible();
    refused = true;
    fireEvent.click(screen.getByRole("button", { name: "Run traversal" }));
    await waitFor(() =>
      expect(screen.getByText("Relationship traversal is restricted")).toBeVisible(),
    );
    expect(screen.getByText("Request ID:")).toBeVisible();
  });

  it("switches the same answer between table and graph, and keeps the view in the URL", async () => {
    window.history.replaceState({}, "", "/relationships?root=entity-identity&depth=3");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/capabilities/entity-identity/dependents?")) return traversal;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByRole("table")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /^Relationship graph focused on/ })).toBeVisible();
    expect(window.location.search).toContain("view=graph");

    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeVisible();
    expect(window.location.search).not.toContain("view=graph");
  });

  it("opens straight into the graph when the address says so", async () => {
    window.history.replaceState({}, "", "/relationships?root=entity-identity&depth=3&view=graph");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/capabilities/entity-identity/dependents?")) return traversal;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    expect(
      await screen.findByRole("group", { name: /^Relationship graph focused on/ }),
    ).toBeVisible();
  });

  it("offers a supersede action per traversal row, and a create beside the view toggle", async () => {
    window.history.replaceState({}, "", "/relationships?root=entity-identity&depth=3");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/capabilities/entity-identity/dependents?")) return traversal;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    await screen.findByRole("table");
    expect(screen.getAllByRole("button", { name: "Supersede" })).toHaveLength(edges.length);
    expect(screen.getByRole("button", { name: "Create relationship" })).toBeVisible();
  });

  it("opens the editor on the row the operator chose", async () => {
    window.history.replaceState({}, "", "/relationships?root=entity-identity&depth=3");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/capabilities/entity-identity/dependents?")) return traversal;
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
      if (path === "/v1/relationships/edge-policy") {
        return {
          endpoints: {
            destination_entity_id: "entity-policy",
            source_entity_id: "entity-identity",
          },
          is_inverse: false,
          profile: { binding_id: "b-1", enforcement_mode: "mandatory", profile_revision_id: "r-1" },
          properties: {},
          provenance: {
            authority: null,
            confidence: null,
            external_record_id: null,
            external_revision: null,
            freshness_state: null,
            source_system: null,
          },
          readiness_state: "ready",
          relationship_id: "edge-policy",
          relationship_type: "depends_on",
          temporal: { effective_from: null, effective_to: null, recorded_at: null },
          validation: { mode: "mandatory", valid: true },
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    await screen.findByRole("table");
    fireEvent.click(screen.getAllByRole("button", { name: "Supersede" })[0]!);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Supersede relationship" }),
    ).toBeVisible();
  });

  it("does not offer a supersede action on another tenant's projection rows", async () => {
    window.history.replaceState({}, "", "/relationships?tab=projections");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/graph/provider")) return { edges, next_cursor: null, nodes };
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    // The projection area renders more than one table; waiting for any of them
    // is enough, since a Supersede would appear in whichever held the edges.
    await waitFor(() => expect(screen.getAllByRole("table").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Supersede" })).not.toBeInTheDocument();
  });
});
