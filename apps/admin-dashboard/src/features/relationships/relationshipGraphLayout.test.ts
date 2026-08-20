import { describe, expect, it } from "vitest";

import type { RelationshipEdge, RelationshipEntity } from "../../shared/api";
import {
  layoutRelationshipGraph,
  matchingNodes,
  nextFocusedNode,
  type GraphNode,
} from "./relationshipGraphLayout";

function entity(entityId: string, name: string): RelationshipEntity {
  return {
    created_at: "2026-08-12T14:28:41Z",
    entity_id: entityId,
    entity_type: "capability",
    external_id: null,
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
  entity("root", "Checkout"),
  entity("a", "Ledger"),
  entity("b", "Auth"),
  entity("c", "Archive"),
];

/** root ← a, root ← b (one hop); a ← c (two hops). */
const edges = [edge("a", "root"), edge("b", "root"), edge("c", "a")];

describe("layoutRelationshipGraph", () => {
  it("places each node in the column of its hop count from the root", () => {
    const layout = layoutRelationshipGraph({
      edges,
      entities,
      rootEntityId: "root",
      visibleDepth: 2,
    });

    const depthOf = Object.fromEntries(layout.nodes.map((node) => [node.entityId, node.depth]));
    expect(depthOf).toEqual({ a: 1, b: 1, c: 2, root: 0 });
    expect(layout.maxDepth).toBe(2);
  });

  it("follows edges as undirected, because the traversal already chose a direction", () => {
    // Every edge here points *at* the root, as a `dependents` answer does.
    // Following them forward from the root would reach nothing at all.
    const layout = layoutRelationshipGraph({
      edges,
      entities,
      rootEntityId: "root",
      visibleDepth: 2,
    });

    expect(layout.nodes).toHaveLength(4);
  });

  it("orders a column by name before id, so two datasets agree", () => {
    const layout = layoutRelationshipGraph({
      edges,
      entities,
      rootEntityId: "root",
      visibleDepth: 1,
    });

    const firstHop = layout.nodes.filter((node) => node.depth === 1).map((node) => node.name);
    expect(firstHop).toEqual(["Auth", "Ledger"]);
  });

  it("discloses what a shallower view is not showing rather than dropping it", () => {
    const layout = layoutRelationshipGraph({
      edges,
      entities,
      rootEntityId: "root",
      visibleDepth: 1,
    });

    expect(layout.nodes.map((node) => node.entityId)).not.toContain("c");
    expect(layout.hiddenNodeCount).toBe(1);
    expect(layout.maxDepth).toBe(2);
  });

  it("keeps only the edges whose both ends are rendered", () => {
    const layout = layoutRelationshipGraph({
      edges,
      entities,
      rootEntityId: "root",
      visibleDepth: 1,
    });

    expect(layout.edges.map((item) => item.edgeId)).toEqual(["a->root", "b->root"]);
  });

  it("counts a node no path from the root reaches instead of placing it at the root", () => {
    const layout = layoutRelationshipGraph({
      edges,
      entities: [...entities, entity("orphan", "Detached")],
      rootEntityId: "root",
      visibleDepth: 5,
    });

    expect(layout.unreachableNodeCount).toBe(1);
    expect(layout.nodes.map((node) => node.entityId)).not.toContain("orphan");
  });

  it("names each relationship type once, for the legend", () => {
    const layout = layoutRelationshipGraph({
      edges: [edge("a", "root", "depends_on"), edge("b", "root", "concept_of")],
      entities,
      rootEntityId: "root",
      visibleDepth: 1,
    });

    expect(layout.legend).toEqual(["concept_of", "depends_on"]);
  });

  it("falls back to the id when the traversal returned an edge but no node for it", () => {
    const layout = layoutRelationshipGraph({
      edges: [edge("ghost", "root")],
      entities: [entity("root", "Checkout")],
      rootEntityId: "root",
      visibleDepth: 1,
    });

    expect(layout.nodes.find((node) => node.entityId === "ghost")?.name).toBe("ghost");
  });

  it("returns a root-only layout when the traversal found no edges", () => {
    const layout = layoutRelationshipGraph({
      edges: [],
      entities: [entity("root", "Checkout")],
      rootEntityId: "root",
      visibleDepth: 2,
    });

    expect(layout.nodes.map((node) => node.entityId)).toEqual(["root"]);
    expect(layout.hiddenNodeCount).toBe(0);
    expect(layout.legend).toEqual([]);
  });
});

describe("nextFocusedNode", () => {
  const nodes = layoutRelationshipGraph({
    edges,
    entities,
    rootEntityId: "root",
    visibleDepth: 2,
  }).nodes as readonly GraphNode[];

  it("walks the visible column with up and down", () => {
    expect(nextFocusedNode(nodes, "b", "ArrowDown")).toBe("a");
    expect(nextFocusedNode(nodes, "a", "ArrowUp")).toBe("b");
  });

  it("crosses a hop with left and right, preferring a node actually linked", () => {
    expect(nextFocusedNode(nodes, "root", "ArrowRight")).toBe("b");
    expect(nextFocusedNode(nodes, "c", "ArrowLeft")).toBe("a");
  });

  it("stays put rather than wrapping off the end of a column", () => {
    expect(nextFocusedNode(nodes, "b", "ArrowUp")).toBeNull();
    expect(nextFocusedNode(nodes, "a", "ArrowDown")).toBeNull();
  });

  it("stays put rather than moving past the root or the deepest hop", () => {
    expect(nextFocusedNode(nodes, "root", "ArrowLeft")).toBeNull();
    expect(nextFocusedNode(nodes, "c", "ArrowRight")).toBeNull();
  });

  it("does nothing for a node that is not rendered", () => {
    expect(nextFocusedNode(nodes, "missing", "ArrowDown")).toBeNull();
  });
});

describe("matchingNodes", () => {
  const nodes = layoutRelationshipGraph({
    edges,
    entities,
    rootEntityId: "root",
    visibleDepth: 2,
  }).nodes;

  it("matches a name case-insensitively and an id exactly", () => {
    expect(matchingNodes(nodes, "led").map((node) => node.entityId)).toEqual(["a"]);
    expect(matchingNodes(nodes, "root").map((node) => node.entityId)).toEqual(["root"]);
  });

  it("matches nothing for an empty term, rather than everything", () => {
    expect(matchingNodes(nodes, "   ")).toEqual([]);
  });
});
