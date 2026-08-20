import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { RelationshipEdge, RelationshipEntity } from "../../shared/api";
import { RelationshipGraph } from "./RelationshipGraph";

function entity(entityId: string, name: string, entityType = "capability"): RelationshipEntity {
  return {
    created_at: "2026-08-01T00:00:00Z",
    entity_id: entityId,
    entity_type: entityType,
    external_id: `${entityId}-external`,
    name,
  };
}

function edge(source: string, destination: string, relationship = "depends_on"): RelationshipEdge {
  return {
    dst_entity_id: destination,
    edge_id: `${source}->${destination}`,
    properties: null,
    rel: relationship,
    src_entity_id: source,
  };
}

const entities = [
  entity("root", "Identity platform"),
  entity("ledger", "Ledger"),
  entity("auth", "Auth"),
  entity("archive", "Archive"),
];

const edges = [edge("ledger", "root"), edge("auth", "root"), edge("archive", "ledger")];

const traversal = {
  as_of: "2026-08-13T10:00:00Z",
  cache_hit: false,
  depth: 3,
  direction: "reverse",
  edges,
  nodes: entities,
  root_entity_id: "root",
  version_satisfied: { "auth->root": true, "ledger->root": false },
};

function renderGraph(overrides: Partial<Parameters<typeof RelationshipGraph>[0]> = {}) {
  return render(
    <ToastProvider>
      <RelationshipGraph
        asOf="2026-08-13T10:00:00Z"
        direction="reverse"
        edges={edges}
        entities={entities}
        question="Used by"
        rootEntityId="root"
        traversal={traversal}
        version="2.4.0"
        {...overrides}
      />
    </ToastProvider>,
  );
}

describe("RelationshipGraph", () => {
  it("states the focus, direction, type, depth, version and time scope", () => {
    renderGraph();

    expect(screen.getAllByText("Identity platform")[0]).toBeVisible();
    expect(screen.getByText("Used by")).toBeVisible();
    expect(screen.getByText("reverse")).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeVisible();
    expect(screen.getByText("2026-08-13T10:00:00Z")).toBeVisible();
    expect(screen.getByText("2.4.0")).toBeVisible();
  });

  it("names each drawn relationship type in a legend", () => {
    renderGraph({
      edges: [edge("ledger", "root", "depends_on"), edge("auth", "root", "requires")],
    });

    const legend = screen.getByRole("list", { name: "Relationship types drawn" });
    expect(within(legend).getByText("Depends On")).toBeVisible();
    expect(within(legend).getByText("Requires")).toBeVisible();
  });

  it("discloses the nodes a one-hop view is not drawing, and reveals them on request", () => {
    renderGraph();

    expect(screen.getByText(/1 further node is beyond 1 hop and not drawn/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Archive,/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand one hop" }));

    expect(screen.getByRole("button", { name: /^Archive,/ })).toBeVisible();
    expect(screen.queryByText(/further node is beyond/)).not.toBeInTheDocument();
  });

  it("reaches every node by keyboard without a drag or a remembered position", () => {
    renderGraph();

    const nodes = screen.getAllByRole("button").filter((node) => node.tagName === "g");
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) expect(node).toHaveAttribute("tabindex", "0");
  });

  it("moves focus between nodes with the arrow keys", () => {
    renderGraph();

    const root = screen.getByRole("button", { name: /^Identity platform,/ });
    root.focus();
    fireEvent.keyDown(root, { key: "ArrowRight" });

    expect(document.activeElement).toHaveAttribute("aria-label", expect.stringMatching(/^Auth,/));
  });

  it("opens the same detail on Enter that a click opens", () => {
    renderGraph();

    const ledger = screen.getByRole("button", { name: /^Ledger,/ });
    fireEvent.keyDown(ledger, { key: "Enter" });

    const detail = screen.getByRole("region", { name: "Detail for Ledger" });
    expect(within(detail).getByText("ledger")).toBeVisible();
    expect(within(detail).getByText("ledger-external")).toBeVisible();
    expect(within(detail).getByText("Hops from focus").nextElementSibling).toHaveTextContent("1");
    expect(within(detail).getByText("Drawn connections").nextElementSibling).toHaveTextContent("1");
  });

  it("reports version agreement on the edges touching the selected node", () => {
    renderGraph();

    fireEvent.click(screen.getByRole("button", { name: /^Ledger,/ }));

    const detail = screen.getByRole("region", { name: "Detail for Ledger" });
    expect(within(detail).getByText("1 of 1 evaluated unresolved")).toBeVisible();
  });

  it("finds a node by name and moves focus to it", () => {
    renderGraph();

    fireEvent.change(screen.getByRole("searchbox", { name: "Find a node by name or ID" }), {
      target: { value: "auth" },
    });

    expect(screen.getByText(/1 of 3 plotted nodes match/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Auth" }));
    expect(document.activeElement).toHaveAttribute("aria-label", expect.stringMatching(/^Auth,/));
  });

  it("counts a returned node no edge connects to the focus rather than drawing it at the root", () => {
    renderGraph({ entities: [...entities, entity("detached", "Detached")] });

    expect(
      screen.getByText(/1 returned node is not reachable from the focus by any returned edge/),
    ).toBeVisible();
  });

  it("says so plainly when the traversal returned nothing to draw", () => {
    renderGraph({ edges: [], entities: [entity("root", "Identity platform")] });

    expect(screen.getByText("Nothing to plot for this traversal")).toBeVisible();
  });
});
